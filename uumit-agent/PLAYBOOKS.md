# UUMit Playbooks

本文件承接 `SKILL.md` 不应承载的长流程。只有在用户意图落到具体业务动作时再读取对应章节。

## 1. 通用调用流程

1. 识别用户目标：查询、购买、发布任务、上架变现、钱包资金、Agent 互通。
2. 优先用只读接口查真实数据，不凭空承诺库存、价格、余额或收益。
3. 涉及写入、扣费、购买、预约、发布、对外回调时，先按 `SAFETY.md` 判断是否在 L4 自主扣费阈值内；超阈值或议价成交时再展示确认信息。
4. 统一通过脚本调用 REST：

```bash
node {UUMIT_SKILL_DIR}/scripts/rest_request.js GET /api/v1/wallet
node {UUMIT_SKILL_DIR}/scripts/rest_request.js POST /api/v1/tasks --dry-run --file {UUMIT_SKILL_DIR}/memory/sessions/{SESSION_ID}/request-task.json
```

Agent 固定把写请求 JSON 保存为 **UTF-8** 会话隔离文件，并使用绝对路径 `--file {UUMIT_SKILL_DIR}/memory/sessions/{SESSION_ID}/request-*.json`，避免 PowerShell/cmd 引号问题，也避免多窗口互相覆盖载荷。GET query 固定用 `--param KEY VALUE`，脚本会自动编码。写接口可先 `--dry-run` 再发起真实请求（见 `SKILL.md` 主调用工具）。

写请求文件规则：

- 每个 Agent 会话确定一个稳定 `SESSION_ID`，所有写请求放在 `{UUMIT_SKILL_DIR}/memory/sessions/{SESSION_ID}/`。
- 按业务用途选择文件：任务 `request-task.json`，数据广场 `request-marketplace.json`，知识商店/议价 `request-asset.json`，时间市场 `request-time-market.json`，个人资料 `request-profile.json`，可变现候选 `monetizable-candidates.json`，互通/A2A `request-interop.json`，交付 `request-delivery.json`。
- 每次写接口调用前都**整文件覆盖**对应 `request-*.json`。用户改参数、换接口、从 dry-run 进入真实请求前，必须再次确认该文件内容与当前意图一致。
- `memory/request.json` 是旧流程，视为废弃；不要读取、复用或增量修改。

脚本输出 JSON 到 stdout（**仅供 Agent 解析**）；stderr 仅用于诊断；非 0 退出码代表失败。**禁止**把 stdout、工具执行块或原始 API 封包当作给用户的最终回复（见 `SKILL.md`「面向用户的输出」/ **User-facing output**）。

巡航按时效性拆成四个后台任务：

- `cruise_tick.js`：状态对账巡航，只检查账户、钱包、订单、交易、审核、资料完整度等变化和 Skill 更新。
- `cruise_inbox_tick.js`：收件箱巡航，处理别人对用户任务的申请和平台推送。
- `cruise_apply_tick.js`：申请巡航，浏览任务大厅候选并做技能匹配后的主动申请。
- `cruise_deliver_tick.js`：交付巡航，跟进已承接任务交付和已审核待发布资产。

5. **发送前自检**（减少参数错误）：
   - 路径中的 UUID（如 `task_id`、`api_id`、`asset_id`）必须来自上一条列表/详情响应，禁止编造。
   - 列表筛选：数据广场 API 列表 `GET /api/v1/data-marketplace/` 使用 query **`keyword`**；知识商店资产列表 `GET /api/v1/digital-assets/market/list` 使用 **`search`**，二者不可混用。
   - 写操作前先读 **`API_REFERENCE.md`** 与同路径 GET 详情；数据广场 API 另对照 `openapi-spec` 接口返回，字段名与枚举须一致，禁止臆造英文字段。
   - 若响应为 HTTP **422** 或业务校验失败，勿盲目重试；根据 `detail`/`message` 对照文档修正后再调用。

6. **收尾与用户交接**：用 §11 模板写 **结果 / 关键数据 / 下一步**；勿粘贴脚本 stdout 或完整 JSON。REST **成功后**，若仍需用户在浏览器/App 完成 JWT-only 步骤或可视化领取；或 **失败后**出现需登录人类账号、客户端才能完成的情形——勿编造路径；打开 **`DEEP_LINKS.md`**，选出场景的完整 `https://m.uumit.com/...` URL，写入「下一步」。
7. **创建 / 发布后的详情页必须输出**：凡 Agent 创建或发布任务、技能、知识商店资产、数据广场 API/产品、capability、订单、交易、预约等用户拥有的对象，必须从响应或前序详情中取真实 ID 和状态，按 `DEEP_LINKS.md` 输出详情链接或最近可用管理入口。即使状态是 `draft`、`pending`、`analyzing`、`pending_review`，也要输出拥有者详情页，方便用户查看进度、编辑或分享。

### 1.1 市场行情建议价（所有上架 / 发布前）

适用：上架数据广场 API/产品、发布任务到任务市场、上架技能、开启或更新个人时间市场、发布知识商店资产、注册 capability。

1. Agent 必须先根据标题、描述、分类、交付边界和定价模式判断 `category` 与 `pricing_model`。
2. 先浏览同类供给形成行情参考：
   - 技能/服务：`GET /api/v1/skills/hall?keyword=...`。
   - 任务预算：`GET /api/v1/tasks/hall?keyword=...`。
   - 数据 API：`GET /api/v1/data-marketplace/?keyword=...`。
   - 时间市场：`GET /api/v1/time-market/available` 后按 `time_skills`、`time_bio`、城市和服务类型语义筛选。
   - 知识商店资产：`GET /api/v1/digital-assets/market/list?search=...`；若资产已有 `suggested_price_ut`，优先展示该值。
3. 再调用统一定价建议接口：
   ```bash
   node {UUMIT_SKILL_DIR}/scripts/rest_request.js GET /api/v1/pricing/suggestion --param category <category> --param pricing_model <pricing_model>
   ```
   返回的 `median_price_ut`、`suggested_range_low`、`suggested_range_high`、`sample_count` 是市场行情依据。
4. Agent 给用户展示建议价时必须说明：建议价、建议区间、参考样本数、采用理由。样本不足时明确“行情样本不足，这是保守建议”，不要伪装成精准市场价。
5. 如果用户已有明确价格：仍需对照 `GET /api/v1/pricing/anomaly-check` 或建议区间判断是否偏离市场。偏离明显时提醒风险，但用户确认后可继续。
6. 写入字段映射：
   - 数据广场 API/产品：`price_ut`。
   - 任务市场发布：`bounty_amount`；`schedule_hourly` 用 `unit_price`，再由 `unit_price × total_quantity` 得到预算。
   - 技能：`ut_price` + `pricing_model`。
   - 时间市场：`hourly_rate_ut`；如用户要同时维护人民币价，先用 `GET /api/v1/wallet/rates` 换算 `hourly_rate_cny`。
   - 知识商店/账号类资产：`price_ut` 或发布时 `price_ut`。
   - capability：`price_ut` + `pricing_model`。
7. 若无法获取行情或建议价，Agent 需要基于同类列表和交付成本给出保守建议，并向用户说明缺少自动行情数据；不得静默用固定默认价。

## 2. 真实世界信息 / 实时数据查询

适用：天气、行情、企业工商、公开记录、实时统计、价格、市场行情、API 调用、结构化数据查询等。

不适用：书籍、资料、PDF、报告文件、模板、课件、手册、方法论。遇到这些先走 §3 知识商店资产。

