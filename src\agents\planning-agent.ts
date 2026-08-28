// [3] Planning Agent - Single text call for copy + style + design + prompt
// Replaces: CopyAnalyzer + StyleAnalyzer + DesignPlanner + PromptEngineer
// Time: ~15-25 seconds (was ~60s across 4 separate calls)

import { BaseAgent } from './base';
import type { AgentInput } from './types';
import type { VisionOutput } from './vision-agent';
import type { ExtractionOutput } from './extraction-agent';

export interface PlanningOutput {
  copy: {
    brandName: string;
    brandEnglish: string;
    heritageLine: string;
    headline: string;
    subHeadline: string;
    sellingPoints: string[];
    footerText: string;
    tone: string;
  };
  style: {
    layout: string;
    lighting: string;
    palette: { primary: string; accent: string; text: string };
    mood: string;
  };
  prompt: string;
  negativePrompt: string;
  generationParams: {
    size: string;
    quality: string;
    n: number;
  };
}

function resolveUrl(baseUrl: string, path: string): string {
  const isLan = /https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(baseUrl);
  if (isLan) return `/api-proxy${path}`;
  return `${baseUrl}${path}`;
}

export class PlanningAgent extends BaseAgent {
  readonly id = 'planning';
  readonly name = '方案规划';

  protected async run(input: AgentInput): Promise<PlanningOutput> {
    const { config, userInput, params, previousOutputs } = input;

    const vision = previousOutputs['vision']?.data as VisionOutput | undefined;
    const extraction = previousOutputs['extraction']?.data as ExtractionOutput | undefined;

    // Calculate product aspect ratio from bbox for proportion constraint
    let productAspectInfo = '';
    if (extraction?.productBbox && extraction.productBbox.width > 0 && extraction.productBbox.height > 0) {
      const ratio = (extraction.productBbox.width / extraction.productBbox.height).toFixed(2);
      productAspectInfo = `\nCRITICAL: The product's exact aspect ratio is ${extraction.productBbox.width}:${extraction.productBbox.height} (width:height ≈ ${ratio}:1). The product MUST maintain this exact proportion in the poster. Do NOT stretch, widen, narrow, or reshape the product.`;
    }

    const url = resolveUrl(config.baseUrl, '/v1/chat/completions');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

    const productInfo = vision?.product
      ? `Category: ${vision.product.category}, Material: ${vision.product.material}, Color: ${vision.product.color}, Features: ${vision.product.important_features.join(', ')}`
      : 'Unknown product';

    const logoInfo = vision?.logo?.exists
      ? `Brand: ${vision.logo.brand}, English: ${vision.logo.englishText}`
      : 'No logo';

    // Check if transparent logo overlay will be used (from extraction)
    const extractionLogoInfo = extraction?.logoInfo;
    const hasTransparentLogo = extractionLogoInfo?.hasTransparency;
    const transparentLogoRule = hasTransparentLogo
      ? '\n11. TRANSPARENT LOGO OVERLAY RULE: The logo is a transparent PNG that will be composited AFTER image generation via post-processing. DO NOT draw, render, or place any logo, brand text, or brand mark in the top-left area (or anywhere). Leave the top-left corner completely EMPTY and CLEAR for the logo overlay. The AI-generated image should have NO logo whatsoever - it will be added later as a separate overlay step.'
      : '';

    const refInfo = vision?.reference
      ? `Composition: ${vision.reference.composition}, Lighting: ${vision.reference.lighting}, Style: ${vision.reference.color_style}, Photography: ${vision.reference.photography_style}`
      : 'No reference';

    const size = params.size || '1024x1536';

    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.textModel,
        messages: [
          {
            role: 'system',
            content: `You are an enterprise e-commerce poster design system. Generate ALL of the following in ONE response. Return strict JSON:

{
  "copy": {
    "brandName": "<Chinese brand, 2-4 chars>",
    "brandEnglish": "<English brand>",
    "heritageLine": "<heritage tagline or empty>",
    "headline": "<main slogan, 6-16 Chinese chars>",
    "subHeadline": "<sub line, 4-12 chars>",
    "sellingPoints": ["<2-6 chars>", "<2-6 chars>", "<2-6 chars>"],
    "footerText": "<brand for footer>",
    "tone": "<premium_heritage|modern_minimal|bold_sporty|elegant_luxury>"
  },
  "style": {
    "layout": "<center_product|grid|split>",
    "lighting": "<soft_studio|dramatic|natural>",
    "palette": {"primary": "#hex", "accent": "#hex", "text": "#hex"},
    "mood": "<mood description>"
  },
  "prompt": "<FULL image generation prompt for gpt-image-2>",
  "negativePrompt": "<negative prompt>",
  "generationParams": {"size": "${size}", "quality": "high", "n": 1}
}

PROMPT RULES:
1. Start with "A vertical e-commerce poster (${size})"
2. FIXED LAYOUT RULES (positions are LOCKED, derived from reference image analysis):
   - LOGO (MUST be flush against top-left corner, zero margin - like a corner label/tag): A light/white card COMPLETELY FLUSH with the top edge AND left edge (0px margin). Only the bottom-right corner is rounded; top-left corner is square. Card aspect ratio ~3.5:1 (width:height) - wide and short, NOT tall or square. Contains "张小泉" calligraphy + "SINCE 1628" + small seal icon. CRITICAL: NO gap between card and top/left edges. CRITICAL: Logo text and card must NOT be stretched, compressed, or distorted - maintain natural character proportions.
   - HEADLINES (center-left, 15-50% height, left 5-55% width): 1-2 lines of large Chinese text (product slogan). Large bold font, dominant visual weight.
   - SELLING POINTS (left half, 40-70% height): 3-4 items with icon + short text label (2-6 chars). Icons: circular badges or simple line icons.
   - PRODUCT (right side or center, 10-90% height): Product prominently displayed, takes 40-60% of frame. Proportions must exactly match reference image.
   - FORMAT: Vertical poster, photorealistic, 8K, print-ready.
3. DIVERGENCE SCOPE (these elements SHOULD vary between generated images - they are NOT constraints, they are creative freedom):
   - Background style & color: Can be dark luxury, bright kitchen, traditional workshop, natural outdoor, etc.
   - Selling point layout style: Can be vertical list on left, horizontal row at center-bottom, pill-shaped badges, circular icons, etc.
   - Headline font style: Can be calligraphy, sans-serif, brush stroke, seal script, etc.
   - Headline text content: Different Chinese slogans for the same product (e.g., "珍檀精作/匠心砧板" vs "好木好板/健康厨房" vs "百年传承/古法板").
   - Additional decorative elements: Can include trophy, sales badge, ingredient props, seal stamps, cloud patterns, etc.
   - Lighting & atmosphere: Dramatic spotlight, natural daylight, warm candlelight, forge glow, etc.
   - Product presentation: Standing upright, on surface, in use context, angled, etc.
   - Color palette: Dark gold, fresh green-wood, warm amber-red, clean white, etc.
   - Endorsement area (bottom 72-85%): Certificates, awards, trust text - style and content can vary.
4. ALL Chinese text written character-by-character in the prompt
5. The reference image IS the product - describe it precisely
6. Include: product description, composition, lighting, background, style, photography params
7. End with "photorealistic, 8K, print-ready"
8. CRITICAL: Include "product proportions exactly matching the reference image, no distortion, no reshaping, maintain exact width-to-height ratio" in the prompt
9. EACH generated image should explore different choices from the DIVERGENCE SCOPE to give users visually distinct options
10. BRAND FIDELITY RULES (MUST include in prompt):
    - PRODUCT is the hero: The product in the reference image is the REAL product. Its shape, color, material, texture, proportions, and details MUST be preserved exactly.
    - LOGO is a fixed brand element: "张小泉" calligraphy must look like real Chinese brush calligraphy with natural stroke width. Do NOT make characters fat, thin, stretched, or squashed.
    - NO plastic/glossy look: Avoid hyper-perfect, plastic, 3D-rendered appearance. Use natural lighting, real textures.
    - Material accuracy: Wood grain must look like real wood. Metal must have realistic metallic reflection.
    - The output product should look like the SAME product as the reference, just in a different scene/lighting.

NEGATIVE PROMPT: no QR codes, URLs, prices, watermarks, no product distortion, no product reshaping, no product recoloring, no logo stretching, no logo compression, no deformed text, no garbled text, no plastic look, no 3D render look, no glossy artificial appearance, no deformed product, no cartoon, no illustration, no missing product details${hasTransparentLogo ? ', no text in top-left corner, no logo text in top-left area, no brand mark in top-left, no logo drawn by AI' : ''}.

COPY RULES:
- ALL text in Chinese except brandEnglish
- No QR codes, URLs, prices, promotions
- Selling points 2-6 chars each
- If brand unknown, leave brandName empty

Return ONLY valid JSON.`,
          },
          {
            role: 'user',
            content: `User request: ${userInput}

Product: ${productInfo}
Logo: ${logoInfo}
Reference style: ${refInfo}
Detected texts: ${(vision?.detectedTexts || []).join(', ')}
Colors: ${(vision?.colors || []).join(', ')}${productAspectInfo}${transparentLogoRule}`,
          },
        ],
        max_tokens: 1200,
        temperature: 0.3,
      }),
    });

    if (!resp.ok) throw new Error(`方案规划失败 (${resp.status})`);
    const data = await resp.json();
    const raw = String(data.choices?.[0]?.message?.content || '').trim()
      .replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

    try {
      const parsed = JSON.parse(raw);
      return {
        copy: parsed.copy || { brandName: '', brandEnglish: '', heritageLine: '', headline: '', subHeadline: '', sellingPoints: [], footerText: '', tone: 'premium' },
        style: parsed.style || { layout: 'center_product', lighting: 'soft_studio', palette: { primary: '#1a1a1a', accent: '#c0a060', text: '#ffffff' }, mood: 'premium' },
        prompt: parsed.prompt || '',
        negativePrompt: parsed.negativePrompt || '',
        generationParams: parsed.generationParams || { size, quality: 'high', n: 1 },
      };
    } catch {
      throw new Error('方案规划未返回有效JSON');
    }
  }
}

