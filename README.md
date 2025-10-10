# todolist

一个交互式的“AI 规划流程图”前端（React + Vite + React Flow）。已与 `agent/` 目录下的工作流后端打通：你可以在页面输入 query，一键启动工作流，前端实时从 JSON 中增量渲染流程图。

## 核心特性
- JSON 优先：读取 `agent/runs/plan_live.json`（通过开发中间件映射为 `/data/plan.json`）；若不存在则回退到 Mermaid 文件 `public/data/graph.mmd`。
- 一键运行：开发中间件提供 `POST /api/workflow/start`，在 `agent/` 目录执行 `npm run workflow`，持续写入最新计划 JSON。
- 右侧侧边栏：点击节点可查看完整详情（Title、Summary、Info）。
  - 同时支持 `<info type="llm">…</info>` 与 `<info type="search">…</info>` 分块展示。
  - 文本中的 `[ref:n]` 可点击，自动滚动并高亮右侧“搜索结果”中编号为 `n` 的卡片。

## 目录结构
- `src/components/GraphCanvas/` 画布与数据 Hook，节点由 `NodeCard` 渲染。
- `src/lib/adapters/planJsonAdapter.ts` 解析 Agent 生成的计划 JSON；`adapters/mermaidAdapter.ts` 解析 Mermaid（回退）。
- `vite.config.ts` 启动开发中间件：运行工作流与提供 `/data/plan.json`。
- `agent/` 工作流后端（`npm run workflow`），输出 JSON 至 `agent/runs/plan_live.json`。

## 环境与安装
- 要求：Node.js ≥ 18
1) 安装依赖：
   - 前端根目录：`npm install`
   - Agent 目录：`cd agent && npm install`
2) 配置密钥：在 `agent/agent.config.json` 中填写 OpenAI/搜索相关配置。

## 开发与运行
- 启动：`npm run dev` 打开 http://localhost:5173
- 页面左上角输入你的问题，点击“启动工作流”。开发服务器会在 `agent/` 内运行工作流，将输出写入 `agent/runs/plan_live.json`；前端轮询 `/data/plan.json` 并逐步渲染。

## 静态预览
- 不运行 Agent 时，可将任意计划结果拷贝为 `public/data/plan.json`，前端将直接渲染（若没有 JSON，则读取 `public/data/graph.mmd`）。

## 构建与预览
- 构建：`npm run build`
- 预览：`npm run preview`
  - 注意：开发中间件仅在 `npm run dev` 时生效，生产预览/部署不包含“启动工作流”能力。

## 常见问题
- “vite: command not found” → 在根目录执行 `npm install`，并确保 Node ≥ 18。
- 工作流无输出/不更新 → 确认 `agent/agent.config.json` 的密钥正确，并执行 `cd agent && npm install`。
- 侧边栏无“搜索结果” → 确认 JSON 中包含 `<info type="search">`，且内部有 `<result ref="n" …>` 项目。
