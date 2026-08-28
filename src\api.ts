import type { ApiConfig, GenParams, GeneratedImage, TaskRecord } from './types';
import type { TextOverlayConfig } from './image/types';

// Proxy LAN requests through Vite dev server to avoid CORS
function resolveUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(baseUrl)) {
    return `${baseUrl}${path}`;
  }
  // If baseUrl is a LAN/private address, route through Vite proxy
  const isLan = /https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|127\.|localhost)/i.test(baseUrl);
  if (isLan) {
    return `/api-proxy${path}`;
  }
  return `${baseUrl}${path}`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(new Error('无法读取图片响应。'));
    reader.readAsDataURL(blob);
  });
}

async function normalizeImageValue(config: ApiConfig, value: string): Promise<string> {
  if (!value) return '';
  if (value.startsWith('data:')) return value.split(',')[1] || '';
  if (!/^https?:\/\//i.test(value)) return value;

  let fetchUrl = value;
  if (value.startsWith(config.baseUrl)) {
    const parsed = new URL(value);
    fetchUrl = resolveUrl(config.baseUrl, `${parsed.pathname}${parsed.search}`);
  }
  const response = await fetch(fetchUrl);
  if (!response.ok) throw new Error(`读取生成图片失败 (${response.status})`);
  return blobToBase64(await response.blob());
}

async function normalizeGeneratedImages(config: ApiConfig, items: any[]): Promise<GeneratedImage[]> {
  const normalized = await Promise.all((items || []).map(async item => ({
    b64_json: await normalizeImageValue(config, item?.b64_json || item?.url || ''),
    revised_prompt: item?.revised_prompt,
  })));
  return normalized.filter(image => Boolean(image.b64_json));
}

export function sanitizeBackgroundDirection(userInput: string): string {
  const forbidden = /(logo|brand|product|item|packaging|text|typography|headline|caption|icon|badge|seal|qr|price|discount|promotion|selling point|watermark|ignore previous|system prompt|instruction|产品|商品|包装|文字|文案|标题|品牌|标志|图标|徽章|印章|二维码|价格|折扣|促销|卖点|水印|忽略|指令)/i;
  const safeParts = userInput
    .split(/[\n。！？!?;；]+/)
    .map(part => part.trim())
    .filter(part => part && !forbidden.test(part))
    .slice(0, 6);
  return safeParts.join(', ').slice(0, 240) || 'premium neutral studio background, restrained lighting, clean empty surface';
}

export function buildStrictBackgroundPrompt(userInput: string): string {
  const direction = sanitizeBackgroundDirection(userInput);
  return `Create a complete, professional vertical e-commerce product poster (1024x1536). The provided reference image IS the product — use it as the EXACT visual reference for the product in the poster.

POSTER STRUCTURE (all layers must be present and integrated):

LAYER 1 - BRAND HEADER (top 10%): Brand name in large elegant Chinese typography, English brand name beneath in smaller serif font, optional heritage tagline.

LAYER 2 - HERO HEADLINE (12-22%): Large bold Chinese advertising slogan (6-16 characters), sub-headline with product benefit below it. Text must be clearly readable with strong contrast.

LAYER 3 - PRODUCT HERO (25-65%): The product from the reference image as the dominant visual element, centered, at a dynamic angle. Professional 3-point studio lighting. Product sits on a premium surface. Realistic contact shadow beneath product.

LAYER 4 - SELLING POINTS (68-80%): 3-4 short Chinese feature phrases arranged horizontally with decorative dividers. Clean typography.

LAYER 5 - FOOTER (85-95%): Brand color accent bar with brand name.

BACKGROUND: ${direction}. Premium atmosphere with subtle texture and depth.

CRITICAL:
- The product must match the reference image exactly — same shape, proportions, color, material, details
- ALL Chinese text must be correctly rendered as readable characters
- No QR codes, URLs, prices, certifications, watermarks
- Composition must feel like ONE cohesive professional poster
- Lighting consistent across product and background`;
}

export interface StrictBackgroundValidation {
  allowed: boolean;
  violations: string[];
  qualityScore: number;
  summary?: string;
}

export async function analyzeBackgroundStyle(
  config: ApiConfig,
  styleReferenceImages: string[],
): Promise<string> {
  if (styleReferenceImages.length === 0) return '';
  const url = resolveUrl(config.baseUrl, '/v1/chat/completions');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.textModel,
      messages: [
        {
          role: 'system',
          content: 'Analyze e-commerce reference images only for transferable background art direction. Completely ignore and do not repeat any products, people, logos, brand names, text, Chinese characters, prices, promotions, icons, badges, QR codes, packaging, claims, or factual content visible in the references. Return strict JSON with short visual-only fields: {"palette":"","surface":"","lighting":"","environment":"","depth":"","composition":""}. Describe only background colors, materials, lighting, atmosphere, camera perspective, negative-space distribution, and environmental depth.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract reusable visual background direction only. Never copy products or commercial content.' },
            ...styleReferenceImages.slice(0, 3).map(image => ({
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${image}`, detail: 'high' },
            })),
          ],
        },
      ],
      max_tokens: 260,
      temperature: 0,
    }),
  });
  if (!response.ok) throw new Error(`参考风格分析失败 (${response.status})`);
  const data = await response.json();
  const raw = String(data.choices?.[0]?.message?.content || '').trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  try {
    const parsed = JSON.parse(raw);
    return sanitizeBackgroundDirection([
      parsed.palette,
      parsed.surface,
      parsed.lighting,
      parsed.environment,
      parsed.depth,
      parsed.composition,
    ].filter(value => typeof value === 'string' && value.trim()).join('. '));
  } catch {
    throw new Error('参考风格分析未返回有效JSON');
  }
}

export async function validateStrictBackground(
  config: ApiConfig,
  backgroundBase64: string,
): Promise<StrictBackgroundValidation> {
  const url = resolveUrl(config.baseUrl, '/v1/chat/completions');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.textModel,
      messages: [
        {
          role: 'system',
          content: 'You are a strict e-commerce poster quality gate. Inspect the supplied poster image. A PASSING poster must: (1) look like ONE cohesive professional e-commerce poster; (2) have a clearly visible product as the dominant element; (3) have readable Chinese text for brand, headline, and selling points; (4) have professional lighting and premium background; (5) NO QR codes, URLs, prices, certifications, watermarks. Reject if: obvious layer separation, text is gibberish, composition is amateur, or prohibited elements exist. Return strict JSON only: {"allowed":boolean,"violations":string[],"quality_score":number,"summary":string}. quality_score is 0-100. Any score below 55 must set allowed=false. When uncertain, allowed must be false.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Evaluate this e-commerce poster for professional quality and compliance.' },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${backgroundBase64}`, detail: 'high' } },
          ],
        },
      ],
      max_tokens: 160,
      temperature: 0,
    }),
  });
  if (!response.ok) throw new Error(`海报审核失败 (${response.status})`);
  const data = await response.json();
  const raw = String(data.choices?.[0]?.message?.content || '').trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  try {
    const parsed = JSON.parse(raw);
    const violations = Array.isArray(parsed.violations) ? parsed.violations.map(String) : ['审核响应格式无效'];
    const qualityScore = Number.isFinite(Number(parsed.quality_score)) ? Number(parsed.quality_score) : 0;
    if (qualityScore < 55 && violations.length === 0) violations.push(`海报质量不足（${qualityScore}/100）`);
    return {
      allowed: parsed.allowed === true && qualityScore >= 55 && violations.length === 0,
      violations,
      qualityScore,
      summary: typeof parsed.summary === 'string' ? parsed.summary : undefined,
    };
  } catch {
    return { allowed: false, violations: ['海报审核未返回有效JSON，已按失败处理'], qualityScore: 0 };
  }
}

