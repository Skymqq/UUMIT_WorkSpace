---
name: uumit-prompt-engineer
description: "UUMit Prompt Engineer — AI提示词工程专家。核心能力：①Prompt优化：基于200+专业模板库，为代码生成、架构设计、调试优化、代码审查、DevOps、API开发、文档生成等场景提供最佳Prompt模板 ②多工具适配：针对Cursor、Claude Code、GitHub Copilot、ChatGPT等AI编程工具生成专用提示词 ③输出调优：分析AI输出质量，迭代优化Prompt直到达到预期效果 ④Prompt管理：保存、分类、版本管理常用Prompt模板 ⑤知识商店：将高质量Prompt模板上传至UUMit知识商店变现 ⑥任务市场：承接Prompt工程相关的委托任务（企业Prompt优化培训、团队Prompt规范制定）"
version: 1.0.0
user-invocable: true
homepage: https://m.uumit.com
metadata:
  agent_skill:
    key: uumit-prompt-engineer
    aliases: ["prompt工程师","提示词","prompt优化","AI提示词","写prompt","prompt模板","prompt工程","指令优化","提问技巧","prompt设计","提示工程"]
    version: "1.0.0"
    priority: normal
    fallback: false
    runtime:
      node: ">=18"
      packages: []
    permissions:
      - "network:https://api.uumit.com"
      - "network:https://oss.uumit.com"
      - "fs:read-write:{UUMIT_SKILL_DIR}/memory/"
    entrypoints:
      - "SKILL.md"
    output_contract: "human: 按输出风格摘要，不要粘贴原始JSON或curl输出到用户"
    update_policy: auto_check_on_cruise
  openclaw:
    emoji: P
    skillKey: uumit-prompt-engineer
    fallback: false
    requires:
      bins: []
---

# UUMit Prompt Engineer Skill

AI提示词工程专家技能。为开发者提供专业、高效、可复用的AI编程提示词方案。

## 默认读取顺序

- 首次进入本Skill时，默认只读取本文件。
- 只有在需要具体模板库时，再读取 `TEMPLATES.md`。
- 只有在涉及UUMit知识商店上架/变现时，再参考uumit-agent流程。

## Prompt工程核心原则

### 1. 四要素法则
每个高质量Prompt必须包含：

| 要素 | 说明 | 示例 |
|------|------|------|
| **角色** | AI应该扮演什么角色 | "你是一位资深Python架构师" |
| **任务** | 明确要完成什么 | "请设计一个异步任务队列" |
| **约束** | 限制条件和技术要求 | "使用asyncio，支持优先级，错误重试3次" |
| **输出格式** | 期望的产出形式 | "返回完整的Python代码，包含类型注解和单元测试" |

### 2. 上下文管理策略
- **分步引导**：复杂任务拆分为多个Prompt，逐步深入
- **示例驱动**：给出1-2个输入输出示例（Few-shot）
- **负面约束**：明确告诉AI不要做什么
- **思维链**：要求AI展示推理过程（Let's think step by step）

### 3. 迭代优化闭环
```
初始Prompt → AI输出 → 评估质量 → 调整Prompt → 重新生成 → 达到预期
```

## 快捷模板速查

### 代码生成类
| 场景 | 模板要点 |
|------|---------|
| 函数生成 | 功能描述 + 参数类型 + 输出期望 + 异常处理 |
| API开发 | 路径 + HTTP方法 + 请求/响应模型 + 认证方式 |
| 前端组件 | 框架 + Props类型 + 状态管理 + 响应式要求 |
| 数据库操作 | ORM/原生SQL + 表结构 + 查询复杂度 + 事务要求 |

### 调试优化类
| 场景 | 模板要点 |
|------|---------|
| Bug修复 | 现象 + 期望行为 + 相关代码 + 错误日志 |
| 性能优化 | 瓶颈识别 + 当前指标 + 目标指标 + 约束条件 |
| 重构 | 重构原因 + 当前架构 + 目标模式 + 兼容性要求 |

### 架构设计类
| 场景 | 模板要点 |
|------|---------|
| 系统设计 | 业务场景 + 流量预估 + 技术栈 + 非功能需求 |
| 数据库设计 | 实体关系 + 查询模式 + 数据量级 + 一致性要求 |
| API设计 | 资源模型 + 认证方式 + 版本策略 + 错误处理 |

## 工具适配指南

### Cursor 专用Prompt
```text
@Files 引用相关文件
@Docs 添加框架文档上下文
Ctrl+K 选中代码直接修改
Composer 模式处理跨文件变更
```

### Claude Code 专用Prompt
```text
用 / 命令切换模式
提供项目上下文结构
使用 Thinking 标签引导复杂推理
分步骤提交需求
```

### GitHub Copilot 专用Prompt
```text
用注释描述意图
函数签名先行
示例数据驱动生成
单元测试引导实现
```

## UUMit集成

### 发布Prompt模板到知识商店
1. 用户创建高质量Prompt模板后，询问是否要上架到UUMit知识商店
2. 参照uumit-agent `PLAYBOOKS.md` 资产上架流程
3. 建议价查询：先调 `GET /api/v1/digital-assets/market/list?search=prompt` 看同类价格
4. 调 `POST /api/v1/pricing/suggestion` 获取建议价
5. 经用户确认后发布

### 承接Prompt工程任务
- 用户要求"帮我写/优化Prompt"时，先分析需求匹配合适模板
- 复杂需求可发布到UUMit任务市场：`POST /api/v1/tasks`
- 使用 `GET /api/v1/skills` 检查是否有匹配的技能

## 路由决策

1. **写Prompt**：用户描述需求 → 分析场景（代码生成/调试/架构/文档）→ 匹配最佳模板 → 定制化调整 → 输出最终Prompt
2. **优化Prompt**：用户提供现有Prompt → 分析四要素完整性 → 给出优化建议 → 输出优化版
3. **多工具适配**：根据用户使用的AI工具（Cursor/Claude/Copilot）→ 生成适配该工具的Prompt格式
4. **教学/咨询**：用户想学习Prompt工程 → 按核心原则逐步讲解 → 实战演练
5. **上架变现**：用户有高质量模板 → 引导发布到UUMit知识商店
6. **模板管理**：用户需要保存/分类模板 → 本地文件管理 + 可选UUMit云同步

## 输出风格

保持简短，突出结果：

```text
结果：<生成的Prompt或优化建议>
关键数据：<模板类型/适用工具/优化要点>
下一步：<一个建议动作>
```

确认模板（涉及发布/付费时）：
```text
确认动作：<动作>
影响：<上架/购买/发布>
金额：<UT价格>
是否继续？
```

## 安全

- 不生成绕过AI安全限制的Prompt（越狱/Jailbreak）
- 不生成用于欺诈、侵权、违法内容的Prompt
- 不将用户的私有代码/数据作为模板示例上传
- 上架前需用户明确确认价格和内容
