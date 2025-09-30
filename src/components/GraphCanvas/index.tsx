import React, { useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useGraphData } from './useGraphData';
import NodeCard from '../NodeCard';

export function GraphCanvas() {
  const { nodes, edges } = useGraphData();
  const didFitRef = React.useRef(false);

  const nodeTypes = useMemo(() => ({ card: NodeCard }), []);
  const edgeTypes = useMemo(() => ({}), []);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes as Node[]}
        edges={edges as Edge[]}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        proOptions={{ hideAttribution: true }}
        onInit={(instance) => {
          if (!didFitRef.current && nodes.length > 0) {
            try {
              instance.fitView({ padding: 0.2, duration: 300 });
            } catch {}
            didFitRef.current = true;
          }
        }}
      >
        <Background variant="dots" gap={16} size={1} color="#2a3653" />
        <MiniMap
          pannable
          zoomable
          style={{ width: 220, height: 150 }}
          nodeColor={() => '#9ab6ff'}
          nodeStrokeColor={() => '#ffffff'}
          nodeStrokeWidth={2}
          maskColor="rgba(10,14,28,0.35)"
        />
        <Controls />
      </ReactFlow>
    </div>
  );
}

export default GraphCanvas;