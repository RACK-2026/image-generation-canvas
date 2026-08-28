// [3] Logo Extraction Agent - Extract and protect brand logos

import { BaseAgent } from './base';
import type { AgentInput, LogoExtractionOutput, AssetAnalysisOutput } from './types';
import { extractProductCutout } from '../api';

export class LogoExtractor extends BaseAgent {
  readonly id = 'logo-extractor';
  readonly name = 'Logo提取';

  protected async run(input: AgentInput): Promise<LogoExtractionOutput> {
    const { config, images, previousOutputs } = input;

    // Find logo image from asset analysis
    const assetAnalysis = previousOutputs['asset-analyzer']?.data as AssetAnalysisOutput | undefined;
    let logoImage = images.find(img => img.role === 'logo');

    if (!logoImage && assetAnalysis?.logos?.length) {
      const logoIdx = assetAnalysis.logos[0].index;
      logoImage = images.find(img => img.index === logoIdx);
    }

    if (!logoImage) {
      // No logo provided - skip gracefully
      this.log('No logo image provided, skipping');
      return {
        logoBase64: '',
        brand: '',
        hasEnglishText: false,
        englishText: '',
        position: 'top_center',
        usageRule: 'keep_original_never_regenerate',
      };
    }

    // Extract logo with transparent background using AI
    this.log('Extracting logo cutout...');
    let logoB64: string;
    try {
      logoB64 = await extractProductCutout(config, logoImage.base64);
    } catch {
      // Fallback to original if AI extraction fails
      this.warn('Logo AI extraction failed, using original');
      logoB64 = logoImage.base64;
    }

    // Analyze logo content
    const brandInfo = await this.analyzeLogo(config, logoImage.base64);

    return {
      logoBase64: logoB64,
      brand: brandInfo.brand,
      hasEnglishText: brandInfo.hasEnglishText,
      englishText: brandInfo.englishText,
      position: 'top_center',
      usageRule: 'keep_original_never_regenerate',
    };
  }

  private async analyzeLogo(config: any, logoBase64: string): Promise<{
    brand: string;
    hasEnglishText: boolean;
    englishText: string;
  }> {
    const isLan = /https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(config.baseUrl);
    const url = isLan ? `/api-proxy/v1/chat/completions` : `${config.baseUrl}/v1/chat/completions`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.textModel,
          messages: [
            {
              role: 'system',
              content: 'Analyze this logo image. Return strict JSON: {"brand":"<brand_name_in_chinese>","hasEnglishText":<boolean>,"englishText":"<english_text_if_any>"}. Return ONLY valid JSON.',
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: 'What brand is this logo? What text appears in it?' },
                { type: 'image_url', image_url: { url: `data:image/png;base64,${logoBase64}`, detail: 'high' } },
              ],
            },
          ],
          max_tokens: 150,
          temperature: 0.1,
        }),
      });

      if (!resp.ok) return { brand: '', hasEnglishText: false, englishText: '' };
      const data = await resp.json();
      const raw = String(data.choices?.[0]?.message?.content || '').trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
      const parsed = JSON.parse(raw);
      return {
        brand: parsed.brand || '',
        hasEnglishText: Boolean(parsed.hasEnglishText),
        englishText: parsed.englishText || '',
      };
    } catch {
      return { brand: '', hasEnglishText: false, englishText: '' };
    }
  }
}

