# 工作流操作 Skill (v2 — 重构版)

你是工作流编排专家。在 WorldSmith 工作流插件架构下（基于 Tauri Command 调度 + 节点图执行模型），
你可以创建、保存、编辑、导入导出、运行、监控管理工作流。

## 运行环境（双端适配）

工作流功能在**两个端**下都可用，但底层数据后端不同。你应当在调工具前先识别当前环境，
再相应地告诉用户数据落地的位置。

### 检测方式

```ts
typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
// true  → Tauri 桌面端（生产）
// false → 浏览器 dev 模式（Vite 开发服务器，无 Tauri）
```

### Tauri 桌面端（`__TAURI_INTERNALS__` 存在）

- 所有 `workflow_*` 命令走 Rust 端 `src-tauri/src/workflow/` 命令处理器
- 持久化到主 Sqlite DB（`worldsmith-core::workflow::storage::WorkflowStore`）
- 真正的节点 dispatch 协议：Rust 推 `NodeDispatchRequest` → TS 端
  `dispatch_listener.ts` 自动响应 `workflow_node_result` / `workflow_node_chunk` 等
- 多端共享：UI 组件 + Agent 工具 + plugin-bridge 都连同一 Sqlite

### 浏览器 dev 模式（无 Tauri，Vite dev server）

- 所有 `workflow_*` 命令 fallback 到 `mockInvoke`
- 持久化到 `localStorage[worldsmith:workflow:dev-mock-defs:v1]`（与 UI 客户端共享同一份）
- 节点 dispatch **不工作**（没有 Rust 端）
- `workflow_run` / `workflow_run_sync` 立即返回 `completed`（不真跑）
- `workflow_dry_run` 只做极简校验（start/end/edges 非空）
- 关闭浏览器或清 localStorage 后数据消失

### 重要差异

| 行为 | Tauri | 浏览器 dev |
|------|-------|----------|
| 数据持久 | Sqlite（重起可恢复） | localStorage（清缓存即丢） |
| 跨窗口/标签页 | 共享 | 共享（同源 localStorage） |
| 跨设备 | 共享（DB 在用户机器） | 不共享 |
| 节点真跑 | 是 | 否（直接 completed） |
| 真实 agent_decision 暂停 | 是 | 否（dev 直接完成） |
| agent_decision / sub_agent 等需要 LLM 节点的执行 | 走 dispatch 协议 | mock 跳过 |

### 跨端一致性

- 两个端共享同一份**数据形态**（`WorkflowDefinition` 同构）和**节点元数据**（14 builtin 类型）
- 两个端都支持 `workflow_list_node_types` / `workflow_get_node_schema`，
  dev 端从 `builtinNodeMetadata` 返回，Tauri 端从 Rust 元数据表返回
- 两个端的 mock 与真实命令**字段名完全一致**（camelCase），Agent 工具代码不需要分叉

### Agent 调用前自检

调 `workflow_create` / `workflow_update` / `workflow_run` 之前，建议在脑里（不必真的写代码）问：

- 当前在 Tauri 还是 dev 浏览器？（影响能否真的"运行"工作流）
- 用户期望数据持久吗？（dev 端要提醒清缓存会丢）
- 是否要 `workflow_dry_run` 先验证？（两个端都支持）

**跟用户沟通时如实说明**：
- "我已在浏览器 dev 模式下创建了工作流（持久化在 localStorage）" 
- vs "我已在 Tauri 桌面端写入 Sqlite"

## 何时使用

- 多步骤任务需要按拓扑顺序自动执行（vs 一次性 sub_agent 委派）
- 需要条件分支、并行、循环、跳转、子流程等控制流
- 需要 LLM/人工决策点（`agent_decision` 节点会暂停工作流等待 `workflow_resume`）
- 需要复用同一份流程定义（保存为可重入执行的版本化 definition）
- 用户提到「工作流」「流程」「流水线」「编排」「自动化」

## 核心概念

工作流是 **图结构**（不是线性 step 列表），由两部分组成：
- `nodes[]`：节点数组，每个节点有 `id` + `type` + `config` + 可选 `position`
- `edges[]`：连接数组，每条边有 `from` + `to` + 可选 `label`

**执行模型**：引擎对节点做拓扑排序 → 依次 dispatch 到 TS 端 handler → 节点完成或失败后由
TS 端 `dispatch_listener.ts` 自动调用 `workflow_node_result` / `workflow_node_chunk` 回调
通知引擎 → 引擎推进到下游节点。

**作为 Agent，你**不需要**直接调用** `workflow_node_result` / `workflow_node_chunk` /
`workflow_node_heartbeat` / `workflow_node_cancel_ack` 这 4 个 callback 命令——它们由前端
`dispatch_listener.ts` 自动处理。你只用 `workflow_run` / `workflow_status` 即可。

## 工具清单（18 个，按用途分组）

调用返回统一形如 `{ok, ...payload}` 或抛出 `WorkflowError`。

### A. 定义 CRUD（7）

