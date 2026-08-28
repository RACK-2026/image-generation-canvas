// [4] Render Agent - Image generation with product cutout reference
// Replaces: ImageGenerator (same logic, cleaner interface)

import { BaseAgent } from './base';
import type { AgentInput } from './types';
import type { PlanningOutput } from './planning-agent';
import type { ExtractionOutput } from './extraction-agent';
import { generateImageBatch } from '../api';
import type { GenParams } from '../types';
import { compositeLogoOntoImage } from '../image/logo-utils';

export interface RenderOutput {
  images: Array<{ b64_json: string; revised_prompt?: string }>;
  promptUsed: string;
  referenceUsed: string;
}

/** Crop a base64 PNG to its content bounding box (removes transparent padding) */
function cropToBbox(cutoutBase64: string, bbox: { x: number; y: number; width: number; height: number }): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        // Add small padding (2%) to avoid cutting edges
        const pad = Math.round(Math.max(bbox.width, bbox.height) * 0.02);
        const sx = Math.max(0, bbox.x - pad);
        const sy = Math.max(0, bbox.y - pad);
        const sw = Math.min(img.width - sx, bbox.width + pad * 2);
        const sh = Math.min(img.height - sy, bbox.height + pad * 2);
        canvas.width = sw;
        canvas.height = sh;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        resolve(canvas.toDataURL('image/png').split(',')[1]);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('Failed to load cutout for cropping'));
    const mime = cutoutBase64.startsWith('iVBOR') ? 'image/png' : 'image/jpeg';
    img.src = `data:${mime};base64,${cutoutBase64}`;
  });
}

export class RenderAgent extends BaseAgent {
  readonly id = 'render';
  readonly name = '图片生成';

  protected async run(input: AgentInput): Promise<RenderOutput> {
    const { config, params, previousOutputs } = input;

    const planning = previousOutputs['planning']?.data as PlanningOutput | undefined;
    const extraction = previousOutputs['extraction']?.data as ExtractionOutput | undefined;

    if (!planning?.prompt) {
      throw new Error('方案规划未生成有效提示词');
    }

    // Crop cutout to bbox to remove transparent padding (fixes product proportion distortion)
    let referenceImages: string[] | undefined;
    if (extraction?.productCutout && extraction?.productBbox) {
      this.log('Cropping cutout to bbox to preserve product proportions...');
      const cropped = await cropToBbox(extraction.productCutout, extraction.productBbox);
      referenceImages = [cropped];
      this.log(`Cropped reference: ${extraction.productBbox.width}x${extraction.productBbox.height}px`);
    }

    const imageCount = config.imageCount || 1;
    this.log(`Generating ${imageCount} image(s) in parallel...`);
    const genParams = {
      size: planning.generationParams.size || params.size || '1024x1536',
      quality: (planning.generationParams.quality || params.quality || 'high') as GenParams['quality'],
    } as GenParams;

    const images = await generateImageBatch(
      config,
      planning.prompt,
      genParams,
      imageCount,
      referenceImages,
    );

    if (images.length === 0) {
      throw new Error('未能生成任何图片');
    }

    // Post-processing: overlay transparent logo onto generated images
    // AI generates background + product + layout, then original logo is composited on top
    let finalImages = images;
    if (extraction?.logoInfo?.hasTransparency && extraction.logoInfo.originalBase64) {
      this.log('[Logo Pipeline] Post-processing: overlaying transparent logo...');
      finalImages = [];
      for (const img of images) {
        try {
          const composited = await compositeLogoOntoImage(
            img.b64_json,
            extraction.logoInfo.originalBase64,
            {
              position: 'top-left',
              widthFraction: 0.30,
              margin: 8,
            },
          );
          finalImages.push({ ...img, b64_json: composited });
          this.log('[Logo Pipeline] Logo overlay composite success');
        } catch (err) {
          this.warn(`[Logo Pipeline] Overlay failed: ${err}`);
          finalImages.push(img); // Fallback: use image without overlay
        }
      }
    }

    return {
      images: finalImages.map(img => ({ b64_json: img.b64_json, revised_prompt: img.revised_prompt })),
      promptUsed: planning.prompt,
      referenceUsed: extraction?.productCutout ? 'product_cutout_cropped' : 'none',
    };
  }
}

