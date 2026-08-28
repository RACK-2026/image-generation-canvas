export type NodeType = 'text' | 'image' | 'video' | 'audio';

export interface CanvasNode {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  content: string; // text content or base64 image data
  title?: string;
  metadata?: Record<string, any>;
}

export interface CanvasEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
}

export interface CanvasData {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
}

export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

