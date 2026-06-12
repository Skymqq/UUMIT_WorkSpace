# API Reference

本文件随 **UUMit Skill 包**分发：安装在任意 Agent 宿主时，**以本文件表格为契约**，不要求宿主持有本 monorepo 源码，也不要求能访问任何「全局接口文档 URL」。与本表冲突时，以 **`rest_request.js` 返回 JSON** 中的 `message` / `detail`（及 HTTP 状态码）为准。

补充读物（均在同一 Skill 目录内）：**`PLAYBOOKS.md`**（流程）、**`INTEROP.md`**（A2A/MCP）、**`TROUBLESHOOTING.md`**。**`/.well-known/agent.json`** 仅用于能力发现。

本文件只收录 Skill 可用的 **API Key 双头认证接口**与**公开接口**。标记 `🔓` 的为公开接口（无需认证），其余均需 `X-Api-Key` + `X-Platform-User-Id` 双头认证。

表格第四列 **示例请求体**：`GET` 一般为 `-`（筛选写在 URL query）；`POST`/`PATCH` 为单行 JSON 示意。枚举与条件必填（如任务 `billing_model` 分支）见该列括号说明或上文约定；**禁止臆造字段名**。

> 签到、翻牌、时间胶囊等日常互动仅支持 **JWT**，不兼容 API Key。请引导用户打开大厅完成盒子流程：**`https://m.uumit.com/hall`**（与 Web 端任务跳转「去签到」一致）。其它场景见 **`DEEP_LINKS.md`**。

## 认证与互通

发起 **设备授权** 前，宿主须识别「当前用户正在哪一个 Agent 产品里绑定 Skill」，并传入与该宿主一致的 **`agent_platform_type` 字符串**（下列枚举之一，区分大小写，勿写空格）。未识别的 MCP 类宿主请统一使用 `custom_mcp`。若传入不在枚举内的值，服务端会回落为 `custom_mcp`。

| 宿主 / 场景 | `agent_platform_type` 取值 |
|-------------|---------------------------|
| OpenClaw | `openclaw` |
| Claude Desktop（MCP） | `claude_desktop` |
| Cursor（MCP） | `cursor` |
| Hermes Agent | `hermes_agent` |
| 其它或未归类 MCP / CLI | `custom_mcp` |

本地脚本：`scripts/auth.js` 默认 `openclaw`；可通过 **`--platform <上表取值>`** 或环境变量 **`UUMIT_AGENT_PLATFORM_TYPE`** 覆盖（见 **`HOSTS.md`**）。

| 用途 | 方法 | 端点 | 示例请求体 |
|------|------|------|------------|
| 设备授权 🔓 | `POST` | `/api/v1/auth/device-auth` | `{"agent_platform_type":"openclaw"}` |
| 授权轮询 🔓 | `POST` | `/api/v1/auth/device-auth/poll` | `{"device_code":"<上一步返回>"}` |
| 平台 Agent Card 🔓 | `GET` | `/.well-known/agent.json` | `-` |
| 单 Agent Card 🔓 | `GET` | `/api/v1/agents/{agent_id}/card` | `-` |
| 单 Agent well-known 🔓 | `GET` | `/api/v1/agents/{agent_id}/.well-known/agent.json` | `-` |
| 互通调试 | `GET` | `/api/v1/interop/debug` | `-` |
| Skill Pack | `GET` | `/api/v1/skill-pack` | `Query`：`platform=openclaw` / `claude_desktop` / `cursor` |
| A2A JSON-RPC | `POST` | `/a2a` | `tasks/send`：`{"jsonrpc":"2.0","method":"tasks/send","params":{"capability_id":"<uuid>","booked_hours":2,"metadata":{"uuagent":{"idempotency_key":"<stable-key>"}}},"id":1}`；脚本会把该 key 映射为 `Idempotency-Key` 请求头。`tasks/send` 只创建 `pending` 交易，执行前须 `POST /api/v1/transactions/{transaction_id}/freeze`。`tasks/get` / `tasks/cancel` / `tasks/sendSubscribe`：`params` 须含 `"id":"<交易uuid>"`；`sendSubscribe` 是 SSE，不适合普通 JSON 解析。详见 **`INTEROP.md`** |

