import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';

function workflowPlugin(): Plugin {
  let child: import('node:child_process').ChildProcess | null = null; // ensure single run
  const agentCwd = path.resolve(__dirname, 'agent');
  const liveOut = path.join(agentCwd, 'runs/plan_live.json');

  return {
    name: 'dev-workflow-middleware',
    configureServer(server) {
      // Kick off workflow from the dev server
      server.middlewares.use('/api/workflow/start', (req, res) => {
        if (req.method !== 'POST') return res.end('Method Not Allowed');
        if (child) {
          res.statusCode = 409;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, message: 'workflow already running' }));
          return;
        }
        let body = '';
        req.on('data', (c) => (body += String(c)));
        req.on('end', () => {
          try {
            const data = body ? JSON.parse(body) : {};
            const query = String(data?.query || '').trim();
            const preset = String(data?.roundsPreset || '').toLowerCase();
            const presetMap: Record<string, string> = { low: '3', mid: '5', high: '8' };
            const maxRoundsEnv = presetMap[preset] || process.env.WORKFLOW_MAX_ROUNDS;
            if (!query) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: false, message: 'missing query' }));
              return;
            }
            // Ensure output file exists so UI can start polling
            const runsDir = path.dirname(liveOut);
            if (!fs.existsSync(runsDir)) fs.mkdirSync(runsDir, { recursive: true });
            try { fs.writeFileSync(liveOut, JSON.stringify({ version: '0.1', nodes: [] }, null, 2)); } catch {}

            // Spawn: npm run workflow -- --query <q> --out runs/plan_live.json
            child = spawn('npm', ['run', 'workflow', '--', '--query', query, '--out', 'runs/plan_live.json'], {
              cwd: agentCwd,
              stdio: 'inherit',
              env: { ...process.env, ...(maxRoundsEnv ? { WORKFLOW_MAX_ROUNDS: maxRoundsEnv } : {}) },
            });
            child.on('close', () => { child = null; });
            child.on('error', () => { child = null; });
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, out: '/data/plan.json' }));
          } catch (e: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, message: String(e?.message || e) }));
          }
        });
      });

      // Serve live plan at /data/plan.json from agent/runs/plan_live.json
      server.middlewares.use('/data/plan.json', (_req, res, next) => {
        try {
          if (fs.existsSync(liveOut)) {
            res.setHeader('Content-Type', 'application/json');
            res.end(fs.readFileSync(liveOut));
            return;
          }
        } catch {}
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), workflowPlugin()],
  server: { port: 5173, open: true },
});
