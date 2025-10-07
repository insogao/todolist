基于 DSL 的 check_list，规划下一批任务（0–3 个）与下一轮 check_list，并将结果程序化地读/写到 JSON 文件。

  涉及文件

  - src/agents/planning_agent.js:1：规划 Agent 主程序（读取/拼接输入 → 调用 LLM → 校验结构 → 分配 id/batch → 回写）
  - plan_test.json:1：DSL 中间产物存储（读/写均在此文件）
  - src/utils/loadConfig.js:1：加载 agent.config.json（OpenAI baseURL、model、API key）

  DSL 文件结构（plan_test.json）

  - 顶层字段
      - version，workflow_id，created_at
      - check_list：
          - latest_id: 当前最新节点 id（Excel 列名式 a..z, aa..az…），用于避免后续 id 冲突
          - latest_batch: 当前最新批次号（>=1）；当进入最终总结时设为 -1
          - refs: string[]，下一轮规划要关注的上游输出引用，例如：
              - "a:summary"（仅摘要）
              - "a:info[llm]" 或 "a:info[search]" 或 "a:info[all]"（默认 all）
              - 大小写与空格不敏感，分隔符为英文冒号
      - nodes: 节点数组，每项包含
          - node_id: Excel 列名式 ID（a..z, aa..az…）
          - title: 节点标题（start=用户初始 query，search=搜索方向，summary=汇总任务）
          - summary: 概览（初始为 ""，执行后补全）
          - info: 详细信息（XML 文本）：兄弟节点并列
              - <info type="llm">…</info>：大模型推理（可能缺失）
              - <info type="search">…</info>：搜索原始结果（未搜则缺失）
          - p_node: 父节点入参（大小写/空格不敏感；冒号分隔；可用逗号多源）
              - 例："a:summary"，"a:info[llm]"，"b:summary, c:summary"
          - batch: 批次号（>=1）；最终总结节点 batch=-1（唯一）
          - type: start | search | summary | end
          - status: planned | running | completed | failed

  规划输出契约（LLM 必须返回的 JSON）

  - 结构
      - is_final: boolean
          - 为 true 时表示进入最终总结阶段（系统将把唯一总结任务 batch 设为 -1）
      - tasks: 数组，最多 3 个
          - title: string（任务名，清楚具体，建议 20–60 字）
          - type: "search" 或 "summary"
          - p_node: string（父节点引用；大小写/空格不敏感；冒号分隔；支持 a:summary 和 a:info[llm|search|all]，可逗号多源）
      - next_check_list: string[]
          - 下一轮规划关注的引用；可引用既有节点（如 "a:summary"），也可引用本轮新任务，使用占位符指代：
              - "NEW1:summary" → 指 tasks[0] 新建的任务
              - "NEW2:summary" → 指 tasks[1] 新建的任务
              - "NEW3:summary" → 指 tasks[2] 新建的任务
  - 重要：模型只返回该 JSON，不能输出其他文本

  由程序负责落盘的规则

  - node_id: 系统分配，基于 check_list.latest_id 使用 Excel 式自增（避免冲突）
  - batch: 系统分配；若 is_final=true 则 batch=-1，否则 batch=latest_batch + 1
  - status: 新任务初始化为 "planned"
  - summary/info: 新任务初始化为 ""；后续由执行节点写入（info 为 <info type="llm"> 和 <info type="search"> 的并列兄弟节点）
  - check_list 更新：
      - latest_id: 更新为本轮新建的最后一个节点 id（若无新任务则保留原值）
      - latest_batch: 更新为 -1 或 latest_batch + 1
      - refs: 将 next_check_list 中的 NEW1..NEW3 替换为新分配的实际 node_id

  功能流程（Planning Agent）

  - 读取 plan_test.json
      - 获取 check_list.latest_id、check_list.latest_batch、check_list.refs
  - 构建 LLM 输入
      - 解析 refs（大小写/空格不敏感；支持 summary 与 info[llm|search|all]）
      - 将每个引用解析为具体值：
          - summary → 上游节点的 summary
          - info[llm] → 从 info 中提取 <info type="llm">…</info>
          - info[search] → 从 info 中提取 <info type="search">…</info>
          - 未指定过滤 → 取整段 info（容错：缺失时返回空字符串）
      - 拼接为多段文本，作为用户输入传给 LLM
      - 日志打印（stderr）：[planning] built input:\n…
  - 调用 LLM（结构化输出）
      - 使用 Agents SDK + zod 校验模型输出结构（{ is_final, tasks[], next_check_list[] }）
      - 日志打印（stderr）：[planning] model output (parsed):\n…
  - 回写 plan_test.json
      - 按规则分配 node_id 与 batch，创建新任务节点（status="planned", summary="", info=""）
      - 解析 next_check_list 中的 NEW1..NEW3 → 实际 node_id
      - 更新 check_list.latest_id 与 check_list.latest_batch，并写入新的 refs
      - 日志打印（stderr）：[planning] wrote plan_test.json with N task(s).
      - 状态信号（stderr）：AGENT_STATUS {"agent":"planning","status":"completed",...}
      - 摘要输出（stdout）：{ planned: [...], next_check_list: {...} }

  运行方式

  - 规划下一批
      - npm run plan
  - 注意
      - 读取与写回均使用 plan_test.json
      - 会联网调用大模型；需保证 agent.config.json 的 baseURL、model、apiKey 可用

  错误与容错

  - refs 引用不存在：跳过该项（不会中断），只根据可解析项构建输入
  - info 缺失子块：返回空字符串，不报错
  - 模型输出非契约 JSON：zod 校验失败 → 进程报错退出
  - 写回失败：报错退出

  扩展建议（可选）

  - 在节点上维护执行时间戳：created_at/updated_at/finished_at
  - 在 nodes 中加 attempts 与 errors，便于失败重试记录
  - 输出 ndjson 形式的运行事件，便于流水线观测与回放

  近期更新与补充说明

  - 首次启动引导（Bootstrap）
      - 当仅存在一个 start 节点且 check_list.refs 为空时，系统会自动将 "a:info"（或首个节点 id 的 info）写入 refs，并立即回写到 plan_test.json，确保首轮就有上下文可读。
      - latest_id 与 latest_batch 会沿用已有值；缺失时基于该节点进行推断与填充。
  - 输入解析的“log level”回退
      - summary 引用为空时，自动回退为该节点的 title 内容。
      - info 引用（llm/search/all）为空时，先回退到 summary，再回退到 title。此策略仅影响规划输入拼接，不改变节点数据。
  - 依赖语法与清洗
      - p_node 仅允许 "id:summary" 或 "id:info[llm|search|all]"；若模型误产出 ":title" 引用，系统在落盘前会自动替换为 ":summary"，保证依赖集合的稳定性与可解析性。
  - NEW 占位符解析的健壮性
      - next_check_list 中的 NEW1..NEW3 将在写回前替换为实际分配的 node_id；若某 NEW 无法解析（例如 tasks 为空或索引不存在），该条引用会被丢弃，不会把 "NEWx:…" 残留进 refs。
  - 规划提示词（instructions）精简
      - 保留单一最小示例，强调“只返回严格 JSON（不含多余文本/代码块/注释）”；新增规划策略启发，避免重复与空转。
  - 运行文件覆盖能力
      - 现在可通过 CLI 传入计划文件路径（第一个以 .json 结尾的参数）或设置环境变量 `PLAN_PATH`/`PLAN_FILE` 来覆盖默认的 `plan_test.json`。
      - 例：`node src/agents/planning_agent.js fixtures/plan_stage1.copy.json`
  - 拷贝运行测试脚本（不影响原文件）
      - 新增 `scripts/run-plan-on-copy.js`：对传入的计划文件创建同目录 `.copy.json`，将规划运行在该拷贝上。
      - 命令：`node scripts/run-plan-on-copy.js <path/to/plan.json>`；PlAN_PATH 将指向拷贝文件。
      - 预置示例（fixtures/），便于三阶段手测：
          - `fixtures/plan_stage1.json`：仅 start 节点→验证首轮 search 规划能力。
          - `fixtures/plan_stage2.json`：已有若干 search→验证继续 search 还是转 summary 的决策。
          - `fixtures/plan_stage3.json`：信息较完善→验证进入最终总结（is_final）与总结任务规划。
      - NPM 脚本快捷方式：`npm run plan:test1`、`npm run plan:test2`、`npm run plan:test3`（均在拷贝上运行）。
