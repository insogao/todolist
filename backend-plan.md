# 后端规划：XML 驱动的三智能体协同

## 角色划分
- **Planner（隐身协调者）**：不直接出现在 XML 中，负责在内存里维护 DAG、派发节点、补全 `title`/`task` 并根据返回的 `summary` 决定下一步。Planner 的动作只体现在节点属性的变化，例如新增 `<task>` 元素或更新 `status`。
- **Searcher（执行节点）**：承担调研 / 检索任务，负责往 `info` 中记录过程与证据，并在 `summary` 给出节点级结论。
- **Summarizer（汇总节点）**：整合多个节点的成果，把综合推理写入 `info`，把阶段/最终结论写入 `summary`。

## XML 基本结构
- 整个工作流使用单一 `<workflow>` 根节点，内部仅由若干 `<task>` 组成。
- 每个 `<task>` 只保留四个子字段，加上必要的属性：

```xml
<workflow id="recommendation-upgrade" version="1" direction="TD">
  <task id="a" status="in_progress" executor="summary">
    <title>制定升级方案</title>
    <task>整合行业与学术调研，形成升级路径。</task>
    <info></info>
    <summary></summary>
  </task>
  <task id="b" status="pending" executor="search" dependsOn="a:summary">
    <title>行业现状调研</title>
    <task>盘点竞品推荐系统的技术路线与指标。</task>
    <info></info>
    <summary></summary>
  </task>
  <task id="c" status="pending" executor="search" dependsOn="a:summary">
    <title>学术进展调研</title>
    <task>检索近一年推荐系统的学术成果与 benchmark。</task>
    <info></info>
    <summary></summary>
  </task>
</workflow>
```

说明：
- `executor` 仅区分节点由谁来执行，可选 `search` / `summary`（或扩展），不含 Planner。
- `info` 用来描述 AI 的完整推理与行动链，建议以自然语言写出“准备 → 执行 → 发现 → 思考 → 决策”全过程，可包含引用、列表或嵌套片段。
- `summary` 保持 1-2 句的阶段性结论，供聚合或展示使用。
- `dependsOn` 可写成 `b:info`、`c:summary` 的形式来指定所需层级；层级支持 `title` / `task` / `info` / `summary`，若省略冒号默认等价于 `:summary`。多个依赖仍以逗号分隔。
- Planner 在运行时新增节点，只需 append `<task>` 元素并设置好 `dependsOn`，无需 `spawn`。

## 时间线示例（T0 → T7）
逐步展示工作流如何被填写。示例只列出在该时间点发生变化的节点，其余节点默认保持上一状态。

### T0-1：用户输入初始任务
```xml
<task id="a" status="in_progress" executor="summary">
  <title>制定推荐系统升级方案</title>
  <task></task>
  <info></info>
  <summary></summary>
</task>
```
此时仅记录用户的原始目标，其余字段等待后续填充。

### T0-2：Planner 拆分基础子任务
```xml
<task id="a" status="in_progress" executor="summary">
  <title>制定升级方案</title>
  <task>整合行业与学术调研，形成升级路径。</task>
  <info></info>
  <summary></summary>
</task>
<task id="b" status="pending" executor="search" dependsOn="a:summary">
  <title>行业现状调研</title>
  <task>盘点竞品推荐系统的技术路线与指标。</task>
  <info></info>
  <summary></summary>
</task>
<task id="c" status="pending" executor="search" dependsOn="a:summary">
  <title>学术进展调研</title>
  <task>检索近一年推荐系统的学术成果与 benchmark。</task>
  <info></info>
  <summary></summary>
</task>
```
Planner 此时仅定义结构，还未写入任何调查结论。

