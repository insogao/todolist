// Bocha Web Search tool wrapper.
// Calls https://api.bochaai.com/v1/web-search and returns compact JSON results.
import { loadConfig } from '../utils/loadConfig.js';

const cfg = loadConfig();

export async function bochaWebSearch({ query, count, freshness, summary }) {
  if (!query || typeof query !== 'string') {
    throw new Error('bocha_web_search: query is required');
  }
  const body = {
    query,
    freshness: freshness || cfg.bocha.freshness,
    summary: typeof summary === 'boolean' ? summary : cfg.bocha.summary,
    count: Math.max(1, Math.min(Number(count ?? cfg.bocha.count), 25)),
  };

  const res = await fetch('https://api.bochaai.com/v1/web-search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cfg.bocha.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`bocha_web_search HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  const json = await res.json();
  // Expected shape:
  // { code: 200, data: { webPages: { value: [ { name, url, summary, siteName, siteIcon, dateLastCrawled } ] } } }
  try {
    const pages = json?.data?.webPages?.value || [];
    const results = pages.map((p, i) => ({
      ref: i + 1,
      title: p?.name,
      url: p?.url,
      summary: p?.summary,
      siteName: p?.siteName,
      date: p?.dateLastCrawled,
    }));
    return {
      query,
      total: results.length,
      results,
    };
  } catch (e) {
    throw new Error('bocha_web_search: unexpected response shape');
  }
}

// Helper to stringify results in a way the model can easily consume and cite.
export function formatSearchResults(result) {
  if (!result || !Array.isArray(result.results)) return '[]';
  // Return a concise JSON string; the model can cite with [ref] using the ref index.
  return JSON.stringify(
    result.results.map((r) => ({ ref: r.ref, title: r.title, url: r.url, summary: r.summary, siteName: r.siteName, date: r.date })),
  );
}