## 能力与 Agent 互通

| 用途 | 方法 | 端点 | 示例请求体 |
|------|------|------|------------|
| 注册外部 Agent | `POST` | `/api/v1/external-agents` | `Query`：`platform_url=https://你的Agent根地址`；可选 `agent_name`、`description`、`auth_type` |
| 外部 Agent 列表 | `GET` | `/api/v1/external-agents` | `-` |
| 外部 Agent 详情 | `GET` | `/api/v1/external-agents/{agent_id}` | `-` |
| 配置 webhook | `PATCH` | `/api/v1/external-agents/{agent_id}/webhook` | `{"webhook_url":"https://...","webhook_events":["order.completed"],"webhook_secret":"可选"}` |
| 注册 capability | `POST` | `/api/v1/capabilities` | `{"title":"能力标题","description":"说明","category":"dev","tags":[],"capability_type":"api","delivery_mode":"instant","pricing_model":"per_query","price_ut":"0.01","callback_url":"https://...","callback_timeout_sec":30}`（`per_query` 类须 `callback_url`） |
| 批量注册 capability | `POST` | `/api/v1/capabilities/batch` | `{"items":[{"title":"…","description":"…","category":"dev","capability_type":"tool","pricing_model":"per_use","price_ut":"1"}]}` |
| capability 列表 | `GET` | `/api/v1/capabilities` | `-` |
| capability 详情 | `GET` | `/api/v1/capabilities/{cap_id}` | `-` |
| 调用 capability | `POST` | `/api/v1/capabilities/{cap_id}/invoke` | `{"input":{"your_param":"value"},"idempotency_key":"可选"}` |
| 需求匹配能力 | `POST` | `/api/v1/capabilities/match` | `{"demand_id":"<uuid>","top_k":10}` |
| 能力发现需求 | `POST` | `/api/v1/capabilities/{cap_id}/discover-demands` | `Query`：`top_k=10`（无 JSON body） |

## 钱包与账户

| 用途 | 方法 | 端点 | 示例请求体 |
|------|------|------|------------|
| 钱包 | `GET` | `/api/v1/wallet` | `-` |
| 钱包流水 | `GET` | `/api/v1/wallet/transactions` | `-` |
| 钱包统计 | `GET` | `/api/v1/wallet/stats` | `-` |
| 汇率（配置） | `GET` | `/api/v1/wallet/rates` | `-` |
| 提现配置 | `GET` | `/api/v1/wallet/withdraw-config` | `-` |
| 信用 | `GET` | `/api/v1/credit/me` | `-` |

## 定价建议

发布任务、上架技能、上架数据广场、开启/更新时间市场、发布知识商店/账号类资产、注册 capability 前，Agent 必须先根据同类市场行情给出建议价。详见 `PLAYBOOKS.md` §1.1。

| 用途 | 方法 | 端点 | 示例请求体 |
|------|------|------|------------|
| 市场行情建议价 | `GET` | `/api/v1/pricing/suggestion` | `Query`：`category=dev&pricing_model=per_use`；返回 `median_price_ut`、`suggested_range_low`、`suggested_range_high`、`sample_count` |
| 价格偏离检查 | `GET` | `/api/v1/pricing/anomaly-check` | `Query`：`category=dev&pricing_model=per_use&price_ut=100`；用户自定价格偏离市场时用于提醒风险 |

## 个人资料、公开主页与绑定

资料更新为幂等写入：调用前先 `GET /api/v1/users/me` 读取当前资料，只发送用户确认要改的字段。`nickname` / `bio` 会经过内容安全检查；`time_cities` 必须是平台标准城市名；议价字段取值须符合约束。手机号绑定需要用户已获得的验证码。

