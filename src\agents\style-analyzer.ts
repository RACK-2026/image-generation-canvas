// [5] Style Analysis Agent - Analyze reference images for design style

import { BaseAgent } from './base';
import type { AgentInput, StyleAnalysisOutput, AssetAnalysisOutput } from './types';

function resolveUrl(baseUrl: string, path: string): string {
  const isLan = /https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(baseUrl);
  if (isLan) return `/api-proxy${path}`;
  return `${baseUrl}${path}`;
}

export class StyleAnalyzer extends BaseAgent {
  readonly id = 'style-analyzer';
  readonly name = '风格分析';

  protected async run(input: AgentInput): Promise<StyleAnalysisOutput> {
    const { config, images, previousOutputs } = input;

    const assetAnalysis = previousOutputs['asset-analyzer']?.data as AssetAnalysisOutput | undefined;

    // Find reference images (reference role, or scene role)
    const refImages = images.filter(img => img.role === 'reference' || img.role === 'scene');

    if (refImages.length === 0) {
      // No reference images - return defaults based on asset analysis
      return this.getDefaultStyle(assetAnalysis);
    }

    const url = resolveUrl(config.baseUrl, '/v1/chat/completions');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

    const userContent: any[] = [
      { type: 'text', text: 'Analyze these reference poster images for their visual style. Extract layout, lighting, color palette, and overall design style. Return strict JSON.' },
    ];

    for (const img of refImages.slice(0, 3)) {
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
            content: `Analyze e-commerce reference images for transferable visual style. Ignore products/logos/text content - focus ONLY on visual design elements. Return strict JSON:
{
  "layout": {"type": "<center_product|left_text_right_product|full_bleed|grid|diagonal>", "balance": "<minimal|symmetric|asymmetric|dynamic>", "textZone": "<top|bottom|left|right|overlay>"},
  "lighting": {"type": "<soft_studio|dramatic|natural|neon|warm_ambient>", "keyLight": "<top_left|top_right|front|back|side>", "shadow": "<bottom_right|bottom_left|none|soft_diffuse>"},
  "palette": {"primary": "<hex>", "accent": "<hex>", "text": "<hex>"},
  "style": "<luxury_dark|clean_minimal|warm_rustic|tech_modern|vintage_classic|bold_vibrant>",
  "surface": "<dark_stone|white_marble|brushed_metal|wood|fabric|concrete>",
  "mood": "<premium_cinematic|clean_fresh|warm_inviting|bold_impact|elegant_sophisticated>",
  "typography": {"headlineWeight": "<bold|light|medium|black>", "brandFont": "<serif|sans_serif|decorative>"}
}
Return ONLY valid JSON.`,
          },
          { role: 'user', content: userContent },
        ],
        max_tokens: 350,
        temperature: 0.2,
      }),
    });

    if (!resp.ok) {
      this.warn('Style analysis failed, using defaults');
      return this.getDefaultStyle(assetAnalysis);
    }

    const data = await resp.json();
    const raw = String(data.choices?.[0]?.message?.content || '').trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();

    try {
      const parsed = JSON.parse(raw);
      return {
        layout: parsed.layout || { type: 'center_product', balance: 'minimal', textZone: 'top' },
        lighting: parsed.lighting || { type: 'soft_studio', keyLight: 'top_left', shadow: 'bottom_right' },
        palette: parsed.palette || { primary: '#1a1a1a', accent: '#c0a060', text: '#ffffff' },
        style: parsed.style || 'luxury_dark',
        surface: parsed.surface || 'dark_stone_slab',
        mood: parsed.mood || 'premium_cinematic',
        typography: parsed.typography || { headlineWeight: 'bold', brandFont: 'serif' },
      };
    } catch {
      return this.getDefaultStyle(assetAnalysis);
    }
  }

  private getDefaultStyle(assetAnalysis?: AssetAnalysisOutput): StyleAnalysisOutput {
    // Infer style from asset analysis colors if available
    const colors = assetAnalysis?.colors || [];
    const primary = colors[0] || '#1a1a1a';
    const accent = colors[1] || '#c0a060';

    return {
      layout: { type: 'center_product', balance: 'minimal', textZone: 'top' },
      lighting: { type: 'soft_studio', keyLight: 'top_left', shadow: 'bottom_right' },
      palette: { primary, accent, text: '#ffffff' },
      style: 'luxury_dark',
      surface: 'dark_stone_slab',
      mood: 'premium_cinematic',
      typography: { headlineWeight: 'bold', brandFont: 'serif' },
    };
  }
}

