import { useState } from 'react';
import { X, Zap } from 'lucide-react';
import type { SizeConfig, GenParams } from '../types';
import { SIZE_RATIOS, BASE_RESOLUTIONS } from '../types';

interface SizeDialogProps {
  sizeConfig: SizeConfig;
  setSizeConfig: (c: SizeConfig) => void;
  params: GenParams;
  setParams: (p: GenParams) => void;
  onClose: () => void;
}

export function SizeDialog({ sizeConfig, setSizeConfig, params, setParams, onClose }: SizeDialogProps) {
  const [tempConfig, setTempConfig] = useState<SizeConfig>(sizeConfig);

  const getDisplaySize = () => {
    if (tempConfig.mode === 'auto') return 'auto';
    if (tempConfig.mode === 'custom') return `${tempConfig.customWidth}×${tempConfig.customHeight}`;
    return `${tempConfig.baseResolution} ${tempConfig.ratio}`;
  };

  const handleConfirm = () => {
    let sizeValue = 'auto';
    if (tempConfig.mode === 'ratio') {
      sizeValue = `${tempConfig.baseResolution}_${tempConfig.ratio}`;
    } else if (tempConfig.mode === 'custom') {
      sizeValue = `${tempConfig.customWidth}x${tempConfig.customHeight}`;
    }
    setParams({ ...params, size: sizeValue });
    setSizeConfig(tempConfig);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-bg-secondary border border-border-primary rounded-2xl w-full max-w-lg mx-4 animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">设置图像尺寸</h2>
            <p className="text-xs text-text-muted mt-1">当前: {params.size}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-bg-tertiary text-text-muted transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="px-6 pb-4">
          <div className="flex bg-bg-tertiary rounded-lg p-1">
            {(['auto', 'ratio', 'custom'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setTempConfig({ ...tempConfig, mode })}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
                  tempConfig.mode === mode
                    ? 'bg-bg-card text-text-primary shadow'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {mode === 'auto' ? '自动' : mode === 'ratio' ? '按比例' : '自定义宽高'}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 pb-6 min-h-[200px] flex flex-col items-center justify-center">
          {tempConfig.mode === 'auto' && (
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
                <Zap className="w-8 h-8 text-accent" />
              </div>
              <h3 className="text-base font-medium text-text-primary mb-2">自动尺寸</h3>
              <p className="text-sm text-text-muted">不向模型传递具体的分辨率参数</p>
              <p className="text-sm text-text-muted">由模型自己决定生成尺寸</p>
            </div>
          )}

          {tempConfig.mode === 'ratio' && (
            <div className="w-full space-y-4">
              <div>
                <label className="text-xs text-text-muted mb-2 block">基准分辨率</label>
                <div className="flex gap-2">
                  {BASE_RESOLUTIONS.map(res => (
                    <button
                      key={res}
                      onClick={() => setTempConfig({ ...tempConfig, baseResolution: res })}
                      className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${
                        tempConfig.baseResolution === res
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-border-primary text-text-secondary hover:border-accent/50'
                      }`}
                    >
                      {res}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-text-muted mb-2 block">图像比例</label>
                <div className="grid grid-cols-4 gap-2">
                  {SIZE_RATIOS.map(ratio => (
                    <button
                      key={ratio}
                      onClick={() => setTempConfig({ ...tempConfig, ratio })}
                      className={`py-2 rounded-lg border text-sm transition-all ${
                        tempConfig.ratio === ratio
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-border-primary text-text-secondary hover:border-accent/50'
                      }`}
                    >
                      {ratio}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tempConfig.mode === 'custom' && (
            <div className="w-full space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-text-muted mb-2 block">宽度 (px)</label>
                  <input
                    type="number"
                    value={tempConfig.customWidth}
                    onChange={e => setTempConfig({ ...tempConfig, customWidth: parseInt(e.target.value) || 1024 })}
                    className="w-full px-3 py-2 rounded-lg bg-bg-tertiary border border-border-primary text-text-primary text-sm focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="text-xs text-text-muted mb-2 block">高度 (px)</label>
                  <input
                    type="number"
                    value={tempConfig.customHeight}
                    onChange={e => setTempConfig({ ...tempConfig, customHeight: parseInt(e.target.value) || 1024 })}
                    className="w-full px-3 py-2 rounded-lg bg-bg-tertiary border border-border-primary text-text-primary text-sm focus:outline-none focus:border-accent"
                  />
                </div>
              </div>
              <p className="text-xs text-text-muted">
                宽高均为16的倍数，最大边长3840px，宽高比不超过3:1，总像素655360-8294400
              </p>
            </div>
          )}
        </div>

        {/* Preview */}
        <div className="px-6 pb-4">
          <div className="bg-bg-tertiary rounded-lg p-3">
            <span className="text-xs text-text-muted">将使用</span>
            <p className="text-sm font-medium text-text-primary mt-0.5">{getDisplaySize()}</p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-bg-tertiary border border-border-primary text-text-primary text-sm font-medium hover:bg-bg-card transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 py-2.5 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors shadow-lg shadow-accent/25"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}

