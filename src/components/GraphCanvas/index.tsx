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
import type { Direction } from '../../lib/utils/types';
import NodeCard from '../NodeCard';
import { ProgressIndicator } from '../ProgressIndicator';

export function GraphCanvas() {
  const [direction, setDirection] = useState<Direction>('LR');
  const { nodes, edges } = useGraphData(direction);
  const didFitRef = React.useRef(false);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [roundsPreset, setRoundsPreset] = useState<'low' | 'mid' | 'high'>('mid');
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState('');
  const [selected, setSelected] = useState<Node | null>(null);
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  // Scroll container for search results list (top box)
  const resultsScrollRef = React.useRef<HTMLDivElement | null>(null);
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

  // 侧边栏渲染辅助：去标签、提取 info 块、解析搜索结果、把 [ref:n] 渲染为可点击
  const stripTags = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  const extractInfoBlocks = (xml?: string) => {
    if (!xml) return { llm: '', search: '' } as const;
    const pick = (type: 'llm' | 'search') => {
      const re = new RegExp(`<info\\b[^>]*type\\s*=\\s*["']${type}["'][^>]*>([\\s\\S]*?)<\\/info>`, 'i');
      const m = xml.match(re);
      return m ? m[1] : '';
    };
    return { llm: pick('llm'), search: pick('search') } as const;
  };

  type SearchResult = { ref: string; title?: string; url?: string; siteName?: string; date?: string; summary?: string };
  const parseSearchResults = (xml?: string): SearchResult[] => {
    if (!xml) return [];
    const results: SearchResult[] = [];
    const re = /<result\b([^>]*)>([\s\S]*?)<\/result>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml))) {
      const attrs = m[1] || '';
      const body = m[2] || '';
      const getAttr = (name: string) => {
        const am = new RegExp(`${name}\\s*=\\s*\"([^\"]+)\"|${name}\\s*=\\s*'([^']+)'`, 'i').exec(attrs);
        return am ? (am[1] || am[2] || '') : '';
      };
      const ref = getAttr('ref') || '';
      const title = getAttr('title');
      const url = getAttr('url');
      const siteName = getAttr('siteName');
      const date = getAttr('date');
      const sm = /<summary[^>]*>([\s\S]*?)<\/summary>/i.exec(body);
      let summary = sm ? sm[1] : '';
      summary = summary.replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '');
      summary = stripTags(summary);
      results.push({ ref, title, url, siteName, date, summary });
    }
    return results;
  };

  const renderRefLinkedText = (text: string) => {
    const parts = text.split(/(\[ref:\s*(\d+)\])/gi);
    const nodes: React.ReactNode[] = [];
    for (let i = 0; i < parts.length; i++) {
      const chunk = parts[i];
      const mm = /^\[ref:\s*(\d+)\]$/i.exec(chunk);
      if (mm) {
        const refId = mm[1];
        nodes.push(
          <button
            key={`ref-${i}`}
            onClick={() => setSelectedRef(refId)}
            style={{ color: 'var(--brand)', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
            title={`跳转到搜索结果 ${refId}`}
          >
            [{`ref:${refId}`}] 
          </button>
        );
      } else {
        nodes.push(<span key={`t-${i}`}>{chunk}</span>);
      }
    }
    return nodes;
  };

  // 当选择了某个 ref，滚动到对应的搜索结果块（在“搜索结果”小方块内，滚到条目顶部）
  useEffect(() => {
    if (!selectedRef) return;
    const el = document.getElementById(`search-ref-${selectedRef}`);
    const container = resultsScrollRef.current;
    if (el && container) {
      try {
        // 将目标条目滚动到容器的可视区顶部（考虑容器 padding 与相对位置）
        const top = el.offsetTop - container.offsetTop; // 相对容器的顶部位置
        container.scrollTo({ top, behavior: 'smooth' });
      } catch {
        // 回退：使用 start 对齐
        try { (el as any).scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch {}
      }
    }
  }, [selectedRef]);

  

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
      {/* 控制面板：输入 query 并触发工作流 */}
      <div style={{
        position: 'fixed', top: 16, left: 16, zIndex: 1200,
        background: 'var(--panel)', color: 'var(--foreground)',
        border: '1px solid var(--card-border)', borderRadius: 8, padding: 12,
        boxShadow: 'var(--shadow-lg)', width: 680, display: 'flex', gap: 8, alignItems: 'center'
      }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="输入你的问题，然后启动工作流"
          style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--card-border)' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>布局</span>
          <select
            value={direction}
            onChange={(e) => setDirection((e.target.value as Direction) || 'LR')}
            style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--card-border)', background: 'var(--panel)', color: 'var(--foreground)' }}
          >
            <option value="LR">从左到右</option>
            <option value="TD">从上到下</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>迭代</span>
          <select
            value={roundsPreset}
            onChange={(e) => setRoundsPreset((e.target.value as any) || 'mid')}
            style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--card-border)', background: 'var(--panel)', color: 'var(--foreground)' }}
            title="运行轮数：low=3, mid=5, high=8"
          >
            <option value="low">low（3轮）</option>
            <option value="mid">mid（5轮）</option>
            <option value="high">high（8轮）</option>
          </select>
        </div>
        <button
          onClick={async () => {
            if (!query.trim()) { setMsg('请输入问题'); return; }
            setRunning(true); setMsg('正在启动工作流...');
            try {
              const res = await fetch('/api/workflow/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, roundsPreset }) });
              const data = await res.json();
              if (!res.ok || !data?.ok) throw new Error(data?.message || '启动失败');
              setMsg('已启动：生成过程会逐步更新流程图');
            } catch (e: any) {
              setMsg(e?.message || String(e));
            } finally { setRunning(false); }
          }}
          disabled={running}
          style={{ padding: '8px 12px', background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
        >
          {running ? '运行中…' : '启动工作流'}
        </button>
      </div>

      {/* 轻量状态提示 */}
      {msg && (
        <div style={{ position: 'fixed', top: 70, left: 16, zIndex: 1200, color: 'var(--muted-foreground)', fontSize: 12 }}>
          {msg}
        </div>
      )}
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
        onNodeClick={(_, node) => { setSelected(node as Node); setSelectedRef(null); }}
        onPaneClick={() => { setSelected(null); setSelectedRef(null); }}
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

      {/* 右侧侧边栏：节点详情 */}
      <aside
        style={{
          position: 'fixed', top: 0, right: 0, height: '100%', width: selected ? 420 : 0,
          transition: 'width 0.2s ease', overflow: 'hidden',
          background: 'var(--panel)', color: 'var(--foreground)', borderLeft: '1px solid var(--card-border)',
          zIndex: 1300, boxShadow: 'var(--shadow-lg)'
        }}
      >
        {selected && (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid var(--card-border)' }}>
              <div style={{ fontWeight: 700 }}>节点详情</div>
              <button onClick={() => setSelected(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18 }}>×</button>
            </div>
            <div style={{ padding: 16, overflow: 'auto' }}>
              {(() => {
                const data = (selected.data as any) || {};
                const raw = data.raw || {};
                const title = String(data.label || raw.title || selected.id || '');
                const { llm: llmRaw, search: searchRaw } = extractInfoBlocks(raw.info);
                const llm = stripTags(llmRaw);
                const summary = typeof raw.summary === 'string' ? stripTags(raw.summary) : '';
                const searchResults = parseSearchResults(searchRaw);
                const status = String(raw?.status || '').toLowerCase();
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* 上方小方块：其余内容（ID/标题/状态/summary/LLM） */}
                    <div
                      style={{
                        border: '1px solid var(--card-border)',
                        borderRadius: 8,
                        background: 'var(--panel)',
                        boxShadow: 'var(--shadow-sm)',
                        padding: 12
                      }}
                    >
                      <div style={{ fontSize: 14, color: 'var(--muted-foreground)', marginBottom: 6 }}>ID: #{selected.id}</div>
                      <h3 style={{ fontSize: 18, margin: '6px 0 10px 0' }}>{title}</h3>
                      {status && (
                        <div style={{ fontSize: 12, marginBottom: 8, color: status === 'failed' ? 'var(--danger)' : 'var(--muted-foreground)' }}>
                          状态：{status === 'running' ? '分析中' : status}
                        </div>
                      )}

                      {summary && (
                        <section style={{ marginBottom: 16 }}>
                          <div style={{ fontWeight: 600, marginBottom: 6 }}>Summary</div>
                          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{summary}</div>
                        </section>
                      )}

                      {llm && (
                        <section>
                          <div style={{ fontWeight: 600, marginBottom: 6 }}>LLM 生成</div>
                          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                            {renderRefLinkedText(llm)}
                          </div>
                        </section>
                      )}
                    </div>

                    {/* 下方小方块：搜索结果（有则显示） */}
                    {searchResults.length > 0 && (
                      <div
                        style={{
                          border: '1px solid var(--card-border)',
                          borderRadius: 8,
                          background: 'var(--panel)',
                          boxShadow: 'var(--shadow-sm)'
                        }}
                      >
                        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--card-border)', fontWeight: 700 }}>
                          搜索结果
                        </div>
                        <div
                          ref={resultsScrollRef}
                          style={{ padding: 12, maxHeight: 260, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}
                        >
                          {searchResults.map((r) => (
                            <div
                              key={`sr-${r.ref}`}
                              id={`search-ref-${r.ref}`}
                              onClick={() => setSelectedRef(r.ref)}
                              style={{
                                border: '1px solid var(--card-border)', borderRadius: 8, padding: 10,
                                background: selectedRef === r.ref ? 'rgba(23,92,211,0.08)' : 'transparent', cursor: 'pointer'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <span style={{ fontWeight: 700, color: 'var(--brand)' }}>[{r.ref}]</span>
                                <a href={r.url} target="_blank" rel="noreferrer" style={{ fontWeight: 600, color: 'var(--foreground)' }}>
                                  {r.title || r.url || '未命名结果'}
                                </a>
                              </div>
                              <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 6 }}>
                                {r.siteName || ''} {r.date ? `· ${new Date(r.date).toLocaleString()}` : ''}
                              </div>
                              {r.summary && (
                                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{r.summary}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

export default GraphCanvas;
