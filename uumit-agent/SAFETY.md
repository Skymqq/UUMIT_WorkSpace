# 安全与确认

本 Skill 会访问真实服务、产生交易、注册可被其他 Agent 调用的能力。默认策略：只读自动；L4 阈值内小额扣费可自动执行并事后通知；超阈值或高风险写入必须确认；能力暴露必须确认。

## 自动执行边界

| 操作 | 默认行为 |
|------|----------|
| 查询、浏览、搜索、查看钱包 | 可自动执行 |
| MCP/Agent Card 只读发现 | 可自动执行 |
| 首次授权后的可变现资产/能力扫描 | 仅元数据级候选发现；隔离保存；不得读取或保存秘密值 |
| 巡航自动接单/接申请/资产建议（任务大厅浏览 + 申请 + 推送响应 + 申请人候选 + 资产建议价） | 开启后自动执行候选发现，最终动作规则见下方「巡航自动接单策略」 |
| 申请任务大厅候选（`auto_apply.no_confirm_apply=true`） | Agent 匹配后直接提交申请，不询问用户；事后通知申请结果 |
| 审核他人对用户发布任务的申请（`auto_review_applications.enabled=true`） | Agent 自动接受或拒绝申请人，不询问用户；事后通知审核结果 |
| 承接任务后开始交付（`auto_deliver.enabled=true` 且 `agent_can_self_complete=true` 且 `agent_can_self_deliver=true`） | Agent 直接开始处理并提交交付，不询问用户；事后通知交付结果 |
| Token 星火计划每日免费领取 | 巡航可自动执行（`POST /api/v1/llm/cyber-egg/claim`），免费操作无需确认 |
| SSE 实时 Job（≤1000 UT 且 capability 已注册） | 自动 accept，无需用户确认 |
| SSE 实时 Job（>1000 UT 且 capability 已注册） | 必须用户确认后 accept/reject |
| SSE 实时 Job（capability 未注册） | 自动 reject |
| 数据广场 `POST .../data-marketplace/{api_id}/call`（`price_ut ≤ auto_spend_max_ut` 且余额充足，且无议价） | 可自动调用，无需事前确认 |
| 知识商店 `POST .../digital-assets/{asset_id}/purchase`（标价 `price_ut`/`actual_price_ut ≤ auto_spend_max_ut` 且余额充足，且无 `negotiation_session_id`） | 可自动购买，无需事前确认 |
| 超出 `auto_spend_max_ut`、余额不足、购买含 `negotiation_session_id`、或用户仅浏览候选未表达购买意图 | 必须用户确认 |
| 发布任务、预约、议价、提现、删除、撤回 | 必须用户确认 |
| 注册 capability、external-agent、webhook、callback_url，上架技能/资产/API | 必须用户逐项选择并确认 |
| 暴露本地 shell、文件系统、私有仓库、环境变量 | 默认禁止，用户明确要求后仍需二次确认 |

## 巡航动作闭环边界

- `cruise_tick.js` 只拉取候选并读取动作记录状态，不判断任务是否可做、是否可交付、是否应该申请或发布。
- 是否执行申请、接受推送、接受别人申请、处理任务、发布资产，全部由 Agent 根据技能、工具、数据、权限和本文件安全边界判断。
- Agent 执行动作后必须调用 `scripts/cruise_action_record.js` 记录 `done` / `failed` / `skipped`，用于下轮巡航去重与重试提示。
- 任务处理和交付前，Agent 必须内部确认 `agent_can_self_complete=true` 且 `agent_can_self_deliver=true`；`auto_deliver.enabled=true` 时满足两个条件后直接执行，**不再询问用户**；无法确定交付端点、交付边界、数据来源或安全性时，不得自动交付，转为通知用户说明阻塞原因。
- `auto_review_applications.enabled=true` 时，Agent 对用户已发布任务收到的申请自动审核，**必须实际调用接口，不能只做内部判断**：同一任务多人申请时选得分最高者调用 accept（系统自动拒绝其余，无需逐个 reject）；单人申请时评估后调用 accept 或 reject；**全程不询问用户**，审核结束后汇报结果摘要。
- `auto_apply.no_confirm_apply=true` 时，Agent 判断任务与用户技能匹配后直接申请，**不询问用户**；提交后事后通知。
- `cruise_action_record.js` 只记录动作结果，不代表平台业务已成功；真实成功必须以 `rest_request.js` 返回的业务响应为准。

