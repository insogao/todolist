// Planning Agent: reads plan.json, consumes values referenced by check_list.refs,
// and produces the next batch plan (0-3 tasks) and the next check_list.
// - Output schema is structured JSON to avoid parsing ambiguities.
// - IDs for new tasks are assigned sequentially (Excel-like a..z, aa..az...).

import OpenAI from 'openai';
import { z } from 'zod';
import { Agent, run, setDefaultOpenAIClient, setOpenAIAPI } from '@openai/agents';
import fs from 'fs';
import path from 'path';

import { loadConfig } from '../utils/loadConfig.js';

const cfg = loadConfig();
setDefaultOpenAIClient(new OpenAI({ apiKey: cfg.openai.apiKey, baseURL: cfg.openai.baseURL }));
setOpenAIAPI('chat_completions');

// Allow overriding plan file via env PLAN_PATH/PLAN_FILE or the first CLI arg ending with .json
const cliPlanArg = process.argv.slice(2).find((a) => /\.json$/i.test(a));
const envPlan = process.env.PLAN_PATH || process.env.PLAN_FILE;
const PLAN_PATH = path.resolve(process.cwd(), cliPlanArg || envPlan || 'plan_test.json');

function readPlan() {
  const raw = fs.readFileSync(PLAN_PATH, 'utf8');
  const obj = JSON.parse(raw);
  return obj;
}

function writePlan(obj) {
  const text = JSON.stringify(obj, null, 2);
  fs.writeFileSync(PLAN_PATH, text, 'utf8');
}

function excelNext(id) {
  // a..z, aa..az, ba..bz, ...
  const toNum = (s) => s.toLowerCase().split('').reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 96), 0);
  const toStr = (n) => {
    let res = '';
    while (n > 0) {
      const r = (n - 1) % 26;
      res = String.fromCharCode(97 + r) + res;
      n = Math.floor((n - 1) / 26);
    }
    return res || 'a';
  };
  return toStr(toNum(id) + 1);
}

function parseRef(refRaw) {
  // tolerant parsing: case/space-insensitive for node and part
  const ref = String(refRaw).trim();
  const m = ref.match(/\s*([a-zA-Z]+)\s*:\s*([a-zA-Z]+)\s*(?:\[(llm|search|all)\])?/);
  if (!m) return null;
  return {
    node: m[1].toLowerCase(),
    part: m[2].toLowerCase(), // summary | info
    filter: (m[3] || 'all').toLowerCase(),
    raw: refRaw,
  };
}

function extractInfoBlock(xml, type) {
  if (!xml) return '';
  const re = new RegExp(`<info\\b[^>]*type\\s*=\\s*["']${type}["'][^>]*>([\\s\\S]*?)<\\/info>`, 'i');
  const m = xml.match(re);
  return m ? m[0] : '';
}

function collectInputs(plan) {
  const refs = plan?.check_list?.refs || [];
  const byId = new Map((plan.nodes || []).map((n) => [n.node_id.toLowerCase(), n]));
  const inputs = [];
  const fallbackSummary = (node) => {
    const s = (node?.summary || '').trim();
    if (s) return node.summary;
    // log-level style fallback: summary includes title when empty
    return node?.title ? node.title : '';
  };
  for (const r of refs) {
    const pr = parseRef(r);
    if (!pr) continue;
    const node = byId.get(pr.node);
    if (!node) continue;
    if (pr.part === 'summary') {
      inputs.push({ ref: r, value: fallbackSummary(node) });
    } else if (pr.part === 'info') {
      if (pr.filter === 'llm') {
        const v = extractInfoBlock(node.info || '', 'llm');
        inputs.push({ ref: r, value: v || fallbackSummary(node) });
      } else if (pr.filter === 'search') {
        const v = extractInfoBlock(node.info || '', 'search');
        inputs.push({ ref: r, value: v || fallbackSummary(node) });
      } else {
        const v = node.info || '';
        inputs.push({ ref: r, value: v || fallbackSummary(node) });
      }
    }
  }
  return inputs;
}

const OutputSchema = z.object({
  is_final: z.boolean(),
  tasks: z.array(z.object({
    title: z.string(),
    type: z.enum(['search', 'summary']),
    p_node: z.string(),
  })).max(3),
  // next_check_list may reference placeholders NEW1..NEW3, e.g., "NEW1:summary"
  next_check_list: z.array(z.string()),
});

