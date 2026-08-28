import { useState, useCallback, useRef, useEffect } from 'react';
import type { CanvasNode, CanvasEdge, ViewportState, CanvasData } from './types';

function generateId() {
  return `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function generateEdgeId() {
  return `edge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useCanvasEngine() {
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [edges, setEdges] = useState<CanvasEdge[]>([]);
  const [viewport, setViewport] = useState<ViewportState>({ x: 0, y: 0, zoom: 1 });
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);

  // History for undo/redo
  const historyRef = useRef<CanvasData[]>([]);
  const historyIndexRef = useRef(-1);

  const saveHistory = useCallback(() => {
    const data: CanvasData = {
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
      viewport: { ...viewport },
    };
    // Truncate future history
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push(data);
    historyIndexRef.current = historyRef.current.length - 1;
    // Keep max 50 states
    if (historyRef.current.length > 50) {
      historyRef.current.shift();
      historyIndexRef.current--;
    }
  }, [nodes, edges, viewport]);

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current--;
    const state = historyRef.current[historyIndexRef.current];
    setNodes(state.nodes);
    setEdges(state.edges);
    setViewport(state.viewport);
  }, []);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current++;
    const state = historyRef.current[historyIndexRef.current];
    setNodes(state.nodes);
    setEdges(state.edges);
    setViewport(state.viewport);
  }, []);

  // Add node - auto offset to avoid overlap
  const nodeOffsetRef = useRef(0);
  const addNode = useCallback((type: 'text' | 'image', content: string, x?: number, y?: number) => {
    saveHistory();
    const centerX = x ?? (-viewport.x + window.innerWidth / 2) / viewport.zoom;
    const centerY = y ?? (-viewport.y + window.innerHeight / 2) / viewport.zoom;

    // Auto offset new nodes to avoid overlap
    const offsetX = x !== undefined ? 0 : (nodeOffsetRef.current % 3) * 30;
    const offsetY = x !== undefined ? 0 : Math.floor(nodeOffsetRef.current / 3) * 30;
    nodeOffsetRef.current++;

    const node: CanvasNode = {
      id: generateId(),
      type,
      x: centerX - 100 + offsetX,
      y: centerY - 50 + offsetY,
      width: type === 'text' ? 240 : 300,
      height: type === 'text' ? 120 : 200,
      content,
    };
    setNodes(prev => [...prev, node]);
    return node.id;
  }, [viewport, saveHistory]);

  // Add edge (connection between nodes)
  const addEdge = useCallback((fromNodeId: string, toNodeId: string) => {
    const exists = edges.some(e => e.fromNodeId === fromNodeId && e.toNodeId === toNodeId);
    if (!exists) {
      saveHistory();
      setEdges(prev => [...prev, { id: generateEdgeId(), fromNodeId, toNodeId }]);
    }
  }, [edges, saveHistory]);

  // Update node
  const updateNode = useCallback((id: string, updates: Partial<CanvasNode>) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));
  }, []);

  // Delete nodes
  const deleteNodes = useCallback((ids: string[]) => {
    saveHistory();
    setNodes(prev => prev.filter(n => !ids.includes(n.id)));
    setEdges(prev => prev.filter(e => !ids.includes(e.fromNodeId) && !ids.includes(e.toNodeId)));
    setSelectedNodeIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.delete(id));
      return next;
    });
  }, [saveHistory]);

  // Clear all
  const clearAll = useCallback(() => {
    saveHistory();
    setNodes([]);
    setEdges([]);
    setSelectedNodeIds(new Set());
  }, [saveHistory]);

  // Select nodes
  const selectNode = useCallback((id: string, additive = false) => {
    setSelectedNodeIds(prev => {
      if (additive) {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }
      return new Set([id]);
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedNodeIds(new Set(nodes.map(n => n.id)));
  }, [nodes]);

  const deselectAll = useCallback(() => {
    setSelectedNodeIds(new Set());
    setConnectingFrom(null);
  }, []);

  // Move selected nodes
  const moveSelectedNodes = useCallback((dx: number, dy: number) => {
    setNodes(prev => prev.map(n =>
      selectedNodeIds.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n
    ));
  }, [selectedNodeIds]);

  // Copy/paste
  const copyNodes = useCallback(() => {
    const selected = nodes.filter(n => selectedNodeIds.has(n.id));
    return JSON.parse(JSON.stringify(selected));
  }, [nodes, selectedNodeIds]);

  const pasteNodes = useCallback((copiedNodes: CanvasNode[], offsetX = 30, offsetY = 30) => {
    saveHistory();
    const newIds = new Map<string, string>();
    const newNodes: CanvasNode[] = copiedNodes.map(n => {
      const newId = generateId();
      newIds.set(n.id, newId);
      return {
        ...n,
        id: newId,
        x: n.x + offsetX,
        y: n.y + offsetY,
      };
    });

    // Also copy edges between selected nodes
    const newEdges: CanvasEdge[] = edges
      .filter(e => selectedNodeIds.has(e.fromNodeId) && selectedNodeIds.has(e.toNodeId))
      .map(e => ({
        id: generateEdgeId(),
        fromNodeId: newIds.get(e.fromNodeId)!,
        toNodeId: newIds.get(e.toNodeId)!,
      }));

    setNodes(prev => [...prev, ...newNodes]);
    setEdges(prev => [...prev, ...newEdges]);
    setSelectedNodeIds(new Set(newNodes.map(n => n.id)));
  }, [edges, selectedNodeIds, saveHistory]);

  // Edges / connections
  const startConnection = useCallback((nodeId: string) => {
    setConnectingFrom(nodeId);
  }, []);

  const completeConnection = useCallback((toNodeId: string) => {
    if (!connectingFrom || connectingFrom === toNodeId) {
      setConnectingFrom(null);
      return;
    }
    // Check if edge already exists
    const exists = edges.some(
      e => e.fromNodeId === connectingFrom && e.toNodeId === toNodeId
    );
    if (!exists) {
      saveHistory();
      setEdges(prev => [...prev, {
        id: generateEdgeId(),
        fromNodeId: connectingFrom,
        toNodeId,
      }]);
    }
    setConnectingFrom(null);
  }, [connectingFrom, edges, saveHistory]);

  const deleteEdge = useCallback((edgeId: string) => {
    saveHistory();
    setEdges(prev => prev.filter(e => e.id !== edgeId));
  }, [saveHistory]);

  // Viewport
  const pan = useCallback((dx: number, dy: number) => {
    setViewport(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
  }, []);

  const zoom = useCallback((factor: number, centerX?: number, centerY?: number) => {
    setViewport(prev => {
      const newZoom = Math.min(5, Math.max(0.05, prev.zoom * factor));
      if (centerX !== undefined && centerY !== undefined) {
        const scale = newZoom / prev.zoom;
        return {
          zoom: newZoom,
          x: centerX - (centerX - prev.x) * scale,
          y: centerY - (centerY - prev.y) * scale,
        };
      }
      return { ...prev, zoom: newZoom };
    });
  }, []);

  const resetView = useCallback(() => {
    setViewport({ x: 0, y: 0, zoom: 1 });
  }, []);

  const setZoom = useCallback((zoomLevel: number) => {
    setViewport(prev => ({ ...prev, zoom: Math.min(5, Math.max(0.05, zoomLevel)) }));
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        selectAll();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault();
        // Copy handled by component
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault();
        // Paste handled by component
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeIds.size > 0) {
          e.preventDefault();
          deleteNodes([...selectedNodeIds]);
        }
      }
      if (e.key === 'Escape') {
        deselectAll();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, selectAll, deleteNodes, selectedNodeIds, deselectAll]);

  return {
    nodes, edges, viewport, selectedNodeIds, connectingFrom,
    addNode, addEdge, updateNode, deleteNodes, clearAll,
    selectNode, selectAll, deselectAll, moveSelectedNodes,
    copyNodes, pasteNodes,
    startConnection, completeConnection, deleteEdge,
    pan, zoom, setZoom, resetView,
    undo, redo, saveHistory,
  };
}