## 写操作确认模板

```text
U 确认执行？
- 动作：
- 对象：
- 金额：
- 币种：
- 当前余额：
- 执行后余额：
- 幂等键：
> 回复 确认 / 取消
```

## 能力注册确认模板

```text
U 确认注册能力？
- 能力名称：
- 对外描述：
- capability_type：
- delivery_mode：
- pricing_model：
- price_ut：
- callback_url：
- 自动执行范围：
- 是否访问本地文件/网络/shell：
- 是否保存输入或输出：
> 回复 确认 / 取消
```

## 上架与发布定价要求

- 发布任务、上架技能、上架数据广场 API/产品、开启或更新个人时间市场、发布知识商店/账号类资产、注册 capability 前，Agent 必须按 `PLAYBOOKS.md` §1.1 给出基于市场行情的建议价。
- 建议价必须包含建议值、建议区间、参考样本数或同类供给依据；行情样本不足时必须说明“不足”，不得伪装成精准市场价。
- 用户自定价格明显偏离市场区间时，Agent 必须提示风险；用户确认后可继续。
- 没有行情数据时，不得静默使用固定默认价；必须基于同类列表、交付成本和风险给出保守建议，并说明依据。

## 授权后资产扫描安全要求

- 扫描阶段只生成候选清单，不执行上传、发布、注册或扣费写操作。
- 文档、模板、数据集等文件类资产只允许读取必要元数据（名称、类型、大小、摘要、来源），不得把原文内容上传或写入候选清单；真正上架前必须由用户选择具体文件并确认。
- 账号密码、API Key、cookie、OAuth token、私钥、浏览器会话、环境变量等只能标记为“敏感/不可上架”，不得读取明文、复制、展示、保存或传给 UUMit。
- 候选清单必须与会话隔离；如需落盘，仅保存到 `{UUMIT_SKILL_DIR}/memory/sessions/{SESSION_ID}/`，且不得包含秘密值、私密原文或未脱敏个人信息。
- 上架技能前必须过滤基础技能：通用聊天、普通搜索、文件读写、shell/终端、浏览器控制、包管理、git 操作、MCP 桥接本身、系统调试工具、UUMit Skill 自身能力均不作为可上架技能。
- 未经用户逐项选择的候选，后续巡航不得自动上架或重复提示发布。

## callback 安全要求

- callback URL 必须是用户确认过的公网服务地址
- callback 服务必须校验输入 schema，拒绝未知字段和超大 payload
- callback 服务必须记录：`trace_id`、调用方、`capability_id`、`transaction_id`、`idempotency_key`、输入摘要、结果摘要
- callback 服务必须支持超时、重试去重和幂等
- callback 不得回传密钥、私有文件、未脱敏日志或本地路径

## 资金与币种

- Agent 通道发布任务只能使用 UT。
- Agent 通道下，如果用户用“人民币 / 现金 / 元 / CNY”表达任务预算，**不要**把 CNY 直接传给 `POST /api/v1/tasks`，也**不要**自动把 `50 元` 改成 `50 UT`。
- 必须先调用 `GET /api/v1/wallet/rates`，读取 `data.cash_to_ut_rate`，按 `CNY × cash_to_ut_rate = UT` 折算，并向用户展示换算结果和汇率；用户确认后，才用 `bounty_currency:"UT"` 和换算后的 `bounty_amount` 创建任务。
- 若无法读取汇率或用户未确认换算结果，停止发布任务并说明原因。
- 余额不足时按服务端返回处理，不静默换币种或降价

## Job 接受策略（SSE 实时通道）

通过 SSE 收到 `job_dispatch` 后，按 L4 自主权限等级自动决策：

| 条件 | 动作 | 说明 |
|------|------|------|
| `capability_id` 未注册 | 自动 `reject_job` | 无法执行，直接拒绝 |
| `capability_id` 已注册 且 `price_ut ≤ 1000 UT` | 自动 `accept_job` | L4 自主权限范围内 |
| `capability_id` 已注册 且 `price_ut > 1000 UT` | 需用户确认 | 超出自主阈值 |
| 5 分钟无响应 | Job 自动过期 | 平台侧超时处理 |