// Check if the endpoint is async (artworkers.online style) or sync (standard OpenAI)
function isAsyncEndpoint(config: ApiConfig): boolean {
  return config.submitEndpoint.includes('/async');
}

// Standard synchronous image generation (OpenAI compatible)
export async function generateImageSync(
  config: ApiConfig,
  prompt: string,
  params: GenParams,
  referenceImages?: string[]
): Promise<GeneratedImage[]> {
  const url = resolveUrl(config.baseUrl, config.submitEndpoint.replace('/async', ''));

  const body: any = {
    model: config.model,
    prompt,
    size: params.size,
    quality: params.quality,
    n: params.n,
    response_format: 'b64_json',
  };

  if (params.output_format !== 'png') {
    body.output_format = params.output_format;
  }
  if (params.moderation && params.moderation !== 'auto') {
    body.moderation = params.moderation;
  }
  if (params.transparent_output) {
    body.transparent_output = true;
  }

  // Pass reference image to gpt-image-2 for product fidelity
  // Note: parameter is 'image' (singular, single base64 string), NOT 'images'
  // Format: raw base64 without 'data:image/png;base64,' prefix
  if (referenceImages && referenceImages.length > 0) {
    body.image = referenceImages[0];
    // Debug: log payload structure (not full image data)
    console.log('[API] Reference image attached:', {
      hasImage: true,
      imageLength: referenceImages[0].length,
      imageStart: referenceImages[0].substring(0, 20),
      hasDataPrefix: referenceImages[0].startsWith('data:image'),
    });
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`生成失败 (${resp.status}): ${errText}`);
  }

  const data = await resp.json();
  return normalizeGeneratedImages(config, data.data || []);
}

