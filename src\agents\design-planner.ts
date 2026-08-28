// [6] Design Planning Agent - Creates structured design plan from all previous analysis

import { BaseAgent } from './base';
import type {
  AgentInput, DesignPlanOutput,
  AssetAnalysisOutput, ProductExtractionOutput,
  LogoExtractionOutput, CopyAnalysisOutput, StyleAnalysisOutput,
} from './types';

function resolveUrl(baseUrl: string, path: string): string {
  const isLan = /https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(baseUrl);
  if (isLan) return `/api-proxy${path}`;
  return `${baseUrl}${path}`;
}

export class DesignPlanner extends BaseAgent {
  readonly id = 'design-planner';
  readonly name = '设计规划';

  protected async run(input: AgentInput): Promise<DesignPlanOutput> {
    const { config, params, previousOutputs } = input;

    const assetAnalysis = previousOutputs['asset-analyzer']?.data as AssetAnalysisOutput | undefined;
    const productExtraction = previousOutputs['product-extractor']?.data as ProductExtractionOutput | undefined;
    const logoExtraction = previousOutputs['logo-extractor']?.data as LogoExtractionOutput | undefined;
    const copyAnalysis = previousOutputs['copy-analyzer']?.data as CopyAnalysisOutput | undefined;
    const styleAnalysis = previousOutputs['style-analyzer']?.data as StyleAnalysisOutput | undefined;

    const url = resolveUrl(config.baseUrl, '/v1/chat/completions');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

    // Build comprehensive context from all previous agents
    const context = {
      product: productExtraction?.description,
      logo: logoExtraction ? { brand: logoExtraction.brand, hasLogo: !!logoExtraction.logoBase64 } : null,
      copy: copyAnalysis ? {
        brandName: copyAnalysis.brandName,
        headline: copyAnalysis.headline,
        sellingPoints: copyAnalysis.sellingPoints,
        tone: copyAnalysis.tone,
        targetPlatform: copyAnalysis.targetPlatform,
      } : null,
      style: styleAnalysis ? {
        layout: styleAnalysis.layout,
        lighting: styleAnalysis.lighting,
        palette: styleAnalysis.palette,
        mood: styleAnalysis.mood,
      } : null,
      assets: assetAnalysis ? {
        colors: assetAnalysis.colors,
        materials: assetAnalysis.materials,
        overallStyle: assetAnalysis.overallStyle,
      } : null,
      requestedSize: params.size,
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.textModel,
        messages: [
          {
            role: 'system',
            content: `You are an enterprise e-commerce poster design planner. Based on the structured analysis data provided, create a detailed design plan. Return strict JSON:
{
  "posterType": "<taobao_main_image|tmall_detail|jd_promotion|amazon_listing|social_media|independent>",
  "size": "<width>x<height>",
  "layout": {
    "brandZone": {"y": "<start%-end%>", "content": "<what goes here>"},
    "headlineZone": {"y": "<start%-end%>", "content": "<what goes here>"},
    "productZone": {"y": "<start%-end%>", "content": "<what goes here>"},
    "featuresZone": {"y": "<start%-end%>", "content": "<what goes here>"},
    "footerZone": {"y": "<start%-end%>", "content": "<what goes here>"}
  },
  "background": "<background description>",
  "visualFocus": "<what the viewer should focus on>",
  "emotion": "<target emotional response>",
  "referencePriority": ["<most important reference>", "<second>", "<third>"]
}
Rules:
- Zones must not overlap and should cover the poster top-to-bottom
- Product zone should be the largest (25-65% of poster)
- Consider the style analysis when planning background and lighting
- Match poster type to target platform
- Return ONLY valid JSON`,
          },
          { role: 'user', content: JSON.stringify(context, null, 2) },
        ],
        max_tokens: 400,
        temperature: 0.3,
      }),
    });

    if (!resp.ok) throw new Error(`设计规划失败 (${resp.status})`);
    const data = await resp.json();
    const raw = String(data.choices?.[0]?.message?.content || '').trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();

    try {
      const parsed = JSON.parse(raw);
      return {
        posterType: parsed.posterType || 'taobao_main_image',
        size: parsed.size || params.size || '1024x1536',
        layout: parsed.layout || {},
        background: parsed.background || 'premium dark studio',
        visualFocus: parsed.visualFocus || 'product center',
        emotion: parsed.emotion || 'premium',
        referencePriority: parsed.referencePriority || ['product_cutout', 'style_reference'],
      };
    } catch {
      throw new Error('设计规划未返回有效JSON');
    }
  }
}

