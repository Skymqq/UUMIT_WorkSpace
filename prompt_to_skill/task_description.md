# Prompt-to-Skill 转换专家 Agent

## 项目概述

本交付物实现了一个**高级 Agent**，能够自动将用户的"大白话"业务诉求（如"帮我自动给发票对账"）转化为工程级结构化 Prompt（Agent Skill），包含完整的 Role（角色定义）、Constraints（约束条件）、Workflow（工作流程）、Few-shots（示例）等结构化字段。

## 交付物清单

| 文件 | 说明 |
|------|------|
| `prompt_to_skill.py` | 核心转换引擎 - CLI 工具 |
| `skill_template.py` | Skill 结构化模板与验证器 |
| `examples.json` | 内置示例库（5 个典型场景） |
| `README.md` | 使用说明文档 |

## 核心功能

1. **自然语言输入** → 用户用大白话描述业务诉求
2. **结构化抽取** → 自动解析并填充 Role / Constraints / Workflow / Few-shots
3. **多格式输出** → Markdown 文档 / JSON 配置 / Hermes SKILL.md 格式
4. **模板验证** → 确保生成的结构完整、可执行

## 使用方式

```bash
# 方式一：交互模式
python prompt_to_skill.py

# 方式二：直接传入需求
python prompt_to_skill.py --prompt "帮我自动给发票对账"
```

## 示例输出片段（"发票对账"场景）

```markdown
## Role
你是一个专业的财务自动化 Agent...

## Workflow
1. 接收用户上传的发票图片/PDF
2. OCR 提取关键字段（发票号、金额、日期、开票方）
3. 与系统账单逐条比对
4. 标记差异项并生成对账报告

## Constraints
- 金额精度保留 2 位小数
- 日期格式统一为 YYYY-MM-DD
- 必须输出双语（中英文）报告

## Few-shots
输入: "核对 3 月发票"
输出: [结构化对账任务...]
```