function instructions() {
  // Keep the prompt compact and unambiguous. Avoid multiple JSON samples or commented JSON
  // that could nudge the model to emit non‑JSON text. The Agents SDK enforces the schema;
  // we just make the intent crisp.
  return `你是一个规划助手（Planning Agent）。
目标：基于给定参考输入，规划“下一批次”的任务（0–3个）并给出下一轮 check_list。

输出：严格 JSON（只返回 JSON，本行之外不要输出任何文本、代码块或注释）。
{
  "is_final": boolean,
  "tasks": [
    { "title": string, "type": "search" | "summary", "p_node": string }
  ],
  "next_check_list": [string]
}

字段约束：
- tasks：最多 3 个；可为 0 个。title 清晰具体，建议 18–60 字。
- type："search"（补充事实与证据）或 "summary"（整合/收束）。
- p_node：父节点引用；大小写/空格不敏感；格式：id:summary 或 id:info[llm|search|all]；多源用英文逗号分隔，如 "b:summary, c:summary"。
- next_check_list：允许引用既有节点（如 "a:summary"、"c:info[llm]"）与本轮新任务，占位符 NEW1/NEW2/NEW3 对应 tasks[0..2]，如 "NEW1:summary"。

 规划策略：
 - 首先判断现有信息覆盖是否充足；若已足够产出最终结论，则设 is_final=true，并创建 1 个 "summary" 任务汇总关键上游（如 "b:summary, c:summary"）。
 - 若存在明显信息缺口或需交叉验证：优先生成 1–2 个有针对性的 "search" 任务（量化口径、来源核验、矛盾点澄清等）。
 - 避免与历史节点重复；每轮任务应实质推进到可总结状态。
 - 当没有有意义的新任务时，允许 tasks 为空，并维持 is_final=false。

搜索生成原则（重要）：
- 默认不新增 search 仅为“补细节/核对准确性”。应首先相信现有搜索节点的专业性，优先通过 summary 聚合来整合并标注不确定性。
- 只有当“上一轮搜索带来了全新的且重要的调查方向”，且该方向无法由现有节点的总结充分覆盖时，才新增下一轮 search；数量控制在 1–2 个，避免横向重复。
- 在新增 search 尚未产出结果之前，务必保留关键既有节点的引用（见 next_check_list 策略），不要过早放弃原始信息基线。

next_check_list 策略（重要）：
- 谨慎剔除：仅在“当前已知节点的信息明显没有参考价值”，或“后续智能体将提供的信息已充分覆盖该节点内容”时，才考虑从 next_check_list 中移除该节点引用。
- 保守保留：如果不确定新的检索方向能带回更有价值的信息，应保留原有节点引用，避免过早放弃已有信息来源。
- 新旧平衡：当新增搜索方向尚未产出结果时，务必保留关键的既有节点（如核心 summary）的引用，以确保下一轮仍能基于可靠基线继续规划。

终局判断（重要）：
- 若本轮主要产出的是对多节点的“汇总/收束”任务，且没有新的搜索方向（没有 "search" 类型任务），则将 is_final 设为 true，产出唯一的最终总结任务（引用关键上游，如 "b:summary, c:summary"）。
- 最终总结的 next_check_list 通常只需保留 NEW1:summary（即最终总结本身），除非业务需要继续跟踪其他特定节点。

单一示例（仅示意，不要在输出中包含此示例）：
{
  "is_final": false,
  "tasks": [
    { "title": "补充治理侧 AI 伦理的量化指标与来源核验", "type": "search", "p_node": "c:summary" },
    { "title": "细化环境维度清洁电力口径与时间范围", "type": "search", "p_node": "b:summary" }
  ],
  "next_check_list": ["a:summary", "NEW1:summary", "NEW2:summary"]
}`;
}

