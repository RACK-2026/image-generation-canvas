// Logo utility: transparency detection and post-generation overlay compositing
// Solves: gpt-image-2 flattens transparent PNG reference images,
//         so logos must be composited AFTER generation, not sent as reference.

/**
 * Detect if a base64 image has transparency (alpha channel with non-opaque pixels).
 * Returns detection result with metadata for logging.
 */
export async function detectTransparency(base64: string): Promise<{
  hasTransparency: boolean;
  alphaPixelPercent: number;
  format: 'PNG' | 'JPEG' | 'UNKNOWN';
}> {
  // Quick check: JPEG never has alpha
  if (base64.startsWith('/9j') || base64.startsWith('data:image/jpeg')) {
    return { hasTransparency: false, alphaPixelPercent: 0, format: 'JPEG' };
  }

  // PNG check
  const isPng = base64.startsWith('iVBOR') || base64.startsWith('data:image/png');
  if (!isPng) {
    return { hasTransparency: false, alphaPixelPercent: 0, format: 'UNKNOWN' };
  }

  // Load image and check alpha channel
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        // Limit sample size for performance
        const maxDim = 256;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, w, h);
        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;
        const totalPixels = w * h;
        let transparentPixels = 0;

        for (let i = 3; i < data.length; i += 4) {
          if (data[i] < 250) { // Not fully opaque
            transparentPixels++;
          }
        }

        const alphaPixelPercent = (transparentPixels / totalPixels) * 100;

        resolve({
          hasTransparency: alphaPixelPercent > 1, // >1% non-opaque = transparent
          alphaPixelPercent: Math.round(alphaPixelPercent * 10) / 10,
          format: 'PNG',
        });
      } catch {
        resolve({ hasTransparency: false, alphaPixelPercent: 0, format: 'PNG' });
      }
    };
    img.onerror = () => resolve({ hasTransparency: false, alphaPixelPercent: 0, format: 'UNKNOWN' });
    const raw = base64.includes(',') ? base64.split(',')[1] : base64;
    img.src = `data:image/png;base64,${raw}`;
  });
}

/**
 * Composite a transparent logo PNG onto a generated image.
 * Adaptive: detects background brightness at logo position,
 * adds a semi-transparent light card on dark backgrounds.
 *
 * @param generatedB64 - The AI-generated image (base64, no data URI prefix)
 * @param logoB64 - The transparent logo PNG (base64, no data URI prefix)
 * @param options - Position and size options
 * @returns Final composited image as base64 (no data URI prefix)
 */