// Submit async image generation task (artworkers.online style)
export async function submitImageTask(
  config: ApiConfig,
  prompt: string,
  params: GenParams,
  referenceImages?: string[]
): Promise<string> {
  const url = resolveUrl(config.baseUrl, config.submitEndpoint);

  const body: any = {
    model: config.model,
    prompt,
    size: params.size,
    quality: params.quality,
    n: params.n,
    response_format: 'b64_json',
    moderation: params.moderation,
    transparent_output: params.transparent_output,
  };

  if (params.output_format !== 'png') {
    body.output_format = params.output_format;
  }

  // Pass reference image to gpt-image-2 for product fidelity
  if (referenceImages && referenceImages.length > 0) {
    body.image = referenceImages[0];
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`提交失败 (${resp.status}): ${errText}`);
  }

  const data = await resp.json();
  return data.data?.id || data.id;
}

// Query task status
export async function queryTaskStatus(
  config: ApiConfig,
  taskId: string
): Promise<{
  status: string;
  images?: GeneratedImage[];
  failReason?: string;
}> {
  const url = resolveUrl(config.baseUrl, config.queryEndpoint.replace('{task_id}', taskId));

  const headers: Record<string, string> = {};
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  const resp = await fetch(url, { headers });

  if (!resp.ok) {
    throw new Error(`查询失败 (${resp.status})`);
  }

  const data = await resp.json();
  const status = data.data?.status || data.status;
  const failReason = data.data?.fail_reason || data.fail_reason;

  let images: GeneratedImage[] = [];
  if (data.data?.result?.data) {
    images = await normalizeGeneratedImages(config, data.data.result.data);
  } else if (data.data?.data) {
    images = await normalizeGeneratedImages(config, data.data.data);
  } else if (data.result?.data) {
    images = await normalizeGeneratedImages(config, data.result.data);
  } else if (data.data?.images) {
    images = await normalizeGeneratedImages(config, data.data.images);
  } else if (data.images) {
    images = await normalizeGeneratedImages(config, data.images);
  }

  return { status, images, failReason };
}

