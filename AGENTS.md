# UUMit Workspace

UUMit 平台智能体工作区 — 3个账号自动化赚钱系统。

## 目录结构

```
UUMIT_WorkSpace/
├── AGENTS.md                    # 本文件：智能体执行规范
├── products/                    # 知识产品（上架到 UUMit 知识商店）
│   ├── Python自动化赚钱脚本合集.md
│   ├── AI编程助手实战手册.md
│   ├── 开发者AI Prompt宝库.md
│   ├── MCP Server 从零入门到部署实战.md
│   ├── prompt-engineering-advanced.md
│   ├── ai-side-hustle-guide.md
│   └── ai-api-integration-guide.md
├── tools/                       # 工具脚本（非 Skill 系统）
│   ├── prompt_to_skill/         # Prompt 转 Skill 工具
│   ├── sales_data_processor.py  # 数据处理脚本
│   └── prompt_to_skill_deliverable.tar.gz
├── uumit-agent/                 # 主 Skill（入口：SKILL.md）
│   ├── SKILL.md                 # 主指令文件
│   ├── API_REFERENCE.md         # API 接口文档
│   ├── PLAYBOOKS.md             # 业务流程手册
│   ├── SAFETY.md                # 安全规则
│   ├── DEEP_LINKS.md            # 深链接
│   ├── scripts/                 # 所有脚本
│   │   ├── rest_request.js      # REST 调用入口
│   │   ├── auth.js              # 认证
│   │   ├── auth_common.js       # 多账号认证
│   │   ├── uumit_earn.js        # 一键赚钱脚本
│   │   ├── cross_account_flow.js # 跨账号流水线
│   │   ├── cruise_*.js          # 巡航脚本（4个）
│   │   ├── upload_file.js       # 文件上传
│   │   └── ...
│   └── memory/                  # 运行时数据（不入 git）
│       ├── uumit-auth.json      # 多账号凭证
│       ├── uumit-state.json     # 状态快照
│       ├── pending_skills.json  # 待发布技能
│       └── runtime/             # 巡航和自动化状态
├── uumit-mcp-deployer/          # 子 Skill：MCP Server 开发
├── uumit-prompt-engineer/       # 子 Skill：Prompt 工程
└── uumit-assets/                # 已发布的资产文件
```

## 环境约定

### 环境变量

```powershell
$env:UUMIT_SKILL_DIR = "D:\mqq\develop\UUMIT_WorkSpace\uumit-agent"
$env:UUMIT_BASE_URL = "https://api.uumit.com"
```

### Shell 约定

- **所有 Node 命令**必须先设置 `$env:UUMIT_SKILL_DIR`
- **写 JSON 文件**必须用 `[System.IO.File]::WriteAllText(path, body, [System.Text.UTF8Encoding]::new($false))`，禁止用 `Set-Content`（会加 BOM）
- **REST 调用**统一用 `node scripts/rest_request.js METHOD PATH`
- **GET 参数**用 `--param KEY VALUE`
- **POST/PUT body**写入会话隔离文件，用 `--file <绝对路径>`
- **写操作前**必须 `--dry-run`
- **幂等操作**必须 `--idempotency-key`

### 文件命名规范

| 文件类型 | 命名模式 | 位置 |
|---------|---------|------|
| REST 请求体 | `request-{用途}.json` | `memory/sessions/{SESSION_ID}/` |
| 巡航状态 | `cruise-state.json` | `memory/` |
| 运行时配置 | `*-config.json` | `memory/runtime/` |
| 待发布内容 | `pending-*.json` | `memory/` |
| 临时脚本 | 禁止 | 根目录不放临时文件 |

### 会话隔离

每个 Agent 会话必须有独立 `SESSION_ID`，所有写请求放在 `memory/sessions/{SESSION_ID}/`：
- `request-task.json` — 任务创建/申请
- `request-asset.json` — 知识商店/议价
- `request-delivery.json` — 交付
- `request-profile.json` — 资料修改
- `request-marketplace.json` — 数据广场

## 账号体系

3 个注册账号，凭证在 `memory/uumit-auth.json`：

| 账号 | 角色 | 技能数 | 主要定位 |
|------|------|--------|---------|
| `硬核逐风者` | 主力 | 41 | 技术开发/数据分析/AI工具 |
| `阿星` | 辅助 | 4 | 内容创作/MCP/Prompt |
| `阿强` | 辅助 | 5 | Python开发/文档翻译 |

