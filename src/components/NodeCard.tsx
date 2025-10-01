import React from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps, HandleType } from '@xyflow/react';

const HandleDot = ({ type, position }: { type: HandleType; position: Position }) => (
  <Handle
    type={type}
    position={position}
    style={{
      width: 10,
      height: 10,
      background: 'var(--brand)',
      border: '2px solid var(--panel)',
      boxShadow: 'var(--shadow-sm)',
      transition: 'all 0.2s ease',
    }}
  />
);

export default function NodeCard({ data, selected }: NodeProps) {
  const { label, raw, direction } = data as any;
  const isMilestone = raw?.type === 'circle';
  const badgeType = isMilestone ? 'milestone' : 'task';
  const badgeText = isMilestone ? '🎯 Milestone' : '📋 Task';

  // 根据图的方向决定 handle 位置
  const isHorizontal = direction === 'LR';
  const sourcePos = isHorizontal ? Position.Right : Position.Bottom;
  const targetPos = isHorizontal ? Position.Left : Position.Top;

  return (
    <div className="node-card" style={{ outline: selected ? '2px solid var(--brand)' : 'none' }}>
      <div className="content-wrapper">
        <div className="status-indicator" />
        <div className="content">
          <div className="title">{label}</div>
          <div className="meta">
            <span className={`badge ${badgeType}`}>{badgeText}</span>
            {raw?.id && <span className="node-id">#{raw.id}</span>}
          </div>
        </div>
      </div>
      <HandleDot type="target" position={targetPos} />
      <HandleDot type="source" position={sourcePos} />
    </div>
  );
}