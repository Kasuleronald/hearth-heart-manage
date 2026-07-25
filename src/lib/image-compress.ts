// Resizes + re-encodes an image client-side (via <canvas>) so an upload
// fits under a byte budget instead of just being rejected for being too
// big. Tries decreasing quality first (cheap, preserves resolution), then
// falls back to shrinking dimensions if a very colorful/detailed image
// still doesn't fit at the lowest quality step.
export async function compressImageToDataUrl(
  file: File,
  opts: { maxBytes: number; maxDimension?: number } = { maxBytes: 500 * 1024 },
): Promise<string> {
  const maxDimension = opts.maxDimension ?? 512;
  const bitmap = await loadImage(file);

  let width = bitmap.width;
  let height = bitmap.height;
  if (width > maxDimension || height > maxDimension) {
    const scale = maxDimension / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  // Shrinking further only kicks in if quality alone can't hit the budget —
  // each pass here also resets the quality ladder, since a smaller canvas
  // can often afford a higher quality at the same byte count.
  for (let pass = 0; pass < 5; pass++) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Couldn't process this image");
    ctx.drawImage(bitmap, 0, 0, width, height);

    for (const quality of [0.92, 0.8, 0.6, 0.4]) {
      // image/webp preserves transparency and compresses well; browsers
      // that don't support it silently return PNG instead (still correct,
      // just ignores `quality` — the dimension-shrink loop below still
      // applies if that comes out too large).
      const dataUrl = canvas.toDataURL("image/webp", quality);
      if (approxBytes(dataUrl) <= opts.maxBytes) return dataUrl;
    }

    width = Math.round(width * 0.75);
    height = Math.round(height * 0.75);
  }

  throw new Error(
    `Couldn't compress this image under ${Math.round(opts.maxBytes / 1024)}KB — try a simpler image`,
  );
}

function approxBytes(dataUrl: string): number {
  return (dataUrl.length * 3) / 4;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read this image file"));
    };
    img.src = url;
  });
}
