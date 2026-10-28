"use client";

/** Browser-only helpers for exporting generated assets. */

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(filename: string, text: string, type = "text/plain"): void {
  downloadBlob(filename, new Blob([text], { type: `${type};charset=utf-8` }));
}

export function downloadSvg(filename: string, svg: string): void {
  downloadText(filename, svg, "image/svg+xml");
}

export function downloadJson(filename: string, data: unknown): void {
  downloadText(filename, JSON.stringify(data, null, 2), "application/json");
}

export function downloadHtml(filename: string, html: string): void {
  downloadText(filename, html, "text/html");
}

/** Rasterizes an SVG string to a PNG and downloads it. */
export async function downloadSvgAsPng(filename: string, svg: string, scale = 2): Promise<void> {
  const sized = ensureSvgSize(svg);
  const blob = new Blob([sized.markup], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = sized.width * scale;
    canvas.height = sized.height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (pngBlob) downloadBlob(filename, pngBlob);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function ensureSvgSize(svg: string): { markup: string; width: number; height: number } {
  const vb = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  const width = vb ? Math.round(Number(vb[1])) : 1080;
  const height = vb ? Math.round(Number(vb[2])) : 1080;
  return { markup: svg, width, height };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      return true;
    } catch {
      return false;
    }
  }
}
