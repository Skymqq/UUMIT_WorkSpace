# App / Web 深链参考（对齐 A2A-Web 路由）

**基准域名**：`https://m.uumit.com`（与 SKILL `homepage` 一致）。

以下为站内路径（SPA）。前端大厅页的会员任务「去签到」等跳转目标与 `src/pages/Hall.tsx` 中 `EVENT_ROUTES` / `MISSION_ACTIONS` 对齐。

## 何时附带深链

Agent 使用 **API Key 双头** 调用 REST 时：

1. **调用成功后**：若用户还需要在 App 内完成 **仅 JWT** 的步骤（如签到、翻牌），或需要可视化领取权益，在输出的「下一步」中附上对应该场景的深链。
2. **Agent 代用户创建 / 发布成功后**：凡通过 Agent 创建 / 发布 **任务、技能、知识商店资产、数据广场 API、数据产品、Agent capability、订单/交易交付相关对象**，必须在最终回复中输出对应详情链接或最近可用管理入口，方便用户一键查看状态、编辑、交付或分享。链接中的 ID 必须来自接口响应或前序详情响应，禁止编造。
3. **调用失败后**：若返回 **401 / 权限不足 / 业务码表明需登录人类账号**，不要反复盲重试；输出失败原因，并附上用户应打开的深链。

## 常用场景 → 深链

| 场景 | 完整 URL | 说明 |
|------|----------|------|
| 大厅 / 今日盒子 / 签到 / 幸运翻牌 | `https://m.uumit.com/hall` | 盒子入口在大厅；签到与翻牌在此操作 |
| 写给未来的信（时间胶囊） | `https://m.uumit.com/hall` | 与盒子同一套日常模块入口 |
| 邀请好友 | `https://m.uumit.com/invite` | |
| 钱包 / 充值提现相关 | `https://m.uumit.com/wallet` | |
| 账号绑定 / Agent 连接（设备授权页） | `https://m.uumit.com/link` | |
| 数据广场 API 浏览 | `https://m.uumit.com/data-marketplace` | |
| 任务市场（赚钱 Tab） | `https://m.uumit.com/tasks?tab=all` | |
| 任务详情 | `https://m.uumit.com/tasks/{task_id}` | 用户通过 Agent 发布任务成功后必须输出；`task_id` 取创建 / 发布响应 |
| 我的订单 | `https://m.uumit.com/orders` | |
| 订单详情 | `https://m.uumit.com/orders/{order_id}` | 如果前端支持该订单详情路由或响应给出可访问链接则输出；否则输出“我的订单”入口 |
| A2A 交易详情 | `https://m.uumit.com/transactions/{transaction_id}` | 如果前端支持该交易详情路由或响应给出可访问链接则输出；否则输出订单/交易列表入口 |
| 聊天 / 智能发布入口 | `https://m.uumit.com/chat` | |
| 技能 | `https://m.uumit.com/skills` | |
| 技能详情 | `https://m.uumit.com/skills/{skill_id}` | 用户通过 Agent 上架技能成功后必须输出；`skill_id` 取创建 / 发布响应 |
| 我的知识商店资产详情 | `https://m.uumit.com/digital-assets/my/{asset_id}` | Agent 上传 / 创建资产后优先输出，适合查看分析、审核、发布状态 |
| 知识商店资产公开详情 | `https://m.uumit.com/digital-assets/{asset_id}` | 资产已发布 / 可售时可同时输出，适合分享给买家 |
| 我的数据广场 API 详情 | `https://m.uumit.com/data-marketplace/my-apis/{api_id}` | Agent 注册 / 导入 / 快速创建数据 API 后必须输出 |
| 数据广场公开 API 详情 | `https://m.uumit.com/data-marketplace/{api_id}` | API 已上线或可售时可同时输出 |
| 数据产品详情 | `https://m.uumit.com/data-marketplace/product/{product_id}` | Agent 创建 / 发布数据产品后必须输出 |
| Agent capability 管理入口 | `https://m.uumit.com/data-marketplace` | 若无独立 capability 详情页，输出最近可用管理入口，并附 `capability_id` |
| 个人资料 | `https://m.uumit.com/me` | |
| 天赋发现（带引导） | `https://m.uumit.com/talent?start=1` | |
| Token 星火计划 / AI 额度 | `https://m.uumit.com/hall` | 星火计划入口在大厅页，领取后可在此查看余额 |
| 我的知识商店账号类商品管理 | `https://m.uumit.com/digital-assets/my/{asset_id}` | 账号库存管理、共享账号状态查看 |

## Agent 发布结果链接要求

当用户通过 Agent 完成发布类动作时，最终回复必须包含：

- **任务**：输出 `https://m.uumit.com/tasks/{task_id}`。
- **技能**：输出 `https://m.uumit.com/skills/{skill_id}`。
- **知识商店资产**：至少输出 `https://m.uumit.com/digital-assets/my/{asset_id}`；若状态已是 `published` / `online` 或接口明确表明可售，再追加 `https://m.uumit.com/digital-assets/{asset_id}`。
- **数据广场 API**：输出 `https://m.uumit.com/data-marketplace/my-apis/{api_id}`；若已上线，再追加 `https://m.uumit.com/data-marketplace/{api_id}`。
- **数据产品**：输出 `https://m.uumit.com/data-marketplace/product/{product_id}`。
- **capability / Agent 互通能力**：若前端无独立详情页，输出最近可用管理入口与 `capability_id`，并说明可在互通/数据广场管理入口查看。
- **订单 / 交易 / 预约**：优先输出响应或前端支持的详情链接；没有详情路由时输出最近可用列表入口，并附 `order_id` / `transaction_id` / `task_id`。

如果接口返回的是 `draft`、`pending`、`analyzing`、`pending_review` 等未最终上架状态，也要输出拥有者详情链接，并说明用户可在该页面查看进度或补充信息。不要为了拿到 `online` / `published` 状态在同一会话里死循环等待。

## 输出模板（含深链）

成功且建议用户去 App 继续：

```text
结果：<摘要>
关键数据：<余额/状态等>
下一步：请在 App 打开：<完整 https://m.uumit.com/... 链接>
```

创建 / 发布成功：

```text
结果：<已创建 / 已发布 / 已提交审核>
关键数据：类型=<任务/技能/资产/API/产品/能力/订单/交易>；ID=<id>；状态=<status>
详情链接：<完整 https://m.uumit.com/.../{id} 链接或最近管理入口>
下一步：<如需审核 / 分析 / 补充资料，在详情页继续查看或处理>
```

失败且需人类账号或 JWT：

```text
这次没有完成：<原因>
可重试性：<否 / 仅人类客户端>
请在浏览器或官方 App 打开：<完整深链>
```

更多业务流程仍以 `PLAYBOOKS.md`、`API_REFERENCE.md` 为准。
