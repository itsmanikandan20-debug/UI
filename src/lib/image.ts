export interface DecodedImage {
  base64: string;
  mimeType: string;
}

/** Splits a "data:image/png;base64,AAAA..." string into its parts. */
export function decodeDataUrl(dataUrl: string): DecodedImage {
  const match = /^data:([^;]+);base64,([\s\S]*)$/.exec(dataUrl);
  if (!match) throw new Error("Expected a base64 data URL image.");
  return { mimeType: match[1], base64: match[2] };
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
