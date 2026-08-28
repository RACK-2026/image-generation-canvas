// [2] Product Extraction Agent - AI-powered product cutout extraction

import { BaseAgent } from './base';
import type { AgentInput, ProductExtractionOutput, AssetAnalysisOutput } from './types';
import { extractProductCutout } from '../api';

export class ProductExtractor extends BaseAgent {
  readonly id = 'product-extractor';
  readonly name = '产品提取';

  protected async run(input: AgentInput): Promise<ProductExtractionOutput> {
    const { config, images, previousOutputs } = input;

    // Find the main product image from asset analysis
    const assetAnalysis = previousOutputs['asset-analyzer']?.data as AssetAnalysisOutput | undefined;
    let productImage = images.find(img => img.role === 'main');

    if (!productImage && images.length > 0) {
      productImage = images[0];
    }

    if (!productImage) {
      throw new Error('未找到产品图片');
    }

    // Step 1: AI extract product cutout (reuse existing function)
    this.log('Extracting product cutout via AI...');
    const cutoutB64 = await extractProductCutout(config, productImage.base64);

    // Step 2: Get product description from text model
    this.log('Getting product description...');
    const description = await this.describeProduct(config, productImage.base64, assetAnalysis);

    return {
      cutoutBase64: cutoutB64,
      bbox: { x: 0, y: 0, width: 1024, height: 1024 }, // Approximate - AI handles cropping
      description,
    };
  }

  private async describeProduct(
    config: any,
    productBase64: string,
    assetAnalysis?: AssetAnalysisOutput,
  ): Promise<ProductExtractionOutput['description']> {
    const url = config.baseUrl.match(/192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\./)
      ? `/api-proxy/v1/chat/completions`
      : `${config.baseUrl}/v1/chat/completions`;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

    const contextHint = assetAnalysis
      ? `\nPre-analysis: category=${assetAnalysis.products[0]?.category || 'unknown'}, materials=${assetAnalysis.materials.join(',')}, detectedTexts=${assetAnalysis.detectedTexts.join(',')}`
      : '';

    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.textModel,
        messages: [
          {
            role: 'system',
            content: `Analyze this product image and return strict JSON:
{"name":"<product_name>","category":"<category>","color":"<dominant_color>","material":"<material>","shape":"<shape_description>","important_features":["<feature1>","<feature2>","<feature3>"]}
Be precise about physical attributes. Return ONLY valid JSON.`,
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: `Describe this product in detail.${contextHint}` },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${productBase64}`, detail: 'high' } },
            ],
          },
        ],
        max_tokens: 300,
        temperature: 0.2,
      }),
    });

    if (!resp.ok) {
      // Return defaults if description fails - cutout is still valid
      return {
        name: 'product',
        category: 'unknown',
        color: 'unknown',
        material: 'unknown',
        shape: 'unknown',
        important_features: [],
      };
    }

    const data = await resp.json();
    const raw = String(data.choices?.[0]?.message?.content || '').trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    try {
      const parsed = JSON.parse(raw);
      return {
        name: parsed.name || 'product',
        category: parsed.category || 'unknown',
        color: parsed.color || 'unknown',
        material: parsed.material || 'unknown',
        shape: parsed.shape || 'unknown',
        important_features: Array.isArray(parsed.important_features) ? parsed.important_features : [],
      };
    } catch {
      return {
        name: 'product',
        category: 'unknown',
        color: 'unknown',
        material: 'unknown',
        shape: 'unknown',
        important_features: [],
      };
    }
  }
}