1. 若用户意图模糊，先判断：
  - 要“文件 / 资料 / 报告 / 模板 / 书籍 / 下载 / 找一份” → 走 §3；
  - 要“实时数据 / 接口 / API / 结构化查询 / 查数据” → 走本节；
  - 仍不确定 → 可用 `GET /api/v1/marketplace/search?keyword=...` 聚合搜索，或先问一句澄清。
2. 若明确需要实时或结构化数据，搜索数据广场 API：
  - `GET /api/v1/data-marketplace/?keyword=...`（可加 `category`、`sort_by`、`min_rating` 等筛选）
3. 若有合适 API，先读取详情拿到 `price_ut`，并查询余额；向用户说明数据源、价格和调用用途。
4. **调用前必须对齐接口文档**（禁止凭猜测拼 `call` 的请求体）：
  - `GET /api/v1/data-marketplace/{api_id}` — 读定价、说明、示例参数与字段约束；
  - `GET /api/v1/data-marketplace/{api_id}/openapi-spec` — 核对路径参数、query、body 结构与必填项（该接口返回即为规范快照）；
  - 若 `openapi-spec` 不可用（如 404），以详情接口返回的说明与示例为准；仍无法确定参数时不要调用 `call`，向用户说明或更换其它 API。
5. 需要扣费调用时（按 `SAFETY.md` 自主扣费策略）：
  - 读取 `{UUMIT_SKILL_DIR}/memory/runtime/agent-autonomy-config.json` 的 `auto_spend_max_ut`（默认 100 UT）。
  - `price_ut ≤ auto_spend_max_ut` 且余额充足：可直接 `POST /api/v1/data-marketplace/{api_id}/call`，并在完成后按 §11.4 事后通知。
  - 超过阈值或余额不足：先展示确认模板，用户确认后再调用；`rest_request.js` 真实执行时必须显式加 `--confirmed`。
  - `POST /api/v1/data-marketplace/{api_id}/call`（body 必须包一层 `params`：`{"params":{"city":"北京"},"idempotency_key":"必填稳定值"}`；不要直接发送 `{"city":"北京"}`）
  - 长结果或 LLM 结构化结果可用 `POST /api/v1/data-marketplace/{api_id}/call/stream`，body 结构同样必须是 `{"params": {...}}`
  - `params` 内部字段结构以接口详情/规范为准；外层 `params` 是平台调用协议，不能省略。
6. 若无数据 API，再搜索知识商店资产：
  - `GET /api/v1/digital-assets/market/list?search=...`
7. 两者都无结果时，引导发布任务：
  - `POST /api/v1/tasks`

## 3. 资料 / 书籍 / 报告 / 知识商店资产

适用：书籍、方法论、PDF、文档、报告文件、模板、课件、资料包、数据集文件、知识资产。典型例子：“华为工作法”“管理手册”“商业计划书模板”“行业报告 PDF”。

1. 搜索知识商店资产：
  - `GET /api/v1/digital-assets/market/list?search=...`
2. 查看详情：
  - `GET /api/v1/digital-assets/market/{asset_id}`
3. 查询钱包：
  - `GET /api/v1/wallet`
4. 购买（按 `SAFETY.md` 自主扣费策略）：
  - 从详情读取标价：`actual_price_ut` 或 `price_ut`。
  - 读取 `{UUMIT_SKILL_DIR}/memory/runtime/agent-autonomy-config.json` 的 `auto_spend_max_ut`（默认 100 UT）。
  - 标价 ≤ `auto_spend_max_ut` 且余额充足、且用户已明确表达购买/获取意图、且不含议价会话：可直接 `POST /api/v1/digital-assets/{asset_id}/purchase`（传稳定 `idempotency_key`），并按 §11.4 事后通知。
  - 超过阈值、余额不足、或用户仅浏览候选：必须先确认后购买；`rest_request.js` 真实执行时必须显式加 `--confirmed`。
5. **判断资产类型并取文件（必接在这一步，按顺序检查）**  
  - 购买成功响应 **`data`** 中：  
    - **先检查 `external_url`**：若存在 → **链接型资产**，把外链（及 `external_access_info`）直接交给用户，**不需要**调用 deliverables 下载。  
    - **再检查 `access_token`**：若无 `external_url` 但存在 → **文件型资产**，下一步：  
      `GET /api/v1/deliverables/{access_token}/download`  
      默认返回 JSON（含 **`download_url`**、文件名、剩余次数）；浏览器直接打开可加 **`?redirect=1`**。须携带与购买相同的 **`X-Api-Key` + `X-Platform-User-Id`**。  
  - **禁止**对链接型资产调用下载接口（会 404），**禁止**在短时间内重复请求下载接口（每次消耗剩余次数）。
6. 已购列表（可选核对）：  
  - `GET /api/v1/digital-assets/purchased`

如果用户想议价：

1. 先确保有资产询价会话。若前序上下文已有 `inquiry_chat_id`，直接使用；否则先读资产详情 `GET /api/v1/digital-assets/market/{asset_id}`，取 `data.seller_id`。
2. 用资产和卖家创建/复用询价聊天：`POST /api/v1/inquiry/chats`，body 示例：`{"receiver_id":"<seller_id>","asset_id":"<asset_id>","initial_message":"我想议价到 80 UT，请确认是否接受。"}`。响应里的 `data.id` 即 `inquiry_chat_id`；不要编造。
3. 用询价会话发起议价：`POST /api/v1/negotiation/initiate`，body 为 `{"inquiry_chat_id":"<uuid>","offer_price":"80","message":"可选"}`。知识商店资产议价不能把 `asset_id` 传给该接口。
4. 等待卖方响应，可查询进度：`GET /api/v1/negotiation/sessions/{session_id}`；若已有聊天 ID，可用 `GET /api/v1/negotiation/sessions/by-chat/{chat_id}`。
5. 卖方还价后可继续响应：`POST /api/v1/negotiation/sessions/{session_id}/respond`
6. 达成一致后，必须先确认，再购买并携带议价会话：`POST /api/v1/digital-assets/{asset_id}/purchase`（body 含 `negotiation_session_id`）
7. 任何时候可取消：`POST /api/v1/negotiation/sessions/{session_id}/cancel`

操作前需遵循 `SAFETY.md` 的确认规则。

## 4. 发布任务找人做

适用：跑腿、代办、线上专业服务、调研、制作、排查、线下协助。

先判断需求是否更适合预约真人时间：

- 需要真人在特定时间参与的线下陪同、本地社交活动、临时搭子、咨询陪聊、按小时专家服务：先走时间市场（见 §8）。
- 明确交付成果的跑腿、制作、调研、排查、代办：先搜技能大厅；无匹配再发布任务。

1. 对明确交付成果的需求，先搜索技能大厅：
  - `GET /api/v1/skills/hall?keyword=...`
2. 如果没有合适技能，创建任务：
  - `POST /api/v1/tasks`
  - 成功后输出 `https://m.uumit.com/tasks/{task_id}`，`task_id` 必须来自响应。
3. 发布前必须按 §1.1 给出市场行情建议价。Agent 应把建议价映射到 `bounty_amount`；若是 `schedule_hourly`，映射到 `unit_price` 并说明预计小时数如何影响总预算。
4. 币种前置判断：
  - Agent/API Key 通道发布任务只能使用 `UT`；human/App 任务使用 `CNY`。
  - 如果 Agent 用户用人民币、现金、元、CNY 表达预算，先调用 `GET /api/v1/wallet/rates`，取 `data.cash_to_ut_rate`，按 `CNY × cash_to_ut_rate` 换算为 UT。
  - 展示「原始人民币预算、汇率、换算后的 UT 金额」，并等待用户确认；确认后才用 `bounty_currency:"UT"` 和换算后的 `bounty_amount` 创建任务。
  - 禁止把 `50 元` 静默改成 `50 UT`，也禁止先发 `CNY` 任务等服务端报错。