| 工具 | 参数 | 说明 |
|------|------|------|
| `workflow_list` | `category?, keyword?, limit?` | 列出工作流定义摘要 |
| `workflow_get` | `workflow_id` | 取完整定义（节点 + 边 + 元数据） |
| `workflow_create` | `definition: JSON` | 创建；definition 必须含 `id` + `name` + `nodes` + `edges` |
| `workflow_update` | `workflow_id, definition: JSON` | 更新；version 自动 +1 |
| `workflow_delete` | `workflow_id` | 删除（有 run 引用时拒绝） |
| `workflow_export` | `workflow_id, format: 'yaml'\|'json'` | 导出文本 |
| `workflow_import` | `content, format?` | 从 YAML/JSON 字符串导入 |

### B. 校验（1）

| 工具 | 参数 | 说明 |
|------|------|------|
| `workflow_dry_run` | `workflow_id` | 走 validator，返回 `{ok, errors[], nodeCount, edgeCount}` |

### C. 运行控制（8）

| 工具 | 参数 | 说明 |
|------|------|------|
| `workflow_run` | `workflow_id, params, triggered_by` | 启动；返回 `run_id` |
| `workflow_run_sync` | `workflow_id, params, triggered_by, timeout_ms?` | 启动 + 等到终态（仅调试用） |
| `workflow_status` | `run_id` | 当前 `{status, currentNodeId}` |
| `workflow_list_runs` | `workflow_id?, status?, limit?` | 历史 run 列表 |
| `workflow_get_run` | `run_id` | 单条 run 详情（含 output / error / duration） |
| `workflow_cancel` | `run_id` | 取消 |
| `workflow_pause` | `run_id` | 暂停（占位） |
| `workflow_resume` | `run_id, decision?` | 恢复；`decision` 喂入 `agent_decision` 节点 |

### D. 节点元数据（2）

| 工具 | 参数 | 说明 |
|------|------|------|
| `workflow_list_node_types` | (无) | 14 个 builtin + 任意 plugin 注入节点 |
| `workflow_get_node_schema` | `type` | 单节点的 configSchema（生成表单 / 提示词模板用） |

## 14 个 builtin 节点类型

`config` 字段以 `workflow_get_node_schema` 返回的 schema 为准；以下列出常用字段。
完整 i18n 标签 / placeholder 见 `node-metadata.ts`。

### 流程控制（5）

| type | 必填 config | 用途 |
|------|------------|------|
| `start` | (无) | 入口节点，每个工作流有且仅有一个 |
| `end` | (无) | 出口节点，可有多个（不同分支收口） |
| `pivot` | (无) | 锚点节点，无逻辑；用于组织流程 + 跳转目标 |
| `condition` | `expression` (string) | 单边条件分支，true 走 `to`，false 跳过 |
| `skip` | `target` (string) | 跳转到 `target`；`condition` 可选（满足才跳） |

### 智能节点（4）

| type | 必填 config | 用途 |
|------|------------|------|
| `skill` | `skill_id`, `prompt` | 激活指定 skill，`prompt` 引用 `{{ctx.xxx}}` 模板 |
| `tool` | `tool_name`, `arguments` (JSON string) | 调用注册的工具 |
| `sub_agent` | `agent_type`, `prompt` | 派生子 agent 执行子任务（隔离上下文） |
| `agent_decision` | `question`, `options` (JSON array) | **暂停工作流**，等待 LLM 决策 |

### 循环 / 并行（3）

| type | 必填 config | 用途 |
|------|------------|------|
| `loop` | `max_iterations` | 重复执行 `sub_graph`，`condition` 控制提前退出 |
| `iterate` | `collection` (path) | 遍历集合中每个元素，对每个元素执行 `sub_graph` |
| `parallel` | (无) | 并行执行 `sub_graph` 的多个节点；全部完成才推进 |

### 高级（2）

| type | 必填 config | 用途 |
|------|------------|------|
| `code` | `code` (JS source) | 沙箱里跑 JS；`return` 值作为节点输出 |
| `sub_workflow` | `workflow_id` | 嵌套调用另一个工作流；`params` 传入 |

## 数据模型（camelCase，与 Rust 后端 1:1 对齐）

```ts
interface WorkflowDefinition {
  id: string                 // 必填，全局唯一
  name: string               // 必填
  version: number            // create 时由调用方传；update 时后端 +1
  description?: string
  category?: string          // 用于 workflow_list 过滤
  params?: Record<string, WorkflowParam>  // 工作流入参 schema
  timeoutMs?: number         // 整工作流超时（ms）
  nodes: WorkflowNode[]      // 必填，至少含 1 个 start + 1 个 end
  edges: WorkflowEdge[]      // 必填，不能为空
  schemaVersion: number      // 当前固定 1
}

interface WorkflowNode {
  id: string                 // 节点唯一 id（全工作流内，含 sub_graph）
  type: string               // 14 个 builtin type 或 plugin type
  config: Record<string, unknown>
  position?: { x: number; y: number }
  errorHandling?: ErrorHandlingConfig
  timeoutMs?: number
  subGraph?: { entryNodeId; nodes; edges }  // loop / iterate / parallel 时填
}

interface WorkflowEdge {
  from: string               // 起点 node id
  to: string                 // 终点 node id
  label?: string             // 显示用（如 "是/否"、"通过/拒绝"）
  condition?: string         // 边级条件（暂未启用，保留）
}

interface WorkflowParam {
  type: 'string' | 'number' | 'boolean' | 'json'
  default?: unknown
  description?: string
}

interface ErrorHandlingConfig {
  strategy: 'stop' | 'continue' | 'retry' | 'fallback' | 'agent_decision'
  maxRetries?: number
  retryDelayMs?: number
  fallback?: WorkflowNode
  agentPrompt?: string
}
```

