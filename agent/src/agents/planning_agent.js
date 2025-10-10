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
  // short progress note for current investigation status (required by structured outputs API)
  note: z.string(),
});

function instructions() {
  // Keep the prompt compact and unambiguous. Avoid multiple JSON samples or commented JSON
  // that could nudge the model to emit non‑JSON text. The Agents SDK enforces the schema;
  // we just make the intent crisp.
  return `你是一个规划助手（Planning Agent）。
目标：基于给定参考输入，规划“下一批次”的任务（0–3 个）并给出下一轮 check_list。

输出：严格 JSON（只返回 JSON，本行之外不要输出任何文本、代码块或注释）。
{
  "is_final": boolean,
  "tasks": [
    { "title": string, "type": "search" | "summary", "p_node": string }
  ],
  "next_check_list": [string],
  "note": string
}

字段约束：
- tasks：最多 3 个；可为 0 个。title 清晰具体，建议 18–60 字。
- type："search"（补充事实与证据）或 "summary"（整合/收束）。
- p_node：父节点引用；大小写/空格不敏感；格式：id:summary 或 id:info[llm|search|all]；多源用英文逗号分隔，如 "b:summary, c:summary"。
- next_check_list：允许引用既有节点（如 "a:summary"、"c:info[llm]"）与本轮新任务，占位符 NEW1/NEW2/NEW3 对应 tasks[0..2]，如 "NEW1:summary"。
 - note：用一段简短中文笔记同步调查进展，格式示例："调查方向a：调查中；调查方向b：已完成无参考价值；调查方向c：有参考价值"。避免无用赘述。

输入与依据（客观性要求）：
- 充分利用参考输入中的 <info type="search">（SERP）结构化结果，识别其中的实体/术语/机构/关键指标/时间范围，作为后续拆解依据。
- 当提出新搜索方向时，先在心中构建“搜索分面图”（无需输出）：
  1) 基于现有 SERP 结果与摘要里的高频要素；
  2) 结合搜索引擎通识（同义词/别名、时间/地域限定、filetype、site:gov/edu、权威来源/官方报告/学术综述等）。
  在此基础上，选取 1–2 个“可执行、收敛且互补”的检索方向，避免只凭主观经验设题。

规划策略：
- 若现有信息已足以产出最终结论：设 is_final=true，并创建 1 个 summary 任务，汇总关键有价值的上游节点（如 "b:summary, c:summary"）。
- 若存在信息缺口或需交叉验证：优先生成 1–2 个针对性的 search 任务（量化口径、来源核验、矛盾点澄清等）。
- 避免与历史节点重复；每轮任务应推动到可总结状态；无意义时允许 tasks 为空。

搜索生成原则（强化）：
- 先看 <info type="search"> 覆盖了什么，再决定是否需要新 search；已覆盖的方向转为 summary 聚合更优。
- 对于入门/领域初探，优先考虑以下客观分面（择优 1–2 个）：
  定义/框架/术语、权威机构与官方发布、行业/学术综述、对比评测/竞品格局、关键指标/数据口径、时间线/里程碑（注意时间限定）。
- 新任务的 p_node 应引用信息量最大的上游（常见为 x:info[search] 与关键 summary）。

任务数量与收敛：
- 默认不新增 search 仅为“补细节/核对准确性”，优先用 summary 聚合并标注不确定性。
- 仅当出现“全新且重要”的调查方向且无法由现有节点总结覆盖时，才新增 1–2 个 search；避免横向重复。
- 在新 search 未产出结果前，保留关键既有节点引用（见 next_check_list 策略），不要过早放弃信息基线。
- 在没有新的search产生的规划的情况下，更倾向于进行进行最终的聚合总结，除非目前的线索过多需要分别进行交叉验证产生阶段性结论

next_check_list 策略：
- 谨慎剔除，仅在确无参考价值或已被覆盖时移除；否则保留核心 summary 引用。
- 新旧平衡：在新增搜索未出结果前，保留关键既有节点，确保下一轮仍有可靠基线。

终局判断：
- 若本轮仅产出总结类（无 search），设 is_final=true，并生成唯一最终总结任务（如 "b:summary, c:summary"）。

示例（仅示意，不要在输出中包含此示例）：
{
  "is_final": false,
  "tasks": [
    { "title": "权威机构（ISO/IEC、NIST、国家标准）对<主题>的定义与术语（近3年）", "type": "search", "p_node": "a:info[search]" },
    { "title": "行业综述/对比评测：主流方案与关键指标（近2年）", "type": "search", "p_node": "a:info[search]" }
  ],
  "next_check_list": ["a:summary", "NEW1:summary", "NEW2:summary"],
  "note": "方向A：调查中；方向B：已完成参考价值；方向C：已完成有参考价值"
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
  // include persisted note to help the planner understand current progress
  const persistedNote = (plan?.check_list && typeof plan.check_list.note === 'string') ? plan.check_list.note : '';
  if (persistedNote && persistedNote.trim()) sections.push('当前调查笔记（note）：\n' + persistedNote.trim());
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
    note: typeof out.note === 'string' ? out.note : (plan?.check_list?.note || ''),
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
