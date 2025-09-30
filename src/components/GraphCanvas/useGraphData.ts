import { useEffect, useMemo, useRef, useState } from 'react';
import type { Edge, Node } from '@xyflow/react';
import { parseMermaidToGraph } from '../../lib/adapters/mermaidAdapter';
import type { GraphData } from '../../lib/utils/types';

const POLL_MS = 1000;

// 稳定布局参数（可按需微调）
const RECT_W = 180;
const RECT_H = 60;
const CIRC_W = 96;
const CIRC_H = 96;
const V_GAP = 80;   // TD：父子纵向间距
const H_GAP = 140;  // LR：父子横向间距
const SIB_GAP = 18; // 兄弟轻微错位，减少遮挡

// 增量定位：首帧用 ELK，后续只给“新增节点”计算坐标，已有节点保持不动
function computeIncrementalPositions(
  graph: GraphData,
  prevPos: Map<string, { x: number; y: number }>
) {
  // 输出从上一帧坐标拷贝，确保旧节点完全不动
  const out = new Map<string, { x: number; y: number }>(prevPos);

  // 节点尺寸与间距（可按需要微调）
  const RECT_W = 180;
  const RECT_H = 60;
  const CIRC_W = 96;
  const CIRC_H = 96;
  const V_GAP = 80;   // TD 模式：子节点纵向间距
  const H_GAP = 140;  // LR 模式：子节点横向间距
  const OFFSET = 18;  // 轻微错位，避免完全重叠

  // 建立父->子 与 子->父 的索引，便于定位兄弟节点
  const childrenByParent = new Map<string, string[]>();
  const parentsByChild = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (!childrenByParent.has(e.source)) childrenByParent.set(e.source, []);
    childrenByParent.get(e.source)!.push(e.target);

    if (!parentsByChild.has(e.target)) parentsByChild.set(e.target, []);
    parentsByChild.get(e.target)!.push(e.source);
  }

  // 统计当前已知坐标的边界，以便没有父节点时把新增节点放到最外侧
  let maxX = 0;
  let maxY = 0;
  for (const { x, y } of prevPos.values()) {
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  // 工具：取节点的“已知父节点”（至少一个在 prevPos 中）
  const pickKnownParent = (id: string) => {
    const ps = parentsByChild.get(id) ?? [];
    return ps.find((p) => prevPos.has(p));
  };

  // 工具：获取父节点已存在子节点中的“末尾位置”（TD取最大y，LR取最大x）
  const getTailPosUnderParent = (parentId: string) => {
    const childIds = childrenByParent.get(parentId) ?? [];
    let tailX = prevPos.get(parentId)?.x ?? 0;
    let tailY = prevPos.get(parentId)?.y ?? 0;
    let found = false;

    for (const cid of childIds) {
      const p = out.get(cid) || prevPos.get(cid);
      if (!p) continue;
      found = true;
      if (graph.direction === 'TD') {
        if (p.y > tailY) tailY = p.y;
        tailX = p.x; // 与兄弟保持同列
      } else {
        if (p.x > tailX) tailX = p.x;
        tailY = p.y; // 与兄弟保持同行
      }
    }
    return { x: tailX, y: tailY, hasAny: found };
  };

  for (const n of graph.nodes) {
    if (out.has(n.id)) continue; // 已存在：保持不变

    const w = n.type === 'circle' ? CIRC_W : RECT_W;
    const h = n.type === 'circle' ? CIRC_H : RECT_H;

    const parent = pickKnownParent(n.id);
    if (parent) {
      const p = prevPos.get(parent)!;
      const tail = getTailPosUnderParent(parent);

      if (graph.direction === 'TD') {
        const baseY = tail.hasAny ? tail.y : p.y;
        const newY = baseY + h + V_GAP;
        const newX = p.x + (tail.hasAny ? 0 : 0) + (OFFSET * ((n.id.charCodeAt(0) + n.id.length) % 2 ? 1 : -1));
        out.set(n.id, { x: newX, y: newY });
      } else {
        const baseX = tail.hasAny ? tail.x : p.x;
        const newX = baseX + w + H_GAP;
        const newY = p.y + (OFFSET * ((n.id.charCodeAt(0) + n.id.length) % 2 ? 1 : -1));
        out.set(n.id, { x: newX, y: newY });
      }
    } else {
      // 没有已知父节点：附着到最外侧边界继续延展
      if (graph.direction === 'TD') {
        maxY += h + V_GAP;
        out.set(n.id, { x: 0, y: maxY });
      } else {
        maxX += w + H_GAP;
        out.set(n.id, { x: maxX, y: 0 });
      }
    }
  }

  return out;
}

