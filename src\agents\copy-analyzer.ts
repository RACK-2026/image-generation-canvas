// [4] Marketing Copy Agent - Extract and generate marketing text elements

import { BaseAgent } from './base';
import type { AgentInput, CopyAnalysisOutput, AssetAnalysisOutput, ProductExtractionOutput } from './types';

function resolveUrl(baseUrl: string, path: string): string {
  const isLan = /https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(baseUrl);
  if (isLan) return `/api-proxy${path}`;
  return `${baseUrl}${path}`;
}

export class CopyAnalyzer extends BaseAgent {
  readonly id = 'copy-analyzer';
  readonly name = '营销文案';

  protected async run(input: AgentInput): Promise<CopyAnalysisOutput> {
    const { config, userInput, previousOutputs } = input;

    const assetAnalysis = previousOutputs['asset-analyzer']?.data as AssetAnalysisOutput | undefined;
    const productExtraction = previousOutputs['product-extractor']?.data as ProductExtractionOutput | undefined;

    const url = resolveUrl(config.baseUrl, '/v1/chat/completions');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

    // Build context from previous agents
    const contextParts: string[] = [];
    contextParts.push(`User request: ${userInput}`);

    if (assetAnalysis) {
      contextParts.push(`Detected texts in images: ${assetAnalysis.detectedTexts.join(', ')}`);
      contextParts.push(`Materials: ${assetAnalysis.materials.join(', ')}`);
      contextParts.push(`Overall style: ${assetAnalysis.overallStyle}`);
    }

    if (productExtraction?.description) {
      const d = productExtraction.description;
      contextParts.push(`Product: ${d.name}, category=${d.category}, color=${d.color}, material=${d.material}`);
      contextParts.push(`Features: ${d.important_features.join(', ')}`);
    }

    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.textModel,
        messages: [
          {
            role: 'system',
            content: `You are an enterprise e-commerce poster copywriter. Generate structured marketing text for a professional poster. Return strict JSON:
{
  "brandName": "<Chinese brand name, 2-4 chars. Use from context if available>",
  "brandEnglish": "<English brand name / romanization>",
  "heritageLine": "<Heritage tagline e.g. 始创于1651·传承百年匠心. Empty if not applicable>",
  "headline": "<Main advertising slogan in Chinese, 6-16 chars, impactful>",
  "subHeadline": "<Secondary benefit line in Chinese, 4-12 chars>",
  "sellingPoints": ["<feature1>", "<feature2>", "<feature3>", "<feature4>"],
  "footerText": "<Brand name for footer>",
  "tone": "<premium_heritage|modern_minimal|bold_sporty|elegant_luxury|warm_natural>",
  "targetPlatform": "<taobao|tmall|jd|amazon|independent>"
}
Rules:
- ALL text in Chinese except English brand name
- No QR codes, URLs, prices, promotions, certifications
- No exaggerated claims like "#1" or "best seller"
- Selling points must be 2-6 chars each, derived from actual product features
- If brand unknown, leave brandName empty rather than inventing
- Return ONLY valid JSON`,
          },
          { role: 'user', content: contextParts.join('\n') },
        ],
        max_tokens: 350,
        temperature: 0.4,
      }),
    });

    if (!resp.ok) throw new Error(`营销文案分析失败 (${resp.status})`);
    const data = await resp.json();
    const raw = String(data.choices?.[0]?.message?.content || '').trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();

    try {
      const parsed = JSON.parse(raw);
      return {
        brandName: parsed.brandName || '',
        brandEnglish: parsed.brandEnglish || '',
        heritageLine: parsed.heritageLine || '',
        headline: parsed.headline || '',
        subHeadline: parsed.subHeadline || '',
        sellingPoints: Array.isArray(parsed.sellingPoints) ? parsed.sellingPoints.map(String).filter(Boolean) : [],
        footerText: parsed.footerText || '',
        tone: parsed.tone || 'premium_heritage',
        targetPlatform: parsed.targetPlatform || 'taobao',
      };
    } catch {
      throw new Error('营销文案分析未返回有效JSON');
    }
  }
}

