import { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, X, Star, Image, Tag } from 'lucide-react';
import type { GenParams } from '../types';

// 参考图角色
export interface RefImage {
  base64: string;
  role: 'main' | 'logo' | 'detail' | 'reference';
  label: string;
}

interface InputBarProps {
  params: GenParams;
  setParams: (p: GenParams) => void;
  onSubmit: (prompt: string, referenceImages?: string[], refImages?: RefImage[]) => void;
  onOpenSizeDialog: () => void;
  isGenerating: boolean;
  imageCount: number;
}

const ROLE_CONFIG = {
  main: { label: '主图', icon: Star, color: 'text-yellow-400', bg: 'bg-yellow-400/20', border: 'border-yellow-400/50' },
  logo: { label: 'Logo', icon: Tag, color: 'text-blue-400', bg: 'bg-blue-400/20', border: 'border-blue-400/50' },
  detail: { label: '详情图', icon: Image, color: 'text-green-400', bg: 'bg-green-400/20', border: 'border-green-400/50' },
  reference: { label: '参考图', icon: Image, color: 'text-text-muted', bg: 'bg-bg-tertiary', border: 'border-border-primary' },
};

export function InputBar({ params, setParams, onSubmit, onOpenSizeDialog, isGenerating, imageCount }: InputBarProps) {
  const [prompt, setPrompt] = useState('');
  const [refImages, setRefImages] = useState<RefImage[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [prompt]);

  const handleSubmit = () => {
    if (!prompt.trim() || isGenerating) return;
    const base64s = refImages.map(r => r.base64);
    onSubmit(prompt, base64s.length > 0 ? base64s : undefined, refImages);
    setPrompt('');
    setRefImages([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      if (refImages.length >= 16) return;
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        if (base64) {
          setRefImages(prev => {
            const newIdx = prev.length;
            // 首图=主图，其他=参考图
            const role: RefImage['role'] = newIdx === 0 ? 'main' : 'reference';
            const label = ROLE_CONFIG[role].label;
            return [...prev, { base64, role, label }];
          });
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removeRefImage = (index: number) => {
    setRefImages(prev => {
      const next = prev.filter((_, i) => i !== index);
      // 重新分配角色：第一张始终是主图
      return next.map((img, i) => {
        if (i === 0 && img.role !== 'main') {
          return { ...img, role: 'main' as const, label: ROLE_CONFIG.main.label };
        }
        return img;
      });
    });
  };

  const cycleRole = (index: number) => {
    setRefImages(prev => prev.map((img, i) => {
      if (i !== index) return img;
      if (i === 0) return img; // 首图固定为主图
      const roles: RefImage['role'][] = ['reference', 'logo', 'detail'];
      const curIdx = roles.indexOf(img.role);
      const nextRole = roles[(curIdx + 1) % roles.length];
      return { ...img, role: nextRole, label: ROLE_CONFIG[nextRole].label };
    }));
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30">
      <div className="max-w-7xl mx-auto px-4 pb-4">
        <div className="bg-bg-card/95 backdrop-blur-xl border border-border-primary rounded-2xl p-4 shadow-2xl">
          {/* Reference images preview with roles */}
          {refImages.length > 0 && (
            <div className="mb-3">
              <div className="mb-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
                严格产品保真已启用：第一张图是不可重绘的主产品；后续图片仅分析背景、配色、灯光和构图，不复制其中的产品、文字、Logo、价格、图标或促销。
              </div>
              <div className="flex gap-2 flex-wrap">
              {refImages.map((img, i) => {
                const rc = ROLE_CONFIG[img.role];
                const Icon = rc.icon;
                return (
                  <div key={i} className={`relative w-16 h-16 rounded-lg overflow-hidden border-2 ${rc.border} group`}>
                    <img src={`data:image/png;base64,${img.base64}`} className="w-full h-full object-contain bg-white" alt={`ref-${i}`} />
                    {/* Role badge */}
                    <button
                      onClick={() => cycleRole(i)}
                      className={`absolute bottom-0 left-0 right-0 ${rc.bg} backdrop-blur-sm px-1 py-0.5 flex items-center gap-0.5 justify-center`}
                      title={i === 0 ? '首图(主图)' : '点击切换角色'}
                    >
                      <Icon className={`w-2.5 h-2.5 ${rc.color}`} />
                      <span className={`text-[9px] ${rc.color} font-medium`}>{img.label}</span>
                    </button>
                    {/* Remove button */}
                    <button
                      onClick={() => removeRefImage(i)}
                      className="absolute -top-1 -right-1 w-5 h-5 bg-error rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                );
              })}
              <div className="w-16 h-16 rounded-lg border-2 border-dashed border-border-primary flex flex-col items-center justify-center text-text-muted">
                <Paperclip className="w-4 h-4" />
                <span className="text-[9px] mt-0.5">添加</span>
              </div>
              </div>
            </div>
          )}

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="只描述背景、场景、光影和氛围；产品、文字与促销信息不会由模型猜测..."
            className="w-full bg-transparent text-text-primary text-sm placeholder-text-muted resize-none focus:outline-none min-h-[40px] max-h-[120px]"
            rows={1}
          />

          {/* Controls */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <button
              onClick={onOpenSizeDialog}
              className="flex flex-col items-start px-3 py-1.5 rounded-lg bg-bg-tertiary border border-border-primary hover:border-accent/50 transition-colors min-w-[80px]"
            >
              <span className="text-[10px] text-text-muted">尺寸</span>
              <span className="text-xs text-text-primary font-medium">{params.size}</span>
            </button>

            <select
              value={params.quality}
              onChange={e => setParams({ ...params, quality: e.target.value as any })}
              className="flex flex-col px-3 py-1.5 rounded-lg bg-bg-tertiary border border-border-primary text-xs text-text-primary focus:outline-none cursor-pointer"
            >
              <option value="high">质量: high (~76s/张)</option>
              <option value="medium">质量: medium (~43s/张)</option>
              <option value="auto">质量: auto (~40s/张)</option>
              <option value="low">质量: low (~25s/张)</option>
            </select>

            <select
              value={params.output_format}
              onChange={e => setParams({ ...params, output_format: e.target.value as any })}
              className="px-3 py-1.5 rounded-lg bg-bg-tertiary border border-border-primary text-xs text-text-primary focus:outline-none cursor-pointer"
            >
              <option value="png">PNG</option>
              <option value="jpeg">JPEG</option>
              <option value="webp">WebP</option>
            </select>

            <select
              value={params.transparent_output ? 'true' : 'false'}
              onChange={e => setParams({ ...params, transparent_output: e.target.value === 'true' })}
              className="px-3 py-1.5 rounded-lg bg-bg-tertiary border border-border-primary text-xs text-text-primary focus:outline-none cursor-pointer"
            >
              <option value="false">透明背景: false</option>
              <option value="true">透明背景: true</option>
            </select>

            <select
              value={params.moderation}
              onChange={e => setParams({ ...params, moderation: e.target.value as any })}
              className="px-3 py-1.5 rounded-lg bg-bg-tertiary border border-border-primary text-xs text-text-primary focus:outline-none cursor-pointer"
            >
              <option value="auto">审核: auto</option>
              <option value="low">审核: low</option>
            </select>

            <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-bg-tertiary border border-border-primary" title={`每次自动生成${imageCount}张`}>
              <span className="text-[10px] text-text-muted">数量</span>
              <span className="text-xs text-text-primary font-medium">{imageCount}</span>
            </div>

            <div className="flex-1" />

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2.5 rounded-xl bg-bg-tertiary border border-border-primary hover:border-accent/50 transition-colors text-text-secondary hover:text-text-primary"
              title="上传图片"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            <button
              onClick={handleSubmit}
              disabled={isGenerating || !prompt.trim()}
              className={`p-2.5 rounded-xl transition-all ${
                isGenerating || !prompt.trim()
                  ? 'bg-bg-tertiary text-text-muted cursor-not-allowed'
                  : 'bg-accent hover:bg-accent-hover text-white shadow-lg shadow-accent/25'
              }`}
              title="发送"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