### T1：节点 b 完成
```xml
<task id="b" status="completed" executor="search" dependsOn="a:summary">
  <title>行业现状调研</title>
  <task>盘点竞品推荐系统的技术路线与指标。</task>
  <info>
    我先在通用搜索引擎中使用“推荐系统 序列建模 升级”“头部电商 推荐 AB测试”两组关键词，筛选过去两年的行业博客与发布会纪要。
    进一步对命中的八篇材料做交叉比对，重点记录 AB 试验的指标和引入序列建模前后的提升幅度。
  </info>
  <summary>主流竞品集中在长序列建模与多版本实验，指标提升体现在 CTR 与 GMV。</summary>
</task>
```
Planner 读取 `b.summary` 后暂时选择“等待”其他节点，未新增任务。

### T2：新增节点 d（依赖 b）
```xml
<task id="d" status="waiting" executor="search" dependsOn="b:summary">
  <title>竞品架构拆解</title>
  <task>在行业现状基础上梳理竞品 A/B 的模型栈、上线节奏与指标。</task>
  <info></info>
  <summary></summary>
</task>
```
Planner 通过新增 `<task>` 体现扩展决策，仍未修改根节点 `info/summary`。

### T3：节点 c 完成
```xml
<task id="c" status="completed" executor="search" dependsOn="a:summary">
  <title>学术进展调研</title>
  <task>检索近一年推荐系统的学术成果与 benchmark。</task>
  <info>
    我切换到学术搜索，围绕“Transformer recommender 2024 benchmark”“multimodal recommendation survey”检索近一年会议论文。
    共筛选 5 篇核心论文，逐一记录实验基线、长序列建模提升幅度以及多模态融合在 CTR 上的增益。
  </info>
  <summary>Transformer 在长序列场景领先，多模态融合额外提升 3-5% CTR。</summary>
</task>
```
Planner 允许节点 d 从 `waiting` 转为真实执行（状态改为 `in_progress`）。

### T4：节点 d 完成
```xml
<task id="d" status="completed" executor="search" dependsOn="b:info">
  <title>竞品架构拆解</title>
  <task>在行业现状基础上梳理竞品 A/B 的模型栈、上线节奏与指标。</task>
  <info>
    基于 b.info 中列出的竞品清单，我重点抓取竞品 A 的双塔 + rerank 架构图和竞品 B 的冷启动标签体系招聘信息，
    将模型栈、数据流与上线节奏整理成对照表，并标注各自关注的核心指标。
  </info>
  <summary>竞品 A：序列召回 + rerank；竞品 B：内容标签缓解冷启动。</summary>
</task>
```
此时 Planner 判定阶段信息充足，准备生成总结节点。

### T5：新增总结节点 s1 并完成
```xml
<task id="s1" status="completed" executor="summary" dependsOn="b:summary,c:summary,d:info">
  <title>阶段总结</title>
  <task>综合行业与学术结论，明确下一步重点方向。</task>
  <info>
    我先复核 b、c 两个节点的 summary，确认行业与学术都指向序列建模与多模态融合；
    再对照 d.info 的架构细节，整理出两个竞品策略的异同，并评估冷启动的风险程度。
  </info>
  <summary>集中推进“序列建模 + 多模态融合”，冷启动做渐进优化，其他方向暂缓。</summary>
</task>
```
Planner 在内存中记录阶段结论（可同步写入节点 `a` 的 `info`：例如“阶段性共识已形成”）。

### T6：新增方案节点 e（依赖 s1）
```xml
<task id="e" status="in_progress" executor="summary" dependsOn="s1:summary">
  <title>方案草拟</title>
  <task>基于 s1 的结论，生成短/中/长期路线、指标与风险评估。</task>
  <info>计划：按照 s1 的结论以及 Planner 的指示，准备三阶段方案并列出指标、资源与风险。</info>
  <summary></summary>
</task>
```

### T7：节点 e 完成，根节点 a 收束
```xml
<task id="e" status="completed" executor="summary" dependsOn="s1:summary">
  <title>方案草拟</title>
  <task>基于 s1 的结论，生成短/中/长期路线、指标与风险评估。</task>
  <info>
    综合 s1 的结论与资源限制，形成三阶段路线：
    (1) 短期上线序列召回并建立指标监控；
    (2) 中期引入多模态特征、完善数据管线；
    (3) 长期推进自适应 rerank，并预留风险缓释措施与验收里程碑。
  </info>
  <summary>升级方案确定，附风险项与里程碑。</summary>
</task>
<task id="a" status="completed" executor="summary">
  <title>制定升级方案</title>
  <task>整合行业与学术调研，形成升级路径。</task>
  <info>复核 b/c/d 的调研细节、s1 的阶段判断与 e 的最终方案，确认依赖闭合并记录未决风险。</info>
  <summary>最终方案确认，工作流结束。</summary>
</task>
```