export async function compositeLogoOntoImage(
  generatedB64: string,
  logoB64: string,
  options: {
    position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center';
    /** Logo width as fraction of canvas width (0-1). Default 0.30 */
    widthFraction?: number;
    /** Margin from edge in pixels. Default 8 */
    margin?: number;
  } = {},
): Promise<string> {
  const {
    position = 'top-left',
    widthFraction = 0.30,
    margin = 8,
  } = options;

  return new Promise((resolve, reject) => {
    const genImg = new Image();
    const logoImg = new Image();
    let genLoaded = false;
    let logoLoaded = false;

    const tryComposite = () => {
      if (!genLoaded || !logoLoaded) return;

      try {
        const canvas = document.createElement('canvas');
        canvas.width = genImg.width;
        canvas.height = genImg.height;
        const ctx = canvas.getContext('2d')!;

        // Draw generated image as background
        ctx.drawImage(genImg, 0, 0);

        // Calculate logo size (maintain aspect ratio)
        const logoAspect = logoImg.width / logoImg.height;
        const logoW = Math.round(genImg.width * widthFraction);
        const logoH = Math.round(logoW / logoAspect);

        // Calculate position
        let x = margin;
        let y = margin;

        switch (position) {
          case 'top-left':
            x = margin; y = margin; break;
          case 'top-right':
            x = genImg.width - logoW - margin; y = margin; break;
          case 'bottom-left':
            x = margin; y = genImg.height - logoH - margin; break;
          case 'bottom-right':
            x = genImg.width - logoW - margin; y = genImg.height - logoH - margin; break;
          case 'top-center':
            x = (genImg.width - logoW) / 2; y = margin; break;
        }

        // Detect background brightness at logo position
        const sampleW = Math.min(logoW, 100);
        const sampleH = Math.min(logoH, 50);
        const sampleCanvas = document.createElement('canvas');
        sampleCanvas.width = sampleW;
        sampleCanvas.height = sampleH;
        const sampleCtx = sampleCanvas.getContext('2d')!;
        sampleCtx.drawImage(genImg, x, y, sampleW, sampleH, 0, 0, sampleW, sampleH);
        const sampleData = sampleCtx.getImageData(0, 0, sampleW, sampleH).data;

        let totalBrightness = 0;
        let pixelCount = 0;
        for (let i = 0; i < sampleData.length; i += 4) {
          // Skip near-transparent pixels
          if (sampleData[i + 3] < 128) continue;
          totalBrightness += (sampleData[i] + sampleData[i + 1] + sampleData[i + 2]) / 3;
          pixelCount++;
        }
        const avgBrightness = pixelCount > 0 ? totalBrightness / pixelCount : 128;
        const isDarkBg = avgBrightness < 100;

        // If dark background, lighten dark pixels in logo (text→light, seal preserved)
        if (isDarkBg) {
          const logoCanvas = document.createElement('canvas');
          logoCanvas.width = logoW;
          logoCanvas.height = logoH;
          const logoCtx = logoCanvas.getContext('2d')!;
          logoCtx.drawImage(logoImg, 0, 0, logoW, logoH);
          const logoData = logoCtx.getImageData(0, 0, logoW, logoH);
          const ld = logoData.data;
          
          for (let i = 0; i < logoW * logoH; i++) {
            const off = i * 4;
            if (ld[off + 3] < 128) continue;
            const r = ld[off], g = ld[off + 1], b = ld[off + 2];
            const max = Math.max(r, g, b), min = Math.min(r, g, b);
            const sat = max === 0 ? 0 : (max - min) / max;
            const bri = (r + g + b) / 3;
            
            if (sat < 0.3 && bri < 100) {
              const factor = 1 - (bri / 100);
              const newVal = Math.round(160 + factor * 60);
              ld[off] = newVal;
              ld[off + 1] = newVal;
              ld[off + 2] = newVal;
            }
          }
          
          logoCtx.putImageData(logoData, 0, 0);
          ctx.drawImage(logoCanvas, x, y);
        } else {
          // Composite logo with alpha (default operation preserves transparency)
          ctx.drawImage(logoImg, x, y, logoW, logoH);
        }

        // Export as PNG to preserve any remaining transparency
        const result = canvas.toDataURL('image/png').split(',')[1];
        resolve(result);
      } catch (err) {
        reject(err);
      }
    };

    genImg.onload = () => { genLoaded = true; tryComposite(); };
    genImg.onerror = () => reject(new Error('Failed to load generated image for logo composite'));

    logoImg.onload = () => { logoLoaded = true; tryComposite(); };
    logoImg.onerror = () => reject(new Error('Failed to load logo for composite'));

    const genRaw = generatedB64.includes(',') ? generatedB64.split(',')[1] : generatedB64;
    const logoRaw = logoB64.includes(',') ? logoB64.split(',')[1] : logoB64;

    // Auto-detect format
    const genMime = genRaw.startsWith('iVBOR') ? 'image/png' : 'image/jpeg';
    const logoMime = logoRaw.startsWith('iVBOR') ? 'image/png' : 'image/jpeg';

    genImg.src = `data:${genMime};base64,${genRaw}`;
    logoImg.src = `data:${logoMime};base64,${logoRaw}`;
  });
}

