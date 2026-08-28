// [2] Extraction Agent - Fast local cutout using Canvas
// Replaces: ProductExtractor (gpt-image-2) + LogoExtractor (gpt-image-2)
// Time: ~1-3 seconds (local processing, no API call)

import { BaseAgent } from './base';
import type { AgentInput } from './types';
import type { VisionOutput } from './vision-agent';
import { fastCutout } from '../image/fastCutout';
import { detectTransparency } from '../image/logo-utils';

export interface LogoInfo {
  hasTransparency: boolean;
  alphaPixelPercent: number;
  format: 'PNG' | 'JPEG' | 'UNKNOWN';
  originalBase64: string; // Preserved original (or cutout if transparency preserved)
}

export interface ExtractionOutput {
  productCutout: string; // base64
  productMask: string;   // base64
  productBbox: { x: number; y: number; width: number; height: number };
  logoCutout: string;    // base64 (empty if no logo)
  logoBbox: { x: number; y: number; width: number; height: number };
  logoInfo?: LogoInfo;   // Transparency detection metadata
}

export class ExtractionAgent extends BaseAgent {
  readonly id = 'extraction';
  readonly name = '资产提取';

  protected async run(input: AgentInput): Promise<ExtractionOutput> {
    const { images, previousOutputs } = input;

    const vision = previousOutputs['vision']?.data as VisionOutput | undefined;

    // Find product image
    const productImage = images.find(img => img.role === 'main') || images[0];
    if (!productImage) {
      throw new Error('未找到产品图片');
    }

    // Fast local cutout for product (no API call!)
    this.log('Fast product cutout (local)...');
    const productResult = await fastCutout(productImage.base64);

    // Logo cutout if logo exists
    let logoCutout = '';
    let logoBbox = { x: 0, y: 0, width: 0, height: 0 };
    let logoInfo: LogoInfo | undefined;

    if (vision?.logo?.exists) {
      const logoImage = images.find(img => img.role === 'logo');
      if (logoImage) {
        // Detect transparency BEFORE any processing
        this.log('[Logo Pipeline] Detecting transparency...');
        const transparency = await detectTransparency(logoImage.base64);
        this.log(`[Logo Pipeline] format: ${transparency.format}, alpha_detected: ${transparency.hasTransparency}, alpha_pixels: ${transparency.alphaPixelPercent}%`);

        if (transparency.hasTransparency) {
          // Transparent logo: preserve original PNG + RGBA, skip flood-fill
          this.log('[Logo Pipeline] preserve_alpha: true, skipping flood-fill cutout');
          logoCutout = logoImage.base64;
          this.log('[Logo Pipeline] image2_input: PNG_RGBA');
        } else {
          // Non-transparent logo: safe to do flood-fill cutout
          this.log('[Logo Pipeline] preserve_alpha: false, running flood-fill cutout');
          try {
            const logoResult = await fastCutout(logoImage.base64);
            logoCutout = logoResult.cutoutBase64;
            logoBbox = logoResult.bbox;
          } catch {
            this.warn('Logo cutout failed, using original');
            logoCutout = logoImage.base64;
          }
        }

        // Attach logo info for downstream agents (render-agent needs it for overlay)
        logoInfo = {
          hasTransparency: transparency.hasTransparency,
          alphaPixelPercent: transparency.alphaPixelPercent,
          format: transparency.format,
          originalBase64: logoImage.base64,
        };
      }
    }

    return {
      productCutout: productResult.cutoutBase64,
      productMask: productResult.maskBase64,
      productBbox: productResult.bbox,
      logoCutout,
      logoBbox,
      logoInfo,
    };
  }
}

