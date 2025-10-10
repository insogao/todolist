// Search Agent implemented with @openai/agents (streaming)
// - Streams LLM output wrapped inside <info type="llm"> ... </info>
// - On seeing <summary>, it closes </info> before emitting the summary
// - Appends <info type="search"> with original Bocha search results at the end

import OpenAI from 'openai';
import { z } from 'zod';
import { Agent, run, tool, setDefaultOpenAIClient, setOpenAIAPI } from '@openai/agents';
import { loadConfig } from '../utils/loadConfig.js';
import { bochaWebSearch } from '../tools/bochaSearch.js';

let collectedSearches = [];

function xmlEscapeAttr(v) {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cdata(text) {
  const s = String(text ?? '');
  return `<![CDATA[${s.replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`;
}

function buildInfoXml(searches) {
  const parts = [];
  parts.push('<info type="search">');
  parts.push('  <searches>');
  for (let i = 0; i < searches.length; i++) {
    const s = searches[i];
    parts.push(
      `    <search step="${i + 1}" query="${xmlEscapeAttr(s.query)}" total="${xmlEscapeAttr(s.total)}">`
    );
    for (const r of s.results || []) {
      parts.push(
        `      <result ref="${xmlEscapeAttr(r.ref)}" title="${xmlEscapeAttr(r.title || '')}" url="${xmlEscapeAttr(r.url || '')}" siteName="${xmlEscapeAttr(r.siteName || '')}" date="${xmlEscapeAttr(r.date || '')}">`
      );
      parts.push(`        <summary>${cdata(r.summary || '')}</summary>`);
      parts.push('      </result>');
    }
    parts.push('    </search>');
  }
  parts.push('  </searches>');
  parts.push('</info>');
  return parts.join('\n');
}

const cfg = loadConfig();
setDefaultOpenAIClient(new OpenAI({ apiKey: cfg.openai.apiKey, baseURL: cfg.openai.baseURL }));
setOpenAIAPI('chat_completions');

const bochaTool = tool({
  name: 'bocha_web_search',
  description:
    'Use Bocha Web Search to get up-to-date facts/news/stats. Returns a list of {ref,title,url,summary,siteName,date}. Always cite with [ref].',
  parameters: z.object({
    query: z.string(),
    count: z.number().int().min(1).max(25).nullable(),
    freshness: z.enum(['oneDay', 'oneWeek', 'oneMonth', 'oneYear', 'noLimit']).nullable(),
    summary: z.boolean().nullable(),
  }),
  strict: true,
  execute: async (input) => {
    const result = await bochaWebSearch({
      query: input.query,
      count: input.count,
      freshness: input.freshness,
      summary: input.summary,
    });
    const payload = { total: result.total, results: result.results };
    collectedSearches.push({ query: input.query, ...payload });
    return payload;
  },
});

function instructions() {
  return [
    '你是一个事实核查与信息检索助手（Search Agent）。',
    '- 优先使用工具 bocha_web_search 获取最新信息；整合后输出明确结论。',
    '- 回答使用中文与 Markdown 格式（使用标题、列表、粗体等），必要时给出简短推理。',
    '- 引用规范：在句末标注引用编号。单轮检索用 [ref:X]，多轮检索用 [ref:s-r]，如第1轮第3条写为 [ref:1-3]。',
    '- 输出结构：首先给出“要点/论述”（分点、包含 [ref] 引用）；最后输出一个 <summary> 节点（1–2 句话总结整体结论与可信度判断）。',
    '- 在检索过程中发现了新的、明确的下一步搜索方向，或者和当前主题相关的可比概念，请在正文末尾追加一个简短段落（1–2 句话）提出“新的搜索建议”；若没有则简单的写“暂无更多搜索方向建议”。',
  ].join('\n');
}

export async function runStream(question) {
  collectedSearches = [];
  const agent = new Agent({
    name: 'Search Agent',
    instructions: instructions(),
    model: cfg.openai.model,
    tools: [bochaTool],
  });

  const streamed = await run(agent, question, { stream: true });
  const nodeStream = streamed.toTextStream({ compatibleWithNodeStreams: true });
  await new Promise((resolve, reject) => {
    const sentinel = '<summary';
    let pending = '';
    let closedInfo = false;
    process.stdout.write('<info type="llm">');

    nodeStream.on('data', (buf) => {
      const chunk = String(buf);
      if (closedInfo) {
        process.stdout.write(chunk);
        return;
      }
      pending += chunk;
      const lower = pending.toLowerCase();
      const idx = lower.indexOf(sentinel);
      if (idx >= 0) {
        const before = pending.slice(0, idx);
        if (before) process.stdout.write(before);
        process.stdout.write('</info>');
        const after = pending.slice(idx);
        if (after) process.stdout.write(after);
        pending = '';
        closedInfo = true;
        return;
      }
      const keep = sentinel.length - 1;
      if (pending.length > keep) {
        const flushLen = pending.length - keep;
        process.stdout.write(pending.slice(0, flushLen));
        pending = pending.slice(flushLen);
      }
    });
    nodeStream.on('end', () => {
      if (!closedInfo) {
        if (pending) process.stdout.write(pending);
        process.stdout.write('</info>');
      }
      resolve();
    });
    nodeStream.on('error', reject);
  });
  await streamed.completed;
  const infoXml = buildInfoXml(collectedSearches);
  process.stdout.write(`\n\n${infoXml}\n`);
  // Emit a machine-readable completion signal on stderr for pipeline coordination
  const status = {
    agent: 'search',
    status: 'completed',
    turns: streamed.currentTurn,
    lastResponseId: streamed.lastResponseId,
    timestamp: new Date().toISOString(),
  };
  try { process.stderr.write(`AGENT_STATUS ${JSON.stringify(status)}\n`); } catch {}
  return status;
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
  const question = process.argv.slice(2).join(' ').trim() || '请告诉我阿里巴巴2024年ESG报告中的亮点，并给出引用。';
  runStream(question).catch((err) => {
    console.error('[search agent error]', err?.message || err);
    process.exit(1);
  });
}
