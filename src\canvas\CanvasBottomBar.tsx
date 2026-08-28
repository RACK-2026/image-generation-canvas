import { Map, RotateCcw, Keyboard } from 'lucide-react';

interface CanvasBottomBarProps {
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onResetView: () => void;
  showMinimap: boolean;
  onToggleMinimap: () => void;
  nodeCount: number;
  edgeCount: number;
}

export function CanvasBottomBar({
  zoom, onZoomChange, onResetView, showMinimap, onToggleMinimap, nodeCount, edgeCount,
}: CanvasBottomBarProps) {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 bg-bg-card/90 backdrop-blur-xl border border-border-primary rounded-xl px-4 py-2 shadow-xl">
      <button
        onClick={onToggleMinimap}
        className={`p-1.5 rounded-lg transition-colors ${showMinimap ? 'text-accent bg-accent/10' : 'text-text-secondary hover:text-text-primary'}`}
        title="小地图"
      >
        <Map className="w-4 h-4" />
      </button>

      <button
        onClick={onResetView}
        className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary transition-colors"
        title="重置视图"
      >
        <RotateCcw className="w-4 h-4" />
      </button>

      <div className="flex items-center gap-2">
        <input
          type="range"
          min={5}
          max={500}
          value={Math.round(zoom * 100)}
          onChange={e => onZoomChange(parseInt(e.target.value) / 100)}
          className="w-32 h-1 appearance-none bg-border-secondary rounded-full cursor-pointer accent-accent"
          style={{
            background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((zoom - 0.05) / 4.95) * 100}%, #2a3a55 ${((zoom - 0.05) / 4.95) * 100}%, #2a3a55 100%)`,
          }}
        />
        <span className="text-xs text-text-secondary font-mono w-12 text-right">
          {Math.round(zoom * 100)}%
        </span>
      </div>

      <div className="w-px h-4 bg-border-primary" />

      <span className="text-xs text-text-muted">
        {nodeCount} 节点 · {edgeCount} 连线
      </span>

      <button
        className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary transition-colors"
        title="快捷键"
      >
        <Keyboard className="w-4 h-4" />
      </button>
    </div>
  );
}