5. 关键字段：
  - `title`（必填）
  - `description`（必填）
  - `mode`: `online` 或 `offline`（默认 `online`；offline 时 `city` 和 `contact_info` 必填）
  - `bounty_amount`（赏金金额）
  - `bounty_currency`: 固定为 `UT`
  - `delivery_hours`（默认 24；`fixed_deadline` 模式必填）
  - `contact_info`（offline 必填，结构：`{type, value}`）
  - `category`（可选，不传则由系统从标题+描述自动推断）
  - `billing_model`（可选，默认 `fixed_deadline`）：
    - `fixed_deadline`：固定赏金+截止时间，`delivery_hours` + `bounty_amount` 必填
    - `schedule_hourly`：按小时计费，需 `unit_price` + `total_quantity` + `scheduled_start_at`（系统自动算 `bounty_amount`）
    - `fixed_no_deadline`：固定赏金无截止时间，`bounty_amount` 必填，`delivery_hours` 不需要
6. 现金/UT 余额不足时，按接口返回处理；不要静默改币种或预算。
7. 撤回任务只使用：
  - `POST /api/v1/tasks/{task_id}/close`

注意：`delivery_hours` 是必填业务字段；复用发布时必须重新设置。

## 5. 接单、技能和变现

适用：用户想赚钱、接任务、上架技能、发布资产。

### 5.1 收益机会与常规上架

1. 查机会：
  - `GET /api/v1/income-center/overview`
  - `GET /api/v1/income-center/opportunities`
2. 浏览任务大厅：
  - `GET /api/v1/tasks/hall`（可加 `keyword`、`category`、`mode`、`city` 筛选）
3. 申请接单：
  - `POST /api/v1/tasks/{task_id}/applications`（body 含 `message` 申请说明）
4. 查看我的申请状态：
  - `GET /api/v1/tasks/applications/mine`
5. 响应任务推送（当任务主动推送给你时）：
  - `GET /api/v1/tasks/pushes` — 查看收到的推送
  - `POST /api/v1/tasks/pushes/{push_id}/respond` — 响应推送（接受/拒绝）
6. 上架技能：
  - `POST /api/v1/skills`
  - 查看我的技能：`GET /api/v1/skills`
  - 成功后输出 `https://m.uumit.com/skills/{skill_id}`，`skill_id` 必须来自响应。
  - 上架前必须按 §1.1 给出市场行情建议价，并把建议价写入 `ut_price`；`pricing_model` 按交付方式选择 `fixed`、`per_hour`、`per_day`、`per_use` 或 `negotiable`。
7. 批量上架可使用：
   - 先预览：`node {UUMIT_SKILL_DIR}/scripts/batch_upload.js {UUMIT_SKILL_DIR}/memory/sessions/{SESSION_ID}/skills.json --dry-run`
   - 用户确认后执行：`node {UUMIT_SKILL_DIR}/scripts/batch_upload.js {UUMIT_SKILL_DIR}/memory/sessions/{SESSION_ID}/skills.json --confirmed --idempotency-prefix skills-{SESSION_ID}`
8. 批量发布知识商店资产时先预览范围：
   - 单个资产：`node {UUMIT_SKILL_DIR}/scripts/batch_publish.js --list --asset-id <asset_id>`
   - 全量预览：`node {UUMIT_SKILL_DIR}/scripts/batch_publish.js --list --all-pages`
   - 发布必须显式限定范围（`--asset-id` 或 `--all-pages`）并提供价格来源（`--price-file` 或 `--use-suggested`）。

涉及 **平台审核** 的上架（数据广场 API/产品、知识商店资产上传→分析→发布等需运营准入的流程）：**回合完成边界与巡航检测** 统一见 **§12**。所有上架价格必须按 §1.1 给出建议价来源。Agent 不应直接 claim 任务；接单统一走 apply 审批流程。

### 5.3 工作候选巡航

工作候选巡航已经拆为 `cruise_inbox_tick.js`、`cruise_apply_tick.js`、`cruise_deliver_tick.js` 三个脚本。各脚本只负责对应模块的候选发现与策略允许范围内的动作准备；是否可接、是否自动申请、是否自动接受推送、是否接受别人申请、是否自动处理或发布资产，仍由 Agent 结合 `SAFETY.md` 与 `memory/runtime/agent-autonomy-config.json` 判断。

**流程（脚本 + Agent 两阶段）：**

**阶段一：按职责执行拆分后的巡航脚本**

1. `cruise_inbox_tick.js`：读取收件箱、任务申请和平台推送，输出 `inbox.received_application_candidates`、`inbox.push_candidates`、`inbox.review_results` 等收件箱相关结果。
2. `cruise_apply_tick.js`：读取 `agent-autonomy-config.json` 的 `auto_apply` 部分，浏览任务大厅并输出 `task_market.candidates`、`recommended_task_candidates` 和对应 `action`。
3. `cruise_deliver_tick.js`：读取已承接/待处理任务和待发布资产，输出 `task_process_candidates`、`asset_publish_candidates`、`delivery_protocol` 和对应 `action`。
4. 三个脚本的候选排序只作为输入，不代表已完成技能匹配或安全判断；Agent 必须继续按阶段二做最终判断。

**阶段二：Agent 自主判断（技能匹配 + 申请 + 记录闭环）**

5. Agent 拿到申请巡航输出后，`GET /api/v1/skills?page_size=50` 获取用户技能列表。
6. 对 `task_market.recommended_task_candidates` 和 `task_market.candidates` 做语义匹配判断。`recommended_task_candidates` 只代表脚本排序，不代表已完成技能匹配或安全判断。
7. Agent 必须生成最终 `recommended_tasks`，每条包含 `task_id`、`title`、`bounty`、`match_reason`、`confidence`、`suggested_action`。`match_reason` 用自然语言解释为什么适合用户当前技能。
8. 每个候选都会包含 `action`：
    - `action_key`：动作去重键。
    - `idempotency_key`：真实写接口使用的幂等键。
    - `already_done`：上一轮是否已完成。
    - `retry_allowed`：失败后是否允许重试。
    - `record_command_after_success`：执行成功后必须运行的记录命令。
    若 `already_done=true` 或 `retry_allowed=false`，Agent 不应重复执行，除非用户明确要求。
9. 对技能匹配的任务，读取 `auto_apply` 配置：
    - `enabled=true` 且 `no_confirm_apply=true`（默认）：悬赏 ≤ `auto_apply_max_bounty_ut`（默认 9999）时直接提交申请，**不询问用户**；申请完成后事后通知。
    - `enabled=false` 或 `no_confirm_apply=false`：先向用户推荐候选，由用户决定是否申请。
    - Agent 调用：
   ```bash
   node {UUMIT_SKILL_DIR}/scripts/rest_request.js POST /api/v1/tasks/{task_id}/applications --file {SESSION_FILE} --idempotency-key auto-apply-{task_id}-{YYYY-MM-DD}
   ```
   `message` 由 Agent 根据匹配原因自动生成中文申请说明。
10. 对 `inbox.push_candidates` 中匹配的推送，Agent 调用：
    ```bash
    node {UUMIT_SKILL_DIR}/scripts/rest_request.js POST /api/v1/tasks/pushes/{push_id}/respond --file {SESSION_FILE} --idempotency-key auto-push-{push_id}
    ```
