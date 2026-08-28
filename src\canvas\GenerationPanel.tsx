import { useState } from 'react';
import { X, Sparkles, Image, Type, Video, Music } from 'lucide-react';
import type { ApiConfig, GenParams } from '../types';
import { DEFAULT_PARAMS } from '../types';

interface GenerationPanelProps {
  apiConfig: ApiConfig;
  setApiConfig: (c: ApiConfig) => void;
  onGenerate: (prompt: string, params: GenParams, referenceImages?: string[]) => void;
  connectedNodeTexts: { id: string; content: string }[];
  connectedImageNodes: { id: string; content: string }[];
  onClose: () => void;
}

type GenMode = 'image' | 'text' | 'video' | 'audio';

const GEN_MODES: { id: GenMode; label: string; icon: React.ReactNode }[] = [
  { id: 'image', label: '生图', icon: <Image className="w-4 h-4" /> },
  { id: 'text', label: '文本', icon: <Type className="w-4 h-4" /> },
  { id: 'video', label: '视频', icon: <Video className="w-4 h-4" /> },
  { id: 'audio', label: '音频', icon: <Music className="w-4 h-4" /> },
];

const ASPECT_RATIOS = ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16', 'auto'];

export function GenerationPanel({
  apiConfig, setApiConfig, onGenerate, connectedImageNodes, onClose,
}: GenerationPanelProps) {
  const [mode, setMode] = useState<GenMode>('image');
  const [prompt, setPrompt] = useState('');
  const [params, setParams] = useState<GenParams>(DEFAULT_PARAMS);
  const [genCount, setGenCount] = useState(1);

  const handleGenerate = () => {
    if (!prompt.trim()) return;
    if (!apiConfig.apiKey) {
      alert('请先配置 API Key');
      return;
    }
    onGenerate(prompt, { ...params, n: genCount });
  };

  return (
    <div className="absolute top-16 right-4 z-20 w-80 bg-bg-card/95 backdrop-blur-xl border border-border-primary rounded-xl shadow-2xl animate-fade-in">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent" />
          生成配置
        </h3>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-bg-tertiary text-text-muted transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Mode tabs */}
      <div className="px-4 pb-3">
        <div className="flex bg-bg-tertiary rounded-lg p-0.5">
          {GEN_MODES.map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1 ${
                mode === m.id ? 'bg-accent text-white' : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {m.icon}
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* API Key */}
      <div className="px-4 pb-3">
        <input
          type="password"
          value={apiConfig.apiKey}
          onChange={e => setApiConfig({ ...apiConfig, apiKey: e.target.value })}
          placeholder="API Key (sk-...)"
          className="w-full px-3 py-2 rounded-lg bg-bg-input border border-border-primary text-text-primary text-xs focus:outline-none focus:border-accent"
        />
      </div>

      {/* Prompt */}
      <div className="px-4 pb-3">
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="输入提示词... 用 @ 引用已连接素材"
          className="w-full px-3 py-2 rounded-lg bg-bg-input border border-border-primary text-text-primary text-xs placeholder-text-muted focus:outline-none focus:border-accent resize-none"
          rows={3}
        />
      </div>

      {/* Connected image nodes as references */}
      {connectedImageNodes.length > 0 && (
        <div className="px-4 pb-3">
          <div className="rounded-lg border border-warning/30 bg-warning/10 p-2 text-xs leading-relaxed text-warning">
            画布参考图生成已暂停。产品图请到画廊使用“严格产品保真”，避免旧式重绘造成变形。
          </div>
        </div>
      )}

      {/* Settings */}
      {mode === 'image' && (
        <div className="px-4 pb-3 space-y-3">
          <div>
            <label className="text-xs text-text-muted mb-1 block">质量</label>
            <select
              value={params.quality}
              onChange={e => setParams({ ...params, quality: e.target.value as any })}
              className="w-full px-3 py-1.5 rounded-lg bg-bg-input border border-border-primary text-xs text-text-primary focus:outline-none"
            >
              <option value="auto">自动</option>
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-text-muted mb-1 block">宽高比</label>
            <div className="grid grid-cols-4 gap-1.5">
              {ASPECT_RATIOS.map(r => (
                <button
                  key={r}
                  onClick={() => setParams({ ...params, size: r === 'auto' ? 'auto' : `auto_${r}` })}
                  className={`py-1.5 rounded-lg border text-xs transition-all ${
                    params.size.includes(r) || (r === 'auto' && params.size === 'auto')
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border-primary text-text-muted hover:border-accent/50'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-text-muted mb-1 block">生成张数</label>
            <div className="flex gap-1.5">
              {[1].map(n => (
                <button
                  key={n}
                  onClick={() => setGenCount(n)}
                  className={`flex-1 py-1.5 rounded-lg border text-xs transition-all ${
                    genCount === n
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border-primary text-text-muted hover:border-accent/50'
                  }`}
                >
                  {n}
                </button>
              ))}
              <span className="flex-1 py-1.5 text-xs text-text-muted text-center">Sub2API限制n=1</span>
            </div>
          </div>
        </div>
      )}

      {/* Generate button */}
      <div className="px-4 pb-4">
        <button
          onClick={handleGenerate}
          disabled={!prompt.trim()}
          className={`w-full py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${
            prompt.trim()
              ? 'bg-accent hover:bg-accent-hover text-white shadow-lg shadow-accent/25'
              : 'bg-bg-tertiary text-text-muted cursor-not-allowed'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          生成
        </button>
      </div>
    </div>
  );
}

