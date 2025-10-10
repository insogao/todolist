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
  const agentType: string | undefined = raw?.agentType;
  const isMilestone = raw?.type === 'circle';
  // Optional short content (from planning JSON summary). Strip tags and collapse spaces.
  const summaryText: string | undefined = typeof raw?.summary === 'string'
    ? raw.summary.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    : undefined;
  const [expanded, setExpanded] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  // Flags
  // Final badge：以 batch === -1 判断最终节点
  const isFinal = typeof raw?.batch === 'number' && raw.batch === -1;
  // Search badge：仅当 info 中存在 <info type="search">（即真实有搜索结果）才显示
  const hasSearchInfo = typeof raw?.info === 'string' && /<info\b[^>]*type\s*=\s*["']search["']/i.test(raw.info);

  // 当展开时，把最近的 React Flow 节点容器置于最顶层，避免被其他节点遮挡
  React.useEffect(() => {
    const host = rootRef.current?.closest('.react-flow__node') as HTMLElement | null;
    if (!host) return;
    const prevZ = host.style.zIndex;
    if (expanded) host.style.zIndex = '10000';
    else host.style.zIndex = prevZ || '';
    return () => {
      // 清理：恢复原有 z-index
      host.style.zIndex = prevZ || '';
    };
  }, [expanded]);

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
    <div
      ref={rootRef}
      className={`node-card${agentType ? ` node-card--${agentType}` : ''}${raw?.status === 'running' ? ' node-card--running' : ''}`}
      style={{ outline: selected ? '2px solid var(--brand)' : 'none', position: 'relative', overflow: 'visible', cursor: 'pointer', zIndex: expanded ? 2000 : undefined, boxShadow: expanded ? 'var(--shadow-lg)' : undefined }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <div className="content-wrapper">
        <div className="status-indicator" />
        <div className="content">
          {/* Top inline red badges */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
            {isFinal && (
              <span style={{ color: 'var(--danger)', fontSize: 11, fontWeight: 700 }}>最终总结-查看报告</span>
            )}
            {hasSearchInfo && (
              <span style={{ color: 'var(--danger)', fontSize: 11, fontWeight: 700 }}>搜索信息</span>
            )}
          </div>
          <div className="title">{label}</div>
          {summaryText && (
            <div
              className="desc"
              style={expanded ? {
                color: 'var(--muted-foreground)',
                fontSize: 12,
                marginTop: 6,
                lineHeight: 1.35,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              } : {
                color: 'var(--muted-foreground)',
                fontSize: 12,
                marginTop: 6,
                lineHeight: 1.35,
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden'
              }}
            >
              {summaryText}
            </div>
          )}
          {!summaryText && raw?.status === 'running' && (
            <div style={{ color: 'var(--muted-foreground)', fontSize: 12, marginTop: 6 }}>
              分析中<span className="loading-dots">...</span>
            </div>
          )}
        </div>
      </div>
      {/* Click to toggle expansion; no hover preview */}
      {targetHandles}
      {sourceHandles}
    </div>
  );
}
