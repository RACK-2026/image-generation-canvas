// Asset store types

export type AssetType =
  | 'cutout'
  | 'logo'
  | 'mask'
  | 'analysis'
  | 'design_plan'
  | 'prompt'
  | 'quality_report'
  | 'copy_analysis'
  | 'style_analysis';

export interface PosterAsset {
  id: string; // `${taskId}_${agentId}_${assetType}`
  taskId: string;
  agentId: string;
  assetType: AssetType;
  data: any; // Structured JSON from agent
  imageBase64?: string; // For image assets (cutout, logo, mask)
  createdAt: number;
}

