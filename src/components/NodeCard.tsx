import React from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps, HandleType } from '@xyflow/react';

const HandleDot = ({ type, position }: { type: HandleType; position: Position }) => (
  <Handle
    type={type}
    position={position}
    style={{
      width: 8,
      height: 8,
      background: 'var(--brand)',
      border: '2px solid var(--panel)',
    }}
  />
);

export default function NodeCard({ data, selected }: NodeProps) {
  const { label, raw } = data as any;
  const badge =
    raw?.type === 'circle' ? 'Milestone' : 'Task';

  return (
    <div className="node-card" style={{ outline: selected ? '2px solid var(--brand)' : 'none' }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <div className="bar" />
        <div style={{ flex: 1 }}>
          <div className="title">{label}</div>
          <div className="meta">
            <span className="pill">{badge}</span>
            {raw?.id && <span style={{ opacity: 0.8 }}>#{raw.id}</span>}
          </div>
        </div>
      </div>
      <HandleDot type="target" position={Position.Top} />
      <HandleDot type="source" position={Position.Bottom} />
    </div>
  );
}