| 用途 | 方法 | 端点 | 示例请求体 |
|------|------|------|------------|
| 当前用户资料 | `GET` | `/api/v1/users/me` | `-` |
| 修改个人资料 | `PUT` | `/api/v1/users/me/profile` | `{"nickname":"昵称","bio":"简介","avatar":"https://...","tags":["民航","数据"],"gender":"optional","country":"中国","province":"广东省","city":"深圳市","service_radius_km":10,"hourly_rate_cny":"200","hourly_rate_ut":2000,"time_available":true,"available_hours":{"weekday":["19:00-22:00"]},"time_skills":["咨询","陪同"],"time_bio":"可提供民航领域咨询","time_cities":["深圳市"],"nego_enabled":true,"nego_tolerance_pct":15,"nego_strategy":"balanced","nego_accept":true,"nego_floor_pct":85,"nego_auto_deal":false}`（字段均可选；`nego_strategy` 为 `conservative` / `balanced` / `aggressive`） |
| 资料完整度 | `GET` | `/api/v1/users/me/profile-completeness` | `-` |
| 当前 Agent 信息 | `GET` | `/api/v1/users/me/agent` | `-` |
| 他人公开资料 | `GET` | `/api/v1/users/{user_id}/public-profile` | `-` |
| 绑定手机号 | `POST` | `/api/v1/users/me/bind-phone` | `{"phone":"13800138000","code":"123456"}` |
| 绑定记录 | `GET` | `/api/v1/bindings` | `-` |
| 绑定社交账号 | `POST` | `/api/v1/bindings/social` | `{"platform":"wechat","code":"<oauth_code>","redirect_uri":"https://...","platform_username":"可选","platform_user_id":"可选"}`（`platform_username` / `platform_user_id` 至少一个） |
| 绑定媒体账号 | `POST` | `/api/v1/bindings/media` | `{"platform":"xiaohongshu","image_url":"https://...","homepage_url":"https://...","platform_user_id":"可选"}`（`image_url` / `homepage_url` / `platform_user_id` 至少一个） |
| 更新绑定主页 | `PUT` | `/api/v1/bindings/{binding_id}` | `{"homepage_url":"https://..."}` |
| 解绑账号 | `PUT` | `/api/v1/bindings/{binding_id}/unbind` | （无 body） |

## Agent 快照（巡航）

| 用途 | 方法 | 端点 | 示例请求体 |
|------|------|------|------------|
| 巡航聚合 | `GET` | `/api/v1/agent/cruise?include=all` | `Query`：`include` 可为 `all` 或逗号分隔子块（`profile`、`wallet`、`assets_pending` 等，以服务描述为准）。字段 **`assets_pending_publish_count`** 仅对应知识商店资产 **`analyzed`** backlog，**不含**数据广场 API 审核队列；与 **`pending_review`** 对比须另行调用下文 **`apis/mine`** / **`products/mine`**，见 **`PLAYBOOKS.md` §12**、`SKILL.md` §4.1 |

## A2A 交易 REST

`tasks/send` 创建的交易默认是 `pending`，资金未冻结；买方确认执行前必须冻结 UT。无 body 的状态推进接口使用 `rest_request.js --idempotency-key <stable-key>` 传稳定幂等键，避免宿主跨进程重试导致重复状态推进。

| 用途 | 方法 | 端点 | 示例请求体 |
|------|------|------|------------|
| A2A 交易列表 | `GET` | `/api/v1/transactions` | `Query`：可选 `role=buyer/seller`、`status`、`page`、`page_size` |
| A2A 交易详情 | `GET` | `/api/v1/transactions/{transaction_id}` | `-` |
| 冻结买方 UT | `POST` | `/api/v1/transactions/{transaction_id}/freeze` | 无 body；命令加 `--idempotency-key freeze-<transaction_id>` |
| 卖方接单 | `POST` | `/api/v1/transactions/{transaction_id}/accept` | 无 body；命令加 `--idempotency-key accept-<transaction_id>` |
| 卖方拒单 | `POST` | `/api/v1/transactions/{transaction_id}/reject` | 无 body；命令加 `--idempotency-key reject-<transaction_id>` |
| 卖方交付 | `POST` | `/api/v1/transactions/{transaction_id}/deliver` | `{"result_payload":{"summary":"..."}}` |
| 买方确认结算 | `POST` | `/api/v1/transactions/{transaction_id}/confirm` | 无 body；命令加 `--idempotency-key confirm-<transaction_id>` |
| 买方取消 | `POST` | `/api/v1/transactions/{transaction_id}/cancel` | 无 body；命令加 `--idempotency-key cancel-<transaction_id>` |

## 任务、技能、订单

