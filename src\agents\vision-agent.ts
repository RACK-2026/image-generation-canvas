// [1] Vision Agent - Single multimodal call for all visual analysis
// Replaces: AssetAnalyzer + product description + logo analysis

import { BaseAgent } from './base';
import type { AgentInput } from './types';
import imageCompression from 'browser-image-compression';

// Convert base64 string to Blob
function base64ToBlob(base64: string, mime = 'image/jpeg'): Blob {
  const byteChars = atob(base64);
  const byteArrays = [];
  for (let offset = 0; offset < byteChars.length; offset += 512) {
    const slice = byteChars.slice(offset, offset + 512);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    byteArrays.push(new Uint8Array(byteNumbers));
  }
  return new Blob(byteArrays, { type: mime });
}

// Convert Blob to base64 string (without data URI prefix)
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Strip the data:image/xxx;base64, prefix
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.substring(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Blob to base64 failed'));
    reader.readAsDataURL(blob);
  });
}

// Compress image using browser-image-compression (Web Worker based, non-blocking)
// detail:'low' only needs ~512px, so we compress aggressively
// For logo images with transparency, preserve PNG format to keep alpha channel
async function resizeImageForVision(base64: string, maxDim = 512, isLogo = false): Promise<{ base64: string; mime: string }> {
  try {
    // Detect if base64 is PNG or JPEG
    const isPng = base64.substring(0, 20).includes('PNG') || base64.length > 500000;
    // Logo images: preserve PNG format to keep alpha channel
    const forcePng = isLogo && isPng;
    const mime = forcePng ? 'image/png' : (isPng ? 'image/png' : 'image/jpeg');
    
    const blob = base64ToBlob(base64, mime);
    const file = new File([blob], forcePng ? 'logo.png' : 'img.jpg', { type: mime });

    const compressedBlob = await imageCompression(file, {
      maxSizeMB: forcePng ? 0.2 : 0.05, // Logo needs more quality (preserve detail)
      maxWidthOrHeight: maxDim,
      useWebWorker: true,
      fileType: forcePng ? 'image/png' : 'image/jpeg',
      initialQuality: forcePng ? 0.9 : 0.6,
    });

    const resultB64 = await blobToBase64(compressedBlob);
    return { base64: resultB64, mime: forcePng ? 'image/png' : 'image/jpeg' };
  } catch (e) {
    console.warn('[VisionAgent] browser-image-compression failed, using original:', e);
    const isPng = base64.substring(0, 20).includes('PNG');
    return { base64, mime: isPng ? 'image/png' : 'image/jpeg' };
  }
}

export interface VisionOutput {
  product: {
    category: string;
    shape: string;
    material: string;
    color: string;
    important_features: string[];
    count: number;
  };
  logo: {
    exists: boolean;
    brand: string;
    englishText: string;
    position: string;
  };
  reference: {
    composition: string;
    lighting: string;
    color_style: string;
    photography_style: string;
  };
  colors: string[];
  detectedTexts: string[];
}

function resolveUrl(baseUrl: string, path: string): string {
  const isLan = /https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|127\.|localhost)/i.test(baseUrl);
  if (isLan) return `/api-proxy${path}`;
  return `${baseUrl}${path}`;
}

export class VisionAgent extends BaseAgent {
  readonly id = 'vision';
  readonly name = '视觉分析';

  protected async run(input: AgentInput): Promise<VisionOutput> {
    const { config, images, userInput } = input;

    if (images.length === 0) {
      return this.defaults();
    }

    const url = resolveUrl(config.baseUrl, '/v1/chat/completions');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

    // Build multimodal content with all images in ONE call
    const userContent: any[] = [
      { type: 'text', text: `User request: ${userInput}\n\nAnalyze all images and return structured JSON.` },
    ];

    // Compress images before sending (detail:'low' only needs ~512px)
    // Logo images: preserve PNG format to keep alpha channel
    const compressedResults = await Promise.all(
      images.slice(0, 6).map(img => resizeImageForVision(img.base64, 512, img.role === 'logo'))
    );

    for (let idx = 0; idx < compressedResults.length; idx++) {
      const { base64: b64, mime } = compressedResults[idx];
      userContent.push({
        type: 'image_url',
        image_url: { url: `data:${mime};base64,${b64}`, detail: 'low' },
      });
    }

    const resp = await fetch(url, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(90000), // 90s timeout
      body: JSON.stringify({
        model: config.textModel,
        messages: [
          {
            role: 'system',
            content: `You are an expert e-commerce visual analyst. Analyze ALL provided images and return strict JSON:
{
  "product": {
    "category": "<english category, e.g. kitchen_knife, candle, headphone>",
    "shape": "<shape description>",
    "material": "<material>",
    "color": "<dominant color>",
    "important_features": ["<feature1>", "<feature2>", "<feature3>"],
    "count": <number>
  },
  "logo": {
    "exists": <true if logo image provided or logo visible>,
    "brand": "<brand name in Chinese>",
    "englishText": "<English brand text if any>",
    "position": "<top_center|top_left|etc>"
  },
  "reference": {
    "composition": "<center_product|grid|split|etc>",
    "lighting": "<soft_studio|dramatic|natural|etc>",
    "color_style": "<dark_luxury|bright_minimal|warm_natural|etc>",
    "photography_style": "<commercial|lifestyle|flat_lay|etc>"
  },
  "colors": ["<hex>", "<hex>", "<hex>"],
  "detectedTexts": ["<text1>", "<text2>"]
}
Rules:
- Analyze product image for physical attributes
- If logo image provided, extract brand info
- If reference poster provided, analyze its style
- Return ONLY valid JSON`,
          },
          { role: 'user', content: userContent },
        ],
        max_tokens: 600,
        temperature: 0.2,
      }),
    });

    if (!resp.ok) throw new Error(`视觉分析失败 (${resp.status})`);
    const data = await resp.json();
    const raw = String(data.choices?.[0]?.message?.content || '').trim()
      .replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

    try {
      const parsed = JSON.parse(raw);
      return {
        product: parsed.product || { category: 'unknown', shape: '', material: '', color: '', important_features: [], count: 1 },
        logo: parsed.logo || { exists: false, brand: '', englishText: '', position: 'top_center' },
        reference: parsed.reference || { composition: 'center_product', lighting: 'soft_studio', color_style: 'dark_luxury', photography_style: 'commercial' },
        colors: Array.isArray(parsed.colors) ? parsed.colors : [],
        detectedTexts: Array.isArray(parsed.detectedTexts) ? parsed.detectedTexts : [],
      };
    } catch {
      throw new Error('视觉分析未返回有效JSON');
    }
  }

  private defaults(): VisionOutput {
    return {
      product: { category: 'unknown', shape: '', material: '', color: '', important_features: [], count: 1 },
      logo: { exists: false, brand: '', englishText: '', position: 'top_center' },
      reference: { composition: 'center_product', lighting: 'soft_studio', color_style: 'dark_luxury', photography_style: 'commercial' },
      colors: [],
      detectedTexts: [],
    };
  }
}

