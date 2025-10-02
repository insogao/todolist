import React, { useMemo, useState, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type EdgeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useGraphData } from './useGraphData';
import NodeCard from '../NodeCard';
import { ProgressIndicator } from '../ProgressIndicator';

export function GraphCanvas() {
  const { nodes, edges } = useGraphData();
  const didFitRef = React.useRef(false);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const nodeTypes = useMemo(() => ({ card: NodeCard }), []);

  // 高亮相关边
  const highlightedEdges = useMemo(() => {
    if (!hoveredNode) return new Set<string>();
    const connected = new Set<string>();
    edges.forEach(edge => {
      if (edge.source === hoveredNode || edge.target === hoveredNode) {
        connected.add(edge.id);
      }
    });
    return connected;
  }, [hoveredNode, edges]);

  // 更新边的样式和 z-index
  const styledEdges = useMemo(() => {
    return edges.map(edge => ({
      ...edge,
      style: {
        ...edge.style,
        strokeWidth: highlightedEdges.has(edge.id) ? 4 : 2,
        stroke: highlightedEdges.has(edge.id) ? 'var(--brand-light)' : 'var(--brand)',
        zIndex: highlightedEdges.has(edge.id) ? 1000 : 1,
      },
      animated: highlightedEdges.has(edge.id),
    }));
  }, [edges, highlightedEdges]);

  // 调试：导出节点布局信息到文件
  useEffect(() => {
    if (nodes.length > 0) {
      const layout = nodes.map(n => ({
        id: n.id,
        x: n.position.x,
        y: n.position.y,
        width: n.width,
        height: n.height,
        label: (n.data as any)?.label
      }));

      // 检测重叠
      const overlaps: string[] = [];
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const n1 = nodes[i];
          const n2 = nodes[j];
          const x1 = n1.position.x;
          const y1 = n1.position.y;
          const w1 = n1.width || 220;
          const h1 = n1.height || 80;
          const x2 = n2.position.x;
          const y2 = n2.position.y;
          const w2 = n2.width || 220;
          const h2 = n2.height || 80;

          if (!(x1 + w1 < x2 || x2 + w2 < x1 || y1 + h1 < y2 || y2 + h2 < y1)) {
            overlaps.push(`${n1.id} <-> ${n2.id}`);
          }
        }
      }

      // 调试：输出到控制台
      if (overlaps.length > 0) {
        console.warn('⚠️ Node overlaps detected:', overlaps);
      }
    }
  }, [nodes]);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      {/* 调试按钮 */}
      {nodes.length > 0 && (
        <button
          onClick={() => {
            const layout = nodes.map(n => ({
              id: n.id,
              x: n.position.x,
              y: n.position.y,
              width: n.width,
              height: n.height,
              label: (n.data as any)?.label
            }));

            const text = JSON.stringify({ nodeCount: nodes.length, layout }, null, 2);
            navigator.clipboard.writeText(text);
            alert('布局数据已复制到剪贴板！');
          }}
          style={{
            position: 'fixed',
            top: 100,
            right: 20,
            zIndex: 1000,
            padding: '10px 20px',
            background: 'var(--brand)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 600,
            boxShadow: 'var(--shadow-lg)'
          }}
        >
          📋 复制布局数据
        </button>
      )}

      <ReactFlow
        nodes={nodes as Node[]}
        edges={styledEdges as Edge[]}
        nodeTypes={nodeTypes}
        proOptions={{ hideAttribution: true }}
        onNodeMouseEnter={(_, node) => setHoveredNode(node.id)}
        onNodeMouseLeave={() => setHoveredNode(null)}
        onInit={(instance) => {
          if (!didFitRef.current && nodes.length > 0) {
            try {
              instance.fitView({ padding: 0.2, duration: 300 });
            } catch {}
            didFitRef.current = true;
          }
        }}
        fitView
        minZoom={0.1}
        maxZoom={2}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        defaultEdgeOptions={{
          animated: false,
          style: { strokeWidth: 2 }
        }}
      >
        <Background variant="dots" gap={16} size={1} color="var(--card-border)" />
        <MiniMap
          pannable
          zoomable
          style={{ width: 220, height: 150 }}
          nodeColor={(node) => {
            const data = node.data as any;
            return data?.raw?.type === 'circle' ? '#175CD3' : '#3b82f6';
          }}
          nodeStrokeColor={() => 'var(--panel)'}
          nodeStrokeWidth={2}
          maskColor="rgba(0,0,0,0.1)"
        />
        <Controls />
      </ReactFlow>
    </div>
  );
}

export default GraphCanvas;