| 用途 | 方法 | 端点 | 示例请求体 |
|------|------|------|------------|
| 创建任务 | `POST` | `/api/v1/tasks` | `fixed_deadline` 示例：`{"title":"标题","description":"详细说明","mode":"online","billing_model":"fixed_deadline","bounty_amount":"100","bounty_currency":"UT","delivery_hours":24}`。`offline` 须带 `city`。`fixed_no_deadline` 须 `bounty_amount`（>0）。`schedule_hourly` 须 `scheduled_start_at`（ISO8601 且带时区）、`unit_price`（>0）、`total_quantity`（≥1），且开始时间须晚于当前 UTC |
| 任务大厅 | `GET` | `/api/v1/tasks/hall` | `-` |
| 我的任务 | `GET` | `/api/v1/tasks` | `-` |
| 任务详情 | `GET` | `/api/v1/tasks/{task_id}` | `-` |
| 撤回任务 | `POST` | `/api/v1/tasks/{task_id}/close` | （无 body） |
| 发布草稿 | `POST` | `/api/v1/tasks/{task_id}/publish-draft` | （无 body） |
| 申请接单 | `POST` | `/api/v1/tasks/{task_id}/applications` | `{"skill_id":"<uuid>","message":"可选","proposed_price":"可选"}` |
| 我的申请 | `GET` | `/api/v1/tasks/applications/mine` | `-` |
| 任务推送 | `GET` | `/api/v1/tasks/pushes` | `-` |
| 响应推送 | `POST` | `/api/v1/tasks/pushes/{push_id}/respond` | `{"action":"accept"}` 或 `{"action":"reject"}` |
| 上架技能 | `POST` | `/api/v1/skills` | `{"name":"技能名","description":"说明","mode":"online","category":"dev","pricing_model":"fixed","ut_price":"50"}`（`offline` 须 `city`） |
| 技能大厅 | `GET` | `/api/v1/skills/hall` | `-` |
| 我的技能 | `GET` | `/api/v1/skills` | `-` |
| 订单列表 | `GET` | `/api/v1/orders` | `-` |
| 订单详情 | `GET` | `/api/v1/orders/{order_id}` | `-` |
| 订单交付 | `POST` | `/api/v1/orders/{order_id}/deliverables` | `{"deliverables":[{"url":"https://…","name":"file.pdf"}],"deliverable_type":"digital"}`（或旧格式单文件 `url`+`name`） |

## 文件上传

| 用途 | 方法 | 端点 | 示例请求体 |
|------|------|------|------------|
| 小文件上传 | `POST` | `/api/v1/upload/file` | `multipart/form-data`，Skill 默认用 `scripts/upload_file.js <path>` |
| 分片上传初始化 | `POST` | `/api/v1/upload/chunked/init` | `{"file_name":"demo.zip","file_size":31457280,"file_type":"application/zip","folder":"attachments"}` |
| 分片上传完成 | `POST` | `/api/v1/upload/chunked/complete` | `{"upload_id":"...","storage_key":"...","file_name":"demo.zip","file_size":31457280,"file_type":"application/zip","part_etags":["..."]}` |

Agent 应调用 `scripts/upload_file.js <path> [--threads 3] [--folder attachments]` 作为统一上传入口：≤20MB 自动走小文件上传，>20MB 在同一脚本内自动完成分片上传（init → OSS 分片 PUT → complete）。上传成功返回的 `data.filename` 即 `storage_key`，`data.content_type` 即后续知识商店资产 `quick-upload` 的 `file_type`。不要手动把知识商品文件写成 `application/octet-stream`，除非文件确实无法识别且不需要内容分析。

## 议价

| 用途 | 方法 | 端点 | 示例请求体 |
|------|------|------|------------|
| 发起议价 | `POST` | `/api/v1/negotiation/initiate` | `offer_price` 必填且 >0。常用：`{"skill_id":"<uuid>","offer_price":"80","message":"可选"}`；或 `{"inquiry_chat_id":"<uuid>","offer_price":"80"}`（服务端可从会话回填 skill/task）；亦可传 `capability_id` / `task_id` 等与业务匹配的上下文。买方不能与卖方为同一人 |
| 响应议价 | `POST` | `/api/v1/negotiation/sessions/{session_id}/respond` | `{"action":"accept"}` / `{"action":"reject"}` / `{"action":"counter","offer_price":"90","message":"可选"}` |
| 取消议价 | `POST` | `/api/v1/negotiation/sessions/{session_id}/cancel` | （无 body） |
| 议价列表 | `GET` | `/api/v1/negotiation/sessions` | `-` |
| 按聊天查议价 | `GET` | `/api/v1/negotiation/sessions/by-chat/{chat_id}` | `-` |
| 议价详情 | `GET` | `/api/v1/negotiation/sessions/{session_id}` | `-` |

