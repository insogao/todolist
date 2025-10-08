import { useEffect, useMemo, useRef, useState } from 'react';
import type { Edge, Node } from '@xyflow/react';
import { parseMermaidToGraph } from '../../lib/adapters/mermaidAdapter';
import { parsePlanJsonToGraph } from '../../lib/adapters/planJsonAdapter';
import { layoutWithElk } from '../../lib/layout/elk';
import type { GraphData } from '../../lib/utils/types';

const POLL_MS = 1000;
const USE_ELK_LAYOUT = false; // 关闭 ELK，使用稳定增量布局避免节点跳动

// 稳定布局参数（增大间距避免重叠）
const RECT_W = 220;
const RECT_H = 80;
const CIRC_W = 96;
const CIRC_H = 96;
const V_GAP = 180;   // TD：父子纵向间距（增大）
const H_GAP = 280;   // LR：父子横向间距（增大）
const SIB_GAP = 150; // 兄弟节点间距（增大到150）

// 完全稳定的增量布局：已有节点绝对不动，新节点智能追加
function stableLayout(graph: GraphData, prevPos: Map<string, { x: number; y: number }>) {
  const pos = new Map(prevPos);

  // 边分类：仅把无 label 的边视为主链路（A --> B）
  const mainEdges = graph.edges.filter((e) => !e.label);
  const childrenByParent = new Map<string, string[]>();
  const parentsByChild = new Map<string, string[]>();

  for (const e of mainEdges) {
    if (!childrenByParent.has(e.source)) childrenByParent.set(e.source, []);
    childrenByParent.get(e.source)!.push(e.target);
    if (!parentsByChild.has(e.target)) parentsByChild.set(e.target, []);
    parentsByChild.get(e.target)!.push(e.source);
  }

  // 计算节点尺寸
  const sizeOf = (id: string) => {
    const n = graph.nodes.find((x) => x.id === id);
    if (!n) return { w: RECT_W, h: RECT_H };
    const w = n.type === 'circle' ? CIRC_W : RECT_W;
    const h = n.type === 'circle' ? CIRC_H : RECT_H;
    return { w, h };
  };

  // 根节点（无父）集合
  const nodeIds = graph.nodes.map((n) => n.id);
  const isRoot = (id: string) => !(parentsByChild.get(id)?.length);
  const roots = nodeIds.filter(isRoot);

  // 首帧：为根节点设置初始坐标
  if (prevPos.size === 0) {
    if (graph.direction === 'TD') {
      let accY = 0;
      for (const rid of roots) {
        const { h } = sizeOf(rid);
        pos.set(rid, { x: 0, y: accY });
        accY += h + V_GAP;
      }
    } else {
      let accX = 0;
      for (const rid of roots) {
        const { w } = sizeOf(rid);
        pos.set(rid, { x: accX, y: 0 });
        accX += w + H_GAP;
      }
    }
  }

  // 跟踪全局占用的Y坐标范围（用于避免不同分支重叠）
  const globalYRanges: Array<{ minY: number; maxY: number; minX: number; maxX: number }> = [];

  // 按层级顺序处理节点（BFS），确保父节点先于子节点
  const processOrder: string[] = [];
  const visited = new Set<string>();
  const queue = [...roots];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    processOrder.push(current);

    const children = childrenByParent.get(current) ?? [];
    queue.push(...children);
  }

  // 确保所有节点都被处理，包括孤立节点
  for (const id of nodeIds) {
    if (!visited.has(id)) {
      processOrder.push(id);
      visited.add(id);
    }
  }

  // 处理每个节点
  for (const id of processOrder) {
    if (pos.has(id)) {
      // 已有节点：记录其占用空间
      const p = pos.get(id)!;
      const { w, h } = sizeOf(id);
      globalYRanges.push({ minY: p.y, maxY: p.y + h, minX: p.x, maxX: p.x + w });
      continue;
    }

    const parents = parentsByChild.get(id) ?? [];
    const parentKnown = parents.find((p) => pos.has(p));

    if (!parentKnown) {
      // 没有已知父节点：作为新根节点
      if (graph.direction === 'TD') {
        let maxY = 0;
        for (const p of pos.values()) if (p.y > maxY) maxY = p.y;
        const { h } = sizeOf(id);
        pos.set(id, { x: 0, y: maxY + h + V_GAP });
      } else {
        let maxX = 0;
        for (const p of pos.values()) if (p.x > maxX) maxX = p.x;
        const { w } = sizeOf(id);
        pos.set(id, { x: maxX + w + H_GAP, y: 0 });
      }
      continue;
    }

    // 有父节点：计算子节点位置
    const parentPos = pos.get(parentKnown)!;
    const siblings = (childrenByParent.get(parentKnown) ?? [])
      .filter(child => pos.has(child) && child !== id);

    const { w, h } = sizeOf(id);

    // 碰撞检测函数（包含间距，避免节点贴边）
    const MARGIN = 1; // 1px margin 确保边缘不重叠
    const checkCollision = (testX: number, testY: number) => {
      for (const range of globalYRanges) {
        const xOverlap = testX - MARGIN < range.maxX && testX + w + MARGIN > range.minX;
        const yOverlap = testY - MARGIN < range.maxY && testY + h + MARGIN > range.minY;
        if (xOverlap && yOverlap) {
          return true; // 有碰撞
        }
      }
      return false; // 无碰撞
    };

    if (graph.direction === 'TD') {
      // 垂直布局
      if (siblings.length === 0) {
        // 第一个子节点
        let baseX = parentPos.x;
        let baseY = parentPos.y + sizeOf(parentKnown).h + V_GAP;

        // 避免碰撞
        while (checkCollision(baseX, baseY)) {
          baseX += SIB_GAP;
        }

        pos.set(id, { x: baseX, y: baseY });
        globalYRanges.push({ minY: baseY, maxY: baseY + h, minX: baseX, maxX: baseX + w });
      } else {
        // 后续兄弟节点：在右侧排列
        const siblingPositions = siblings.map(s => pos.get(s)!);
        const siblingWidths = siblings.map(s => sizeOf(s).w);
        const maxSiblingX = Math.max(...siblingPositions.map((p, i) => p.x + siblingWidths[i]));
        const referenceY = siblingPositions[0].y;
        let baseX = maxSiblingX + SIB_GAP;
        let baseY = referenceY;

        // 避免碰撞
        while (checkCollision(baseX, baseY)) {
          baseY += SIB_GAP;
        }

        pos.set(id, { x: baseX, y: baseY });
        globalYRanges.push({ minY: baseY, maxY: baseY + h, minX: baseX, maxX: baseX + w });
      }
    } else {
      // 水平布局
      if (siblings.length === 0) {
        // 第一个子节点
        let baseX = parentPos.x + sizeOf(parentKnown).w + H_GAP;
        let baseY = parentPos.y;

        // 避免碰撞
        while (checkCollision(baseX, baseY)) {
          baseY += SIB_GAP;
        }

        pos.set(id, { x: baseX, y: baseY });
        globalYRanges.push({ minY: baseY, maxY: baseY + h, minX: baseX, maxX: baseX + w });
      } else {
        // 后续兄弟节点：在下方排列
        const siblingPositions = siblings.map(s => pos.get(s)!);
        const siblingHeights = siblings.map(s => sizeOf(s).h);
        const maxSiblingY = Math.max(...siblingPositions.map((p, i) => p.y + siblingHeights[i]));
        const referenceX = siblingPositions[0].x;
        let baseX = referenceX;
        let baseY = maxSiblingY + SIB_GAP;

        // 避免碰撞
        while (checkCollision(baseX, baseY)) {
          baseY += SIB_GAP;
        }

        pos.set(id, { x: baseX, y: baseY });
        globalYRanges.push({ minY: baseY, maxY: baseY + h, minX: baseX, maxX: baseX + w });
      }
    }
  }

  return pos;
}

