import type { GraphData, GraphEdge, GraphNode } from '@/lib/utils/types';

// Adapter: transform planning JSON (agent/runs/*.json) into GraphData
// Expected input shape (subset): { nodes: [{ node_id, title, summary, p_node, type }] }
// Edges are derived from `p_node`, which may be a comma-separated list like "a:summary, c:info[llm]".
export function parsePlanJsonToGraph(src: string): GraphData {
  let json: any;
  try {
    json = JSON.parse(src);
  } catch (e) {
    // Return empty graph on parse error
    return { direction: 'LR', nodes: [], edges: [] };
  }

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const items: any[] = Array.isArray(json?.nodes) ? json.nodes : [];
  const latestId = String(json?.check_list?.latest_id || '').toLowerCase();

  // Build node list
  for (const it of items) {
    if (!it || !it.node_id) continue;
    const type = inferNodeType(it?.type);
    const title = String(it.title ?? it.node_id);
    const summaryRaw = typeof it.summary === 'string' ? it.summary : '';
    nodes.push({
      id: String(it.node_id),
      title,
      summary: summaryRaw || undefined,
      info: typeof it.info === 'string' ? it.info : undefined,
      agentType: typeof it.type === 'string' ? (String(it.type).toLowerCase() as any) : undefined,
      status: typeof it.status === 'string' ? (String(it.status).toLowerCase() as any) : undefined,
      batch: typeof it.batch === 'number' ? it.batch : undefined,
      type,
    });
  }

  // Derive edges from p_node
  const idSet = new Set(nodes.map((n) => n.id));
  for (const it of items) {
    const toId = String(it?.node_id ?? '');
    if (!toId) continue;
    const refs = normalizeRefs(String(it?.p_node ?? ''));
    for (const ref of refs) {
      const fromId = ref.id;
      if (!fromId || !idSet.has(fromId)) continue; // skip unknown parent
      const id = ref.label ? `${fromId}-${ref.label}-${toId}` : `${fromId}-${toId}`;
      edges.push({ id, source: fromId, target: toId }); // keep unlabeled to remain in main layout
    }
  }

  // Mark latest node
  if (latestId) {
    for (const n of nodes) {
      if (n.id.toLowerCase() === latestId) {
        (n as any).isLatest = true;
        break;
      }
    }
  }

  const dirRaw = String(json?.direction || '').toUpperCase();
  const direction = dirRaw === 'TD' ? 'TD' : 'LR';
  return { direction, nodes, edges, metadata: { updatedAt: new Date().toISOString() } };
}

function inferNodeType(t?: string): GraphNode['type'] {
  const v = String(t || '').toLowerCase();
  if (v === 'start' || v === 'end') return 'circle';
  return 'rect';
}

function normalizeRefs(s: string): Array<{ id: string; label?: string }> {
  if (!s) return [];
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((part) => {
      // accept forms: "a:summary", "b:info[llm]", " c : info[all] "
      const m = /^([a-zA-Z]+)\s*:\s*([^\s]+)\s*$/i.exec(part);
      if (m) {
        return { id: m[1].toLowerCase(), label: m[2].toLowerCase() };
      }
      return { id: part.toLowerCase() };
    });
}
