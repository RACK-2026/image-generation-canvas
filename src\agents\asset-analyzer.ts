// [1] Asset Analysis Agent - Analyzes all input images to understand products, logos, references

import { BaseAgent } from './base';
import type { AgentInput, AssetAnalysisOutput } from './types';
import type { ApiConfig } from '../types';

function resolveUrl(baseUrl: string, path: string): string {
  const isLan = /https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|127\.|localhost)/i.test(baseUrl);
  if (isLan) return `/api-proxy${path}`;
  return `${baseUrl}${path}`;
}

export class AssetAnalyzer extends BaseAgent {
  readonly id = 'asset-analyzer';
  readonly name = '资产分析';

  protected async run(input: AgentInput): Promise<AssetAnalysisOutput> {
    const { config, images, userInput } = input;

    if (images.length === 0) {
      return {
        products: [],
        logos: [],
        references: [],
        colors: [],
        materials: [],
        overallStyle: 'neutral',
        detectedTexts: [],
      };
    }

    const url = resolveUrl(config.baseUrl, '/v1/chat/completions');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

    // Build multimodal content with all images
    const userContent: any[] = [
      { type: 'text', text: `User request: ${userInput}\n\nAnalyze ALL the provided images. Each image has a role label. Return structured JSON describing what you see.` },
    ];

    for (const img of images.slice(0, 6)) {
      userContent.push({
        type: 'text',
        text: `[Image ${img.index}: role=${img.role}, label=${img.label}]`,
      });
      userContent.push({
        type: 'image_url',
        image_url: { url: `data:image/png;base64,${img.base64}`, detail: 'high' },
      });
    }

    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.textModel,
        messages: [
          {
            role: 'system',
            content: `You are an expert e-commerce asset analyzer. Analyze the provided images and return strict JSON:
{
  "products": [{"index": <image_index>, "role": "<role>", "category": "<product_category_english>", "count": <number_of_items>}],
  "logos": [{"index": <image_index>, "brand": "<brand_name>", "hasText": <boolean>}],
  "references": [{"index": <image_index>, "style": "<style_description>", "layout": "<layout_type>"}],
  "colors": ["<hex_color>", ...],
  "materials": ["<material>", ...],
  "overallStyle": "<overall_style>",
  "detectedTexts": ["<text_found_in_images>", ...]
}
Rules:
- Identify which images contain products (main product, product details)
- Identify which images contain logos/brand marks
- Identify which are reference posters/styles
- Extract dominant colors as hex codes
- Identify materials visible in images
- Extract any visible text from images
- Be precise about product categories
- Return ONLY valid JSON, no markdown`,
          },
          { role: 'user', content: userContent },
        ],
        max_tokens: 500,
        temperature: 0.2,
      }),
    });

    if (!resp.ok) throw new Error(`资产分析失败 (${resp.status})`);
    const data = await resp.json();
    const raw = String(data.choices?.[0]?.message?.content || '').trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();

    try {
      const parsed = JSON.parse(raw);
      return {
        products: Array.isArray(parsed.products) ? parsed.products : [],
        logos: Array.isArray(parsed.logos) ? parsed.logos : [],
        references: Array.isArray(parsed.references) ? parsed.references : [],
        colors: Array.isArray(parsed.colors) ? parsed.colors : [],
        materials: Array.isArray(parsed.materials) ? parsed.materials : [],
        overallStyle: parsed.overallStyle || 'neutral',
        detectedTexts: Array.isArray(parsed.detectedTexts) ? parsed.detectedTexts : [],
      };
    } catch {
      throw new Error('资产分析未返回有效JSON');
    }
  }
}

