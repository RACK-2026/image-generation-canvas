// [9] Quality Check Agent - Validates generated poster quality

import { BaseAgent } from './base';
import type { AgentInput, QualityCheckOutput, CopyAnalysisOutput, ProductExtractionOutput } from './types';

function resolveUrl(baseUrl: string, path: string): string {
  const isLan = /https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(baseUrl);
  if (isLan) return `/api-proxy${path}`;
  return `${baseUrl}${path}`;
}

export class QualityChecker extends BaseAgent {
  readonly id = 'quality-checker';
  readonly name = '质量检查';

  protected async run(input: AgentInput): Promise<QualityCheckOutput> {
    const { config, previousOutputs } = input;

    const imageGenOutput = previousOutputs['image-generator']?.data as { images: Array<{ b64_json: string }> } | undefined;
    const copyAnalysis = previousOutputs['copy-analyzer']?.data as CopyAnalysisOutput | undefined;
    const productExtraction = previousOutputs['product-extractor']?.data as ProductExtractionOutput | undefined;

    if (!imageGenOutput?.images?.length) {
      throw new Error('无生成图片可供检查');
    }

    // Check the first generated image
    const posterBase64 = imageGenOutput.images[0].b64_json;

    const url = resolveUrl(config.baseUrl, '/v1/chat/completions');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

    // Build context for quality check
    const expectedTexts: string[] = [];
    if (copyAnalysis?.brandName) expectedTexts.push(`品牌名: ${copyAnalysis.brandName}`);
    if (copyAnalysis?.headline) expectedTexts.push(`主标题: ${copyAnalysis.headline}`);
    if (copyAnalysis?.sellingPoints?.length) expectedTexts.push(`卖点: ${copyAnalysis.sellingPoints.join(', ')}`);

    const productDesc = productExtraction?.description;
    const productHint = productDesc
      ? `Expected product: ${productDesc.name}, color=${productDesc.color}, material=${productDesc.material}, features=${productDesc.important_features.join(', ')}`
      : '';

    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.textModel,
        messages: [
          {
            role: 'system',
            content: `You are a strict enterprise e-commerce poster quality gate. Inspect the poster image carefully.

Evaluate these dimensions (each 0-100):
1. product_similarity: Does the product match the expected description? Is it the dominant element?
2. logo_match: Is the brand logo correct? (100 if no logo expected)
3. text_accuracy: Are the expected Chinese texts present and readable?

Overall assessment:
- pass: true only if overallScore >= 55 AND no critical violations
- violations: list specific problems found
- suggestions: actionable improvements

Return strict JSON:
{
  "product_similarity": <0-100>,
  "logo_match": <0-100>,
  "text_accuracy": <0-100>,
  "overallScore": <0-100>,
  "pass": <boolean>,
  "violations": ["<violation>", ...],
  "summary": "<one-line summary>",
  "suggestions": ["<suggestion>", ...]
}

Reject if: obvious layer separation, gibberish text, amateur composition, QR codes, URLs, prices, watermarks.
When uncertain, pass must be false.`,
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Evaluate this e-commerce poster.\n${productHint}\nExpected texts: ${expectedTexts.join('; ') || 'none specified'}`,
              },
              {
                type: 'image_url',
                image_url: { url: `data:image/png;base64,${posterBase64}`, detail: 'high' },
              },
            ],
          },
        ],
        max_tokens: 300,
        temperature: 0.1,
      }),
    });

    if (!resp.ok) throw new Error(`质量检查失败 (${resp.status})`);
    const data = await resp.json();
    const raw = String(data.choices?.[0]?.message?.content || '').trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();

    try {
      const parsed = JSON.parse(raw);
      const overallScore = Number.isFinite(Number(parsed.overallScore)) ? Number(parsed.overallScore) : 0;
      const violations = Array.isArray(parsed.violations) ? parsed.violations.map(String) : [];

      return {
        productSimilarity: Number(parsed.product_similarity) || 0,
        logoMatch: Number(parsed.logo_match) || 100,
        textAccuracy: Number(parsed.text_accuracy) || 0,
        overallScore,
        pass: parsed.pass === true && overallScore >= 55 && violations.length === 0,
        violations,
        summary: parsed.summary || '',
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.map(String) : [],
      };
    } catch {
      return {
        productSimilarity: 0,
        logoMatch: 0,
        textAccuracy: 0,
        overallScore: 0,
        pass: false,
        violations: ['质量检查未返回有效JSON'],
        summary: '质量检查解析失败',
        suggestions: ['重试生成'],
      };
    }
  }
}

