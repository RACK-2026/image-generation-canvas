// [7] Prompt Engineering Agent - Synthesizes all analysis into image generation prompt

import { BaseAgent } from './base';
import type {
  AgentInput, PromptEngineeringOutput,
  ProductExtractionOutput, CopyAnalysisOutput,
  StyleAnalysisOutput, DesignPlanOutput, LogoExtractionOutput,
} from './types';

function resolveUrl(baseUrl: string, path: string): string {
  const isLan = /https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(baseUrl);
  if (isLan) return `/api-proxy${path}`;
  return `${baseUrl}${path}`;
}

export class PromptEngineer extends BaseAgent {
  readonly id = 'prompt-engineer';
  readonly name = 'Prompt工程';

  protected async run(input: AgentInput): Promise<PromptEngineeringOutput> {
    const { config, params, previousOutputs } = input;

    const product = previousOutputs['product-extractor']?.data as ProductExtractionOutput | undefined;
    const copy = previousOutputs['copy-analyzer']?.data as CopyAnalysisOutput | undefined;
    const style = previousOutputs['style-analyzer']?.data as StyleAnalysisOutput | undefined;
    const plan = previousOutputs['design-planner']?.data as DesignPlanOutput | undefined;
    const logo = previousOutputs['logo-extractor']?.data as LogoExtractionOutput | undefined;

    const url = resolveUrl(config.baseUrl, '/v1/chat/completions');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

    // Build comprehensive context from all agents
    const context = {
      product: product?.description,
      copy,
      style,
      plan,
      logo: logo ? { brand: logo.brand, hasLogo: !!logo.logoBase64, usageRule: logo.usageRule } : null,
      size: params.size,
      quality: params.quality,
      count: params.n,
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.textModel,
        messages: [
          {
            role: 'system',
            content: `You are an expert prompt engineer for e-commerce poster image generation. Based on the structured design data, write a detailed image generation prompt and a negative prompt.

The prompt MUST include ALL of these elements explicitly:
1. "A vertical e-commerce poster (1024x1536)"
2. EXACT product description from the product data (shape, color, material, proportions)
3. Brand header text in Chinese (brand name + English + heritage line)
4. Hero headline text in Chinese (large, bold)
5. Product composition: position, angle, lighting setup
6. Selling point text in Chinese (3-4 features)
7. Footer description
8. Background and atmosphere description
9. Quality: "photorealistic, 8K, print-ready, professional commercial poster"

The negative prompt MUST include:
- "DO NOT regenerate or modify the logo"
- "DO NOT distort or redesign the product"
- "No QR codes, URLs, prices, certifications, watermarks"
- "No extra products or objects"
- "No brand errors or incorrect text"

Return strict JSON:
{
  "prompt": "<detailed English prompt with all Chinese text spelled out>",
  "negativePrompt": "<what to avoid>",
  "referencePriority": ["<which references matter most>"],
  "generationParams": {"size": "<size>", "quality": "<quality>", "n": <count>}
}

CRITICAL: All Chinese text must be written out character-by-character in the prompt so the image model renders it correctly.
Return ONLY valid JSON.`,
          },
          { role: 'user', content: JSON.stringify(context, null, 2) },
        ],
        max_tokens: 800,
        temperature: 0.3,
      }),
    });

    if (!resp.ok) throw new Error(`Prompt工程失败 (${resp.status})`);
    const data = await resp.json();
    const raw = String(data.choices?.[0]?.message?.content || '').trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();

    try {
      const parsed = JSON.parse(raw);
      return {
        prompt: parsed.prompt || '',
        negativePrompt: parsed.negativePrompt || '',
        referencePriority: Array.isArray(parsed.referencePriority) ? parsed.referencePriority : ['product_cutout'],
        generationParams: {
          size: parsed.generationParams?.size || params.size,
          quality: parsed.generationParams?.quality || params.quality,
          n: parsed.generationParams?.n || params.n,
        },
      };
    } catch {
      throw new Error('Prompt工程未返回有效JSON');
    }
  }
}

