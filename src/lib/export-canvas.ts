import type { CanvasElement } from "./canvas-types";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textLines(label: string | undefined, fallback: string[]): string[] {
  if (!label) return fallback;
  return label.split("\n").filter((l) => l.length > 0);
}

export function elementToSvg(el: CanvasElement): string {
  const { x, y, w, h } = el;

  switch (el.type) {
    case "heading": {
      const label = el.label || "Heading";
      return `<text x="${x}" y="${y + h / 2 + 7}" font-size="22" font-weight="700" fill="#15131C">${escapeXml(label)}</text>`;
    }
    case "text": {
      const lines = textLines(el.label, []);
      if (lines.length > 0) {
        const lineH = Math.max(16, Math.min(22, h / lines.length));
        return lines
          .map(
            (line, i) =>
              `<text x="${x}" y="${y + 14 + i * lineH}" font-size="13" fill="#413B4E">${escapeXml(line)}</text>`
          )
          .join("");
      }
      const barCount = Math.max(2, Math.min(4, Math.round(h / 18)));
      const widths = [1, 0.92, 0.96, 0.6];
      let bars = "";
      for (let i = 0; i < barCount; i++) {
        const by = y + i * (h / barCount) + 4;
        bars += `<rect x="${x}" y="${by}" width="${w * (widths[i % widths.length])}" height="8" rx="4" fill="#D8D3E4" />`;
      }
      return bars;
    }
    case "rectangle": {
      return (
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#B9B2CC" stroke-width="2" stroke-dasharray="7 5" rx="6" />` +
        `<text x="${x + 8}" y="${y + 16}" font-size="10" letter-spacing="1" fill="#9089A6">${escapeXml((el.label || "CONTAINER").toUpperCase())}</text>`
      );
    }
    case "image": {
      return (
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#F1EEF8" stroke="#D8D3E4" stroke-width="1.5" rx="6" />` +
        `<line x1="${x}" y1="${y}" x2="${x + w}" y2="${y + h}" stroke="#C7C0DA" stroke-width="1.5" />` +
        `<line x1="${x + w}" y1="${y}" x2="${x}" y2="${y + h}" stroke="#C7C0DA" stroke-width="1.5" />` +
        `<text x="${x + w / 2}" y="${y + h / 2 + 5}" font-size="12" text-anchor="middle" fill="#9089A6">${escapeXml(el.label || "Image")}</text>`
      );
    }
    case "button": {
      const label = el.label || "Button";
      return (
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(h / 2, 10)}" fill="#6D4CE0" />` +
        `<text x="${x + w / 2}" y="${y + h / 2 + 5}" font-size="13" font-weight="600" text-anchor="middle" fill="#FFFFFF">${escapeXml(label)}</text>`
      );
    }
    case "card": {
      const headerH = Math.min(h * 0.32, 44);
      return (
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#FFFFFF" stroke="#E6E2EF" stroke-width="1.5" />` +
        `<rect x="${x}" y="${y}" width="${w}" height="${headerH}" rx="10" fill="#EAE4FD" />` +
        `<rect x="${x}" y="${y + headerH}" width="${w}" height="${Math.max(0, headerH - 10)}" fill="#EAE4FD" />` +
        `<rect x="${x + 14}" y="${y + headerH + 16}" width="${w - 28}" height="9" rx="4" fill="#D8D3E4" />` +
        `<rect x="${x + 14}" y="${y + headerH + 34}" width="${(w - 28) * 0.7}" height="9" rx="4" fill="#D8D3E4" />` +
        (el.label
          ? `<text x="${x + 14}" y="${y + headerH / 2 + 5}" font-size="12" font-weight="600" fill="#392381">${escapeXml(el.label)}</text>`
          : "")
      );
    }
    case "tabs": {
      const count = Math.max(2, Math.min(6, el.tabCount ?? 3));
      const gap = 6;
      const tabW = (w - gap * (count - 1)) / count;
      let out = "";
      for (let i = 0; i < count; i++) {
        const tx = x + i * (tabW + gap);
        const active = i === 0;
        out += `<rect x="${tx}" y="${y}" width="${tabW}" height="${h}" rx="${h / 2}" fill="${active ? "#6D4CE0" : "#FFFFFF"}" stroke="${active ? "#6D4CE0" : "#D4CEE1"}" stroke-width="1.5" />`;
        out += `<text x="${tx + tabW / 2}" y="${y + h / 2 + 4}" font-size="11" text-anchor="middle" fill="${active ? "#FFFFFF" : "#7B7488"}">Tab ${i + 1}</text>`;
      }
      return out;
    }
    case "line": {
      const horizontal = w >= h;
      if (horizontal) {
        const cy = y + h / 2;
        return `<rect x="${x}" y="${cy - 1}" width="${w}" height="2" fill="#B9B2CC" />`;
      }
      const cx = x + w / 2;
      return `<rect x="${cx - 1}" y="${y}" width="2" height="${h}" fill="#B9B2CC" />`;
    }
    default:
      return "";
  }
}

export function elementsToSvgMarkup(
  elements: CanvasElement[],
  width: number,
  height: number
): string {
  const body = elements.map(elementToSvg).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect x="0" y="0" width="${width}" height="${height}" fill="#FFFFFF" />
    ${body}
  </svg>`;
}

/** Rasterizes the wireframe to a PNG data URL, entirely client-side. */
export function elementsToPngDataUrl(
  elements: CanvasElement[],
  width: number,
  height: number
): Promise<string> {
  const svg = elementsToSvgMarkup(elements, width, height);
  const svgDataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;

  return new Promise((resolve, reject) => {
    const scale = 1.5;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas is not supported in this browser."));
        return;
      }
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("Failed to render the wireframe to an image."));
    img.src = svgDataUrl;
  });
}
