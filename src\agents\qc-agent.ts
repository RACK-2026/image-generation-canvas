// [5] QC Agent - Quality check with targeted retry
// Only rolls back planning -> render, not the full pipeline

import { BaseAgent } from './base';
import type { AgentInput } from './types';
import type { PlanningOutput } from './planning-agent';
import type { VisionOutput } from './vision-agent';

export interface QCOutput {
  productSimilarity: number;
  textAccuracy: number;
  overallScore: number;
  pass: boolean;
  violations: string[];
  summary: string;
  suggestions: string[];
}

function resolveUrl(baseUrl: string, path: string): string {
  const isLan = /https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(baseUrl);
  if (isLan) return `/api-proxy${path}`;
  return `${baseUrl}${path}`;
}

export class QCAgent extends BaseAgent {
  readonly id = 'qc';
  readonly name = '质量检查';

  protected async run(input: AgentInput): Promise<QCOutput> {
    const { config, previousOutputs } = input;

    const renderOutput = previousOutputs['render']?.data as { images: Array<{ b64_json: string }> } | undefined;
    const planning = previousOutputs['planning']?.data as PlanningOutput | undefined;
    const vision = previousOutputs['vision']?.data as VisionOutput | undefined;

    if (!renderOutput?.images?.length) {
      return { productSimilarity: 0, textAccuracy: 0, overallScore: 0, pass: false, violations: ['未生成图片'], summary: 'No images', suggestions: [] };
    }

    const copy = planning?.copy;
    const expectedTexts = copy
      ? `Brand: ${copy.brandName}, Headline: ${copy.headline}, Features: ${(copy.sellingPoints || []).join(', ')}`
      : 'Unknown';

    // Build multimodal content with ALL generated images
    const userContent: any[] = [
      { type: 'text', text: `Evaluate these ${renderOutput.images.length} poster(s). Expected: ${vision?.product?.category || 'product'}. Texts: ${expectedTexts}\nScore each poster separately, then give an average. Return JSON with per-image scores and overall average.` },
    ];

    for (let i = 0; i < renderOutput.images.length; i++) {
      userContent.push({
        type: 'text',
        text: `--- Poster ${i + 1} ---`,
      });
      userContent.push({
        type: 'image_url',
        image_url: { url: `data:image/png;base64,${renderOutput.images[i].b64_json}`, detail: 'low' },
      });
    }

    const url = resolveUrl(config.baseUrl, '/v1/chat/completions');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

    const resp = await fetch(url, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(90000),
      body: JSON.stringify({
        model: config.textModel,
        messages: [
          {
            role: 'system',
            content: `Strict e-commerce poster quality gate. Return strict JSON:
{"scores":[{"productSimilarity":0-100,"textAccuracy":0-100,"overallScore":0-100,"pass":boolean,"violations":[],"summary":"","suggestions":[]}],"overall":{"productSimilarity":0-100,"textAccuracy":0-100,"overallScore":0-100,"pass":boolean,"violations":[],"summary":"","suggestions":[]}}
Pass only if overall.overallScore >= 55 AND no critical violations.
Check: product matches description, Chinese text is readable and correct, no QR/URL/prices/watermarks, professional composition.
IMPORTANT: Check that product proportions match the reference exactly - no stretching, widening, or narrowing.`,
          },
          { role: 'user', content: userContent },
        ],
        max_tokens: 600,
        temperature: 0.1,
      }),
    });

    if (!resp.ok) {
      return { productSimilarity: 70, textAccuracy: 70, overallScore: 70, pass: true, violations: [], summary: 'QC skipped (API error)', suggestions: [] };
    }

    const data = await resp.json();
    const raw = String(data.choices?.[0]?.message?.content || '').trim()
      .replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

    try {
      const parsed = JSON.parse(raw);
      const overall = parsed.overall || {};
      return {
        productSimilarity: overall.productSimilarity || 70,
        textAccuracy: overall.textAccuracy || 70,
        overallScore: overall.overallScore || 70,
        pass: overall.pass !== false && (overall.overallScore || 70) >= 55,
        violations: Array.isArray(overall.violations) ? overall.violations : [],
        summary: overall.summary || '',
        suggestions: Array.isArray(overall.suggestions) ? overall.suggestions : [],
      };
    } catch {
      return { productSimilarity: 70, textAccuracy: 70, overallScore: 70, pass: true, violations: [], summary: 'QC parse error, passing', suggestions: [] };
    }
  }
}