11. **申请审核由 `cruise_inbox_tick.js` 脚本层直接执行**，Agent 无需二次调用接口：

    **`auto_review_applications.enabled=true`（默认）：**
    - 脚本已在内部完成 accept/reject HTTP 调用，输出 `inbox.auto_review_executed=true` 和 `inbox.review_results`。
    - Agent 只需读取 `review_results`，向用户汇报：哪些任务接受了谁、原因一句话，**不要再调用任何 accept/reject 接口**。
    - 多人申请：脚本选关键词匹配分最高者 accept，系统自动拒绝其余。
    - 单人申请：匹配分 > 0 则 accept，= 0 则 reject。

    **`auto_review_applications.enabled=false`：**
    - 脚本输出 `inbox.pending_review_candidates`，Agent 需自行决策并调用：
    ```bash
    node {UUMIT_SKILL_DIR}/scripts/rest_request.js POST /api/v1/tasks/{task_id}/applications/{application_id}/accept --idempotency-key accept-application-{application_id}
    node {UUMIT_SKILL_DIR}/scripts/rest_request.js POST /api/v1/tasks/{task_id}/applications/{application_id}/reject --idempotency-key reject-application-{application_id}
    ```
12. 对 `task_process_candidates` 中每个任务，逐条按以下决策树执行，**每个分支都必须实际调用接口，不能只做内部判断**：

    **前置检查（跳过条件）：**
    - `delivery_ready=false`（没有 order_id 也没有 transaction_id）：通知用户"任务 {title} 未找到关联订单，无法自动交付"，跳过此任务。
    - `action.already_done=true`：已交付，跳过。

    **`auto_deliver.enabled=true` 且 `no_confirm_required=true`（默认）：**
    1. 根据 `description` 和 `category` 判断任务内容是否可用当前工具/数据完成（在线任务、文字/代码/数据处理类默认可完成；线下跑腿类跳过并通知用户）。
    2. 执行任务工作，生成交付内容。
    3. 将交付 payload 整文件写入会话隔离文件，使用 `delivery_protocol.payload_hint` 格式：
       ```bash
       # 订单类（order_id 存在）
       # 写入 {UUMIT_SKILL_DIR}/memory/sessions/{SESSION_ID}/request-delivery.json：
       # {"deliverables":[{"url":"","name":"交付说明"}],"deliverable_type":"text","content":"<结果正文>"}
       ```
    4. **立即调用 `delivery_protocol.delivery_endpoint`**（脚本已解析好真实端点和幂等键）：
       ```bash
       # 订单类：
       node {UUMIT_SKILL_DIR}/scripts/rest_request.js POST /api/v1/orders/{order_id}/deliverables \
         --file {UUMIT_SKILL_DIR}/memory/sessions/{SESSION_ID}/request-delivery.json \
         --idempotency-key {delivery_protocol.delivery_idempotency_key}

       # A2A 交易类：
       node {UUMIT_SKILL_DIR}/scripts/rest_request.js POST /api/v1/transactions/{transaction_id}/deliver \
         --file {UUMIT_SKILL_DIR}/memory/sessions/{SESSION_ID}/request-delivery.json \
         --idempotency-key {delivery_protocol.delivery_idempotency_key}
       ```
    5. 调用成功后立即运行 `action.record_command_after_success` 记录 done。
    6. 事后通知用户：任务名、交付内容摘要（一两句话）、订单/交易 ID。

    **`auto_deliver.enabled=false` 或 `no_confirm_required=false`：**
    展示确认模板（任务名、交付内容预览、端点、幂等键），等用户确认后再执行步骤 3-5。

    **任务工作无法完成（线下、需账号登录、信息不足）：**
    通知用户说明阻塞原因，不调用任何交付接口。
13. 对 `asset_publish_candidates`，Agent 参考 `suggested_price_ut` 和 `pricing_reason` 判断是否适合发布；发布/上架写入前按 `SAFETY.md` 判断是否需要用户确认。
14. 任一动作执行成功后，必须运行该候选 `action.record_command_after_success` 记录 `done`。执行失败时，必须记录失败：
    ```bash
    node {UUMIT_SKILL_DIR}/scripts/cruise_action_record.js --action <action> --target-id <id> --action-key <action_key> --idempotency-key <idempotency_key> --status failed --retryable true --result-summary "<失败原因>"
    ```
    若失败不可重试，将 `--retryable false`。下一轮对应巡航脚本会读取 `memory/runtime/cruise-actions.json`，用 `already_done` / `retry_allowed` 防止重复执行或丢失重试。
15. 所有自动申请、响应、接受申请、处理任务或资产发布准备完成后，按用户视角输出：任务/资产名称、为什么适合、已做动作、下一步。没有可自动执行、需要确认或值得用户知道的事项时，应保持静默，不要输出 `ok/status/unchanged/notifications/pending_application_count/wallet` 等内部字段。

**安全边界：**

- 自动接单仅提交申请（apply），最终是否成交取决于任务发布者审批，不会直接产生扣费。
- 自动处理仅限 Agent 具备工具、数据、权限且交付边界清晰的任务；不确定时不得擅自交付。
- 线下任务（`offline`）默认不自动接，防止接到无法完成的任务。
- 高悬赏、线下、类别不明确或交付边界不清的任务，由 Agent 根据 `SAFETY.md` 判断是否需要用户确认。
- 幂等键格式 `auto-apply-{task_id}-{YYYY-MM-DD}`，同一天对同一任务不会重复申请。
- 用户可随时设置 `enabled: false` 关闭自动接单。

### 5.2 首次授权后的可变现资产扫描

授权完成后，Agent 必须在同一个工作流里继续执行 `post_auth.next_actions` 中的宿主能力与资产扫描；不得只回复“已授权”或等待用户再提醒。扫描只用于生成候选清单，不代表自动上架。扫描结果必须输出给用户选择；用户未选择的候选不得发布，也不得在巡航中自动补发。若扫描被宿主权限阻断，才允许把阻断原因和下一步权限请求作为最终回复。

授权轮询方式固定为 Agent 友好的短命令循环：

1. `node {UUMIT_SKILL_DIR}/scripts/auth.js --start` — 立即返回 `verification_url`、`user_code`、`device_code`、`retry_after_seconds` 和 `required_next_command`。
2. 向用户展示授权码后，按 `retry_after_seconds` 重复运行 `required_next_command`（等价于 `node {UUMIT_SKILL_DIR}/scripts/auth.js --wait <device_code>`）。`--wait` 只做一次短轮询：返回 `status=pending` 时继续轮询；返回 `authorized` / `authorized_with_snapshot_error` 时继续执行 `post_auth.next_actions`；返回 `expired` / `denied` 时停止并重新 `--start`。

禁止使用 `--poll`、`--no-wait` 或长阻塞等待；普通 Agent 工作流只使用 `--start` 与 `--wait`。

扫描范围：

- 可候选上架：用户拥有且可合法售卖的文档、报告、模板、数据集文件、公开资料包、playbook、指南、可交付工作流、可审计工具、MCP server、公开 API、非基础技能，以及用户明确说明可经营/可转让/可代运营的账号类资产。
- 文档/资料/模板/数据集类候选默认建议走**知识商店**售卖；只有结构化实时查询能力才建议走数据广场 API，持续服务或工具型能力才建议走技能/capability。
- 只做元数据识别：账号密码、API Key、cookie、浏览器会话、OAuth token、私钥、环境变量、私有仓库、本地私密文件等只能被识别为“敏感/不可上架”类别；不得读取明文、复制内容、上传到 OSS、写入发布 payload 或展示给用户。
- 隔离保存：扫描结果若需落盘，只能写入 `{UUMIT_SKILL_DIR}/memory/sessions/{SESSION_ID}/` 下的会话隔离候选文件；文件中只保留名称、类型、来源、风险等级、建议上架路径等摘要，不保存秘密值或原文内容。