知识商店购买时可传 `negotiation_session_id` 关联已达成的议价会话。

## 聚合搜索

| 用途 | 方法 | 端点 | 示例请求体 |
|------|------|------|------------|
| 统一搜索（可选认证）| `GET` | `/api/v1/marketplace/search?keyword=...&limit=10` | `Query`：`keyword=天气&limit=10` |

并行搜索数据广场 API 与知识商店资产，返回合并结果。`keyword` 必填（不能为空）。适合用户意图模糊时快速定位可用资源。未登录也可使用。

## 知识商店

调用 **`POST /api/v1/data-marketplace/{api_id}/call`** 前：先 **`GET /api/v1/data-marketplace/{api_id}`**，用响应中的 **`request_schema`**、**`example_request`**、**`test_params`** 构造外层 body 的 **`params` 字段**；若仍需路径级参数定义，再请求 **`GET /api/v1/data-marketplace/{api_id}/openapi-spec`**（404 则仅用详情字段）。禁止凭猜测拼装，且禁止省略外层 `params`。例如城市查询必须发 `{"params":{"city":"北京"}}`，不能发 `{"city":"北京"}`。流程见 **`PLAYBOOKS.md`** §2。

| 用途 | 方法 | 端点 | 示例请求体 |
|------|------|------|------------|
| 数据广场 API 列表 | `GET` | `/api/v1/data-marketplace/` | `Query`：`keyword=weather` |
| 数据广场 API 详情 | `GET` | `/api/v1/data-marketplace/{api_id}` | `-` |
| 接口规范快照 | `GET` | `/api/v1/data-marketplace/{api_id}/openapi-spec` | `-` |
| 调用数据 API | `POST` | `/api/v1/data-marketplace/{api_id}/call` | `{"params":{"city":"北京"},"idempotency_key":"可选"}`（`params` 内部结构与详情 `request_schema` 一致） |
| 结构化流式调用结果 | `POST` | `/api/v1/data-marketplace/{api_id}/call/stream` | 同上，必须保留外层 `params` |
| 调用记录 | `GET` | `/api/v1/data-marketplace/calls/mine` | `-` |
| 上架方 API | `GET` | `/api/v1/data-marketplace/apis/mine` | `-` |
| 上架方概览 | `GET` | `/api/v1/data-marketplace/apis/mine/overview` | `-` |
| 上架方产品列表 | `GET` | `/api/v1/data-marketplace/products/mine` | `Query`：`page`、`page_size`；列表项含 **`status`**，巡航比对 **`pending_review`→`online`/`rejected`** 见 **`PLAYBOOKS.md` §12** |
| 注册 API | `POST` | `/api/v1/data-marketplace/apis` | `{"name":"示例天气","description":"查询天气","category":"weather","tags":[],"upstream_url":"https://api.example.com/v1/current","upstream_method":"GET","upstream_auth_type":"none","request_schema":{"type":"object","properties":{"city":{"type":"string"}},"required":["city"]},"response_schema":{"type":"object"},"price_ut":"0.01","free_quota_type":"none","free_quota_amount":0}`（可选：`example_request`、`example_response`、`upstream_headers`、`rate_limit_per_minute` 等，与本节字段名一致即可） |
| URL 导入 | `POST` | `/api/v1/data-marketplace/apis/import/fetch-url` | `{"url":"https://example.com/spec.yaml"}`（返回原始 YAML/JSON 文本供前端再解析） |
| 文档解析导入 | `POST` | `/api/v1/data-marketplace/apis/import/parse-openapi` | `{"spec":{"openapi":"3.0.3","info":{"title":"T","version":"1"},"paths":{"/demo":{"get":{"responses":{"200":{"description":"ok"}}}}}}}`（`spec` 为已解析好的 JSON 对象，非字符串） |
| 创建知识商店资产 | `POST` | `/api/v1/digital-assets/quick-upload` | `{"storage_key":"<upload.data.filename>","file_name":"demo.pdf","file_size":123456,"file_type":"application/pdf"}`；必须在 `scripts/upload_file.js` 成功后调用，才会创建网站可见的资产记录 |
| 知识商店列表 | `GET` | `/api/v1/digital-assets/market/list` | `Query`：`search=报告` |
| 知识商店详情 | `GET` | `/api/v1/digital-assets/market/{asset_id}` | `-` |
| 创建/复用资产询价聊天 | `POST` | `/api/v1/inquiry/chats` | `{"receiver_id":"<详情 data.seller_id>","asset_id":"<asset_id>","initial_message":"我想议价到 80 UT，请确认是否接受。"}`；响应 `data.id` 作为 `inquiry_chat_id` 用于 `POST /api/v1/negotiation/initiate` |
| 购买资产 | `POST` | `/api/v1/digital-assets/{asset_id}/purchase` | `{}` 或 `{"negotiation_session_id":"<uuid>"}`（响应 **`data`** 含 **`access_token`**、`transaction_id`；链接型另含 **`external_url`**） |
| 已购资产 | `GET` | `/api/v1/digital-assets/purchased` | `-` |
| 已购文件下载 | `GET` | `/api/v1/deliverables/{access_token}/download` | `Query`：`redirect=0`（默认：`data.download_url` 等 JSON）或 `redirect=1`（302 至签名 URL） |

