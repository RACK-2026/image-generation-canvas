import type { CanvasNode, CanvasEdge, ViewportState } from './types';

interface MinimapProps {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport: ViewportState;
  containerWidth: number;
  containerHeight: number;
  onViewportClick: (x: number, y: number) => void;
}

export function CanvasMinimap({ nodes, edges, viewport, containerWidth, containerHeight, onViewportClick }: MinimapProps) {
  const mapWidth = 180;
  const mapHeight = 120;

  // Calculate bounds
  if (nodes.length === 0) {
    return (
      <div className="absolute bottom-16 right-4 z-20 bg-bg-card/90 backdrop-blur-xl border border-border-primary rounded-lg p-2 shadow-xl"
        style={{ width: mapWidth, height: mapHeight }}>
        <div className="w-full h-full flex items-center justify-center text-text-muted text-xs">
          画布为空
        </div>
      </div>
    );
  }

  const padding = 200;
  const minX = Math.min(...nodes.map(n => n.x)) - padding;
  const minY = Math.min(...nodes.map(n => n.y)) - padding;
  const maxX = Math.max(...nodes.map(n => n.x + n.width)) + padding;
  const maxY = Math.max(...nodes.map(n => n.y + n.height)) + padding;

  const worldWidth = maxX - minX || 1;
  const worldHeight = maxY - minY || 1;
  const scale = Math.min(mapWidth / worldWidth, mapHeight / worldHeight);

  const toMapX = (x: number) => (x - minX) * scale;
  const toMapY = (y: number) => (y - minY) * scale;

  // Viewport rect on minimap
  const vpX = toMapX(-viewport.x / viewport.zoom);
  const vpY = toMapY(-viewport.y / viewport.zoom);
  const vpW = (containerWidth / viewport.zoom) * scale;
  const vpH = (containerHeight / viewport.zoom) * scale;

  const handleClick = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const worldX = minX + mx / scale;
    const worldY = minY + my / scale;
    onViewportClick(worldX, worldY);
  };

  return (
    <div
      className="absolute bottom-16 right-4 z-20 bg-bg-card/90 backdrop-blur-xl border border-border-primary rounded-lg overflow-hidden shadow-xl cursor-pointer"
      style={{ width: mapWidth, height: mapHeight }}
      onClick={handleClick}
    >
      <svg width={mapWidth} height={mapHeight} className="absolute inset-0">
        {/* Edges */}
        {edges.map(edge => {
          const from = nodes.find(n => n.id === edge.fromNodeId);
          const to = nodes.find(n => n.id === edge.toNodeId);
          if (!from || !to) return null;
          return (
            <line
              key={edge.id}
              x1={toMapX(from.x + from.width / 2)}
              y1={toMapY(from.y + from.height / 2)}
              x2={toMapX(to.x + to.width / 2)}
              y2={toMapY(to.y + to.height / 2)}
              stroke="#3b82f6"
              strokeWidth={1}
              opacity={0.5}
            />
          );
        })}

        {/* Nodes */}
        {nodes.map(node => (
          <rect
            key={node.id}
            x={toMapX(node.x)}
            y={toMapY(node.y)}
            width={Math.max(4, node.width * scale)}
            height={Math.max(3, node.height * scale)}
            fill={node.type === 'text' ? '#64748b' : '#3b82f6'}
            rx={1}
            opacity={0.7}
          />
        ))}

        {/* Viewport */}
        <rect
          x={vpX}
          y={vpY}
          width={vpW}
          height={vpH}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={1.5}
          strokeDasharray="3,2"
          opacity={0.8}
        />
      </svg>
    </div>
  );
}

