export type Direction = 'TD' | 'LR';

export interface GraphNode {
  id: string;
  title: string;
  type?: 'rect' | 'circle';
  width?: number;
  height?: number;
  x?: number;
  y?: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string; // e.g., depends_on
}

export interface GraphData {
  direction: Direction;
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata?: {
    updatedAt?: string;
    version?: string | number;
  };
}