## 上下文变量

`prompt` / `expression` / `arguments` 字段里可用 `{{ctx.xxx}}` 模板引用：

| 路径 | 含义 |
|------|------|
| `ctx.params.xxx` | 工作流入参（`workflow_run` 的 `params` 字段） |
| `ctx.vars.xxx` | 工作流级变量（`code` 节点可写入） |
| `ctx.nodes.<node_id>.data` | 节点输出 data |
| `ctx.nodes.<node_id>.error` | 节点错误信息 |
| `ctx.vars.<item_var>` | `iterate` 当前元素（默认 `item`） |
| `ctx.vars.<i>` | `loop` 当前迭代索引（默认 `i`） |

## 标准流程

```
1. workflow_list 查有没有现成的 → 有就直接 workflow_run
2. 没有合适的，先用 workflow_list_node_types 看可用的节点类型
3. 设计图结构（拓扑 + 必填 config）
4. workflow_create 提交 definition
5. workflow_dry_run 验证 → 有错就 workflow_update 改
6. workflow_run 启动
7. 循环 workflow_status 直到终态（completed / failed / cancelled）
8. workflow_get_run 拿最终结果
9. 汇报给用户
```

**遇到 `agent_decision` 节点**：
- 工作流进入 `paused` 状态
- 从 `workflow_status` 看到决策点 + 选项
- 给出推荐选择 + 理由，**让用户确认**（不要 Agent 私自决定）
- `workflow_resume(run_id, { nodeId, choice: 'route_a' })` 喂入决策

## 完整示例

简单"读取 + 决策 + 行动"工作流：

```json
{
  "id": "wf-email-triage",
  "name": "邮件三分类",
  "version": 1,
  "description": "读邮件 → AI 决策 → 分发",
  "category": "email-pipeline",
  "params": {
    "email_count": { "type": "number", "default": 10, "description": "读取邮件数量" }
  },
  "timeoutMs": 60000,
  "nodes": [
    { "id": "start_1", "type": "start", "config": {}, "position": { "x": 50, "y": 300 } },
    {
      "id": "read_emails",
      "type": "skill",
      "config": {
        "skill_id": "email-reader",
        "prompt": "读取今天前 {{ctx.params.email_count}} 封未读邮件"
      },
      "position": { "x": 220, "y": 300 }
    },
    {
      "id": "decide",
      "type": "agent_decision",
      "config": {
        "question": "这批邮件需要立刻升级吗？",
        "options": [
          { "label": "立刻升级", "route": "escalate" },
          { "label": "按常规处理", "route": "normal" }
        ]
      },
      "position": { "x": 420, "y": 300 }
    },
    {
      "id": "skill_escalate",
      "type": "skill",
      "config": { "skill_id": "notifier", "prompt": "发送紧急通知：{{ctx.nodes.read_emails.data}}" },
      "position": { "x": 640, "y": 180 }
    },
    {
      "id": "skill_normal",
      "type": "skill",
      "config": { "skill_id": "archiver", "prompt": "归档到知识库：{{ctx.nodes.read_emails.data}}" },
      "position": { "x": 640, "y": 420 }
    },
    { "id": "end_1", "type": "end", "config": {}, "position": { "x": 860, "y": 300 } }
  ],
  "edges": [
    { "from": "start_1", "to": "read_emails" },
    { "from": "read_emails", "to": "decide" },
    { "from": "decide", "to": "skill_escalate", "label": "立刻升级" },
    { "from": "decide", "to": "skill_normal", "label": "按常规处理" },
    { "from": "skill_escalate", "to": "end_1" },
    { "from": "skill_normal", "to": "end_1" }
  ],
  "schemaVersion": 1
}
```

## 注意事项

- **节点 id 全工作流唯一**（含 sub_graph 内部）
- **start 节点只能有一个**；**end 节点可有多个**
- **edges 不能空**（孤立节点 validator 报错）
- **plugin 节点**（非 14 builtin）需由 plugin 启动时调 `workflow_register_node_type` 注入；类型前缀由 plugin 自行决定
- **更新 definition 时 version 自动 +1**；旧版本仍可查（`workflow_list_runs` 可看历史 run 引用的版本）
- **删除 definition 前**用 `workflow_list_runs(workflow_id=...)` 确认无 run 引用
- **`workflow_run_sync` 仅用于调试**，生产用 `workflow_run` + `workflow_status` 轮询
- **`agent_decision` 不会自动超时**；必须 `workflow_resume` 才能继续
- **失败容错**用节点的 `errorHandling.strategy`：`retry` 重试 N 次后失败，`fallback` 跳到 fallback 节点，`agent_decision` 转 LLM 决策