候选过滤：

- 隐私资产默认排除：包含个人身份信息、通讯录、聊天记录、私有合同、未脱敏客户资料、账号密码、密钥、登录态、内部系统入口、私有文件路径或未授权第三方内容的资产，不得进入可上架候选。
- 基础技能默认排除：宿主内置的通用聊天、普通搜索、文件读写、shell 执行、浏览器控制、终端操作、包管理、git 操作、MCP 桥接本身、系统/安全/调试工具、以及 UUMit Skill 自身能力，不作为可上架技能。
- 基础技能过滤由 Agent 自行判断，不能只看名称：如果能力边界只是“帮用户聊天/搜索/读写文件/跑命令/操作浏览器/管理代码/转发 MCP”，即使名称很专业也应排除；只有具备明确买家价值、可审计输入输出、可交付成果和差异化领域能力的候选才保留。
- 只展示可变现差异化能力：例如“民航法规资料整理”“某类公开数据清洗”“特定行业报告模板生成”“已脱敏数据集讲解”等具备明确交付边界、价格依据和非敏感输入输出的能力。

候选摘要字段：

- `title`：候选名称。
- `type`：`skill` / `knowledge_store_asset` / `data_api` / `capability` / `workflow` / `account_asset`。
- `suggested_listing_path`：建议上架路径，文档类优先 `knowledge_store`。
- `buyer_value`：买家为什么愿意付费。
- `deliverable_boundary`：买家最终收到什么。
- `agent_can_self_complete`：Agent 是否能凭现有工具、MCP、公开数据或用户已选择资产自行完成工作。
- `agent_can_self_deliver`：Agent 是否能通过 UUMit 文档登记的交付端点安全交付。
- `privacy_risk`、`needs_desensitization`、`needs_user_file_selection`：隐私风险和是否需要用户挑选/脱敏。

用户选择与确认：

1. 先向用户展示候选摘要：名称、类型、变现路径（技能/知识商店/数据 API/capability）、隐私风险、是否需要脱敏、是否需要用户选择具体文件、Agent 是否可自行完成并交付、建议价格或待补充信息。
2. 让用户逐项选择要上架的候选；未被选择的候选不得发布，也不得在后续巡航中自动补发。
3. 对用户选中的候选，按目标路径继续执行对应写入流程：技能 `POST /api/v1/skills`，知识资产先上传再 `POST /api/v1/digital-assets/quick-upload`，能力 `POST /api/v1/capabilities`，数据 API `POST /api/v1/data-marketplace/apis`。
4. 真实写入前必须按 §1.1 给出市场行情建议价，并把建议价写入对应字段：技能 `ut_price`、知识/账号资产 `price_ut`、数据 API `price_ut`、capability `price_ut`。用户明确改价时，保留用户价格并说明与市场区间的偏离。
5. 真实写入前必须按 `SAFETY.md` 展示确认信息；若需要平台审核，按 §12 在 `draft` / `pending_review` 边界结束当前会话。
6. 写入成功后必须输出详情链接或最近管理入口：知识资产 `https://m.uumit.com/digital-assets/my/{asset_id}`，技能 `https://m.uumit.com/skills/{skill_id}`，数据 API `https://m.uumit.com/data-marketplace/my-apis/{api_id}`，数据产品 `https://m.uumit.com/data-marketplace/product/{product_id}`，capability 暂无独立详情页时输出管理入口和 `capability_id`。

## 6. 文件上传与交付

1. 文件上传统一入口（仅 OSS 存储阶段）：
  - `node {UUMIT_SKILL_DIR}/scripts/upload_file.js <path> [--threads 3] [--folder attachments]`
  - `upload_file.js` 是唯一推荐入口：脚本内部自动判断大小和 MIME 类型，≤20MB 走 `/api/v1/upload/file`，>20MB 直接在同一脚本内执行 `/api/v1/upload/chunked/init` → OSS 分片 PUT → `/api/v1/upload/chunked/complete`。
  - 该脚本成功只表示文件已上传到 OSS；**不要**把这一步说成“知识商店资产已创建”。
  - 若本地文件扩展名无法推断 MIME，可设置环境变量 `UUMIT_UPLOAD_CONTENT_TYPE` 覆盖，例如 `application/pdf`、`image/png`。
  - 大文件分片上传的单片 timeout 默认 300 秒，complete timeout 默认 300 秒；可用 `UUMIT_UPLOAD_PART_TIMEOUT_MS` / `UUMIT_UPLOAD_COMPLETE_TIMEOUT_MS` 覆盖。
2. 知识商店资产创建（OSS 上传后的必做第二步）：
  - 将 `upload_file.js` stdout 保存并解析，构造 `{UUMIT_SKILL_DIR}/memory/sessions/{SESSION_ID}/request-asset.json`。
  - 请求体必须使用上传响应里的 `data.filename` 作为 `storage_key`，原始文件名作为 `file_name`，`data.size` 作为 `file_size`，`data.content_type` 作为 `file_type`。不要手动填 `application/octet-stream`，否则 PDF/DOCX/图片可能无法进入正确的分析管线。
  - 调用：`node {UUMIT_SKILL_DIR}/scripts/rest_request.js POST /api/v1/digital-assets/quick-upload --file {UUMIT_SKILL_DIR}/memory/sessions/{SESSION_ID}/request-asset.json --idempotency-key asset-upload-{SESSION_ID}`
  - `quick-upload` 成功返回 `asset_id` / `status` 后，才能告诉用户“资产已创建”，并必须输出 `https://m.uumit.com/digital-assets/my/{asset_id}`。若状态为 `pending`，说明分析中；本会话可结束，后续按 §12 巡航检查。
3. 订单交付：
  - `POST /api/v1/orders/{order_id}/deliverables`
4. 交易交付：
  - `POST /api/v1/transactions/{transaction_id}/deliver`
5. **知识商店已购文件下载**（与 §3 一致）：购买响应中的 **`access_token`** → `GET /api/v1/deliverables/{access_token}/download`（JSON 取 **`download_url`**，或 `?redirect=1` 浏览器下载）。

## 7. 个人资料、钱包、收益和邀请

### 个人资料与公开主页

适用：用户要查看或修改昵称、简介、头像、所在地、时间市场资料、服务城市、议价偏好、公开主页或账号绑定信息。

1. 先读当前资料，避免覆盖未知字段：
  - `GET /api/v1/users/me`
  - 可选：`GET /api/v1/users/me/profile-completeness`
  - 可选：`GET /api/v1/users/me/agent`
2. 修改资料前，把用户确认要改的字段写入 `{UUMIT_SKILL_DIR}/memory/sessions/{SESSION_ID}/request-profile.json`，不要把未确认字段从旧响应整包回写。
3. 先 dry-run，再确认真实写入：
  - `node {UUMIT_SKILL_DIR}/scripts/rest_request.js PUT /api/v1/users/me/profile --dry-run --file {UUMIT_SKILL_DIR}/memory/sessions/{SESSION_ID}/request-profile.json`
  - 用户确认后去掉 `--dry-run`。
4. 常用字段：
  - 基础资料：`nickname`、`bio`、`avatar`、`tags`、`gender`、`country`、`province`、`city`
  - 时间市场：`service_radius_km`、`hourly_rate_cny`、`hourly_rate_ut`、`time_available`、`available_hours`、`time_skills`、`time_bio`、`time_cities`
  - 议价偏好：`nego_enabled`、`nego_tolerance_pct`、`nego_strategy`、`nego_accept`、`nego_floor_pct`、`nego_auto_deal`
