import ELK from 'elkjs/lib/elk.bundled.js';
import type { GraphData, GraphNode, GraphEdge, Direction } from '@/lib/utils/types';

const DEFAULT_RECT = { width: 220, height: 80 };
const DEFAULT_CIRCLE = { width: 96, height: 96 };

function elkDirection(dir: Direction) {
  // TD: top-down; LR: left-right
  return dir === 'LR' ? 'RIGHT' : 'DOWN';
}

const elk = new ELK();

/**
 * 使用 ELK 进行树形布局，避免连线与节点重叠
 */
export async function layoutWithElk(
  graph: GraphData,
  prevPositions?: Map<string, { x: number; y: number }>
) {
  // 构造 ELK 图
  const children = graph.nodes.map((n) => {
    const size = n.type === 'circle' ? DEFAULT_CIRCLE : DEFAULT_RECT;
    const prev = prevPositions?.get(n.id);
    const base = {
      id: n.id,
      width: n.width ?? size.width,
      height: n.height ?? size.height,
    } as any;

    // 如果有前一帧坐标，传入但不固定（允许优化）
    if (prev && prevPositions && prevPositions.size > 0) {
      base.x = prev.x;
      base.y = prev.y;
    }

    return base;
  });

  const edges = graph.edges.map((e) => ({
    id: e.id,
    sources: [e.source],
    targets: [e.target],
  }));

  const elkGraph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': elkDirection(graph.direction),
      // 增加节点间距以避免重叠
      'elk.spacing.nodeNode': '80',
      'elk.layered.spacing.nodeNodeBetweenLayers': '120',
      'elk.layered.spacing.edgeNodeBetweenLayers': '60',
      // 使用正交路由避免边与节点重叠
      'elk.edgeRouting': 'ORTHOGONAL',
      // 节点放置策略
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      // 交叉最小化
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      // 尊重输入顺序
      'elk.considerModelOrder': 'NODES_AND_EDGES',
      // 紧凑布局
      'elk.layered.compaction.postCompaction.strategy': 'EDGE_LENGTH',
      // 层分配策略
      'elk.layered.layering.strategy': 'NETWORK_SIMPLEX',
    },
    children,
    edges,
  };

  const res = await elk.layout(elkGraph as any);

  // 映射回坐标
  const nodePos = new Map<string, { x: number; y: number }>();
  for (const c of res.children ?? []) {
    nodePos.set(c.id, { x: c.x ?? 0, y: c.y ?? 0 });
  }

  const laidNodes: GraphNode[] = graph.nodes.map((n) => {
    const pos = nodePos.get(n.id) ?? { x: 0, y: 0 };
    return {
      ...n,
      x: pos.x,
      y: pos.y,
      width: n.width ?? (n.type === 'circle' ? DEFAULT_CIRCLE.width : DEFAULT_RECT.width),
      height: n.height ?? (n.type === 'circle' ? DEFAULT_CIRCLE.height : DEFAULT_RECT.height),
    };
  });

  const laidEdges: GraphEdge[] = graph.edges.map((e) => ({ ...e }));

  return { nodes: laidNodes, edges: laidEdges };
}