/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 目标 Mermaid 文件（Vite 会从 public 目录静态服务）
const target = path.resolve(__dirname, '../public/data/graph.mmd');

// 初始数据
let tick = 0;

// 确保目录存在
fs.mkdirSync(path.dirname(target), { recursive: true });

function makeMermaid(t) {
  // 生成一个简单但递增的任务图
  // - 第一行固定方向：graph TD
  // - 新增一个节点 N{t}，并从上一个节点连一条边
  // - 每隔 3 个节点插入一个 depends_on 标签的边
  // - 偶尔用圆形 ((Title)) 表示“里程碑/特殊任务”
  const lines = [];
  lines.push('graph TD');

  // 根节点固定
  lines.push('A[产品愿景]');
  // 第二个节点
  lines.push('B[MVP 范围]');
  lines.push('A --> B');

  // 连续生成节点与边
  let prev = 'B';
  for (let i = 1; i <= t; i++) {
    const id = `N${i}`;
    const isCircle = i % 5 === 0;
    const title = isCircle ? `${id}` : `任务 ${i}`;
    const nodeLine = isCircle ? `${id}(( ${title} ))` : `${id}[${title}]`;
    lines.push(nodeLine);

    // 主链路
    lines.push(`${prev} --> ${id}`);

    // 依赖边（每 3 个）
    if (i % 3 === 0) {
      lines.push(`${id} -- depends_on --> B`);
    }

    prev = id;
  }

  // 再补充几条稳定边，测试解析健壮性
  lines.push('B -- depends_on --> E[UI 设计]');
  lines.push('E --> G[主题与样式]');
  lines.push('A --> C[路线图]');
  lines.push('C --> F[里程碑]');
  lines.push('F --> H[发布计划]');

  return lines.join('\n');
}

function writeOnce() {
  // 0..20 共 21 个状态（t=0 只含基础节点，t=20 含 20 个新增 N 节点）
  const t = tick % 21;
  const content = makeMermaid(t);
  fs.writeFileSync(target, content, 'utf8');
  console.log(`[gen-mmd] tick=${t} -> wrote ${target}`);
  tick = t + 1;
}

// 立即写一次，然后每 3 秒写一次
writeOnce();
setInterval(writeOnce, 3000);