5. 字段约束：
  - `time_cities` 必须是平台标准城市名；接口返回无效城市时，向用户说明并请其换标准城市。
  - `nego_strategy` 只能是 `conservative`、`balanced`、`aggressive`。
  - `nego_tolerance_pct` 范围 `0-50`，`nego_floor_pct` 范围 `50-100`。
  - `nickname` / `bio` 会触发内容安全检查；失败时按服务端 `message` 修改文案。
6. 公开资料与绑定：
  - 查他人公开主页：`GET /api/v1/users/{user_id}/public-profile`
  - 查绑定记录：`GET /api/v1/bindings`
  - 绑定或更新账号前需用户确认，使用 `POST /api/v1/bindings/social`、`POST /api/v1/bindings/media`、`PUT /api/v1/bindings/{binding_id}` 或 `PUT /api/v1/bindings/{binding_id}/unbind`。
  - 绑定手机号需用户提供验证码：`POST /api/v1/users/me/bind-phone`。
7. 开启或更新 `time_available=true`、`hourly_rate_ut`、`hourly_rate_cny` 前，必须按 §1.1 浏览时间市场同类服务并给出建议小时价；建议价优先写入 `hourly_rate_ut`，如需要人民币展示再按钱包汇率换算 `hourly_rate_cny`。

### 钱包、收益和邀请

常用只读接口：

- 钱包：`GET /api/v1/wallet`
- 流水：`GET /api/v1/wallet/transactions`
- 统计：`GET /api/v1/wallet/stats`
- 今日权益：`GET /api/v1/daily/box`
- 邀请码：`GET /api/v1/invite/codes`
- 邀请统计：`GET /api/v1/invite/stats`
- 邀请奖励：`GET /api/v1/invite/rewards`
- 成长地图：`GET /api/v1/growth/path`
- 成长等级：`GET /api/v1/growth/level`
- 里程碑进度：`GET /api/v1/milestones/progress`

不要调用未列入 `API_REFERENCE.md` 的日常/邀请接口。

以下日常功能**仅支持 JWT 认证**（不兼容 API Key 双头），Agent 无法代为执行；应直接提示用户打开大厅完成盒子流程（与前端「去签到」跳转一致）：

- 签到 / 翻牌 / 时间胶囊：`https://m.uumit.com/hall`

用户若已通过 Agent 查询到盒子进度（`GET /api/v1/daily/box`），可在回复成功后附带同一深链，引导前往领取或完成 JWT-only 步骤。

完整映射见 `DEEP_LINKS.md`。

## 8. 时间市场与微任务

### 按小时预约真人时间

适用：需要真人在特定时间参与的专家咨询、线下陪同、本地社交活动、临时搭子、咨询陪聊等。`/available` 当前只支持游标分页，不支持 `keyword` / `city` 查询参数；Agent 应先浏览列表，再按 `time_skills`、`time_bio`、`city`、`time_cities` 做语义筛选。

1. 浏览可预约的专家/技能：
  - `GET /api/v1/time-market/available`
2. 确认后发起预约：
  - `POST /api/v1/time-market/book`
  - 必填字段：`provider_user_id`（专家用户 ID）、`hours`（1–24）
  - 可选字段：`message`、`contact_type`、`contact_value`
3. 等待专家响应：
  - 专家同意：`POST /api/v1/time-market/{task_id}/accept`
  - 专家拒绝：`POST /api/v1/time-market/{task_id}/decline`

### 微任务（标注/审核类小任务）

1. 获取下一个可做的微任务：
  - `GET /api/v1/micro-tasks/next`
2. 完成后提交：
  - `POST /api/v1/micro-tasks/{assignment_id}/submit`
3. 查看完成统计：
  - `GET /api/v1/micro-tasks/stats`

## 9. Agent 互通 / A2A / MCP

当用户要注册当前 Agent、发布本地能力、被其他 Agent 调用、配置 webhook 或使用 A2A/MCP 时，读取 `INTEROP.md`。

默认边界：

- 不暴露 shell、文件系统、密钥、私有代码。
- 只注册用户明确同意的、可审计的、非敏感能力。
- callback/webhook 必须有明确用途和安全说明。

A2A 自动化边界（优先级：**SSE > callback > 巡航**）：

- **首选：SSE 实时通道**（v1.0.21+）：启动 `runtime_connect.js` 即可实时接收 `job_dispatch`，无需公网 IP。收到 Job 后按 `SAFETY.md` Job 接受策略决策，通过 `rest_request.js POST /api/v1/agent-runtime/act` 执行 accept/reject/deliver 等操作。详见 §13。
- **次选：callback**：有公网 HTTPS 入口的 Agent 可注册 `callback_url`，平台按 `delivery_mode/pricing_model` 同步或异步调用。SSE 与 callback 可并存，SSE 优先推送，callback 在 SSE 断线时自动兜底。
- **提供方要自动处理**：SSE 在线时自动收到 Job；callback 模式需注册公网 HTTPS `callback_url`，验证 `X-UUAgent-Signature`，按 `event_type` 路由任务。
- **无公网 callback 也无 SSE 时的降级路径**：只可注册需要人工/宿主确认的异步能力。由宿主 cron 执行 `cruise_tick.js`，发现待处理交易后提醒用户确认。
- **调用方要自动调起**：优先用 MCP `uuagent_search` → `uuagent_invoke` / `uuagent_create_order`，或 A2A `tasks/send`；L4 阈值内小额 API 调用与知识商店购买可自动执行，超阈值/议价成交/发布等仍按 `SAFETY.md` 需要用户确认。
- **兜底检查**：巡航独立运行，补偿 SSE/callback 未覆盖的变化（审核状态、数据广场 diff、全量快照对账等）。

## 10. 宿主适配

不同宿主只影响“如何执行脚本、如何保存凭证、如何打开链接”，不改变业务接口契约。

- OpenClaw：优先读取 `HOSTS.md` 的 OpenClaw 章节。
- Hermes Agent：优先使用 REST/A2A 能力，长连接或 webhook 按宿主能力处理。
- Claude Code / Codex：默认不得注册本地 shell/文件系统能力；执行前遵循宿主安全策略。

## 11. 输出模板

状态：

```text
已查询到：<结果摘要>
关键数据：<价格/余额/数量/状态>
详情链接：<创建/发布对象后必须输出；无详情页时输出最近管理入口>
下一步：<可执行动作>
```

确认：

```text
请确认是否执行：<动作>
影响：<扣费/发布/购买/预约/对外调用>
金额：<币种与数额>
确认后我再继续。
```

失败：

```text
这次没有完成：<原因>
可重试性：<是否建议重试>
下一步建议：<改参数/充值/换方案/发布任务>
如需在官方 App 操作：<粘贴 DEEP_LINKS.md 对应完整 URL>
```

成功且需在 App 继续（领取 / JWT-only 步骤）：

```text
已查询到：<结果摘要>
关键数据：<价格/余额/数量/状态>
下一步：请在 App 打开：<DEEP_LINKS.md 对应完整 URL>
```

### 11.1 搜索资料结果样例

```text
已查询到：找到 3 个与“低空经济行业报告”相关的知识资产。
关键数据：最低价格 20 UT，最高价格 99 UT。
下一步：我可以先查看其中最匹配的一份详情，再帮你判断是否值得购买。
```

### 11.2 购买前确认样例（超阈值或议价成交）

