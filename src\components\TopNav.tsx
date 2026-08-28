import { Paintbrush, LayoutGrid, Settings, HelpCircle, Download, Database } from 'lucide-react';

interface TopNavProps {
  view: 'gallery' | 'canvas';
  setView: (v: 'gallery' | 'canvas') => void;
  showSettings: boolean;
  setShowSettings: (v: boolean) => void;
  vaultReady?: boolean;
  onInitVault?: () => void;
  cacheStats?: { total: number; vision: number; extraction: number; planning: number } | null;
}

export function TopNav({ view, setView, showSettings, setShowSettings, vaultReady, onInitVault, cacheStats }: TopNavProps) {
  return (
    <nav className="sticky top-0 z-40 bg-bg-primary/80 backdrop-blur-xl border-b border-border-primary">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Paintbrush className="w-5 h-5 text-accent" />
            <span className="font-semibold text-text-primary text-sm">artworkers image</span>
          </div>
          <div className="flex bg-bg-tertiary rounded-lg p-0.5 ml-4">
            <button
              onClick={() => setView('gallery')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
                view === 'gallery'
                  ? 'bg-accent text-white shadow-lg'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              画廊
            </button>
            <button
              onClick={() => setView('canvas')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
                view === 'canvas'
                  ? 'bg-accent text-white shadow-lg'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              画布
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Knowledge Base / Vault */}
          {onInitVault && (
            <button
              onClick={onInitVault}
              className={`p-2 rounded-lg transition-colors flex items-center gap-1 ${
                vaultReady
                  ? 'bg-green-500/20 text-green-400'
                  : 'hover:bg-bg-tertiary text-text-secondary hover:text-text-primary'
              }`}
              title={vaultReady ? `知识库已就绪 (缓存: ${cacheStats?.total || 0}条)` : '初始化知识库 (Obsidian vault)'}
            >
              <Database className="w-4 h-4" />
              {vaultReady && <span className="text-[10px]">{cacheStats?.total || 0}</span>}
            </button>
          )}
          <button className="p-2 rounded-lg hover:bg-bg-tertiary text-text-secondary hover:text-text-primary transition-colors" title="安装为应用">
            <Download className="w-4 h-4" />
          </button>
          <button className="p-2 rounded-lg hover:bg-bg-tertiary text-text-secondary hover:text-text-primary transition-colors" title="操作指南">
            <HelpCircle className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2 rounded-lg transition-colors ${
              showSettings ? 'bg-accent/20 text-accent' : 'hover:bg-bg-tertiary text-text-secondary hover:text-text-primary'
            }`}
            title="设置"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </nav>
  );
}

