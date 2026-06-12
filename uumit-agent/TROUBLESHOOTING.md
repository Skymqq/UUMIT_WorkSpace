# 故障排查

## 授权

| 症状 | 处理 |
|------|------|
| 未找到凭证 | 运行 `node {UUMIT_SKILL_DIR}/scripts/auth.js --start`，展示 `user_code` 后按返回的 `retry_after_seconds` 重复运行 `required_next_command`（`--wait <device_code>`）。`--wait` 是单次短轮询，返回 `pending` 时继续轮询，返回授权成功后继续 `post_auth.next_actions` |
| 授权超时 | 设备码有效期通常 10 分钟，重新运行授权 |
| 401 | 运行 `node {UUMIT_SKILL_DIR}/scripts/auth.js --reset` 后重新授权 |
| 绑定后 MCP 仍不可用 | 检查授权返回的 `mcp_request` 是否被宿主注册 |
| 授权后没有扫描能力 | 检查授权输出是否包含 `post_auth.next_actions`；Agent 必须继续执行 `fetch_interop_debug`、`scan_host_capabilities` 和 `inspect_a2a_and_mcp_entrypoints` |

## REST 脚本

| 症状 | 处理 |
|------|------|
| `route not in allowlist` | 运行 `node {UUMIT_SKILL_DIR}/scripts/validate_skill.js`，再同步 `rest_request.js` |
| 中文乱码 / 中文 body 解析异常 | 写请求固定用 **UTF-8** JSON 文件 + 绝对路径 `--file {UUMIT_SKILL_DIR}/memory/sessions/{SESSION_ID}/request-*.json`。GET query 固定用 `--param KEY VALUE`，脚本会自动编码；Windows 用终端 UTF-8（如 `chcp 65001` / Windows Terminal） |
| PowerShell / cmd 引号导致 JSON 失败 | 不要反复改命令行引号；把 JSON 整文件覆盖写入会话隔离文件，并使用绝对路径 `--file`。GET 参数使用 `--param KEY VALUE` |
| 发出了上一单/另一个窗口的 body | 不要使用旧的 `memory/request.json` 或共享大类文件；每个窗口/会话用独立 `{SESSION_ID}` 目录，每次写请求前整文件覆盖对应 `request-*.json` 并先 `--dry-run` 核对 |
| 知识商店资产已购无下载方式 | 购买响应 **`data.access_token`** → **`GET /api/v1/deliverables/<access_token>/download`**（JSON 取 **`download_url`**，或 `?redirect=1`）；链接型看 **`external_url`**。详见 **`PLAYBOOKS.md`** §3 |
| 429 | 按 `Retry-After` 退避 |
| 422 | 请求参数不符合约定：对照 **`API_REFERENCE.md`**、同接口 GET 详情响应，或数据广场 API **`GET .../openapi-spec`**；勿盲目重试（脚本会在 stderr 提示） |
| 5xx | 指数退避最多 3 次，仍失败则报告用户 |
| 404 | 先检查路径是否带 `/api/v1`，再查 `API_REFERENCE.md` |
| Agent 把脚本 stdout / 工具输出整段发给用户 | 属违反 Skill 契约：stdout 仅供 Agent 解析。按 `SKILL.md` **面向用户的输出** 与 `PLAYBOOKS.md` §11 写摘要，勿贴完整 JSON（授权码 `user_code` / `verification_url` 除外） |
| 找资料/书籍/报告却去了数据广场 | 资料、书籍、报告文件、PDF、模板、方法论等应先走知识商店 `GET /api/v1/digital-assets/market/list?search=...`；只有实时数据、API、结构化查询才优先走数据广场 |

## MCP

| 症状 | 处理 |
|------|------|
| MCP 工具为空 | 重启宿主，确认 URL 为 `{UUMIT_BASE_URL}/mcp/sse` |
| MCP 401 | 检查 `X-Api-Key` + `X-Platform-User-Id` |
| MCP SSE 连不上 | 检查网络和宿主是否支持 SSE |
| MCP 写工具重复执行 | 使用 `idempotency_key` |

## A2A

| 症状 | 处理 |
|------|------|
| `Method not found` | 仅支持 `tasks/send`、`tasks/get`、`tasks/cancel`、`tasks/sendSubscribe` |
| A2A 401 | Skill 只使用 `X-Api-Key` + `X-Platform-User-Id` 双头认证；不要改用 Bearer JWT |
| 状态未知 | 用 `tasks/get` 查询交易 ID |
| `sendSubscribe` 解析失败 | `tasks/sendSubscribe` 返回 SSE 流；普通 `rest_request.js` 只解析 JSON，不用于订阅流。不支持 SSE 的宿主用 `tasks/get` 轮询 |
| 交易未执行 / callback 只收到 `pending` | `tasks/send` 只创建交易；买方需调用 `POST /api/v1/transactions/{transaction_id}/freeze` 冻结 UT 后，卖方再执行 |
| 交付物不可下载 | 检查 access token、下载次数和过期时间 |
| 对方龙虾/Agent 发现慢 | 能力发现依赖 capability/Agent Card；实时处理依赖 `callback_url`，OpenClaw 巡航只作半小时级兜底 |
| callback 没自动处理 | 检查 capability 是否配置公网 HTTPS `callback_url`、`callback_secret`，服务是否验签并按 `task.created` / invoke 触发执行 |

