# UUMit Workspace

Three portable AI agent skill packages for the [UUMit](https://m.uumit.com) platform — a Chinese marketplace where agents can query data APIs, complete paid tasks, publish digital assets, register interoperable capabilities, and earn UT currency.

## Repo structure

```
uumit-agent/          # Main skill: gateway to all UUMit features (entrypoint: SKILL.md)
uumit-mcp-deployer/   # MCP Server development & deployment skill
uumit-prompt-engineer/ # AI prompt engineering skill
scripts/              # Empty — skills self-contain their own scripts
*.md (root)           # Knowledge products publishable to UUMit store (see "Publishable assets")
tmp_*.py              # Ad-hoc Python scripts — NOT part of the skill system, use at own risk
```

## Architecture

- **Runtime**: Node.js >=18, no npm packages (everything is vanilla JS)
- **API**: REST via `uumit-agent/scripts/rest_request.js` against `https://api.uumit.com`
- **Auth**: `X-Api-Key` + `X-Platform-User-Id` headers (stored in `memory/uumit-auth.json`)
- **Entrypoint**: `uumit-agent/SKILL.md` — the primary instruction file (~450 lines)
- **Update**: `update_skill.js --check` / `--update`, validated via `manifest.json` SHA256

## Critical gotchas

### Writing JSON payloads
**ALWAYS** use `[System.IO.File]::WriteAllText(path, body, [System.Text.UTF8Encoding]::new($false))` in PowerShell. `Set-Content` may insert a UTF-8 BOM that breaks `rest_request.js` JSON parsing.

```
$body = '{...}'
[System.IO.File]::WriteAllText(
  "$env:UUMIT_SKILL_DIR\memory\sessions\$session\request-task.json",
  $body,
  [System.Text.UTF8Encoding]::new($false)
)
```

### Session-isolated request files
- Each session gets its own dir: `memory/sessions/<SESSION_ID>/`
- Never reuse `memory/request.json` (deprecated)
- Write payloads: `request-task.json`, `request-asset.json`, `request-delivery.json`, etc.
- ALWAYS pass absolute paths to `--file`

### REST API rules
- GET params: `--param KEY VALUE` (handles encoding automatically)
- Write operations: PUT body in session file → `--file <path>` (never inline JSON)
- Always `--dry-run` before real write
- Use `--idempotency-key` for all risky writes
- Only call routes in `API_REFERENCE.md` allowlist
- 422 = fix payload fields, don't retry blindly
- 5xx = exponential backoff max 3

### Knowledge Store (two-step publish)
1. `upload_file.js <local_path>` → returns `data.filename` (storage_key)
2. `POST /api/v1/digital-assets/quick-upload` with `storage_key`, `file_name`, `file_size`, `file_type`, `price_ut`
- Upload alone does NOT create a store listing

### Agent output rules
- Parse JSON from script stdout internally
- NEVER paste raw stdout/stderr/tool blocks to user
- Summarize: result + 1-3 key fields + link
- Exception: `verification_url` + `user_code` can be shown

### JWT-only features (not available via API Key)
- 签到 (check-in), 翻牌 (card flip), 时间胶囊 (time capsule)
- Guide user to `https://m.uumit.com/hall`

### Cruise system (4 independent ticks)
| Script | Interval | Purpose |
|--------|----------|---------|
| `cruise_tick.js` | 6h | Account/wallet/order reconciliation |
| `cruise_inbox_tick.js` | 15min | Check applications to your tasks + platform pushes |
| `cruise_apply_tick.js` | 30min | Browse task hall, skill-match, auto-apply |
| `cruise_deliver_tick.js` | 60min | Deliver accepted work + publish pending assets |
`cruise_work_tick.js` is **deprecated** — never use it.

### Autonomy (L4)
Config in `memory/runtime/agent-autonomy-config.json`:
- Auto-spend: ≤100 UT (data API calls + store purchases)
- Auto-accept jobs: ≤1000 UT via SSE
- Auto-apply: enabled, no confirm, max 9999 UT bounty
- Auto-review applications: enabled (skill match + reputation)
- Auto-deliver: enabled (if agent can self-complete)

### Exchange rate
- 1 CNY = 100 UT (cash_to_ut_rate)
- Withdrawal: 1 UT = 0.007 CNY
- Agent tasks MUST use `bounty_currency: "UT"`, never CNY directly

## Key skills

3 skills registered on UUMit (10 UT fixed each):
- Python 脚本开发与技术支持 (`1c9ff94a-...`)
- AI Prompt 工程优化 (`018f37d6-...`)
- MCP Server 开发部署 (`51450c23-...`)

## Sub-skills

- `uumit-mcp-deployer/`: SKILL.md for building & deploying MCP servers (FastMCP, Docker, cloud)
- `uumit-prompt-engineer/`: SKILL.md for prompt engineering consulting (200+ templates methodology)

## Publishable assets

Root-level `.md` files are knowledge products for the UUMit store. Do NOT delete or rename without confirming intent. Known products:
- `Python自动化赚钱脚本合集.md`
- `AI编程助手实战手册.md`
- `开发者AI Prompt宝库.md`
- `MCP Server 从零入门到部署实战.md`
- `prompt-engineering-advanced.md`
- `ai-side-hustle-guide.md`

## Verification

```
$env:UUMIT_SKILL_DIR="D:\mqq\develop\UUMIT_WorkSpace\uumit-agent"
node "$env:UUMIT_SKILL_DIR\scripts\validate_skill.js"
node "$env:UUMIT_SKILL_DIR\scripts\rest_request.js" GET /api/v1/wallet
```

## Auth Profiles (multi-account)

Multi-profile auth system: `scripts/auth.js` and `scripts/auth_common.js`.

| Command | Purpose |
|---------|---------|
| `--start` | Device OAuth login, defaults to `default` profile |
| `--start --save-as <name>` | Save credentials under named profile |
| `--wait` | Poll pending auth session |
| `--check` | Validate current profile, wallet, cruise status |
| `--list` | List all saved profiles with active marker |
| `--switch <name>` | Switch active profile instantly, no re-auth |
| `--delete <name>` | Remove a saved profile |

### Profile data
- Stored: `memory/uumit-auth.json` — `{ current, profiles: { name: { cached_api_key, cached_user_id, updated_at } } }`
- `--check` returns `current_profile`, wallet balance, cruise registration status, and post-auth onboarding
- Switching is instant (changes `current` field + `process.env`)

### Adding a new account
```
node scripts/auth.js --start --save-as <name>
```
Complete device auth in browser. Then `--switch <name>` to activate.

## Registered Accounts

3 accounts registered in `memory/uumit-auth.json`:

| Profile | User ID | API Key (preview) |
|---------|---------|-------------------|
| `阿强` | `4e3941ba-22be-406a-8575-d9cb8a13eb87` | `dqXoUpBB94...` |
| `阿星` | `65c2be88-f1f3-4cb7-b556-7d3758132877` | `PYLJGdbI3P4...` |
| `硬核逐风者` | `67dd1391-253e-4e46-9f4d-a6494abf4cd5` | `yQUY2doiWT8...` |

### Per-account skills

**阿强** (publisher/worker):
| Skill ID | Name | Price |
|----------|------|-------|
| `98364b8d-...` | Python自动化脚本定制 | 50 UT |
| `83edc879-...` | Python自动化脚本定制(dup) | 50 UT |
| `51450c23-...` | MCP Server 开发部署 | 10 UT |
| `018f37d6-...` | AI Prompt 工程优化 | 10 UT |
| `1c9ff94a-...` | Python 脚本开发与技术支持 | 100 UT |

**阿星** (publisher/worker):
| Skill ID | Name | Price |
|----------|------|-------|
| `f411f89f-...` | MCP Server 开发部署 | 50 UT |
| `fd5a0a07-...` | AI Prompt 工程优化 | 50 UT |
| `224ad819-...` | Python 脚本开发与技术支持 | 50 UT |
| `fe935266-...` | 专业内容创作与写作服务 | 50 UT |

**硬核逐风者** (publisher/worker):
| Skill ID | Name | Price |
|----------|------|-------|
| `b1c26339-...` | 数据清洗与ETL自动化服务 | 150 UT |
| `8d77d836-...` | AI代码审查与质量优化 | 200 UT |
| `ee3b3e17-...` | AI工作流自动化搭建服务 | 350 UT |
| `66b31b30-...` | MCP Server快速开发服务 | 300 UT |
| `59be0fb7-...` | 电商运营数据分析与优化 | 130 UT |
| `e40cf8ea-...` | AI数据分析报告生成 | 200 UT |

## Cross-Account Automation

Script: `uumit-agent/scripts/cross_account_flow.js`

一键完成3个账号之间的任务发布→申请→同意→交付→确认→评分全流程。

### Flow definition

| # | Publisher → Worker | Task | Bounty |
|---|-------------------|------|--------|
| 1 | `阿星` → `硬核逐风者` | Python数据处理脚本开发 | 200 UT |
| 2 | `硬核逐风者` → `阿星` | Web应用自动化测试 | 200 UT |
| 3 | `硬核逐风者` → `阿强` | 技术文档翻译与整理 | 100 UT |

### Per-flow 6-step process

1. Publisher `POST /api/v1/tasks` — create task
2. Worker `POST /api/v1/tasks/{id}/applications` — apply (uses worker's skill_id)
3. Publisher `POST /api/v1/tasks/{id}/applications/{app_id}/accept` — accept
4. Worker: upload file via `upload_file.js` → `POST /api/v1/orders/{order_id}/deliverables` — deliver
5. Publisher `POST /api/v1/orders/{order_id}/confirm` — confirm receipt
6. Publisher `POST /api/v1/orders/{order_id}/rating` — 5-star rating

### Account switching

The script uses `auth_common.getProfileCredentials(name)` to read credentials by profile name and sets `UUMIT_API_KEY` + `UUMIT_USER_ID` env vars per request — no global auth switch needed.

### Run

```powershell
$env:UUMIT_SKILL_DIR="D:\mqq\develop\UUMIT_WorkSpace\uumit-agent"
node "$env:UUMIT_SKILL_DIR\scripts\cross_account_flow.js"
```

### Wallet requirements

Ensure each publisher has enough available UT balance before running:
- 阿星: ≥ 200 UT available
- 硬核逐风者: ≥ 300 UT available (200 + 100 as publisher)
