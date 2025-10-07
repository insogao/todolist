// Run Planning Agent against a copy of a given plan json file, leaving the original untouched.
// Usage: node scripts/run-plan-on-copy.js <path/to/plan.json>
// - Creates a sibling file with suffix .copy.json (e.g., plan_stage1.copy.json)
// - Sets PLAN_PATH env to the copy and invokes planning agent once.

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

function usage(code = 2) {
  console.error('Usage: node scripts/run-plan-on-copy.js <path/to/plan.json>');
  process.exit(code);
}

const arg = process.argv[2];
if (!arg) usage();
const srcPath = path.resolve(process.cwd(), arg);
if (!fs.existsSync(srcPath)) {
  console.error(`[err] File not found: ${srcPath}`);
  process.exit(2);
}
if (!/\.json$/i.test(srcPath)) {
  console.error('[err] Expect a .json plan file');
  process.exit(2);
}

const copyPath = srcPath.replace(/\.json$/i, '.copy.json');
fs.copyFileSync(srcPath, copyPath);
console.error(`[test] Copied plan to ${copyPath}`);

const child = spawn(
  process.execPath,
  [path.resolve(process.cwd(), 'src/agents/planning_agent.js'), copyPath],
  {
    stdio: 'inherit',
    env: { ...process.env, PLAN_PATH: copyPath },
  }
);

child.on('exit', (code) => {
  console.error(`[test] planning finished with code ${code}`);
  process.exit(code || 0);
});