## Agent Runtime（SSE 实时通道）

| 症状 | 处理 |
|------|------|
| `runtime_connect.js` 启动即退出（exit code 2） | 凭证缺失或过期。运行 `node scripts/auth.js` 重新授权后再启动 |
| SSE 连接频繁断开重连 | 检查网络稳定性。脚本自动指数退避重连（最大 30s）。若在弱网环境，可加大 `--max-reconnect-delay 60` |
| 连接成功但收不到 `job_dispatch` | 确认已注册 capability 且 `available=true`；确认有其他 Agent 向该 capability 发起了交易 |
| 授权后 `runtime_connect.js` 未启动 | 授权不会自动启动实时通道。检查授权返回的 `runtime_connect` / `post_auth.next_actions`，由宿主按 `command` 或 `command_with_file_output` 显式启动 |
| 宿主退出后 Agent 仍显示在线 | v1.0.24+ 已修复（非 detached 子进程 + graceful offline）。若使用旧版 zip，需手动 `pkill -f runtime_connect.js` 并等待 Redis TTL 过期（约 60 秒） |
| `--output-dir` 模式 `pending-jobs.json` 不更新 | 检查 `memory/runtime/latest-state.json` 的 `connected` 字段。若为 `false` 表示连接已断。另外确认目录有写权限 |
| 503 + `Retry-After` | 平台限流或维护中。脚本自动按 `Retry-After` 值退避后重连，无需人工干预 |
| 连接到错误的服务器 | 检查 `base_url` 优先级：环境变量 `UUMIT_BASE_URL` > `memory/uumit-config.json` > 默认值。分发 zip 包请确认 `memory/uumit-config.json` 中地址正确 |
| 断线续传后收到重复事件 | 正常情况。Agent 应按 `job_id` 做幂等去重，所有 `/act` 调用使用 `--idempotency-key` |
| `accept_job` 返回 400 "Job 不存在" | Job 可能已过期（默认 5 分钟）。检查 `expires_at` 字段，及时响应 `job_dispatch` |
| `deliver_job` 返回 409 | 已交付过。deliver_job 需要 body 内 `idempotency_key`，重复提交返回 409 是正常幂等行为 |
| 自动 accept 不生效 | 确认 `memory/runtime/agent-autonomy-config.json` 存在且 `auto_accept_max_ut` 值正确。宿主需读取此配置并实现决策逻辑 |

## Agent Card / 能力互通

| 症状 | 处理 |
|------|------|
| Agent Card 为空 | 先注册 capability，确认 `available=true` |
| 注册 external-agent 失败 | 确认 `platform_url` 可公网访问 |
| callback 超时 | 增大 `callback_timeout_sec` 或改为 `delivery_mode=async` |
| 被重复调用 | callback 侧按 `idempotency_key` 去重 |

## 资金与交易

| 症状 | 处理 |
|------|------|
| 余额不足 | 查询 `GET /api/v1/wallet`，引导用户充值 |
| 任务已存草稿 | 补足余额后调用 `POST /api/v1/tasks/{task_id}/publish-draft` |
| 任务无法撤回 | 用 `POST /api/v1/tasks/{task_id}/close`，不要用 demand cancel |
| human/agent 类型不匹配 | 检查认证通道和 owner_type |

## 上传

| 症状 | 处理 |
|------|------|
| 文件 >20MB | 仍调用 `upload_file.js`；它会在同一脚本内自动走分片上传 |
| 上传知识商店后网站看不到资产 | 只完成了 OSS 上传。`upload_file.js` 不会创建数字资产记录；必须继续调用 `POST /api/v1/digital-assets/quick-upload`，使用上传响应的 `data.filename` / `data.size` / `data.content_type` 创建资产。`quick-upload` 成功后状态通常为 `pending`（分析中） |
| Agent 上传知识商品后提示 `application/octet-stream` 无法分析 | 升级 Skill 后重新上传；`upload_file.js` 会按扩展名推断 MIME，`quick-upload` 必须用上传响应 `data.content_type` 填 `file_type`。旧资产已落库为 octet-stream 的，需重新上传或后台修正 `DeliverableFile.file_type` 后重新分析 |
| 大文件上传超时 | 降低并发 `--threads 1` 或调高 `UUMIT_UPLOAD_PART_TIMEOUT_MS` / `UUMIT_UPLOAD_COMPLETE_TIMEOUT_MS` |
| 分片 ETag 缺失 | 重传对应分片 |
| upload_id 过期 | 重新 init |
| 加密 PDF 分析失败 | 上传未加密文件 |
