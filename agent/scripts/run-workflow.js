// Orchestrate full loop: initialize plan from a new query, plan -> execute child agents -> write back -> repeat until final.
// Usage:
//   node scripts/run-workflow.js --query "<user question>" [--out runs/plan.json]
//   or provide an existing plan path with --plan <path.json>
// Notes:
//   - Requires OpenAI/Bocha keys configured per agent.config.json at repo root
//   - Uses the planning agent's PLAN_PATH override so all agents read/write the same plan JSON

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const ROOT = path.resolve(process.cwd());

function parseArgs(argv) {
  const args = { query: '', out: '', plan: '' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--query') { args.query = argv[++i] || ''; }
    else if (a === '--out') { args.out = argv[++i] || ''; }
    else if (a === '--plan') { args.plan = argv[++i] || ''; }
  }
  return args;
}

function ensureDir(p) {
  const d = path.dirname(p);
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function nowISO() { return new Date().toISOString(); }

function newPlanFromQuery(query) {
  const created = nowISO();
  return {
    version: '0.1',
    workflow_id: `workflow-${created.replace(/[:.]/g, '')}`,
    created_at: created,
    check_list: { latest_id: 'a', latest_batch: 1, refs: [] },
    nodes: [
      { node_id: 'a', title: String(query || '').trim(), summary: '', info: '', p_node: '', batch: 1, type: 'start', status: 'completed' },
    ],
  };
}

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function writeJson(p, obj) { ensureDir(p); fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8'); }

function spawnNode(scriptPath, args = [], env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', (b) => { out += String(b); });
    child.stderr.on('data', (b) => { err += String(b); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`[${path.basename(scriptPath)}] exit ${code}: ${err || out}`));
      resolve({ stdout: out, stderr: err });
    });
  });
}