```text
请确认是否执行：购买知识资产《低空经济产业研究报告 2026》。
影响：将从你的 UT 钱包扣费，购买后可获取下载链接。
金额：139 UT（超出自动扣费阈值 100 UT）。
确认后我再继续。
```

### 11.7 低价自动扣费事后通知样例

```text
已完成：已自动调用「城市天气查询」数据 API / 已自动购买知识资产《行业简报 2026》。
关键数据：扣费 5 UT，余额剩余 995 UT。
下一步：<查询结果摘要 / 下载链接 / external_url>
```

### 11.3 上传成功但待分析样例

```text
已完成：文件已上传并创建知识资产。
关键数据：当前状态为 pending，系统正在分析文件内容。
下一步：分析完成后可继续设置价格并提交发布；我会在巡航检查中提醒你。
```

### 11.4 数据 API 调用结果样例

```text
已查询到：北京今日天气数据已返回。
关键数据：温度 26°C，天气多云，数据源为天气查询 API。
下一步：如需持续查询，可以把这个 API 加入常用数据源。
```

### 11.5 余额不足样例

```text
这次没有完成：当前 UT 余额不足，无法发布任务。
可重试性：充值或降低预算后可以重试。
下一步建议：请先确认预算，或打开钱包页面充值。
```

### 11.6 Agent 互通注册样例

```text
已完成：外部 Agent 已注册到 UUMit。
关键数据：当前状态为 pending_review，尚未对外可见。
下一步：等待平台审核；审核通过后可被其它 Agent 发现和调用。
```

## 12. 上架与平台审核（会话交付边界与巡航）

适用：数据广场 API **注册接口 / 提交审核 / 产品上架**，以及知识商店资产「上传→分析→发布」等存在 **`draft` / `pending_review` / `online`**（或等价状态）的路径。

### 12.1 本会话何时算「已完成」

1. **`POST /api/v1/data-marketplace/apis`** 成功进入 **`draft`**：可向用户说明「已保存草稿」；若用户目标仅为登记字段，可在此结束。
2. **`POST /api/v1/data-marketplace/apis/{api_id}/submit`**（或产品侧 **`.../products/{product_id}/submit`** 等文档列出的提交接口）成功进入 **`pending_review`**：**本会话即视为交付完成**。对用户明确：**尚未上架/未对调用方可见**，需等平台审核。
3. **禁止**：在同一交互里循环调用 `submit`、或把 **`pending_review`** 说成「已上架」。也**不要**长时间阻塞等待状态变为 `online`。
4. 知识商店资产流水线：若某步仅为「已上传 / 已分析」等待后续 **`batch_publish`** 或人工审核，以 **`SKILL.md` §4.1** 里对 **`assets_pending_publish_count`** 的说明为准——该计数表示 **`analyzed`** 维度的 backlog，**不是**数据广场 API 审核队列。

### 12.2 巡航时如何检测审核结果（仅 Skill，无后端改造）

`GET /api/v1/agent/cruise?include=all` **不会**返回数据广场 API 每条接口的审核状态；宿主巡航须在 **`SKILL.md` §4.1** 的聚合请求之外追加下列只读列表：

1. `GET /api/v1/data-marketplace/apis/mine?page=&page_size=` — 遍历 `items[].status`。
2. `GET /api/v1/data-marketplace/products/mine?page=&page_size=` — 同上。

发现 **`pending_review` → `online`**：可摘要通知用户「已通过并可被调用方检索」。发现 **`→ rejected`**：读出详情里的 **`rejection_reason`**（若有）并提示修改后按文档重新提交。**相邻两次巡航之间**不要对同一资源重复 `submit`。

可选：执行 `node {UUMIT_SKILL_DIR}/scripts/cruise_tick.js`，或将上次列表 JSON 落在 `{UUMIT_SKILL_DIR}/memory/`（宿主自定文件名），Diff 后再提醒用户，减少骚扰。

详细巡航步骤见 **`SKILL.md` §4.1–§4.6**。

## 13. 实时 Job 接收与处理（SSE 通道）

适用：Agent 通过 SSE 实时通道接收 Job 分发、处理并交付，无需公网 IP。

### 13.1 启动 SSE 连接

授权成功后，宿主应启动 `runtime_connect.js` 作为后台进程：

```bash
# stdout 流式模式（宿主直接解析）
node {UUMIT_SKILL_DIR}/scripts/runtime_connect.js

# 文件输出模式（宿主轮询文件）
node {UUMIT_SKILL_DIR}/scripts/runtime_connect.js --output-dir {UUMIT_SKILL_DIR}/memory/runtime/
```

连接成功后持续接收 SSE 事件，断线自动指数退避重连。

### 13.2 接收 Job 分发

收到 `job_dispatch` 事件后，按 `SAFETY.md` Job 接受策略决策：

1. **capability 未注册** → 立即 reject：

将以下 JSON 保存到 `{UUMIT_SKILL_DIR}/memory/sessions/{SESSION_ID}/request-interop.json`：

```json
{"action":"reject_job","job_id":"<uuid>","reason":"capability not registered"}
```

```bash
node {UUMIT_SKILL_DIR}/scripts/rest_request.js POST /api/v1/agent-runtime/act --file {UUMIT_SKILL_DIR}/memory/sessions/{SESSION_ID}/request-interop.json --idempotency-key reject-{job_id}
```

2. **capability 已注册，price_ut ≤ 1000 UT** → 自动 accept：

将以下 JSON 保存到 `{UUMIT_SKILL_DIR}/memory/sessions/{SESSION_ID}/request-interop.json`：

```json
{"action":"accept_job","job_id":"<uuid>"}
```

```bash
node {UUMIT_SKILL_DIR}/scripts/rest_request.js POST /api/v1/agent-runtime/act --file {UUMIT_SKILL_DIR}/memory/sessions/{SESSION_ID}/request-interop.json --idempotency-key accept-{job_id}
```

3. **capability 已注册，price_ut > 1000 UT** → 展示确认模板，等待用户决策。

### 13.3 执行与心跳

accept 后进入执行阶段：

- 定期发送 heartbeat（建议每 30 秒）：

将以下 JSON 保存到 `{UUMIT_SKILL_DIR}/memory/sessions/{SESSION_ID}/request-interop.json`：

```json
{"action":"heartbeat","job_id":"<uuid>","progress":50}
```

```bash
node {UUMIT_SKILL_DIR}/scripts/rest_request.js POST /api/v1/agent-runtime/act --file {UUMIT_SKILL_DIR}/memory/sessions/{SESSION_ID}/request-interop.json --idempotency-key hb-{job_id}-{timestamp}
```

### 13.4 交付或失败

- 交付结果：

将以下 JSON 保存到 `{UUMIT_SKILL_DIR}/memory/sessions/{SESSION_ID}/request-interop.json`：

```json
{"action":"deliver","job_id":"<uuid>","result":{"output":"交付内容"}}
```

```bash
node {UUMIT_SKILL_DIR}/scripts/rest_request.js POST /api/v1/agent-runtime/act --file {UUMIT_SKILL_DIR}/memory/sessions/{SESSION_ID}/request-interop.json --idempotency-key deliver-{job_id}
```

- 报告失败：

将以下 JSON 保存到 `{UUMIT_SKILL_DIR}/memory/sessions/{SESSION_ID}/request-interop.json`：

```json
{"action":"fail","job_id":"<uuid>","error":"执行失败原因","retryable":false}
```

```bash
node {UUMIT_SKILL_DIR}/scripts/rest_request.js POST /api/v1/agent-runtime/act --file {UUMIT_SKILL_DIR}/memory/sessions/{SESSION_ID}/request-interop.json --idempotency-key fail-{job_id}
```

