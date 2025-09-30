import type { Direction, GraphData, GraphEdge, GraphNode } from '@/lib/utils/types';

// 轻量 Mermaid flowchart 子集解析器
// 支持示例：
// graph TD
// A[Root] --> B[Child]
// B -- depends_on --> C((Lib))
// 行首 // 或 # 作为注释
// 节点语法：id[Title] 或 id((Title))，未声明的节点从边引用中自动补全（title 同 id）
export function parseMermaidToGraph(src: string): GraphData {
  const lines = src
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('//') && !l.startsWith('#'));

  if (lines.length === 0) {
    return { direction: 'TD', nodes: [], edges: [] };
  }

  // 第一行方向：graph TD / graph LR
  const first = lines[0];
  const dir = parseDirection(first);
  const nodesMap = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  // 其余行：节点或边
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // 节点定义
    const node = parseNode(line);
    if (node) {
      nodesMap.set(node.id, node);
      continue;
    }
    // 边定义
    const edge = parseEdge(line);
    if (edge) {
      edges.push(edge);
      // 补全未定义节点
      if (!nodesMap.has(edge.source)) {
        nodesMap.set(edge.source, { id: edge.source, title: edge.source });
      }
      if (!nodesMap.has(edge.target)) {
        nodesMap.set(edge.target, { id: edge.target, title: edge.target });
      }
      continue;
    }
    // 其他行忽略（如 subgraph 先不支持）
  }

  return {
    direction: dir,
    nodes: Array.from(nodesMap.values()),
    edges,
    metadata: { updatedAt: new Date().toISOString() },
  };
}

function parseDirection(line: string): Direction {
  const m = /^graph\s+(TD|LR)\b/i.exec(line);
  if (m) {
    return (m[1].toUpperCase() as Direction) || 'TD';
  }
  return 'TD';
}

function parseNode(line: string): GraphNode | null {
  // id[Title]（矩形）
  let m = /^([A-Za-z0-9_\-]+)\s*\[\s*([^\]]+)\s*\]\s*$/.exec(line);
  if (m) {
    const id = m[1];
    const title = m[2];
    return { id, title, type: 'rect' };
  }
  // id((Title))（圆形）
  m = /^([A-Za-z0-9_\-]+)\s*\(\(\s*([^)]+)\s*\)\)\s*$/.exec(line);
  if (m) {
    const id = m[1];
    const title = m[2];
    return { id, title, type: 'circle' };
  }
  return null;
}

function parseEdge(line: string): GraphEdge | null {
  // A -- label --> B
  let m = /^([A-Za-z0-9_\-]+)\s*--\s*([^>-]+?)\s*-->\s*([A-Za-z0-9_\-]+)\s*$/.exec(escapeLtGt(line));
  if (m) {
    const source = m[1];
    const label = m[2].trim();
    const target = m[3];
    return { id: `${source}-${label}-${target}`, source, target, label };
  }
  // A --> B
  m = /^([A-Za-z0-9_\-]+)\s*-->\s*([A-Za-z0-9_\-]+)\s*$/.exec(escapeLtGt(line));
  if (m) {
    const source = m[1];
    const target = m[2];
    return { id: `${source}-${target}`, source, target };
  }
  return null;
}

// 将原始行中的 --> 替换为 --> 以便正则更稳定（兼容某些编辑器转义）
function escapeLtGt(s: string) {
  return s.replace(/-->/g, '-->').replace(/-->/g, '-->');
}