## 状态与前端映射
- `title` → 节点标题；`task` → 描述执行目标；`info`/`summary` → 前端主显示文本（过程 + 结论）。
- `executor` → 映射节点样式：`search` 用矩形、`summary` 用圆形等；如未来扩展其他执行体，可增加枚举。
- 拓扑完全依赖 `dependsOn`，前端可以据此生成连线。

## 落地要点
1. **运行框架**：使用 Node.js + Fastify 提供 REST/SSE 接口；内存中维护 `workflowGraph`（Map 结构）和待执行队列，Planner/Runner 共享该状态。
2. **存储层（better-sqlite3）** — 最小化表结构（两张表即可覆盖“当前状态 + 审计”）：
   - `workflow_instances(id TEXT PRIMARY KEY, name TEXT, status TEXT, updated_at TEXT)`：工作流元数据，包含最新 XML 快照或可选指向文件的引用。
   - `workflow_node_history(workflow_id TEXT, node_id TEXT, revision INTEGER, executor TEXT, status TEXT, title TEXT, task TEXT, info TEXT, summary TEXT, depends_on TEXT, stage TEXT, created_at TEXT, PRIMARY KEY(workflow_id,node_id,revision))`：节点快照历史。
     - `revision=0`：Planner 创建节点时写入的初始空白。
     - `stage='partial'`：Runner 流式回写的片段（默认仅保存最新一次，老版本可忽略或覆盖）。
     - `stage='final'`：节点完成时的终版；后续再有改动则 `revision+1`、`stage='final'`。
     - 若需要保留流式原始 chunk，可在 JSON 的 `info` 字段中追加，而不是建新表。
3. **任务流转**：Planner 将可执行节点封装为 `TaskPayload` 入队（含 `nodeId`, `executor`, `requiredContext`），Runner（Searcher/Summarizer 实现）取出执行；若调用 LLM 采用流式输出，则 Runner 可以选择先写一条 `stage='partial'` 的快照（`revision` 不变或覆盖），最终 `stage='final'` 版本覆盖即可，无需回放流式历史。
4. **XML 校验**：定义 XSD 或 zod schema，在写入 SQLite 前先验证 `title/task/info/summary` 与属性是否合法；在对外返回（前端拉取）时亦走同样的校验或转换。
5. **日志与审计**：每次更新四字段时，除了刷新内存图，还向 `workflow_node_history` 追加一条记录（`revision = previous + 1`，`stage` 标记为 `partial` 或 `final`），便于回放和差分。

### 数据流示例
以下以两个代表性节点展示“请求 → 内存 → 持久化 → 前端”的信息流。

#### 示例 1：节点 b（T1 完成时，带流式补全）
1. **触发**：Search Runner 完成检索 → 通过 `POST /workflows/:id/nodes/b/result` 回传 `{ info: ..., summary: ..., status: 'completed' }`。
2. **Fastify Handler**：
   - 校验 payload（zod）→ 更新内存 `workflowGraph.nodes.get('b')` 的四字段和 `status`。
   - 在 `workflow_node_history` 中插入一条新记录（`revision = previous + 1`, `stage='final'`，包含四字段与 `depends_on`）。如存在尚未完成的 `partial` 记录，可直接覆盖。
3. **任务调度**：Planner 监听到节点 b 完成后，更新内存 DAG（例如将 d 的状态置为 `pending`），并把下一步任务（若有）入队。
4. **前端**：定时轮询或通过 SSE 获取最新 XML；因为 `dependsOn` 指向 `a:summary`，前端解析时直接展示更新后的 `info`/`summary` 内容。