export function useGraphData() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const lastRawRef = useRef<string>('');
  const prevPosRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const isInitialLoad = useRef(true); // 标记首次加载

  useEffect(() => {
    let alive = true;
    let timer: number | undefined;

    const tick = async () => {
      try {
        // Prefer JSON-based plan; fall back to Mermaid if not present.
        let text = '';
        let mode: 'json' | 'mmd' = 'json';
        let res = await fetch('/data/plan.json', { cache: 'no-store' });
        if (!res.ok) {
          mode = 'mmd';
          res = await fetch('/data/graph.mmd', { cache: 'no-store' });
          if (!res.ok) throw new Error('fetch data failed');
        }
        text = await res.text();

        console.log('🔍 Fetched data:', {
          length: text.length,
          isEmpty: !text,
          hasChanged: text !== lastRawRef.current,
          isInitialLoad: isInitialLoad.current,
          nodeCount: text.split('\n').length
        });

        // 首次加载或内容变化时处理
        if (text && (isInitialLoad.current || text !== lastRawRef.current)) {
          isInitialLoad.current = false;
          lastRawRef.current = text;
          const graph: GraphData = mode === 'json' ? parsePlanJsonToGraph(text) : parseMermaidToGraph(text);

          console.log('📊 Parsed graph:', {
            nodeCount: graph.nodes.length,
            edgeCount: graph.edges.length,
            direction: graph.direction,
            nodes: graph.nodes.map(n => n.id)
          });

          let laidNodes = graph.nodes;
          let laidEdges = graph.edges;

          if (USE_ELK_LAYOUT) {
            // 使用 ELK.js 自动布局，传入上一帧坐标以减少抖动
            const result = await layoutWithElk(graph, prevPosRef.current);
            laidNodes = result.nodes;
            laidEdges = result.edges;
          } else {
            // 使用自定义稳定布局
            const posMap = stableLayout(graph, prevPosRef.current);
            laidNodes = graph.nodes.map((n) => {
              const p = posMap.get(n.id);
              if (!p) {
                console.error('❌ Missing position for node:', n.id);
                return { ...n, x: 0, y: 0 };
              }
              return { ...n, x: p.x, y: p.y };
            });
            laidEdges = graph.edges;
          }

          if (!alive) return;

          // 计算每个节点的入边和出边数量，并为每条边分配handle索引
          const incomingEdgeCount = new Map<string, number>();
          const outgoingEdgeCount = new Map<string, number>();
          const incomingEdgesList = new Map<string, string[]>();
          const outgoingEdgesList = new Map<string, string[]>();
          const targetHandleMap = new Map<string, number>(); // edgeId -> handleIndex
          const sourceHandleMap = new Map<string, number>(); // edgeId -> handleIndex

          // 第一遍：收集所有边信息
          laidEdges.forEach((e) => {
            // 统计入边
            if (!incomingEdgesList.has(e.target)) incomingEdgesList.set(e.target, []);
            incomingEdgesList.get(e.target)!.push(e.id);

            // 统计出边
            if (!outgoingEdgesList.has(e.source)) outgoingEdgesList.set(e.source, []);
            outgoingEdgesList.get(e.source)!.push(e.id);
          });

          // 第二遍：为每条边分配handle索引
          laidEdges.forEach((e) => {
            const targetEdges = incomingEdgesList.get(e.target) || [];
            const sourceEdges = outgoingEdgesList.get(e.source) || [];

            targetHandleMap.set(e.id, targetEdges.indexOf(e.id));
            sourceHandleMap.set(e.id, sourceEdges.indexOf(e.id));

            incomingEdgeCount.set(e.target, targetEdges.length);
            outgoingEdgeCount.set(e.source, sourceEdges.length);
          });

          // 转为 React Flow 节点/边
          const rfNodes: Node[] = laidNodes.map((n) => ({
            id: n.id,
            type: 'card',
            position: { x: n.x ?? 0, y: n.y ?? 0 },
            width: n.width ?? (n.type === 'circle' ? 96 : 220),
            height: n.height ?? (n.type === 'circle' ? 96 : 80),
            data: {
              label: n.title,
              type: n.type,
              raw: {
                ...n,
                incomingEdges: incomingEdgesList.get(n.id) || [],
                outgoingEdges: outgoingEdgesList.get(n.id) || [],
              },
              direction: graph.direction
            },
          }));

          const rfEdges: Edge[] = laidEdges.map((e) => {
            const sourceHandleId = `source-${sourceHandleMap.get(e.id) || 0}`;
            const targetHandleId = `target-${targetHandleMap.get(e.id) || 0}`;

            return {
              id: e.id,
              source: e.source,
              target: e.target,
              sourceHandle: sourceHandleId,
              targetHandle: targetHandleId,
              label: e.label,
              type: 'default',
              animated: false,
              style: { stroke: 'var(--brand)', strokeWidth: 2 },
              className: e.label === 'depends_on' ? 'edge--depends' : 'edge--default',
            };
          });

          setNodes(rfNodes);
          setEdges(rfEdges);

          // 更新坐标缓存
          const next = new Map<string, { x: number; y: number }>();
          for (const n of laidNodes) {
            next.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });
          }
          prevPosRef.current = next;
        }
      } catch (e) {
        console.error('❌ Error in tick:', e);
      } finally {
        if (alive) {
          timer = window.setTimeout(tick, POLL_MS);
        }
      }
    };

    tick();
    return () => {
      alive = false;
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  return useMemo(() => ({ nodes, edges }), [nodes, edges]);
}
