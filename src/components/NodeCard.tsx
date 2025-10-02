import React from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps, HandleType } from '@xyflow/react';

const HandleDot = ({
  type,
  position,
  id,
  offset
}: {
  type: HandleType;
  position: Position;
  id?: string;
  offset?: number;
}) => {
  // 计算偏移样式（用于多个handle时的垂直分布）
  const style: React.CSSProperties = {
    width: 10,
    height: 10,
    background: 'var(--brand)',
    border: '2px solid var(--panel)',
    boxShadow: 'var(--shadow-sm)',
    transition: 'all 0.2s ease',
  };

  // 如果有偏移，根据位置添加偏移样式
  if (offset !== undefined) {
    if (position === Position.Left || position === Position.Right) {
      // 左右方向的handle使用垂直偏移
      style.top = `${offset}%`;
    } else {
      // 上下方向的handle使用水平偏移
      style.left = `${offset}%`;
    }
  }

  return (
    <Handle
      type={type}
      position={position}
      id={id}
      style={style}
    />
  );
};

export default function NodeCard({ data, selected }: NodeProps) {
  const { label, raw } = data as any;
  const isMilestone = raw?.type === 'circle';
  const badgeType = isMilestone ? 'milestone' : 'task';
  const badgeText = isMilestone ? '🎯 Milestone' : '📋 Task';

  // 固定为左进右出
  const sourcePos = Position.Right;
  const targetPos = Position.Left;

  // 获取入边和出边的数量
  const incomingCount = raw?.incomingEdges?.length || 1;
  const outgoingCount = raw?.outgoingEdges?.length || 1;

  // 生成多个target handles（入口点）
  const targetHandles = [];
  if (incomingCount > 1) {
    // 如果有多条入边，为每条边创建一个handle
    for (let i = 0; i < incomingCount; i++) {
      const offset = ((i + 1) * 100) / (incomingCount + 1); // 均匀分布
      targetHandles.push(
        <HandleDot
          key={`target-${i}`}
          type="target"
          position={targetPos}
          id={`target-${i}`}
          offset={offset}
        />
      );
    }
  } else {
    targetHandles.push(
      <HandleDot key="target-0" type="target" position={targetPos} id="target-0" />
    );
  }

  // 生成多个source handles（出口点）
  const sourceHandles = [];
  if (outgoingCount > 1) {
    for (let i = 0; i < outgoingCount; i++) {
      const offset = ((i + 1) * 100) / (outgoingCount + 1);
      sourceHandles.push(
        <HandleDot
          key={`source-${i}`}
          type="source"
          position={sourcePos}
          id={`source-${i}`}
          offset={offset}
        />
      );
    }
  } else {
    sourceHandles.push(
      <HandleDot key="source-0" type="source" position={sourcePos} id="source-0" />
    );
  }

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
      {targetHandles}
      {sourceHandles}
    </div>
  );
}
