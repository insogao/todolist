// Lightweight config loader for agent.config.json at project root
// Returns parsed config with sensible defaults and basic validation.
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const CONFIG_PATH = path.join(ROOT, 'agent.config.json');

export function loadConfig() {
  let raw;
  try {
    raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  } catch (err) {
    throw new Error(`Missing agent.config.json at ${CONFIG_PATH}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error('agent.config.json is not valid JSON');
  }

  const cfg = {
    openai: {
      baseURL: parsed?.openai?.baseURL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      apiKey: parsed?.openai?.apiKey || process.env.OPENAI_API_KEY || '',
      model: parsed?.openai?.model || process.env.OPENAI_MODEL || 'gpt-4o-mini',
    },
    bocha: {
      apiKey: parsed?.bocha?.apiKey || process.env.BOCHA_API_KEY || '',
      count: Number(parsed?.bocha?.count ?? 5),
      freshness: parsed?.bocha?.freshness || 'noLimit',
      summary: Boolean(parsed?.bocha?.summary ?? true),
    },
  };

  if (!cfg.openai.apiKey) {
    // Allow empty here because user may use non-secret baseURL in local env, but warn explicitly.
    console.warn('[warn] OPENAI API key is empty in config. Set agent.config.json or env.');
  }
  if (!cfg.bocha.apiKey) {
    console.warn('[warn] Bocha API key is empty in config. Set agent.config.json or env.');
  }
  return cfg;
}