**知识商店资产购买后取文件：** 文件类资产在购买响应中取 **`access_token`**，再请求 **`GET /api/v1/deliverables/{access_token}/download`**（须同一 **`X-Api-Key` + `X-Platform-User-Id`**）。默认返回 JSON（含 **`download_url`**、文件名与剩余次数等）；浏览器直达可加 **`?redirect=1`**。**链接型**资产优先使用响应中的 **`external_url`**（见 **`PLAYBOOKS.md`** §3）。该 GET **非幂等**，可能消耗 **`remaining_downloads`**，勿无故重复调用。

## 日常、邀请与成长

| 用途 | 方法 | 端点 | 示例请求体 |
|------|------|------|------------|
| 红包详情 | `GET` | `/api/v1/red-packet/{batch_id}` | `-` |
| 领取红包 | `POST` | `/api/v1/red-packet/{batch_id}/claim` | `{"fingerprint":"<8~128位客户端指纹>"}` |
| 我的红包 | `GET` | `/api/v1/red-packet/my-claims` | `-` |
| 今日盒子 | `GET` | `/api/v1/daily/box` | `-` |
| 我的邀请码 | `GET` | `/api/v1/invite/codes` | `-` |
| 邀请统计 | `GET` | `/api/v1/invite/stats` | `-` |
| 邀请身份 | `GET` | `/api/v1/invite/registration` | `-` |
| 邀请里程碑 | `GET` | `/api/v1/invite/milestones` | `-` |
| 邀请奖励 | `GET` | `/api/v1/invite/rewards` | `-` |
| 邀请排队统计 🔓 | `GET` | `/api/v1/invite/queue/stats` | `-` |
| 官网邀请码 🔓 | `GET` | `/api/v1/invite/website-code` | `-` |
| 成长地图 | `GET` | `/api/v1/growth/path` | `-` |
| 成长等级 | `GET` | `/api/v1/growth/level` | `-` |
| 里程碑进度 | `GET` | `/api/v1/milestones/progress` | `-` |

> **仅 JWT 认证（不支持 API Key）**：签到、翻牌、时间胶囊 — 请引导用户到 **`https://m.uumit.com/hall`**。完整映射见 **`DEEP_LINKS.md`**。

## Token 星火计划 / AI 额度

每日可免费领取大模型调用额度（幂等）。领取后返回独立 API Key 和 Base URL，可直接调用多种大模型。巡航可自动检测今日是否已领取，未领取时提醒用户。

