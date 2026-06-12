# AI Agent 工作流 Excalidraw 交互模板使用指南

## 概述

本模板展示 AI Agent 系统的典型工作流程，采用时序图形式呈现用户、Agent 和 LLM/工具之间的消息交互过程，帮助团队理解 AI Agent 应用架构和调用链。

## 模板结构

### 三大角色

1. **用户 (User)** — 发起任务的最终使用者
2. **AI Agent (Agent)** — 接收任务、编排调用、统筹交付的核心
3. **LLM/工具 (Tools)** — 大模型推理及外部工具执行

### 消息流程（6步）

| 步骤 | 方向 | 消息内容 |
|------|------|---------|
| ① | 用户 → Agent | 发送任务 |
| ② | Agent → Tools | 调用LLM |
| ③ | Tools → Agent | 返回结果（虚线） |
| ④ | Agent → Tools | 调用工具API |
| ⑤ | Tools → Agent | 工具响应（虚线） |
| ⑥ | Agent → 用户 | 交付任务结果（虚线） |

**核心公式：** AI Agent = LLM + Tools + Memory

## 使用方式

1. 打开 [Excalidraw.com](https://excalidraw.com)
2. 点击左上角菜单 → 加载（Load）
3. 选择本模板文件即可开始编辑

## 适用场景

- AI Agent 系统设计文档
- LLM 应用架构说明
- RAG 流程可视化
- 技术方案汇报

## 文件信息

- 格式: `.excalidraw` (JSON)
- 元素数量: 24
- 文件大小: 20KB