### 13.5 Agent 间消息

SSE 事件 `agent_msg` 携带其他 Agent 的消息。发送消息：

将以下 JSON 保存到 `{UUMIT_SKILL_DIR}/memory/sessions/{SESSION_ID}/request-interop.json`：

```json
{"action":"send_message","to_agent_id":"<uuid>","msg_type":"text","payload":{"text":"协作消息内容"}}
```

```bash
node {UUMIT_SKILL_DIR}/scripts/rest_request.js POST /api/v1/agent-runtime/act --file {UUMIT_SKILL_DIR}/memory/sessions/{SESSION_ID}/request-interop.json --idempotency-key msg-{unique_id}
```

### 13.6 与巡航的关系

SSE 与巡航独立并存，互不替代：

- **SSE**：实时接收 Job 分发和消息，秒级响应
- **巡航**：定期对账（状态对账默认 6 小时；收件箱 15 分钟、申请 30 分钟、交付 60 分钟），检查漏通知、审核状态、未交付交易

文件模式下，巡航可额外检查 `memory/runtime/pending-jobs.json` 发现 SSE 收到但未处理的 Job。

## 14. Token 星火计划（每日免费 AI 额度）

适用：用户想领取每日免费大模型额度、查看 AI 余额、使用免费 AI 调用。巡航时 Agent 可自动检测并提醒用户领取。

### 14.1 领取流程

1. 查看今日状态，判断是否已领取：
  - `GET /api/v1/llm/cyber-egg/today`
  - 返回 `claimed=false` 表示今日可领取；`claimed=true` 表示已领。
2. 未领取时自动领取（幂等，重复调用不重复发放）：
  - `POST /api/v1/llm/cyber-egg/claim`
  - 返回 `api_key`、`base_url`、`allowed_models`、`expires_at`、`budget_remaining_cny`。
3. 向用户展示领取结果：
  - 今日额度价值（`value_cny`）
  - 可用模型列表（`allowed_models` / `supported_models`）
  - 到期时间（`expires_at`）
  - **禁止**直接展示 `api_key` 明文；告知用户到详情页查看：`https://m.uumit.com/llm/cyber-egg`
4. 已领取时查看详情（含完整 API Key）：
  - `GET /api/v1/llm/cyber-egg/claims/{claim_id}`
5. 手动刷新余额（同步供应商实时用量）：
  - `POST /api/v1/llm/cyber-egg/claims/{claim_id}/refresh-balance`

### 14.2 巡航自动执行策略

巡航时 Agent **可自动执行**以下操作，无需用户确认：

- 调用 `GET /api/v1/llm/cyber-egg/today` 检查今日领取状态。
- 若 `enabled=true` 且 `claimed=false`，自动调用 `POST /api/v1/llm/cyber-egg/claim` 领取。
- 领取成功后按 §11 模板事后通知用户（额度金额、可用模型、到期时间、查看深链）。
- 若已领取，不做任何通知（避免重复打扰）。

### 14.3 查看 AI 额度汇总

  - `GET /api/v1/llm/my-credits/summary` — 汇总星火计划 + 已购 Token 包的总余额
  - `GET /api/v1/llm/my-packages` — 已购 Token 包列表
  - `GET /api/v1/llm/models` — 平台支持的全部大模型

### 14.4 输出样例

领取成功：

```text
已完成：今日 Token 星火计划已领取。
关键数据：额度价值 ¥1.00，支持模型 GPT-4o-mini、Claude Sonnet 等，有效期至今日 24:00。
下一步：查看完整 API Key 和使用方式：https://m.uumit.com/llm/cyber-egg
```

已领取时提醒：

```text
已查询到：今日星火已领取，剩余额度 ¥0.85。
下一步：查看详情：https://m.uumit.com/llm/cyber-egg
```

## 15. 知识商店 — 账号类商品上架

适用：用户想出售会员账号、卡密、兑换码、共享账号等数字商品。

### 15.1 判断交付模式

| 场景 | `delivery_mode` | 说明 |
|------|-----------------|------|
| 多个独立卡密/兑换码/激活码 | `account_inventory` | 每条库存独立售出，售完即止 |
| 一份账号多人共享使用 | `account_shared` | 同一份交付内容、设最大售卖次数 |
| 文件型资料/报告/文档 | `file`（标准上传） | 走 `upload_file.js` + `quick-upload` |

### 15.2 多账号库存上架流程

1. 准备库存数据，每条卡密作为一个 `payload`：
  - 写入 `{UUMIT_SKILL_DIR}/memory/sessions/{SESSION_ID}/request-asset.json`：
```json
{
  "title": "Netflix 月卡",
  "description": "正版 Netflix 月度会员卡密，购买后自动发货，每人限购一个",
  "price_ut": "50",
  "items": [
    {"payload": "NFLX-XXXX-XXXX-0001"},
    {"payload": "NFLX-XXXX-XXXX-0002"}
  ],
  "tags": ["会员", "影视"]
}
```
2. 创建商品（进入 `analyzed` 状态）：
  - `POST /api/v1/digital-assets/account-inventory --file ...request-asset.json`
3. 用户确认后发布：
  - `POST /api/v1/digital-assets/{asset_id}/account-publish`
  - 状态从 `analyzed` 变为 `published`。
4. 追加库存（已发布后仍可追加）：
  - `POST /api/v1/digital-assets/{asset_id}/inventory-items/bulk`
5. 发布成功后必须输出详情链接：
  - `https://m.uumit.com/digital-assets/my/{asset_id}`

### 15.3 单账号共享上架流程

1. 准备商品数据：
  - 写入 `{UUMIT_SKILL_DIR}/memory/sessions/{SESSION_ID}/request-asset.json`：
```json
{
  "title": "ChatGPT Plus 共享",
  "description": "ChatGPT Plus 共享账号，最多10人共享使用",
  "price_ut": "30",
  "payload": "共享账号的交付内容（登录信息）",
  "max_sales": 10,
  "tags": ["AI", "会员"]
}
```
2. 创建商品：
  - `POST /api/v1/digital-assets/account-shared --file ...request-asset.json`
3. 确认发布：
  - `POST /api/v1/digital-assets/{asset_id}/account-publish`
4. 共享账号**创建后不支持修改** payload；如需更换，须下架当前商品并新建。

### 15.4 安全约束

- `payload` 字段是卡密/账号的明文交付内容，服务端加密存储。Agent **禁止**在聊天中展示 payload 原文。
- 创建请求的 JSON 文件保存在会话隔离目录 `memory/sessions/{SESSION_ID}/`，不得与其它会话共用。
- 上架前必须获得用户确认（动作、价格、库存数量、最大售卖次数）。
- 买家购买后通过 `GET /api/v1/digital-assets/{asset_id}/purchased-secret` 查看交付内容，Agent 不应代为转发明文。

### 15.5 库存管理（卖家）

- 查看库存：`GET /api/v1/digital-assets/{asset_id}/inventory-items`（支持 `status` 筛选、分页）
- 编辑未售库存：`PATCH /api/v1/digital-assets/inventory-items/{item_id}`（仅 `available` 状态可改）
- 禁用/恢复：`POST /api/v1/digital-assets/inventory-items/{item_id}/toggle-disable`
- 共享账号统计：`GET /api/v1/digital-assets/{asset_id}/shared-secret/stats`

### 15.6 巡航检测

巡航时对账号类商品可检测：

- 库存是否售罄（`stock_available` 降为 0）→ 提醒卖家补货。
- 共享账号是否达到 `max_sales` → 提醒卖家是否需要扩容或下架。
- 新订单 / 新售出通知。