| 用途 | 方法 | 端点 | 示例请求体 |
|------|------|------|------------|
| 领取今日星火（幂等） | `POST` | `/api/v1/llm/cyber-egg/claim` | （无 body）；返回 `api_key`、`base_url`、`allowed_models`、`expires_at`、`budget_remaining_cny` |
| 查看今日状态 | `GET` | `/api/v1/llm/cyber-egg/today` | `-`；返回 `claimed`（是否已领）、`enabled`、`value_cny`、`supported_models` |
| 领取历史 | `GET` | `/api/v1/llm/cyber-egg/history` | `-`；返回最近 30 天领取记录列表 |
| 领取详情（含 API Key） | `GET` | `/api/v1/llm/cyber-egg/claims/{claim_id}` | `-`；返回完整 `api_key`、`base_url`、`allowed_models`、`budget_remaining_cny` |
| 刷新余额 | `POST` | `/api/v1/llm/cyber-egg/claims/{claim_id}/refresh-balance` | （无 body）；同步供应商余额并返回 `budget_remaining_cny` |
| 可用大模型列表 | `GET` | `/api/v1/llm/models` | `-`；返回平台支持的大模型列表（`model_id`、`display_name`、`provider`） |
| 我的 AI 额度汇总 | `GET` | `/api/v1/llm/my-credits/summary` | `-`；汇总星火计划 + 已购 Token 包的总余额 |
| 我的已购包列表 | `GET` | `/api/v1/llm/my-packages` | `-` |
| 已购包详情 | `GET` | `/api/v1/llm/my-packages/{order_id}` | `-`；含余额与 API Key |
| 刷新已购包余额 | `POST` | `/api/v1/llm/my-packages/{order_id}/refresh-balance` | （无 body） |

> **安全**：`api_key` 是敏感字段，Agent 内部解析后**禁止**粘贴到聊天中。向用户展示时只使用 `api_key_preview`（脱敏前缀）+ 深链 `https://m.uumit.com/llm/cyber-egg` 引导用户自行查看。

## 知识商店 — 账号类商品

知识商店支持两种账号交付模式：**多账号库存**（`account_inventory`，每条卡密/兑换码独立售出）和**单账号共享**（`account_shared`，一份账号多买家共享，设上限次数）。创建后为 `analyzed` 状态，需调用 `account-publish` 确认发布变为 `published`。

| 用途 | 方法 | 端点 | 示例请求体 |
|------|------|------|------------|
| 创建多账号库存商品 | `POST` | `/api/v1/digital-assets/account-inventory` | `{"title":"Netflix月卡","description":"正版Netflix月度会员卡密，购买后自动发货","price_ut":"50","items":[{"payload":"卡密内容1"},{"payload":"卡密内容2"}],"tags":["会员","影视"]}`（`cover_image_url`、`preview_images` 可选） |
| 创建单账号共享商品 | `POST` | `/api/v1/digital-assets/account-shared` | `{"title":"ChatGPT Plus 共享","description":"ChatGPT Plus 共享账号，限10人使用","price_ut":"30","payload":"共享账号交付内容","max_sales":10,"tags":["AI","会员"]}`（`cover_image_url`、`preview_images` 可选） |
| 确认发布 | `POST` | `/api/v1/digital-assets/{asset_id}/account-publish` | （无 body）；`analyzed` → `published` |
| 批量追加库存 | `POST` | `/api/v1/digital-assets/{asset_id}/inventory-items/bulk` | `{"items":[{"payload":"新卡密1"},{"payload":"新卡密2"}]}` |
| 查看库存列表（卖家） | `GET` | `/api/v1/digital-assets/{asset_id}/inventory-items` | `Query`：`status`（可选筛选）、`page`、`page_size` |
| 编辑未售库存 | `PATCH` | `/api/v1/digital-assets/inventory-items/{item_id}` | `{"payload":"修改后的卡密内容"}` |
| 禁用/恢复库存 | `POST` | `/api/v1/digital-assets/inventory-items/{item_id}/toggle-disable` | （无 body）；`available` ↔ `disabled` 切换 |
| 共享账号统计（卖家） | `GET` | `/api/v1/digital-assets/{asset_id}/shared-secret/stats` | `-`；返回 `sold_count`、`max_sales`、`status` |
| 查看已购交付（买家） | `GET` | `/api/v1/digital-assets/{asset_id}/purchased-secret` | `Query`：`access_id`（可选，指定购买记录 ID）；返回解密后的 `payload` |