export async function planNext() {
  const plan = readPlan();
  // Bootstrap: if first run (only one start node) and no refs provided, seed refs with "a:info"
  // so the planner can see the user's initial context. Generic to the first node id.
  try {
    const nodes = Array.isArray(plan.nodes) ? plan.nodes : [];
    const hasRefs = Array.isArray(plan?.check_list?.refs) && plan.check_list.refs.length > 0;
    if (!hasRefs && nodes.length === 1 && (nodes[0].type === 'start' || !nodes[0].type)) {
      const nid = String(nodes[0].node_id || 'a').toLowerCase();
      const latestIdSeed = plan?.check_list?.latest_id || nid;
      const latestBatchSeed = (typeof plan?.check_list?.latest_batch === 'number')
        ? plan.check_list.latest_batch
        : (typeof nodes[0].batch === 'number' ? nodes[0].batch : 1);
      plan.check_list = {
        latest_id: latestIdSeed,
        latest_batch: latestBatchSeed,
        refs: [`${nid}:info`],
      };
      writePlan(plan); // persist bootstrap for transparency
      console.error(`[planning] bootstrap refs -> ["${nid}:info"]`);
    }
  } catch (e) {
    console.error('[planning] bootstrap refs check failed (non-fatal):', e?.message || e);
  }
  const inputs = collectInputs(plan);
  // Always include the user's original question (start node title) at the top of the prompt,
  // without exposing node id/name. This keeps exploration anchored to the user's goal.
  const startNode = (plan.nodes || []).find((n) => n.type === 'start') || (plan.nodes || [])[0];
  const userQuestion = startNode && startNode.title ? String(startNode.title).trim() : '';
  // Note: collectInputs already applies log-level fallback (summary -> title, info -> summary/title)
  const latestId = plan?.check_list?.latest_id || 'a';
  const latestBatch = typeof plan?.check_list?.latest_batch === 'number' ? plan.check_list.latest_batch : (() => {
    const batches = (plan.nodes || []).map((n) => n.batch).filter((b) => typeof b === 'number' && b >= 1);
    return batches.length ? Math.max(...batches) : 1;
  })();
  const nextBatch = latestBatch + 1;

  const agent = new Agent({
    name: 'Planning Agent',
    instructions: instructions(),
    model: cfg.openai.model,
    outputType: OutputSchema,
  });

  const sections = [];
  if (userQuestion) sections.push('用户问题:\n' + userQuestion);
  sections.push('参考输入（check_list 对应值）：', ...inputs.map((x, i) => `#${i + 1} ${x.ref} ->\n${x.value}`));
  const userInput = sections.join('\n\n');
  // Log the exact prompt components we pass to the model.
  // Set env PLANNING_LOG_FULL=1 to disable truncation.
  const __truncate = (s, n = 1600) => (s && s.length > n ? s.slice(0, n) + '\n...[truncated]...' : s);
  const logFull = process.env.PLANNING_LOG_FULL === '1';
  const showInstr = process.env.PLANNING_LOG_SHOW_INSTR === '1';
  try {
    console.error(`[planning] plan file: ${PLAN_PATH}`);
    if (showInstr) {
      const instr = instructions();
      console.error('[planning] INSTRUCTIONS ->\n' + (logFull ? instr : __truncate(instr)));
    }
    console.error('[planning] USER_INPUT ->\n' + (logFull ? userInput : __truncate(userInput)));
  } catch {}

  const result = await run(agent, userInput);
  const out = result.finalOutput; // structured object per zod
  console.error('[planning] MODEL_OUTPUT (parsed) ->\n' + JSON.stringify(out, null, 2));

  // Assign IDs to new tasks
  let curId = latestId;
  const assigned = [];
  for (const t of out.tasks) {
    curId = excelNext(curId);
    const pnodeSanitized = String(t.p_node || '')
      .replace(/:title\b/ig, ':summary') // forbid title in dependency grammar
      .replace(/\s*,\s*/g, ', ');
    assigned.push({ node_id: curId, title: t.title, type: t.type, p_node: pnodeSanitized });
  }

  // Update plan.json with new nodes
  for (const t of assigned) {
    const node = {
      node_id: t.node_id,
      title: t.title,
      summary: '',
      info: '',
      p_node: t.p_node,
      batch: out.is_final ? -1 : nextBatch,
      type: t.type,
      status: 'planned',
    };
    plan.nodes.push(node);
  }

  // Build next_check_list: resolve NEW1..NEW3 placeholders to assigned IDs.
  // If a NEW placeholder cannot be resolved (e.g., tasks is empty), drop that entry to avoid leaking NEWx into refs.
  const resolveRef = (s) => {
    const str = String(s).trim();
    const m = str.match(/\bNEW([1-3])\b/i);
    if (!m) return str;
    const idx = Number(m[1]) - 1;
    const nid = assigned[idx]?.node_id;
    return nid ? str.replace(m[0], nid) : null; // drop unresolved
  };
  const nextRefs = (out.next_check_list || [])
    .map(resolveRef)
    .filter((x) => typeof x === 'string' && x.length > 0);

  plan.check_list = {
    latest_id: assigned.length ? assigned[assigned.length - 1].node_id : latestId,
    latest_batch: assigned.length ? (out.is_final ? -1 : nextBatch) : (plan?.check_list?.latest_batch ?? nextBatch),
    refs: nextRefs,
  };

  writePlan(plan);
  console.error('[planning] wrote plan_test.json with', assigned.length, 'task(s).');

  const status = {
    agent: 'planning',
    status: 'completed',
    planned_tasks: assigned.map((x) => ({ id: x.node_id, type: x.type })),
    batch: assigned.length ? (out.is_final ? -1 : nextBatch) : null,
    timestamp: new Date().toISOString(),
  };
  try { process.stderr.write(`AGENT_STATUS ${JSON.stringify(status)}\n`); } catch {}
  // Emit a concise summary to stdout
  process.stdout.write(JSON.stringify({ planned: assigned, next_check_list: plan.check_list }, null, 2) + '\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  planNext().catch((err) => {
    console.error('[planning agent error]', err?.message || err);
    process.exit(1);
  });
}
