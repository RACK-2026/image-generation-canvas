// [8] Image Generation Agent - Wraps existing generateImageBatch with pipeline context

import { BaseAgent } from './base';
import type { AgentInput, ImageGenerationOutput, PromptEngineeringOutput, ProductExtractionOutput } from './types';
import { generateImageBatch } from '../api';
import type { GenParams } from '../types';

export class ImageGenerator extends BaseAgent {
  readonly id = 'image-generator';
  readonly name = '图片生成';

  protected async run(input: AgentInput): Promise<ImageGenerationOutput> {
    const { config, params, previousOutputs } = input;

    const promptOutput = previousOutputs['prompt-engineer']?.data as PromptEngineeringOutput | undefined;
    const productOutput = previousOutputs['product-extractor']?.data as ProductExtractionOutput | undefined;

    if (!promptOutput?.prompt) {
      throw new Error('Prompt工程未生成有效提示词');
    }

    // Build reference images: product cutout is primary reference
    const referenceImages: string[] = [];
    const referenceImagesUsed: string[] = [];

    if (productOutput?.cutoutBase64) {
      referenceImages.push(productOutput.cutoutBase64);
      referenceImagesUsed.push('product_cutout');
    }

    // Use generation params from prompt engineer (may override user params)
    const genParams: GenParams = {
      ...params,
      size: promptOutput.generationParams?.size || params.size,
      quality: (promptOutput.generationParams?.quality as GenParams['quality']) || params.quality,
      n: promptOutput.generationParams?.n || params.n,
    };

    const count = genParams.n || 1;
    this.log(`Generating ${count} images with prompt length: ${promptOutput.prompt.length}`);

    const images = await generateImageBatch(
      config,
      promptOutput.prompt,
      genParams,
      count,
      referenceImages.length > 0 ? referenceImages : undefined,
      (status, current, total) => {
        this.log(`Generation progress: ${current}/${total} (${status})`);
      },
    );

    if (images.length === 0) {
      throw new Error('未能生成任何图片');
    }

    return {
      images: images.map(img => ({
        b64_json: img.b64_json,
        revised_prompt: img.revised_prompt,
      })),
      promptUsed: promptOutput.prompt,
      referenceImagesUsed,
      generationParams: {
        size: genParams.size,
        quality: genParams.quality,
      },
    };
  }
}

