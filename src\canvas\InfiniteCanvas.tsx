import { useState, useRef, useCallback, useEffect } from 'react';
import { useCanvasEngine } from './useCanvasEngine';
import { CanvasToolbar } from './CanvasToolbar';
import { CanvasBottomBar } from './CanvasBottomBar';
import { CanvasMinimap } from './CanvasMinimap';
import { GenerationPanel } from './GenerationPanel';
import type { CanvasNode } from './types';
import type { ApiConfig, GenParams, GeneratedImage } from '../types';

interface InfiniteCanvasProps {
  apiConfig: ApiConfig;
  setApiConfig: (c: ApiConfig) => void;
  onImageGenerated: (nodeId: string, images: GeneratedImage[], prompt?: string) => void;
}

export function InfiniteCanvas({ apiConfig, setApiConfig, onImageGenerated }: InfiniteCanvasProps) {
  const engine = useCanvasEngine();
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showMinimap, setShowMinimap] = useState(true);
  const [showGenPanel, setShowGenPanel] = useState(false);
  const [showAppearance, setShowAppearance] = useState(false);
  const [showAgent, setShowAgent] = useState(false);
  const [gridStyle, setGridStyle] = useState<'dots' | 'lines' | 'none'>('dots');
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [clipboardNodes, setClipboardNodes] = useState<CanvasNode[]>([]);

  // Drag state
  const dragRef = useRef<{
    type: 'pan' | 'node' | 'select';
    startX: number;
    startY: number;
    startVpX: number;
    startVpY: number;
    nodeIds?: string[];
    nodeStartPositions?: Map<string, { x: number; y: number }>;
    selectRect?: { x: number; y: number; w: number; h: number };
  } | null>(null);

  const [selectRect, setSelectRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // Measure container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Screen to world coordinates
  const screenToWorld = useCallback((sx: number, sy: number) => {
    return {
      x: (sx - engine.viewport.x) / engine.viewport.zoom,
      y: (sy - engine.viewport.y) / engine.viewport.zoom,
    };
  }, [engine.viewport]);

  // Mouse handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      // Middle click or Alt+click: pan
      dragRef.current = {
        type: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        startVpX: engine.viewport.x,
        startVpY: engine.viewport.y,
      };
      e.preventDefault();
    } else if (e.button === 0 && e.target === containerRef.current) {
      // Click on empty space: start selection rect
      const rect = containerRef.current!.getBoundingClientRect();
      dragRef.current = {
        type: 'select',
        startX: e.clientX - rect.left,
        startY: e.clientY - rect.top,
        startVpX: 0,
        startVpY: 0,
      };
    }
  }, [engine.viewport]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current) return;
    const drag = dragRef.current;

    if (drag.type === 'pan') {
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      engine.pan(dx, dy);
    } else if (drag.type === 'node' && drag.nodeIds && drag.nodeStartPositions) {
      const dx = (e.clientX - drag.startX) / engine.viewport.zoom;
      const dy = (e.clientY - drag.startY) / engine.viewport.zoom;
      for (const id of drag.nodeIds) {
        const start = drag.nodeStartPositions.get(id);
        if (start) {
          engine.updateNode(id, { x: start.x + dx, y: start.y + dy });
        }
      }
    } else if (drag.type === 'select') {
      const rect = containerRef.current!.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const x = Math.min(drag.startX, cx);
      const y = Math.min(drag.startY, cy);
      const w = Math.abs(cx - drag.startX);
      const h = Math.abs(cy - drag.startY);
      setSelectRect({ x, y, w, h });
    }
  }, [engine]);

  const handleMouseUp = useCallback((_e: React.MouseEvent) => {
    if (!dragRef.current) return;
    const drag = dragRef.current;

    if (drag.type === 'node') {
      engine.saveHistory();
    } else if (drag.type === 'select' && selectRect) {
      // Find nodes within selection rect
      const worldRect = {
        x: screenToWorld(selectRect.x, selectRect.y).x,
        y: screenToWorld(selectRect.x, selectRect.y).y,
        w: selectRect.w / engine.viewport.zoom,
        h: selectRect.h / engine.viewport.zoom,
      };

      const selectedIds = engine.nodes
        .filter(n =>
          n.x < worldRect.x + worldRect.w &&
          n.x + n.width > worldRect.x &&
          n.y < worldRect.y + worldRect.h &&
          n.y + n.height > worldRect.y
        )
        .map(n => n.id);

      if (selectedIds.length > 0) {
        engine.deselectAll();
        selectedIds.forEach(id => engine.selectNode(id, true));
      } else {
        engine.deselectAll();
      }
      setSelectRect(null);
    }

    dragRef.current = null;
  }, [engine, selectRect, screenToWorld]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = containerRef.current!.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    if (e.ctrlKey || e.metaKey) {
      // Precise zoom
      const factor = 1 - e.deltaY * 0.005;
      engine.zoom(factor, cx, cy);
    } else {
      // Pan
      engine.pan(-e.deltaX, -e.deltaY);
    }
  }, [engine]);

  // Node drag start
  const handleNodeDragStart = useCallback((nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const isSelected = engine.selectedNodeIds.has(nodeId);

    if (!isSelected) {
      engine.selectNode(nodeId, e.shiftKey || e.ctrlKey);
    }

    const ids = isSelected ? [...engine.selectedNodeIds] : [nodeId];
    const positions = new Map<string, { x: number; y: number }>();
    for (const id of ids) {
      const node = engine.nodes.find(n => n.id === id);
      if (node) positions.set(id, { x: node.x, y: node.y });
    }

    dragRef.current = {
      type: 'node',
      startX: e.clientX,
      startY: e.clientY,
      startVpX: engine.viewport.x,
      startVpY: engine.viewport.y,
      nodeIds: ids,
      nodeStartPositions: positions,
    };
  }, [engine]);

  // Node double click to edit
  const handleNodeDoubleClick = useCallback((nodeId: string) => {
    setEditingNodeId(nodeId);
  }, []);

  // Node right click for connection
  const handleNodeRightClick = useCallback((nodeId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (engine.connectingFrom) {
      engine.completeConnection(nodeId);
    } else {
      engine.startConnection(nodeId);
    }
  }, [engine]);

  // Toolbar actions
  const handleAddText = useCallback(() => {
    const id = engine.addNode('text', '双击编辑文本');
    setEditingNodeId(id);
  }, [engine]);

  const handleAddImage = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      if (base64) {
        engine.addNode('image', base64);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, [engine]);

  const handleUploadFromToolbar = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Copy/paste
  useEffect(() => {
    const handleCopy = (e: ClipboardEvent) => {
      if (engine.selectedNodeIds.size === 0) return;
      const copied = engine.copyNodes();
      setClipboardNodes(copied);
      e.preventDefault();
    };
    const handlePaste = (e: ClipboardEvent) => {
      if (clipboardNodes.length > 0) {
        engine.pasteNodes(clipboardNodes);
        e.preventDefault();
      }
    };
    window.addEventListener('copy', handleCopy);
    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('copy', handleCopy);
      window.removeEventListener('paste', handlePaste);
    };
  }, [engine, clipboardNodes]);

  // AI Generation
  const handleGenerate = useCallback(async (prompt: string, params: GenParams, referenceImages?: string[]) => {
    if (!apiConfig.apiKey) return;

    // Create a text node for the prompt
    const textNodeId = engine.addNode('text', prompt);

    try {
      if (referenceImages?.length) {
        throw new Error('画布参考图生成已安全停用：请在画廊使用“严格产品保真”生成，避免产品被模型重绘。');
      }
      const { generateImageBatch, enhancePrompt } = await import('../api');

      let finalPrompt = prompt;

      // Step 1: AI prompt enhancement
      if (apiConfig.enhancePrompt) {
        try {
          finalPrompt = await enhancePrompt(apiConfig, prompt, undefined, referenceImages);
          engine.updateNode(textNodeId, { content: `[原] ${prompt}\n[AI增强] ${finalPrompt}` });
        } catch (err: any) {
          console.warn('Prompt enhancement failed:', err.message);
        }
      }

      // Step 2: Batch generate images
      const imageCount = apiConfig.imageCount || 3;
      const images = await generateImageBatch(apiConfig, finalPrompt, params, imageCount, referenceImages);

      if (images.length > 0) {
        for (const img of images) {
          const imageNodeId = engine.addNode('image', img.b64_json);
          // Auto-connect image node to text node
          engine.addEdge(textNodeId, imageNodeId);
        }
        onImageGenerated(textNodeId, images, prompt);
      }
    } catch (err: any) {
      engine.updateNode(textNodeId, { content: `[生成失败] ${prompt}\n错误: ${err.message}` });
    }
  }, [apiConfig, engine, onImageGenerated]);

  // Connected node texts for generation panel
  const connectedNodeTexts = engine.nodes
    .filter(n => n.type === 'text' && engine.selectedNodeIds.has(n.id))
    .map(n => ({ id: n.id, content: n.content }));

  // Connected image nodes for reference
  const connectedImageNodes = engine.nodes
    .filter(n => n.type === 'image' && engine.selectedNodeIds.has(n.id))
    .map(n => ({ id: n.id, content: n.content }));

  // Grid background
  const getGridBackground = () => {
    if (gridStyle === 'none') return 'transparent';
    if (gridStyle === 'dots') {
      return `radial-gradient(circle, #1e2d45 1px, transparent 1px)`;
    }
    return `linear-gradient(#1e2d45 1px, transparent 1px), linear-gradient(90deg, #1e2d45 1px, transparent 1px)`;
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden cursor-grab active:cursor-grabbing"
      style={{
        backgroundColor: '#0a0e17',
        backgroundImage: getGridBackground(),
        backgroundSize: gridStyle === 'dots' ? `${20 * engine.viewport.zoom}px ${20 * engine.viewport.zoom}px` : `${20 * engine.viewport.zoom}px ${20 * engine.viewport.zoom}px`,
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      onContextMenu={e => e.preventDefault()}
    >
      {/* Canvas transform layer */}
      <div
        className="absolute origin-top-left"
        style={{
          transform: `translate(${engine.viewport.x}px, ${engine.viewport.y}px) scale(${engine.viewport.zoom})`,
        }}
      >
        {/* SVG edges */}
        <svg className="absolute inset-0 overflow-visible pointer-events-none" style={{ width: 1, height: 1 }}>
          {engine.edges.map(edge => {
            const from = engine.nodes.find(n => n.id === edge.fromNodeId);
            const to = engine.nodes.find(n => n.id === edge.toNodeId);
            if (!from || !to) return null;
            const x1 = from.x + from.width / 2;
            const y1 = from.y + from.height;
            const x2 = to.x + to.width / 2;
            const y2 = to.y;
            const midY = (y1 + y2) / 2;
            return (
              <path
                key={edge.id}
                d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
                fill="none"
                stroke="#3b82f6"
                strokeWidth={2}
                opacity={0.6}
                className="pointer-events-auto cursor-pointer hover:opacity-100 hover:stroke-[3]"
                onClick={() => engine.deleteEdge(edge.id)}
              />
            );
          })}
          {/* Connection line while connecting */}
          {engine.connectingFrom && (() => {
            const from = engine.nodes.find(n => n.id === engine.connectingFrom);
            if (!from) return null;
            return (
              <line
                x1={from.x + from.width / 2}
                y1={from.y + from.height}
                x2={from.x + from.width / 2}
                y2={from.y + from.height + 50}
                stroke="#3b82f6"
                strokeWidth={2}
                strokeDasharray="5,5"
                opacity={0.5}
              />
            );
          })()}
        </svg>

        {/* Nodes */}
        {engine.nodes.map(node => (
          <CanvasNodeElement
            key={node.id}
            node={node}
            isSelected={engine.selectedNodeIds.has(node.id)}
            isConnecting={engine.connectingFrom === node.id}
            isEditing={editingNodeId === node.id}
            onDragStart={(e) => handleNodeDragStart(node.id, e)}
            onDoubleClick={() => handleNodeDoubleClick(node.id)}
            onRightClick={(e) => handleNodeRightClick(node.id, e)}
            onEditComplete={(content) => {
              engine.updateNode(node.id, { content });
              setEditingNodeId(null);
              engine.saveHistory();
            }}
            onEditCancel={() => setEditingNodeId(null)}
            zoom={engine.viewport.zoom}
          />
        ))}
      </div>

      {/* Selection rectangle */}
      {selectRect && (
        <div
          className="absolute border border-accent/60 bg-accent/10 pointer-events-none z-10"
          style={{
            left: selectRect.x,
            top: selectRect.y,
            width: selectRect.w,
            height: selectRect.h,
          }}
        />
      )}

      {/* Toolbar */}
      <CanvasToolbar
        onAddText={handleAddText}
        onAddImage={handleAddImage}
        onUndo={engine.undo}
        onRedo={engine.redo}
        onClearAll={engine.clearAll}
        onDeleteSelected={() => engine.deleteNodes([...engine.selectedNodeIds])}
        hasSelection={engine.selectedNodeIds.size > 0}
        onOpenGenConfig={() => setShowGenPanel(!showGenPanel)}
        onOpenAppearance={() => setShowAppearance(!showAppearance)}
        onOpenAgent={() => setShowAgent(!showAgent)}
        onUploadFile={handleUploadFromToolbar}
        fileInputRef={fileInputRef}
        onFileChange={handleFileUpload}
      />

      {/* Bottom bar */}
      <CanvasBottomBar
        zoom={engine.viewport.zoom}
        onZoomChange={engine.setZoom}
        onResetView={engine.resetView}
        showMinimap={showMinimap}
        onToggleMinimap={() => setShowMinimap(!showMinimap)}
        nodeCount={engine.nodes.length}
        edgeCount={engine.edges.length}
      />

      {/* Minimap */}
      {showMinimap && (
        <CanvasMinimap
          nodes={engine.nodes}
          edges={engine.edges}
          viewport={engine.viewport}
          containerWidth={containerSize.width}
          containerHeight={containerSize.height}
          onViewportClick={(wx, wy) => {
            engine.pan(
              -wx * engine.viewport.zoom - engine.viewport.x + containerSize.width / 2,
              -wy * engine.viewport.zoom - engine.viewport.y + containerSize.height / 2
            );
          }}
        />
      )}

      {/* Generation panel */}
      {showGenPanel && (
        <GenerationPanel
          apiConfig={apiConfig}
          setApiConfig={setApiConfig}
          onGenerate={handleGenerate}
          connectedNodeTexts={connectedNodeTexts}
          connectedImageNodes={connectedImageNodes}
          onClose={() => setShowGenPanel(false)}
        />
      )}

      {/* Appearance panel */}
      {showAppearance && (
        <div className="absolute top-16 right-4 z-20 w-64 bg-bg-card/95 backdrop-blur-xl border border-border-primary rounded-xl p-4 shadow-2xl animate-fade-in">
          <h3 className="text-sm font-semibold text-text-primary mb-3">画布外观</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-text-muted mb-1.5 block">网格样式</label>
              <div className="flex gap-1.5">
                {(['dots', 'lines', 'none'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setGridStyle(s)}
                    className={`flex-1 py-1.5 rounded-lg border text-xs transition-all ${
                      gridStyle === s
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border-primary text-text-muted hover:border-accent/50'
                    }`}
                  >
                    {s === 'dots' ? '点' : s === 'lines' ? '线' : '无'}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <button
            onClick={() => setShowAppearance(false)}
            className="mt-3 w-full py-1.5 rounded-lg bg-bg-tertiary text-text-secondary text-xs hover:bg-bg-card transition-colors"
          >
            关闭
          </button>
        </div>
      )}

      {/* Agent panel */}
      {showAgent && (
        <div className="absolute top-16 right-4 z-20 w-80 bg-bg-card/95 backdrop-blur-xl border border-border-primary rounded-xl shadow-2xl animate-fade-in">
          <div className="p-4 border-b border-border-primary">
            <h3 className="text-sm font-semibold text-text-primary">Agent 画布助手</h3>
            <p className="text-xs text-text-muted mt-1">通过 AI 对话操作画布</p>
          </div>
          <div className="p-4">
            <div className="bg-bg-tertiary rounded-lg p-3 text-center">
              <p className="text-xs text-text-muted">Agent 功能需要配置文本模型 API</p>
              <p className="text-xs text-text-muted mt-1">请在设置中配置 API Key 后使用</p>
            </div>
          </div>
          <div className="px-4 pb-4">
            <button
              onClick={() => setShowAgent(false)}
              className="w-full py-1.5 rounded-lg bg-bg-tertiary text-text-secondary text-xs hover:bg-bg-card transition-colors"
            >
              关闭
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {engine.nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center text-text-muted/40">
            <p className="text-lg mb-2">无限画布</p>
            <p className="text-sm">点击工具栏添加文本或图片节点</p>
            <p className="text-xs mt-2">滚轮缩放 · Alt+拖拽平移 · 右键节点连线</p>
          </div>
        </div>
      )}
    </div>
  );
}

// Node element component
function CanvasNodeElement({
  node, isSelected, isConnecting, isEditing,
  onDragStart, onDoubleClick, onRightClick,
  onEditComplete, onEditCancel, zoom: _zoom,
}: {
  node: CanvasNode;
  isSelected: boolean;
  isConnecting: boolean;
  isEditing: boolean;
  onDragStart: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onRightClick: (e: React.MouseEvent) => void;
  onEditComplete: (content: string) => void;
  onEditCancel: () => void;
  zoom: number;
}) {
  const [editText, setEditText] = useState(node.content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [isEditing]);

  if (node.type === 'text') {
    return (
      <div
        className={`absolute rounded-xl border transition-shadow ${
          isSelected
            ? 'border-accent shadow-lg shadow-accent/20'
            : isConnecting
              ? 'border-accent/50 border-dashed'
              : 'border-border-primary hover:border-border-secondary'
        } bg-bg-card/90 backdrop-blur-sm`}
        style={{
          left: node.x,
          top: node.y,
          width: node.width,
          minHeight: node.height,
          cursor: 'move',
        }}
        onMouseDown={onDragStart}
        onDoubleClick={onDoubleClick}
        onContextMenu={onRightClick}
      >
        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={editText}
            onChange={e => setEditText(e.target.value)}
            onBlur={() => onEditComplete(editText)}
            onKeyDown={e => {
              if (e.key === 'Escape') onEditCancel();
              if (e.key === 'Enter' && e.ctrlKey) onEditComplete(editText);
            }}
            className="w-full h-full p-3 bg-transparent text-text-primary text-sm resize-none focus:outline-none"
            style={{ minHeight: node.height }}
          />
        ) : (
          <div className="p-3">
            <p className="text-sm text-text-primary whitespace-pre-wrap break-words leading-relaxed">
              {node.content}
            </p>
          </div>
        )}
        {/* Connection handle */}
        <div
          className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-accent border-2 border-bg-card cursor-crosshair opacity-0 hover:opacity-100 transition-opacity"
          onContextMenu={onRightClick}
          title="右键连线"
        />
      </div>
    );
  }

  // Image node
  return (
    <div
      className={`absolute rounded-xl border overflow-hidden transition-shadow ${
        isSelected
          ? 'border-accent shadow-lg shadow-accent/20'
          : isConnecting
            ? 'border-accent/50 border-dashed'
            : 'border-border-primary hover:border-border-secondary'
      } bg-bg-card/90 backdrop-blur-sm`}
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        cursor: 'move',
      }}
      onMouseDown={onDragStart}
      onDoubleClick={onDoubleClick}
      onContextMenu={onRightClick}
    >
      <img
        src={`data:image/png;base64,${node.content}`}
        alt="Node"
        className="w-full h-auto block"
        draggable={false}
      />
      {/* Connection handle */}
      <div
        className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-accent border-2 border-bg-card cursor-crosshair opacity-0 hover:opacity-100 transition-opacity"
        onContextMenu={onRightClick}
        title="右键连线"
      />
    </div>
  );
}