### 多账号操作

```powershell
# 切换账号
node scripts/auth.js --switch <name>

# 查看所有账号
node scripts/auth.js --list

# 跨账号流水线（自动切换）
node scripts/cross_account_flow.js
```

## 自动化系统

### 一键赚钱脚本

```powershell
node scripts/uumit_earn.js --status      # 查看状态
node scripts/uumit_earn.js --scan-only   # 扫描匹配任务
node scripts/uumit_earn.js --dry-run     # 模拟申请
node scripts/uumit_earn.js               # 自动申请
```

### 巡航系统（4 个独立 cron）

| 脚本 | 间隔 | 职责 |
|------|------|------|
| `cruise_tick.js` | 6h | 账户/钱包/订单对账 |
| `cruise_inbox_tick.js` | 15min | 收件箱：申请+推送 |
| `cruise_apply_tick.js` | 30min | 任务大厅：扫描+申请 |
| `cruise_deliver_tick.js` | 60min | 交付+发布 |

### 跨账号全流水线

```powershell
node scripts/cross_account_flow.js
```

6 条路线（3 账号 × 2 方向）：
1. 阿星 → 硬核逐风者 (200 UT)
2. 硬核逐风者 → 阿星 (200 UT)
3. 硬核逐风者 → 阿强 (100 UT)
4. 阿强 → 阿星 (150 UT)
5. 阿强 → 硬核逐风者 (180 UT)
6. 阿星 → 阿强 (120 UT)

## 知识产品管理

### 上架流程（两步）

1. `upload_file.js <path>` → 获取 `storage_key`
2. `POST /api/v1/digital-assets/quick-upload` → 创建资产

### 产品清单

| 文件 | 状态 |
|------|------|
| `products/Python自动化赚钱脚本合集.md` | 待上架 |
| `products/AI编程助手实战手册.md` | 待上架 |
| `products/开发者AI Prompt宝库.md` | 待上架 |
| `products/MCP Server 从零入门到部署实战.md` | 待上架 |
| `products/prompt-engineering-advanced.md` | 待上架 |
| `products/ai-side-hustle-guide.md` | 待上架 |
| `products/ai-api-integration-guide.md` | 待上架 |

## 技能管理

### 待发布技能（明日可发）

保存在 `memory/pending_skills.json`，今日 10 次上限已用完：

| 技能 | 定价 |
|------|------|
| SEO优化与搜索引擎排名提升 | 200 UT |
| 商业计划书与BP撰写 | 300 UT |
| 第三方API对接与系统集成 | 250 UT |
| 数据可视化与BI看板制作 | 280 UT |
| 自动化测试与质量保障 | 220 UT |

### 已注册技能（硬核逐风者，41个）

高价值技能（≥150 UT）：
- MCP Server 定制开发 (400 UT)
- AI工作流自动化搭建 (350 UT)
- 复古像素画 (300 UT)
- AI内容批量生成工作流 (320 UT)
- 手绘风架构图 (250 UT)
- Python数据采集与RPA (260 UT)
- AI Prompt工程化 (280 UT)
- MCP Server快速开发 (300 UT)
- AI代码审查 (200 UT)
- 数据清洗与ETL (150 UT)
- 科研数据分析 (180 UT)
- 学术论文润色 (180 UT)
- 数据可视化/BI看板 (280 UT)

## 安全规则

1. **禁止**在 git 中提交凭证、API Key、密码
2. **禁止**把本地文件/密钥注册为对外 capability
3. **写操作前**必须 `--dry-run`
4. **超阈值消费**（>100 UT）必须用户确认
5. **任务币种**必须用 `UT`，禁止用 `CNY`
6. **JWT-only 功能**（签到/翻牌/时间胶囊）引导用户到 App

## 验证命令

```powershell
# 验证 Skill 完整性
node "$env:UUMIT_SKILL_DIR\scripts\validate_skill.js"

# 检查钱包
node "$env:UUMIT_SKILL_DIR\scripts\rest_request.js" GET /api/v1/wallet

# 检查技能列表
node "$env:UUMIT_SKILL_DIR\scripts\rest_request.js" GET /api/v1/skills

# 检查任务大厅
node "$env:UUMIT_SKILL_DIR\scripts\rest_request.js" GET /api/v1/tasks/hall --param page 1 --param page_size 5
```
