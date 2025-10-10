// Summary Agent: produce analysis then a final <summary>.
// Streaming wrapper captures analysis before <summary> into <info type="llm">…</info>.

import OpenAI from 'openai';
import { Agent, run, setDefaultOpenAIClient, setOpenAIAPI } from '@openai/agents';
import { loadConfig } from '../utils/loadConfig.js';
import fs from 'fs';
import path from 'path';

const cfg = loadConfig();
setDefaultOpenAIClient(new OpenAI({ apiKey: cfg.openai.apiKey, baseURL: cfg.openai.baseURL }));
setOpenAIAPI('chat_completions');

function instructions() {
  return [
    '你是一个总结助手（Summary Agent）。',
    '- 先输出正文分析（中文，支持 Markdown 标题与要点列表，可包含 [ref:n] 引用编号），',
    '- 最后输出一个 <summary>…</summary>（1–2 句话，总括性结论与可信度判断）。',
    '- 不要输出 <info> 标签，模型只需写正文与 <summary>，其余由系统处理。',
  ].join('\n');
}

export async function runStream(text) {
  const agent = new Agent({
    name: 'Summary Agent',
    instructions: instructions(),
    model: cfg.openai.model,
  });
  const streamed = await run(agent, text, { stream: true });
  const nodeStream = streamed.toTextStream({ compatibleWithNodeStreams: true });
  await new Promise((resolve, reject) => {
    const sentinel = '<summary';
    let pending = '';
    let closedInfo = false;
    // Wrap analysis in <info type="llm">…</info> until <summary>
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
  const status = {
    agent: 'summary',
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
  const arg = process.argv.slice(2).join(' ').trim();
  let input = arg;
  try {
    const p = path.resolve(arg);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      input = fs.readFileSync(p, 'utf8');
    }
  } catch {}
  if (!input) {
    console.error('Usage: node src/agents/summary_agent.js <text or filePath>');
    process.exit(2);
  }
  runStream(input).catch((err) => {
    console.error('[summary agent error]', err?.message || err);
    process.exit(1);
  });
}
