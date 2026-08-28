// Asset Viewer - displays intermediate outputs from each pipeline agent

import { useState } from 'react';
import { Eye, ChevronDown, ChevronUp, FileJson } from 'lucide-react';
import type { PosterAsset } from '../assets-store/types';
import { getTaskAssets } from '../assets-store/store';

interface AssetViewerProps {
  taskId: string;
  onPreview?: (src: string) => void;
}

const AGENT_LABELS: Record<string, string> = {
  'asset-analyzer': '资产分析',
  'product-extractor': '产品提取',
  'logo-extractor': 'Logo提取',
  'copy-analyzer': '营销文案',
  'style-analyzer': '风格分析',
  'design-planner': '设计规划',
  'prompt-engineer': 'Prompt工程',
  'image-generator': '图片生成',
  'quality-checker': '质量检查',
};

const AGENT_ORDER = [
  'asset-analyzer', 'product-extractor', 'logo-extractor',
  'copy-analyzer', 'style-analyzer', 'design-planner',
  'prompt-engineer', 'image-generator', 'quality-checker',
];

export function AssetViewer({ taskId, onPreview }: AssetViewerProps) {
  const [assets, setAssets] = useState<PosterAsset[] | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedJson, setSelectedJson] = useState<string | null>(null);

  const handleLoad = async () => {
    if (assets) {
      setExpanded(!expanded);
      return;
    }
    setLoading(true);
    try {
      const result = await getTaskAssets(taskId);
      setAssets(result);
      setExpanded(true);
    } catch (err) {
      console.error('Failed to load assets:', err);
    }
    setLoading(false);
  };

  if (!assets || assets.length === 0) {
    return (
      <button
        onClick={handleLoad}
        disabled={loading}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors"
        title="查看流水线中间产物"
      >
        <Eye className="w-3 h-3" />
        {loading ? '加载中...' : '流水线详情'}
      </button>
    );
  }

  // Group assets by agent
  const byAgent: Record<string, PosterAsset[]> = {};
  for (const asset of assets) {
    if (!byAgent[asset.agentId]) byAgent[asset.agentId] = [];
    byAgent[asset.agentId].push(asset);
  }

  const agentsWithAssets = AGENT_ORDER.filter(id => byAgent[id]);

  return (
    <div className="border border-border-primary rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 flex items-center gap-2 bg-bg-tertiary/50 hover:bg-bg-tertiary transition-colors"
      >
        <FileJson className="w-3.5 h-3.5 text-accent" />
        <span className="text-xs font-medium text-text-primary flex-1 text-left">
          流水线资产 ({assets.length}项)
        </span>
        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-text-muted" /> : <ChevronDown className="w-3.5 h-3.5 text-text-muted" />}
      </button>

      {expanded && (
        <div className="p-2 space-y-1 max-h-[400px] overflow-y-auto">
          {agentsWithAssets.map(agentId => {
            const agentAssets = byAgent[agentId];
            return (
              <div key={agentId} className="rounded-lg border border-border-primary overflow-hidden">
                <div className="px-2.5 py-1.5 bg-bg-tertiary/50 flex items-center gap-2">
                  <span className="text-[10px] font-medium text-accent">
                    {AGENT_LABELS[agentId] || agentId}
                  </span>
                  <span className="text-[10px] text-text-muted">
                    {agentAssets.length}项
                  </span>
                </div>
                <div className="p-1.5 space-y-1">
                  {agentAssets.map(asset => (
                    <div key={asset.id} className="flex items-center gap-2">
                      {/* Image preview for image assets */}
                      {asset.imageBase64 && onPreview && (
                        <button
                          onClick={() => onPreview(`data:image/png;base64,${asset.imageBase64}`)}
                          className="w-8 h-8 rounded border border-border-primary overflow-hidden flex-shrink-0 hover:border-accent/50 transition-colors"
                        >
                          <img
                            src={`data:image/png;base64,${asset.imageBase64}`}
                            alt={asset.assetType}
                            className="w-full h-full object-contain bg-white"
                          />
                        </button>
                      )}
                      {/* JSON data toggle */}
                      <button
                        onClick={() => setSelectedJson(
                          selectedJson === asset.id ? null : asset.id
                        )}
                        className="flex-1 text-left text-[10px] text-text-secondary hover:text-text-primary transition-colors"
                      >
                        <span className="text-text-muted">{asset.assetType}:</span>{' '}
                        {getAssetSummary(asset)}
                      </button>
                    </div>
                  ))}
                  {/* Show JSON for selected asset */}
                  {agentAssets.map(asset =>
                    selectedJson === asset.id ? (
                      <pre
                        key={`${asset.id}-json`}
                        className="text-[9px] text-text-secondary bg-black/20 rounded p-2 overflow-x-auto max-h-[200px] overflow-y-auto"
                      >
                        {JSON.stringify(asset.data, null, 2)}
                      </pre>
                    ) : null
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Generate a short summary of asset data for display
function getAssetSummary(asset: PosterAsset): string {
  if (!asset.data) return '(empty)';
  const d = asset.data;
  switch (asset.assetType) {
    case 'analysis':
      return `${d.products?.length || 0}产品, ${d.logos?.length || 0}Logo, ${d.colors?.length || 0}色`;
    case 'cutout':
      return `${d.description?.name || 'product'} - ${d.description?.category || ''}`;
    case 'logo':
      return d.brand || '(no brand detected)';
    case 'copy_analysis':
      return d.headline || d.brandName || '(no copy)';
    case 'style_analysis':
      return `${d.style || ''} / ${d.mood || ''}`;
    case 'design_plan':
      return `${d.posterType || ''} - ${d.emotion || ''}`;
    case 'prompt':
      return `${(d.prompt || '').substring(0, 60)}...`;
    case 'quality_report':
      return `分数:${d.overallScore || 0} ${d.pass ? '通过' : '未通过'}`;
    default:
      return JSON.stringify(d).substring(0, 60);
  }
}

