// Fast canvas-based product cutout - replaces gpt-image-2 cutout call
// Uses flood-fill background removal + alpha erosion for clean edges

export interface CutoutResult {
  cutoutBase64: string;
  maskBase64: string;
  bbox: { x: number; y: number; width: number; height: number };
}

export async function fastCutout(imageBase64: string): Promise<CutoutResult> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Image decode timeout in fastCutout'));
    }, 10000); // 10s timeout

    const img = new Image();
    img.onload = () => {
      clearTimeout(timeout);
      try {
        const w = img.width;
        const h = img.height;

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;

        // Sample corner colors to determine background
        const corners = [
          getPixel(data, w, 0, 0),
          getPixel(data, w, 0, h - 1),
          getPixel(data, w, w - 1, 0),
          getPixel(data, w, w - 1, h - 1),
          getPixel(data, w, Math.floor(w / 2), 0),
          getPixel(data, w, 0, Math.floor(h / 2)),
        ];

        // Average corner color
        const bgColor = {
          r: Math.round(corners.reduce((s, c) => s + c.r, 0) / corners.length),
          g: Math.round(corners.reduce((s, c) => s + c.g, 0) / corners.length),
          b: Math.round(corners.reduce((s, c) => s + c.b, 0) / corners.length),
        };

        const threshold = 30; // Color distance threshold

        // Flood fill from corners to mark background
        const mask = new Uint8Array(w * h); // 0 = background, 1 = foreground
        const visited = new Uint8Array(w * h);
        const queue: number[] = [];

        // Start flood fill from all border pixels
        for (let x = 0; x < w; x++) {
          enqueue(queue, x, 0, w, h, visited, mask, data, bgColor, threshold);
          enqueue(queue, x, h - 1, w, h, visited, mask, data, bgColor, threshold);
        }
        for (let y = 0; y < h; y++) {
          enqueue(queue, 0, y, w, h, visited, mask, data, bgColor, threshold);
          enqueue(queue, w - 1, y, w, h, visited, mask, data, bgColor, threshold);
        }

        // BFS flood fill
        while (queue.length > 0) {
          const idx = queue.shift()!;
          const px = idx % w;
          const py = Math.floor(idx / w);

          const neighbors = [
            [px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1],
          ];

          for (const [nx, ny] of neighbors) {
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
            const nIdx = ny * w + nx;
            if (visited[nIdx]) continue;

            const pixel = getPixel(data, w, nx, ny);
            const dist = colorDistance(pixel, bgColor);

            if (dist <= threshold) {
              visited[nIdx] = 1;
              mask[nIdx] = 0; // background
              queue.push(nIdx);
            } else {
              visited[nIdx] = 1;
              mask[nIdx] = 1; // foreground boundary
            }
          }
        }

        // Mark unvisited as foreground
        for (let i = 0; i < w * h; i++) {
          if (!visited[i]) mask[i] = 1;
        }

        // Alpha erosion: shrink mask by 1px to remove edge artifacts
        const erodedMask = erodeMask(mask, w, h);

        // Apply mask to image data
        for (let i = 0; i < w * h; i++) {
          if (!erodedMask[i]) {
            data[i * 4 + 3] = 0; // Set alpha to 0 for background
          }
        }

        ctx.putImageData(imageData, 0, 0);

        // Calculate bbox
        const bbox = calculateBbox(erodedMask, w, h);

        // Create mask image
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = w;
        maskCanvas.height = h;
        const maskCtx = maskCanvas.getContext('2d')!;
        const maskImageData = maskCtx.createImageData(w, h);
        for (let i = 0; i < w * h; i++) {
          const v = erodedMask[i] ? 255 : 0;
          maskImageData.data[i * 4] = v;
          maskImageData.data[i * 4 + 1] = v;
          maskImageData.data[i * 4 + 2] = v;
          maskImageData.data[i * 4 + 3] = 255;
        }
        maskCtx.putImageData(maskImageData, 0, 0);

        resolve({
          cutoutBase64: canvas.toDataURL('image/png').split(',')[1],
          maskBase64: maskCanvas.toDataURL('image/png').split(',')[1],
          bbox,
        });
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => { clearTimeout(timeout); reject(new Error('Failed to load image')); };
    // Auto-detect format: PNG base64 starts with 'iVBOR', JPEG starts with '/9j'
    const mime = imageBase64.startsWith('iVBOR') ? 'image/png' : 'image/jpeg';
    img.src = `data:${mime};base64,${imageBase64}`;
  });
}

function getPixel(data: Uint8Array, w: number, x: number, y: number) {
  const i = (y * w + x) * 4;
  return { r: data[i], g: data[i + 1], b: data[i + 2] };
}

function colorDistance(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

function enqueue(
  queue: number[], x: number, y: number, w: number, h: number,
  visited: Uint8Array, mask: Uint8Array, data: Uint8Array,
  bgColor: { r: number; g: number; b: number }, threshold: number,
) {
  const idx = y * w + x;
  if (visited[idx]) return;
  visited[idx] = 1;
  const pixel = getPixel(data, w, x, y);
  if (colorDistance(pixel, bgColor) <= threshold) {
    mask[idx] = 0;
    queue.push(idx);
  } else {
    mask[idx] = 1;
  }
}

function erodeMask(mask: Uint8Array, w: number, h: number): Uint8Array {
  const result = new Uint8Array(mask.length);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (mask[i] && mask[i - 1] && mask[i + 1] && mask[i - w] && mask[i + w]) {
        result[i] = 1;
      }
    }
  }
  return result;
}

function calculateBbox(mask: Uint8Array, w: number, h: number) {
  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  return {
    x: minX,
    y: minY,
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1),
  };
}