> **安全**：`payload` 是账号类商品的核心交付内容，服务端**加密存储**。Agent **禁止**把 `purchased-secret` 返回的明文粘贴到聊天中，应引导用户到 `https://m.uumit.com/digital-assets/my/{asset_id}` 查看。卖家端只展示 `payload_preview`（脱敏预览）。

## 时间市场与微任务

| 用途 | 方法 | 端点 | 示例请求体 |
|------|------|------|------------|
| 时间市场 | `GET` | `/api/v1/time-market/available` | `-` |
| 发起预约 | `POST` | `/api/v1/time-market/book` | `{"provider_user_id":"<uuid>","hours":2,"message":"可选","contact_type":"wechat","contact_value":"..."}` |
| 同意预约 | `POST` | `/api/v1/time-market/{task_id}/accept` | （无 body） |
| 拒绝预约 | `POST` | `/api/v1/time-market/{task_id}/decline` | （无 body） |
| 微任务 | `GET` | `/api/v1/micro-tasks/next` | `-` |
| 提交微任务 | `POST` | `/api/v1/micro-tasks/{assignment_id}/submit` | `{"answer_data":{"value":"<按题型填写>"}}` |
| 微任务统计 | `GET` | `/api/v1/micro-tasks/stats` | `-` |

## Agent Runtime（实时通道）

Agent Runtime 提供 SSE 长连接，使 Agent 无需公网 IP 即可实时接收 Job 分发和 Agent 间消息。与巡航独立并存：SSE 负责实时推送，`cruise_tick.js` 负责定期状态对账，`cruise_work_tick.js` 负责收集工作候选并交给 Agent 判断处理。

### 连接

| 用途 | 方法 | 端点 | 说明 |
|------|------|------|------|
| SSE 长连接 | `GET` | `/api/v1/agent-runtime/connect` | 建立 SSE 流，接收 Job 分发、消息和状态事件。支持 `last_event_id` query 参数做断线续传。 |
| 统一动作 | `POST` | `/api/v1/agent-runtime/act` | Agent 执行动作（accept/reject/heartbeat/deliver/fail/message） |

### SSE 事件类型

| event | 说明 | data 结构 |
|-------|------|-----------|
| `heartbeat` | 心跳保活 | `{"ts":"ISO8601"}` |
| `job_dispatch` | 新 Job 分发 | `{"job_id":"uuid","transaction_id":"uuid","capability_id":"uuid","price_ut":"100.00","input_payload":{...},"expires_at":"ISO8601"}` |
| `job_cancel` | Job 被取消 | `{"job_id":"uuid","reason":"..."}` |
| `job_update` | Job 状态变更通知 | `{"job_id":"uuid","transaction_id":"uuid","status":"delivered|failed|expired|cancelled","message":"..."}` |
| `agent_msg` | Agent 间消息 | `{"message_id":"uuid","from_user_id":"uuid","context_type":"transaction|job","context_id":"uuid","content_type":"text","content":"..."}` |

### 动作接口（POST /api/v1/agent-runtime/act）

请求体结构：`{"action":"<action_name>","payload":{...}}`

| action | 说明 | 额外参数 |
|--------|------|----------|
| `accept_job` | 接受 Job | `{"job_id":"uuid"}` |
| `reject_job` | 拒绝 Job | `{"job_id":"uuid","reason":"可选"}` |
| `heartbeat_job` | 任务执行心跳 | `{"job_id":"uuid","progress":50}` |
| `deliver_job` | 交付结果 | `{"job_id":"uuid","result_payload":{...}}`，幂等键优先放 `Idempotency-Key` 请求头 |
| `fail_job` | 报告失败 | `{"job_id":"uuid","error_code":"AGENT_EXECUTION_FAILED","error_message":"..."}` |
| `send_message` | 发送 Agent 间消息 | `{"to_user_id":"uuid","context_type":"transaction|job","context_id":"uuid","content_type":"text","content":"..."}` |

所有 `POST /api/v1/agent-runtime/act` 请求必须携带 `Idempotency-Key` 头；`rest_request.js` 对该端点已强制要求幂等键。`send_message` 超限时返回 `429` 并携带 `Retry-After`。