// Poll task until completion
export async function pollTask(
  config: ApiConfig,
  taskId: string,
  onProgress?: (status: string) => void,
  abortSignal?: AbortSignal
): Promise<{
  status: string;
  images: GeneratedImage[];
  failReason?: string;
}> {
  const maxAttempts = 120;
  const interval = 3000;

  for (let i = 0; i < maxAttempts; i++) {
    if (abortSignal?.aborted) throw new Error('已取消');
    const result = await queryTaskStatus(config, taskId);
    onProgress?.(result.status);
    if (result.status === 'success' || result.status === 'failure') {
      return { ...result, images: result.images || [] };
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  throw new Error('任务超时');
}

// Unified generate function - auto-detects sync vs async
export async function generateImage(
  config: ApiConfig,
  prompt: string,
  params: GenParams,
  referenceImages?: string[],
  onProgress?: (status: string) => void
): Promise<GeneratedImage[]> {
  if (isAsyncEndpoint(config)) {
    // Async mode (artworkers.online)
    const taskId = await submitImageTask(config, prompt, params, referenceImages);
    const result = await pollTask(config, taskId, onProgress);
    if (result.status === 'failure') {
      throw new Error(result.failReason || '生成失败');
    }
    return result.images || [];
  } else {
    // Sync mode (standard OpenAI compatible)
    onProgress?.('processing');
    return generateImageSync(config, prompt, params, referenceImages);
  }
}

// AI Prompt Enhancement - use text model to analyze user intent and generate professional prompt
export async function enhancePrompt(
  config: ApiConfig,
  userInput: string,
  onProgress?: (status: string) => void,
  referenceImages?: string[]
): Promise<string> {
  const url = resolveUrl(config.baseUrl, '/v1/chat/completions');

  let systemPrompt = `You are a world-class e-commerce poster art director. You design complete, print-ready commercial posters with ALL visual and text elements.

## ABSOLUTE PRODUCT RULES
1. The provided reference image IS the product. Use it as the exact visual reference.
2. Product must be PIXEL-PERFECTLY IDENTICAL to reference — same exact proportions, shape, color, material, texture, thickness, weight feel, surface finish, logo/brand marks. ZERO alteration allowed.
3. If reference provided: extract every physical detail precisely and include them in the prompt.
4. Never widen, shorten, recolor, reshape, or add features the product doesn't have.
5. ONLY change: background, lighting, environment, and add commercial text elements.
6. Do NOT redesign, beautify, or "improve" the product itself.

## COMPLETE POSTER ANATOMY (ALL LAYERS REQUIRED)
A real e-commerce poster has ALL of these layers from top to bottom:

### LAYER 1: BRAND HEADER (top 12-15%)
- Brand logo (if visible in reference, reproduce exactly)
- Brand name in large elegant Chinese typography: e.g. "张小泉" or brand-appropriate name
- English brand name beneath in refined serif font
- Heritage line: e.g. "始创于1628 · 中华老字号" or brand-appropriate tagline

### LAYER 2: HERO HEADLINE (15-28%)
- Main advertising slogan in large bold Chinese text: e.g. "锋利传承 · 匠心锻造" or product-appropriate slogan
- Sub-headline with product benefit: e.g. "精工开刃，一刀利落"
- All Chinese characters must be correctly rendered, visible, professionally typeset

### LAYER 3: PRODUCT HERO SHOT (30-65%)
- Product occupying 45-55% of poster area
- Dynamic 3/4 angle or dramatic composition
- Professional 3-point studio lighting:
  * Key light: 45° angle, revealing product texture and details
  * Fill light: opposite side, soft, preserving detail
  * Rim light: behind/above, outlining edges, premium glow
- Product on premium surface (dark stone, marble, brushed metal) matching product character
- Subtle atmospheric elements: particles, mist, or gradient haze

### LAYER 4: SELLING POINTS (65-82%)
- 3-4 product feature callouts in horizontal grid
- Each with small icon + Chinese text describing actual product features
- Features must be derived from the product itself (material, craft, design, function)
- Clean typography, evenly spaced, professional layout
- NO exaggerated claims, NO "#1 seller", NO fake certifications

### LAYER 5: FOOTER (82-100%)
- Brand color accent bar at very bottom (e.g. deep red for Chinese brands)
- Clean, minimal footer with brand name only
- NO QR codes, NO URLs, NO certification badges, NO promotional claims
- NO "free shipping", "quality guarantee", "official product" type text

## BACKGROUND DESIGN
- Must match product personality:
  * Heavy/dark products (knives, tools) → deep charcoal-to-black gradient, premium feel
  * Light/elegant products (cosmetics) → soft gradients, ivory/blush tones
  * Food products → warm red/orange tones, appetizing atmosphere
- Subtle texture: brushed metal, stone grain, fabric weave
- Depth of field: sharp product, softly blurred background

## E-COMMERCE COMPLIANCE RULES (STRICT)
- NO QR codes anywhere in the image
- NO URLs or website addresses
- NO certification badges or award seals
- NO promotional claims: "free shipping", "quality guarantee", "official product", "limited offer"
- NO watermarks or seller names
- NO price information
- Only brand name, product name, and product feature descriptions are allowed as text
- ALL text must be ACTUALLY RENDERED as visible, readable Chinese/English text
- Chinese characters must be correct, clear, professionally typeset
- Font hierarchy: brand > headline > features > footer
- Text color must contrast with background for readability
- Never use placeholder or pseudo-text

## PROMPT OUTPUT FORMAT
Write a single detailed English prompt including:
1. "A vertical e-commerce poster for [brand] [product]"
2. EXACT product description from reference analysis
3. Brand header text (Chinese + English)
4. Hero headline text (Chinese)
5. Product composition and lighting
6. Selling point text (Chinese)
7. Footer text (Chinese)
8. Background and atmosphere
9. Quality: photorealistic, 8K, print-ready, professional commercial poster

## OUTPUT: Pure English prompt text only. No quotes, no markdown, no explanations.`;

  systemPrompt = `Rewrite the user's request as a concise professional image-generation prompt. Preserve only facts explicitly supplied by the user. Never invent brands, logos, product specifications, certifications, prices, claims, or company history. Do not request generated text unless the user explicitly asks for it. Return prompt text only, without markdown or explanation.`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  // Build user message content - multimodal if reference images provided
  let userContent: any;
  if (referenceImages && referenceImages.length > 0) {
    userContent = [
      { type: 'text', text: userInput + '\n\nCRITICAL: Analyze the reference image(s) carefully. Extract the EXACT product appearance - proportions (length, width, thickness ratios), shape, color, material, surface texture, weight feel, brand marks. Then create a poster prompt that PRESERVES every detail of the product exactly as shown. Do NOT modify any product attribute.' },
      ...referenceImages.slice(0, 3).map(b64 => ({
        type: 'image_url',
        image_url: { url: `data:image/png;base64,${b64}`, detail: 'high' }
      }))
    ];
  } else {
    userContent = userInput;
  }

  onProgress?.('enhancing');

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.textModel || 'gpt-5.6-sol',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      max_tokens: 400,
      temperature: 0.6,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`提示词增强失败 (${resp.status}): ${errText}`);
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content?.trim() || userInput;
}

// Extract structured poster text elements from user prompt using text model
export async function extractPosterText(
  config: ApiConfig,
  userInput: string,
  referenceImages?: string[],
): Promise<TextOverlayConfig> {
  const url = resolveUrl(config.baseUrl, '/v1/chat/completions');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

  const userContent: any[] = [
    { type: 'text', text: `${userInput}\n\nFrom this e-commerce poster request, extract structured text elements for overlay. If the user mentions a brand name, use it. If they mention slogans or features, extract them. If information is not provided, infer reasonable defaults based on the product type. Return ONLY valid JSON.` },
  ];
  if (referenceImages?.length) {
    userContent.push({ type: 'text', text: 'Analyze the product image to infer product type and appropriate text.' });
    referenceImages.slice(0, 2).forEach(b64 => {
      userContent.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${b64}`, detail: 'high' } });
    });
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.textModel,
      messages: [
        {
          role: 'system',
          content: `You are an enterprise e-commerce poster copywriter. Extract or generate text elements for a commercial poster. Return strict JSON with these fields (all optional, but provide as many as possible):
- "brandName": Chinese brand name (2-4 chars). If not specified, infer from product or use empty.
- "brandEnglish": English brand name / romanization. If not specified, use empty.
- "heritageLine": Heritage/legacy tagline (e.g. "始创于1628·中华老字号"). If not applicable, use empty.
- "headline": Main advertising slogan in Chinese (6-16 chars, impactful, product-relevant).
- "subHeadline": Secondary benefit line in Chinese (4-12 chars).
- "sellingPoints": Array of 3-4 short Chinese feature phrases (each 2-6 chars), derived from product characteristics.
- "footerText": Brand name for footer area.

Rules:
- ALL text must be in Chinese unless it's the English brand name.
- No QR codes, URLs, prices, promotions, certifications, or exaggerated claims.
- Text must be appropriate for the product type visible in the image or described.
- Keep text concise and commercially professional.
- If brand is unknown, omit brandName and footerText rather than inventing one.`,
        },
        { role: 'user', content: userContent },
      ],
      max_tokens: 300,
      temperature: 0.4,
    }),
  });

  if (!response.ok) throw new Error(`提取海报文字失败 (${response.status})`);
  const data = await response.json();
  const raw = String(data.choices?.[0]?.message?.content || '').trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  try {
    const parsed = JSON.parse(raw);
    const cfg: TextOverlayConfig = {};
    if (parsed.brandName) cfg.brandName = String(parsed.brandName);
    if (parsed.brandEnglish) cfg.brandEnglish = String(parsed.brandEnglish);
    if (parsed.heritageLine) cfg.heritageLine = String(parsed.heritageLine);
    if (parsed.headline) cfg.headline = String(parsed.headline);
    if (parsed.subHeadline) cfg.subHeadline = String(parsed.subHeadline);
    if (Array.isArray(parsed.sellingPoints)) cfg.sellingPoints = parsed.sellingPoints.map(String).filter(Boolean);
    if (parsed.footerText) cfg.footerText = String(parsed.footerText);
    return cfg;
  } catch {
    throw new Error('海报文字提取未返回有效JSON');
  }
}

// Use gpt-image-2 to extract a clean product cutout from the reference image
// This produces a much better cutout than local flood-fill, especially for complex edges
export async function extractProductCutout(
  config: ApiConfig,
  referenceImageBase64: string,
): Promise<string> {
  const url = resolveUrl(config.baseUrl, config.submitEndpoint.replace('/async', ''));
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      prompt: 'Extract the product from this image. Remove the background completely and return ONLY the product on a fully transparent background. Preserve every detail of the product exactly as shown — same shape, proportions, color, material, texture, and surface finish. Do NOT modify, beautify, or redesign the product in any way. Output should be a clean product cutout with transparent background.',
      size: 'auto',
      quality: 'high',
      n: 1,
      response_format: 'b64_json',
      transparent_output: true,
      image: referenceImageBase64,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`AI抠图失败 (${resp.status}): ${errText}`);
  }

  const data = await resp.json();
  const items = data.data || [];
  if (items.length === 0) throw new Error('AI抠图未返回结果');
  const b64 = items[0].b64_json || items[0].url;
  if (!b64) throw new Error('AI抠图返回数据格式无效');
  // Normalize: strip data URI prefix if present
  return b64.startsWith('data:') ? b64.split(',')[1] : b64;
}

// Batch generate multiple images - PARALLEL requests (simultaneous, not sequential)
export async function generateImageBatch(
  config: ApiConfig,
  prompt: string,
  params: GenParams,
  count: number,
  referenceImages?: string[],
  onProgress?: (status: string, current: number, total: number) => void
): Promise<GeneratedImage[]> {
  onProgress?.('generating', 0, count);

  // Fire all requests in parallel (simultaneous)
  const promises = Array.from({ length: count }, (_, i) =>
    generateImage(config, prompt, params, referenceImages)
      .then(images => ({ index: i, images, error: null }))
      .catch(err => ({ index: i, images: [], error: err.message }))
  );

  const results = await Promise.allSettled(promises);
  const allImages: GeneratedImage[] = [];
  let completed = 0;

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const r = result.value;
      if (r.error) {
        console.error(`Image ${r.index + 1} failed:`, r.error);
      } else {
        allImages.push(...r.images);
      }
    }
    completed++;
    onProgress?.('generating', completed, count);
  }

  onProgress?.('done', count, count);
  return allImages;
}

// Create a new task record
export function createTaskRecord(
  prompt: string,
  params: GenParams,
  referenceImages?: string[]
): TaskRecord {
  return {
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    prompt,
    params: { ...params },
    status: 'pending',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    images: [],
    referenceImages,
    favorite: false,
  };
}