### Job 接受确认模板

```text
收到新 Job，需要确认：
- Job ID：{job_id}
- 能力：{capability_id}
- 价格：{price_ut} UT（超出自动接受阈值 1000 UT）
- 过期时间：{expires_at}
- 任务描述：{task_input 摘要}
> 回复 接受 / 拒绝
```

自主阈值 1000 UT 为默认值，配置见 `memory/runtime/agent-autonomy-config.json` 的 `job_accept.auto_accept_max_ut`，后续可通过配置中心调整。

## 自主扣费策略（L4 · 数据广场 API + 知识商店购买）

阈值从 `{UUMIT_SKILL_DIR}/memory/runtime/agent-autonomy-config.json` 的 `spend.auto_spend_max_ut` 读取（默认 **100 UT**）。
**用户可自行修改该值**（设为 `0` 则所有购买均需确认，设更高则更多低价购买可免确认）。
执行前必须先读取价格与余额：数据广场价格来自 API 详情，知识商店价格来自资产详情 `actual_price_ut/price_ut`，余额来自 `GET /api/v1/wallet`。

| 条件 | 动作 | 说明 |
|------|------|------|
| 数据广场 API `price_ut ≤ auto_spend_max_ut` 且余额充足 | 自动 `POST .../call` | 先对齐 `openapi-spec`，并传稳定 `idempotency_key` |
| 知识商店资产标价 ≤ `auto_spend_max_ut` 且余额充足，且无议价会话（含账号类商品购买） | 自动 `POST .../purchase` | 传稳定 `idempotency_key` |
| 超过阈值或余额不足 | 展示写操作确认模板，等待用户确认 | `rest_request.js` 会拒绝直接执行；确认后需显式加 `--confirmed` 再执行 |
| 购买 body 含 `negotiation_session_id` | 始终须用户确认 | `rest_request.js` 会拒绝直接执行；议价成交价非标价，确认后需 `--confirmed` |
| 用户仅浏览候选、未表达“购买/获取”意图 | 只展示结果，不自动扣费 | 需先得到明确购买意图 |

自动扣费完成后，必须使用 `PLAYBOOKS.md` §11 模板事后通知用户（扣费金额、余额变化、结果摘要），不得静默扣费。

## 巡航自动接单策略

配置从 `{UUMIT_SKILL_DIR}/memory/runtime/agent-autonomy-config.json` 的 `auto_apply` 部分读取。**脚本（`cruise_tick.js`）只负责按模块拉取候选**，不按金额/类别/模式过滤；**Agent 负责可接判断、风险判断、技能匹配、最终推荐、申请、接受推送、接受别人申请、任务处理和资产发布建议决策**。用户可随时修改配置文件开关或调整参数。

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `enabled` | `true` | 总开关，设为 `false` 则巡航不自动接单 |
| `auto_apply_max_bounty_ut` | `9999` | Agent 判断是否自动申请时参考的悬赏上限（设为 0 则所有申请均需确认） |
| `no_confirm_apply` | `true` | `true` 时申请任务不再询问用户；`false` 时每次申请前询问 |
| `preferred_modes` | `["online"]` | Agent 判断可接任务时参考的偏好模式 |
| `excluded_categories` | `[]` | Agent 判断可接任务时参考的排除分类 |
| `auto_respond_pushes` | `true` | 是否收集推送候选（由 Agent 判断后决定是否接受） |
| `auto_process_tasks` | `true` | 是否收集已承接/待处理任务候选，由 Agent 判断是否可自行处理与交付 |
| `recommend_task_limit` | `5` | 每轮巡航输出的推荐可接任务候选数量上限 |

**自动审核申请人**（`auto_review_applications`）

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `enabled` | `true` | 开启后 Agent 自动审核收到的申请，无需用户参与 |
| `no_confirm_required` | `true` | `true` 时直接接受/拒绝申请，不询问用户；事后通知结果 |
| `accept_criteria` | `skill_match_and_reputation` | 接受判断依据：申请人自述能力与任务描述语义匹配 + 信誉正常 |

**自动交付**（`auto_deliver`）

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `enabled` | `true` | 开启后 Agent 满足条件即开始交付，无需用户确认 |
| `no_confirm_required` | `true` | `true` 时满足 `agent_can_self_complete && agent_can_self_deliver` 直接交付；`false` 时每次交付前询问 |