export function useGraphData() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const lastRawRef = useRef<string>('');
  // 缓存上一帧坐标，增量固定已有节点以减少抖动
  const prevPosRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  // 辅助：稳定布局（仅用无 label 的主链路边），严格复用旧坐标
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

    // 首帧：为根给初始坐标（按方向并排）
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

    // 对所有节点进行稳定定位：旧节点不动，新节点只尾部延展
    for (const id of nodeIds) {
      if (pos.has(id)) continue; // 旧节点：严格不动

      // 选择一个已知父（如果有多个，优先第一个已有位置的）
      const parents = parentsByChild.get(id) ?? [];
      const parentKnown = parents.find((p) => pos.has(p));

      // 取父节点尾部位置（同一父的已存在子节点的末尾），保证新增只在尾部延展
      const tailUnderParent = (pid: string) => {
        const kids = childrenByParent.get(pid) ?? [];
        let tailX = pos.get(pid)?.x ?? 0;
        let tailY = pos.get(pid)?.y ?? 0;
        let found = false;
        for (const kid of kids) {
          const p = pos.get(kid);
          if (!p) continue;
          found = true;
          if (graph.direction === 'TD') {
            if (p.y > tailY) tailY = p.y;
            tailX = p.x;
          } else {
            if (p.x > tailX) tailX = p.x;
            tailY = p.y;
          }
        }
        return { tailX, tailY, hasAny: found };
      };

      const { w, h } = sizeOf(id);
      if (parentKnown) {
        const parentP = pos.get(parentKnown)!;
        const tail = tailUnderParent(parentKnown);

        if (graph.direction === 'TD') {
          const baseY = tail.hasAny ? tail.tailY : parentP.y;
          const newY = baseY + h + V_GAP;
          const newX = parentP.x + ((id.charCodeAt(0) + id.length) % 2 ? SIB_GAP : -SIB_GAP);
          pos.set(id, { x: newX, y: newY });
        } else {
          const baseX = tail.hasAny ? tail.tailX : parentP.x;
          const newX = baseX + w + H_GAP;
          const newY = parentP.y + ((id.charCodeAt(0) + id.length) % 2 ? SIB_GAP : -SIB_GAP);
          pos.set(id, { x: newX, y: newY });
        }
      } else {
        // 没有已知父：作为新根并排追加
        if (graph.direction === 'TD') {
          // 取当前最靠下的 y
          let maxY = 0;
          for (const p of pos.values()) if (p.y > maxY) maxY = p.y;
          pos.set(id, { x: 0, y: maxY + h + V_GAP });
        } else {
          let maxX = 0;
          for (const p of pos.values()) if (p.x > maxX) maxX = p.x;
          pos.set(id, { x: maxX + w + H_GAP, y: 0 });
        }
      }
    }

    return pos;
  }

  useEffect(() => {
    let alive = true;
    let timer: number | undefined;

    const tick = async () => {
      try {
        const res = await fetch('/data/graph.mmd', { cache: 'no-store' });
        if (!res.ok) throw new Error('fetch mmd failed');
        const text = await res.text();

        if (text && text !== lastRawRef.current) {
          lastRawRef.current = text;
          const graph: GraphData = parseMermaidToGraph(text);
          // 纯前端稳定布局（旧节点不动，新节点尾部延展）
          const posMap = stableLayout(graph, prevPosRef.current);
          const laidNodes = graph.nodes.map((n) => {
            const p = posMap.get(n.id)!;
            return { ...n, x: p.x, y: p.y };
          });
          const laidEdges = graph.edges;
          if (!alive) return;

          // 转为 React Flow 节点/边
          const rfNodes: Node[] = laidNodes.map((n) => ({
            id: n.id,
            type: 'card',
            position: { x: n.x ?? 0, y: n.y ?? 0 },
            width: n.type === 'circle' ? 96 : 180,
            height: n.type === 'circle' ? 96 : 60,
            data: { label: n.title, type: n.type, raw: n },
          }));
          const rfEdges: Edge[] = laidEdges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            label: e.label,
            animated: false,
            className: e.label === 'depends_on' ? 'edge--depends' : 'edge--default',
          }));

          setNodes(rfNodes);
          setEdges(rfEdges);

          // 更新上一帧坐标缓存（用于下一次增量布局）
          const next = new Map<string, { x: number; y: number }>();
          for (const n of laidNodes) {
            next.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });
          }
          prevPosRef.current = next;
        }
      } catch (e) {
        // 忽略单次失败，继续轮询
        // console.error(e);
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