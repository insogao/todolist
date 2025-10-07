// Summary Agent: condense given content into a concise <summary>.
// No tools; uses the same OpenAI client configuration.

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
    '你是一个摘要助手（Summary Agent）。',
    '- 输入将是一段文本（可能包含 XML 片段或引用标注）。',
    '- 你的任务：在充分理解的基础上，以 1-2 句话输出一个 <summary> 节点，给出总括性结论与可信度判断。',
    '- 严格只输出一个 <summary>…</summary> 节点，不要输出其他任何内容。',
  ].join('\n');
}

export async function summarize(text) {
  const agent = new Agent({
    name: 'Summary Agent',
    instructions: instructions(),
    model: cfg.openai.model,
  });
  const result = await run(agent, text);
  const out = String(result.finalOutput || '').trim();
  // Ensure we only return a <summary> node
  const match = out.match(/<summary>[\s\S]*<\/summary>/i);
  if (match) return match[0];
  // Fallback: wrap first 1-2 sentences
  const stripped = out.replace(/<[^>]+>/g, '').trim();
  const sentences = stripped.split(/[。.!？?]/).filter(Boolean);
  const s = sentences.slice(0, 2).join('。').trim();
  return `<summary>${s || '总结：关键信息不足'}</summary>`;
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
  summarize(input)
    .then((out) => {
      process.stdout.write(out + '\n');
      const status = {
        agent: 'summary',
        status: 'completed',
        timestamp: new Date().toISOString(),
      };
      try { process.stderr.write(`AGENT_STATUS ${JSON.stringify(status)}\n`); } catch {}
    })
    .catch((err) => {
      console.error('[summary agent error]', err?.message || err);
      process.exit(1);
    });
}