async function withRetry(fn, { tries = 3, baseDelayMs = 1500 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) {
      lastErr = e;
      const msg = String(e?.message || e || '').toLowerCase();
      const retriable = msg.includes('429') || msg.includes('rate limit') || msg.includes('timeout') || msg.includes('temporarily unavailable');
      if (!retriable || i === tries - 1) break;
      const wait = baseDelayMs * Math.pow(2, i);
      console.error(`[workflow] retry in ${wait} ms due to: ${e?.message || e}`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

// Helpers copied from planning agent to resolve refs
function parseRef(refRaw) {
  const ref = String(refRaw).trim();
  const m = ref.match(/\s*([a-zA-Z]+)\s*:\s*([a-zA-Z]+)\s*(?:\[(llm|search|all)\])?/);
  if (!m) return null;
  return { node: m[1].toLowerCase(), part: m[2].toLowerCase(), filter: (m[3] || 'all').toLowerCase(), raw: refRaw };
}
function extractInfoBlock(xml, type) {
  if (!xml) return '';
  const re = new RegExp(`<info\\b[^>]*type\\s*=\\s*["']${type}["'][^>]*>([\\s\\S]*?)<\\/info>`, 'i');
  const m = xml.match(re);
  return m ? m[0] : '';
}
function buildContextFromRefs(plan, p_node) {
  const refs = String(p_node || '').split(',').map((s) => s.trim()).filter(Boolean);
  const byId = new Map((plan.nodes || []).map((n) => [String(n.node_id).toLowerCase(), n]));
  const parts = [];
  for (const r of refs) {
    const pr = parseRef(r);
    if (!pr) continue;
    const node = byId.get(pr.node);
    if (!node) continue;
    if (pr.part === 'summary') {
      const v = node.summary?.trim() || node.title || '';
      parts.push(`# ${r}\n${v}`);
    } else if (pr.part === 'info') {
      let v = '';
      if (pr.filter === 'llm') v = extractInfoBlock(node.info || '', 'llm');
      else if (pr.filter === 'search') v = extractInfoBlock(node.info || '', 'search');
      else v = node.info || '';
      if (!v) v = node.summary?.trim() || node.title || '';
      parts.push(`# ${r}\n${v}`);
    }
  }
  return parts.join('\n\n');
}

function parseSummary(text) {
  const m = String(text).match(/<summary>[\s\S]*?<\/summary>/i);
  return m ? m[0] : '';
}

async function runPlanning(planPath) {
  const script = path.resolve(ROOT, 'src/agents/planning_agent.js');
  const { stdout } = await spawnNode(script, [planPath], { PLAN_PATH: planPath });
  let obj;
  try { obj = JSON.parse(stdout); } catch { obj = null; }
  if (!obj) throw new Error('planning stdout not JSON');
  const planned = Array.isArray(obj.planned) ? obj.planned : [];
  return { planned, info: obj.next_check_list };
}

async function runSearchAgent(question) {
  const script = path.resolve(ROOT, 'src/agents/search_agent.js');
  const { stdout } = await spawnNode(script, [question]);
  return stdout;
}

async function runSummaryAgent(text) {
  const script = path.resolve(ROOT, 'src/agents/summary_agent.js');
  const { stdout } = await spawnNode(script, [text]);
  return stdout;
}

async function executeTask(planPath, task) {
  const plan = readJson(planPath);
  const ctx = buildContextFromRefs(plan, task.p_node);
  if (task.type === 'search') {
    const question = ctx ? `${task.title}\n\n参考输入：\n${ctx}` : task.title;
    const out = await runSearchAgent(question);
    const summary = parseSummary(out) || '<summary>（无摘要）</summary>';
    const infoLlm = extractInfoBlock(out, 'llm');
    const infoSearch = extractInfoBlock(out, 'search');
    const info = [infoLlm, infoSearch].filter(Boolean).join('\n\n');
    return { summary, info };
  } else if (task.type === 'summary') {
    const text = ctx || task.title;
    const out = await runSummaryAgent(text);
    const summary = parseSummary(out) || '<summary>（无摘要）</summary>';
    const info = '';
    return { summary, info };
  }
  throw new Error(`unknown task type: ${task.type}`);
}

function writeNodeResult(planPath, nodeId, result) {
  const plan = readJson(planPath);
  const idx = (plan.nodes || []).findIndex((n) => String(n.node_id).toLowerCase() === String(nodeId).toLowerCase());
  if (idx < 0) throw new Error(`node not found: ${nodeId}`);
  const node = plan.nodes[idx];
  node.summary = result.summary || node.summary || '';
  if (result.info) node.info = (node.info ? `${node.info}\n\n` : '') + result.info;
  node.status = 'completed';
  node.updated_at = nowISO();
  plan.nodes[idx] = node;
  writeJson(planPath, plan);
}

async function main() {
  const args = parseArgs(process.argv);
  let planPath = args.plan;
  if (!planPath) {
    if (!args.query) {
      console.error('Usage: node scripts/run-workflow.js --query "<user question>" [--out runs/plan.json]');
      process.exit(2);
    }
    const outArg = args.out || `runs/plan_${Date.now()}.json`;
    const normalized = (path.basename(ROOT) === 'agent' && outArg.startsWith('agent/')) ? outArg.replace(/^agent\//, '') : outArg;
    planPath = path.resolve(ROOT, normalized);
    const plan = newPlanFromQuery(args.query);
    writeJson(planPath, plan);
    console.error(`[workflow] initialized plan at ${planPath}`);
  } else {
    planPath = path.resolve(ROOT, planPath);
    if (!fs.existsSync(planPath)) {
      console.error(`[workflow] plan not found: ${planPath}`);
      process.exit(2);
    }
  }

  const MAX_ROUNDS = Number(process.env.WORKFLOW_MAX_ROUNDS || 8);
  const CONCURRENCY = Math.max(1, Number(process.env.WORKFLOW_CONCURRENCY || 3));
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    console.error(`\n[workflow] === Round ${round} planning (concurrency=${CONCURRENCY}) ===`);
    const { planned } = await runPlanning(planPath);
    if (!planned.length) {
      console.error('[workflow] no tasks planned; stop.');
      break;
    }
    // Run with limited concurrency; collect results, then write back sequentially.
    const queue = planned.map((task, idx) => ({ task, idx }));
    const results = new Array(planned.length);
    let cursor = 0;
    async function workerThread(id) {
      while (true) {
        const next = cursor < queue.length ? queue[cursor++] : null;
        if (!next) break;
        const t = next.task;
        console.error(`[workflow] executing ${t.node_id} (${t.type}) :: ${t.title}`);
        try {
          const res = await withRetry(() => executeTask(planPath, t), { tries: 3, baseDelayMs: 2000 });
          results[next.idx] = { task: t, result: res };
          console.error(`[workflow] completed ${t.node_id}`);
        } catch (e) {
          console.error(`[workflow] task ${t.node_id} failed: ${e?.message || e}`);
          throw e;
        }
      }
    }
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, (_, i) => workerThread(i + 1));
    await Promise.all(workers);
    for (const item of results) {
      if (!item) continue;
      writeNodeResult(planPath, item.task.node_id, item.result);
    }
    const plan = readJson(planPath);
    const latestBatch = plan?.check_list?.latest_batch;
    if (latestBatch === -1) {
      console.error('[workflow] reached final batch (-1); stop.');
      break;
    }
  }
  console.error('[workflow] done.');
}

main().catch((err) => {
  console.error('[workflow error]', err?.message || err);
  process.exit(1);
});
