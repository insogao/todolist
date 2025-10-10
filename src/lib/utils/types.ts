export type Direction = 'TD' | 'LR';

export interface GraphNode {
  id: string;
  title: string;
  // Optional short description/content to render under the title (from planning JSON summary)
  summary?: string;
  // Raw info XML from planning JSON (<info type="llm">, <info type="search">)
  info?: string;
  // Original agent node type from planning JSON (start | search | summary | end)
  agentType?: 'start' | 'search' | 'summary' | 'end';
  // Execution status propagated from planning/workflow (planned | running | completed | failed)
  status?: 'planned' | 'running' | 'completed' | 'failed';
  // Batch index from plan JSON; -1 indicates final batch
  batch?: number;
  // Whether this node is the latest (check_list.latest_id)
  isLatest?: boolean;
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
