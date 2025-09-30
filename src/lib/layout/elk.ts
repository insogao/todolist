import ELK from 'elkjs/lib/elk.bundled.js';
import type { GraphData, GraphNode, GraphEdge, Direction } from '@/lib/utils/types';

const DEFAULT_RECT = { width: 180, height: 60 };
const DEFAULT_CIRCLE = { width: 96, height: 96 };

function elkDirection(dir: Direction) {
  // TD: top-down; LR: left-right
  return dir === 'LR' ? 'RIGHT' : 'DOWN';
}

const elk = new ELK();

/**
 * 增量布局：对已有节点传入 x/y 并固定，避免整体大幅移动
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

    if (prev) {
      // 传入旧坐标并固定
      base.x = prev.x;
      base.y = prev.y;
      base.layoutOptions = {
        'org.eclipse.elk.fixed': 'true',
      };
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
      'elk.layered.spacing.nodeNodeBetweenLayers': '48',
      'elk.spacing.nodeNode': '32',
      'elk.edgeRouting': 'POLYLINE',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      // 尽量尊重输入顺序，辅助减小扰动
      'elk.considerModelOrder': 'true',
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