// Asset lifecycle manager - handles saving and retrieving agent outputs

import type { AgentOutput } from '../agents/types';
import type { PosterAsset, AssetType } from './types';
import { saveAsset, getTaskAssets, getAgentAssets, makeAssetId } from './store';

// Map agent IDs to their asset types
const AGENT_ASSET_TYPE_MAP: Record<string, AssetType> = {
  // New fast pipeline agents
  'vision': 'analysis',
  'extraction': 'cutout',
  'planning': 'design_plan',
  'render': 'analysis',
  'qc': 'quality_report',
  // Legacy agents (backward compat)
  'asset-analyzer': 'analysis',
  'product-extractor': 'cutout',
  'logo-extractor': 'logo',
  'copy-analyzer': 'copy_analysis',
  'style-analyzer': 'style_analysis',
  'design-planner': 'design_plan',
  'prompt-engineer': 'prompt',
  'quality-checker': 'quality_report',
};

// Persist an agent's output to the asset store
export async function persistAgentOutput(
  taskId: string,
  agentId: string,
  output: AgentOutput,
): Promise<void> {
  const assetType = AGENT_ASSET_TYPE_MAP[agentId] || 'analysis';
  const asset: PosterAsset = {
    id: makeAssetId(taskId, agentId, assetType),
    taskId,
    agentId,
    assetType,
    data: output.data,
    imageBase64: extractImageFromOutput(agentId, output.data),
    createdAt: Date.now(),
  };
  await saveAsset(asset);
}

// Get all assets for a task, organized by agent
export async function getOrganizedAssets(taskId: string): Promise<Record<string, PosterAsset[]>> {
  const assets = await getTaskAssets(taskId);
  const organized: Record<string, PosterAsset[]> = {};
  for (const asset of assets) {
    if (!organized[asset.agentId]) organized[asset.agentId] = [];
    organized[asset.agentId].push(asset);
  }
  return organized;
}

// Extract image base64 from agent output for preview
function extractImageFromOutput(agentId: string, data: any): string | undefined {
  if (!data) return undefined;
  switch (agentId) {
    case 'product-extractor':
      return data.cutoutBase64;
    case 'logo-extractor':
      return data.logoBase64;
    case 'extraction':
      return data.productCutout;
    case 'render':
      return data.images?.[0]?.b64_json;
    default:
      return undefined;
  }
}