> **流式补全细节**：Runner 在抓取材料过程中可先调用 `PATCH /workflows/:id/nodes/b/result` 发送临时内容（如 “准备阶段：收集关键词……”），服务端可以选择用 `revision` 不变的写法覆盖 `stage='partial'` 的快照；完成时再 `POST` 全量结果，将同一节点写入 `stage='final'` 的新 `revision`，保留最终版本即可。

#### 示例 2：节点 s1（T5 完成时）
1. **来源**：Summarizer Runner 拉取 `b:summary`, `c:summary`, `d:info`（Runner 通过 REST `GET /workflows/:id/context?node=s1&fields=summary` 获取所需层级）→ 调用 LLM → 生成总结。
2. **回写**：`POST /workflows/:id/nodes/s1/result`，payload 包含长段 `info`（描述整合过程）、`summary`（方向结论）、`status: 'completed'`。
3. **服务端处理**：与节点 b 同步——校验 → 更新内存 → 在 `workflow_node_history` 追加 `revision=+1, stage='final'` 的记录 → 发送合适的 SSE/事件通知。
4. **Planner 决策**：读取 `s1.summary`，判断需要新增节点 e，即在内存中 append `<task id="e" ...>` 并入队；同时往 `workflow_node_history` 插入 `revision=0, stage='draft'` 的空白记录，为后续执行做准备。
5. **前端呈现**：下次轮询到最新 XML 时，能看到 `s1` 的长 `info` 与 `summary`，以及新添加的节点 e。若前端需要历史版本，可调用 `GET /workflows/:id/nodes/s1/versions` 从 SQLite 取回。

### SQLite 存储示范
以节点 **b** 与 **s1** 为例展示核心表中可能出现的记录（示例时间与 ID 仅为说明）。

#### 表 `workflow_instances`
| id | name | status | updated_at |
|----|------|--------|------------|
| recommendation-upgrade | 推荐系统升级 | in_progress | 2024-07-18T10:05:12Z |

#### 表 `workflow_node_history`
| workflow_id | node_id | revision | executor | status | title | task | info (摘要) | summary | depends_on | stage  | created_at |
|--------------|---------|----------|----------|--------|-------|------|-------------|---------|------------|--------|------------|
| recommendation-upgrade | b  | 0 | search   | pending    | 行业现状调研 | 盘点竞品… | `` (空) | `` | `a:summary` | draft   | 2024-07-18T09:50:00Z |
| recommendation-upgrade | b  | 1 | search   | in_progress| 行业现状调研 | 盘点竞品… | `准备阶段：列出关键词…` | `` | `a:summary` | partial | 2024-07-18T09:58:01Z |
| recommendation-upgrade | b  | 2 | search   | completed  | 行业现状调研 | 盘点竞品… | `我先在通用搜索引擎…` | `主流竞品集中在…` | `a:summary` | final   | 2024-07-18T10:00:45Z |
| recommendation-upgrade | s1 | 0 | summary  | pending    | 阶段总结     | 综合行业… | `` | `` | `b:summary,c:summary,d:info` | draft | 2024-07-18T10:02:00Z |
| recommendation-upgrade | s1 | 1 | summary  | completed  | 阶段总结     | 综合行业… | `我先复核 b、c…` | `集中推进…` | `b:summary,c:summary,d:info` | final | 2024-07-18T10:04:20Z |


上述结构确保：
- `workflow_node_revisions` 以增量方式记录从 “空 → partial → final” 的演进；
- `workflow_events` 帮助追踪 LLM 流式片段与最终完成事件；
- 应用重启时先读取 `workflow_node_state` 恢复最新状态，再按 `workflow_node_revisions` 回放或展示历史；
- 前端若订阅 SSE，可实时接收 partial/final 事件，从而在 UI 中逐步显示 `info` 字段的新增内容。

产生的这些xml是ai很擅长产生的格式，但是我们的前端是用mermid语法渲染的，所以我们还需要有一个中间件，动态的给目前xml的拓扑关系映射成mermid中间产物方便我们目前的前端渲染