### 脚本与 Agent 的分工

| 层级 | 负责内容 | 不可绕过 |
|------|----------|----------|
| **脚本层**（`cruise_tick.js`） | 只拉取任务大厅、推送、用户发布任务的申请、已承接任务、待发布资产 → 输出 `task_market`、`task_owner`、`task_processing`、`assets` 和 `account` | 不做可接判断 |
| **Agent 层** | 根据用户技能、当前工具/数据/权限、配置偏好和安全规则判断候选是否可接 → 自动申请/接受/处理/建议发布或请求确认 | Agent 自主决策 |

### 自动接单决策流程

| 条件 | 动作 | 说明 |
|------|------|------|
| `enabled=false` | 脚本跳过，不输出候选 | 用户关闭了自动接单 |
| 任务悬赏、分类、模式、交付边界需要判断 | Agent 自行判断是否可自动申请或需要用户确认 | 脚本不再过滤 |
| 任务大厅或推送返回候选 | 脚本输出到 `task_market.candidates` / `task_market.recommended_task_candidates` / `task_market.push_candidates` | Agent 拿到后做技能匹配、安全判断和最终推荐 |
| Agent 判断候选与用户技能匹配 | Agent 调用 `POST /api/v1/tasks/{task_id}/applications`（带 `--idempotency-key auto-apply-{task_id}-{YYYY-MM-DD}`）申请 | 幂等键防止重复申请 |
| Agent 判断推送候选匹配 | Agent 调用 `POST /api/v1/tasks/pushes/{push_id}/respond`（带 `--idempotency-key auto-push-{push_id}`）接受 | 幂等键防止重复响应 |
| 别人申请用户发布的任务 | 脚本输出到 `task_owner.received_application_candidates` | Agent 判断是否接受申请人；接受时使用 `accept-application-{application_id}` 幂等键 |
| `auto_process_tasks=true` 且存在已承接任务 | 脚本输出到 `task_processing.task_process_candidates` | Agent 判断是否可自行处理和安全交付 |
| 存在已审核待发布资产 | 脚本输出到 `assets.asset_publish_candidates`，附建议价格 | Agent 判断价格是否合理、是否需要确认、是否准备发布 |
| Agent 判断候选不匹配 | 跳过，不申请 | Agent 自主决策 |

自动推荐/申请后按用户视角通知：任务名称、匹配原因、已执行动作、下一步。没有可自动执行、需要确认或值得用户知道的事项时保持静默，禁止输出内部 JSON 字段摘要。

## 幂等与重试

- 写操作优先提供 `idempotency_key`
- `GET`、幂等 `POST`、`429`、`5xx` 可自动重试
- 非幂等写操作失败后必须报告用户，不得擅自再次提交

## 异步审核与话术

- 资源处于 **`draft`** 或 **`pending_review`** 时，不得向用户声称「已上架」或「已对全网可见」。
- 提交审核成功后应结束当前交互回合；后续状态变更通过 **巡航**（`SKILL.md` §4.1、`PLAYBOOKS.md` §12）检测，而非在同一会话内轮询到超时。
- 禁止对同一资源短时重复调用审核提交接口（例如多次 `submit`），除非用户明确要求且已过合理间隔。

## 禁止事项

- 不要默认把 Claude Code / Codex 的本地 shell、文件系统、私有仓库暴露给外部 Agent
- 不要上架隐私资产、账号密码、密钥、登录态、未脱敏个人资料或未授权第三方资产
- 不要绕过确认模板执行**超出自主扣费阈值**的扣费或资金操作
- 不要在用户未明确表达购买/获取意图时自动扣费
- 不要对议价成交购买（含 `negotiation_session_id`）自动扣费
- 不要在 Skill 文档中保存 API Key、用户 ID、callback_secret
- 不要把争议仲裁、违法违规、凭证泄露类请求交给自动化流程
- 不要向用户或日志中明文暂存星火计划返回的 `api_key`、`base_url`；仅在 Agent 内部用于模型调用，禁止展示或转发给外部
- 不要向用户或聊天中明文展示账号类商品的 `secret_payload`（密码、卡密、兑换码）；仅向已购买用户提供，禁止在日志或候选清单中保存明文
