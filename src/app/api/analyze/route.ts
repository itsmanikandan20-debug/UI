import type { NextRequest } from "next/server";
import { runPipeline, PipelineError } from "@/lib/pipeline";
import { decodeDataUrl } from "@/lib/image";
import type { PipelineEvent } from "@/lib/types";

// This route calls three real external services (Gemini, Exa,
// Browserbase) end-to-end and streams progress the whole time, so it
// needs a long-running Node runtime rather than the edge runtime.
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { image?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body.", { status: 400 });
  }

  if (!body.image) {
    return new Response("Missing `image` (a data URL).", { status: 400 });
  }

  let decoded;
  try {
    decoded = decodeDataUrl(body.image);
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Invalid image.", { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const emit = (event: PipelineEvent) => {
        if (closed) return;
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };

      try {
        await runPipeline(decoded.base64, decoded.mimeType, emit);
      } catch (err) {
        if (err instanceof PipelineError) {
          emit({ type: "error", message: err.message, step: err.step });
        } else {
          emit({ type: "error", message: err instanceof Error ? err.message : String(err) });
        }
      } finally {
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
    },
  });
}
