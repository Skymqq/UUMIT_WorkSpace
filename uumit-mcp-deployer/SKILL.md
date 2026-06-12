---
name: uumit-mcp-deployer
description: "UUMit MCP Deployer — MCP Server开发部署专家。核心能力：①MCP Server开发：基于FastMCP/Python SDK/TypeScript SDK创建标准MCP Server，支持Tool、Resource、Prompt资源定义 ②协议适配：支持stdio和SSE两种传输模式，自动生成符合MCP规范的server实现 ③部署运维：Docker容器化、Fly.io/Railway云部署、监控日志、安全加固 ④生态集成：接入Claude Desktop、Cursor、VS Code、OpenCode等宿主 ⑤故障排查：MCP连接诊断、Tool调用调试、权限修复 ⑥上架变现：将MCP Server发布到UUMit Agent互通市场，通过capability注册对外提供服务"
version: 1.0.0
user-invocable: true
homepage: https://m.uumit.com
metadata:
  agent_skill:
    key: uumit-mcp-deployer
    aliases: ["MCP","mcp server","model context protocol","mcp开发","mcp部署","mcp接入","fastmcp","mcp工具","mcp服务","mcp集成","mcp故障"]
    version: "1.0.0"
    priority: normal
    fallback: false
    runtime:
      node: ">=18"
      packages: []
    permissions:
      - "network:https://api.uumit.com"
      - "network:https://oss.uumit.com"
      - "exec:python"
      - "exec:node"
      - "fs:read-write:{UUMIT_SKILL_DIR}/memory/"
    entrypoints:
      - "SKILL.md"
    output_contract: "human: 按输出风格摘要，不要粘贴原始工具输出到用户"
    update_policy: auto_check_on_cruise
  openclaw:
    emoji: M
    skillKey: uumit-mcp-deployer
    fallback: false
    requires:
      bins: []
---

# UUMit MCP Deployer Skill

MCP (Model Context Protocol) Server 开发、部署、集成专家技能。

## 默认读取顺序

- 首次进入本Skill时，默认只读取本文件。
- 只有在需要具体部署脚本或模板时，再读取 `TEMPLATES.md`。
- 只有在涉及UUMit Agent互通/capability注册时，再读取uumit-agent的 `INTEROP.md`。

## MCP协议核心概念

### 什么是MCP
Model Context Protocol (MCP) 是AI模型与外部工具/数据源之间的开放协议。它让AI助手能安全地调用本地或远程工具、访问数据资源。

### 核心架构
```
AI宿主 (Claude/Cursor/OpenCode)
    ↕ MCP 协议 (JSON-RPC 2.0)
MCP Server (stdio/SSE)
    ↕ 内部实现
外部服务 / 数据库 / 文件系统 / API
```

### 资源类型
| 类型 | 说明 | 用途 |
|------|------|------|
| **Tool** | 可调用函数 | 查询数据库、发请求、操作文件 |
| **Resource** | 可读数据资源 | 获取文档、配置、日志 |
| **Prompt** | 提示词模板 | 预定义的AI交互模板 |

### 传输模式
| 模式 | 适用场景 | 特点 |
|------|---------|------|
| **stdio** | 本地开发、单用户 | 子进程通信，延迟低 |
| **SSE** | 远程服务、多用户 | HTTP流式传输，可部署到云端 |

## 快速创建MCP Server

### Python (FastMCP) — 推荐
```python
from fastmcp import FastMCP

mcp = FastMCP("my-server")

@mcp.tool()
def my_tool(param: str) -> str:
    """工具描述"""
    return f"处理结果: {param}"

@mcp.resource("config://app")
def get_config() -> str:
    """获取配置"""
    return "配置内容"

@mcp.prompt()
def my_prompt(topic: str) -> str:
    """提示词模板"""
    return f"请帮我生成关于{topic}的内容"

if __name__ == "__main__":
    mcp.run()
```

### Node.js/TypeScript
```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new Server({ name: "my-server", version: "1.0.0" }, {
  capabilities: { tools: {}, resources: {} }
});

server.setRequestHandler("tools/call", async (request) => {
  // 处理Tool调用
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

## 部署指南

### Docker容器化
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["python", "server.py"]
```

### Fly.io部署
```bash
fly launch
fly deploy
```

### Railway部署
- 连接Git仓库
- 设置启动命令
- 配置环境变量

## 生态集成

### 接入Claude Desktop
在 `claude_desktop_config.json` 中添加：
```json
{
  "mcpServers": {
    "my-server": {
      "command": "python",
      "args": ["path/to/server.py"],
      "env": {}
    }
  }
}
```

### 接入OpenCode
在 `opencode.json` 中配置为stdio MCP：
```json
{
  "mcp": {
    "my-server": {
      "type": "stdio",
      "command": "python",
      "args": ["path/to/server.py"]
    }
  }
}
```

### 接入Cursor
在Cursor Settings → Features → MCP Servers 中添加。

## UUMit集成

### 通过capability注册发布MCP Server
1. MCP Server开发完成后，可注册为UUMit Agent的能力
2. 读取uumit-agent的 `INTEROP.md` 了解A2A/capability注册流程
3. 调用 `POST /api/v1/agent/capabilities` 注册
4. 通过UUMit Agent互通市场对外提供服务

### MCP Server上架变现
1. 成熟的MCP Server可上架到UUMit数据广场
2. 按调用量定价（需先查询建议价）
3. 提供OpenAPI规范文档供其他Agent发现和调用

## 路由决策

1. **创建新MCP Server**：用户描述需求 → 选择语言（Python/TS）→ 生成骨架代码 → 定义Tool/Resource/Prompt → 本地测试
2. **部署MCP Server**：已有代码 → 选择部署方式（Docker/Fly/Railway）→ 配置环境 → 启动服务 → 验证连通性
3. **集成到宿主**：MCP Server已运行 → 按宿主类型（Claude/Cursor/OpenCode）配置连接 → 测试调用
4. **故障排查**：连接失败/Tool调用异常 → 检查传输模式 → 验证JSON-RPC格式 → 查看日志 → 修复问题
5. **诊断MCP配置**：用户提供MCP配置 → 验证参数正确性 → 测试连接可达性 → 返回诊断报告
6. **上架变现**：用户有成熟的MCP Server → 引导注册为UUMit capability或上架数据广场

## MCP常用Tool模板

### 文件系统MCP
```python
@mcp.tool()
def read_file(path: str) -> str:
    """读取文件内容"""

@mcp.tool()
def write_file(path: str, content: str) -> bool:
    """写入文件"""
```

### 数据库查询MCP
```python
@mcp.tool()
def query(sql: str) -> list:
    """执行SQL查询"""

@mcp.tool()
def get_schema(table: str) -> str:
    """获取表结构"""
```

### API网关MCP
```python
@mcp.tool()
def call_api(endpoint: str, params: dict) -> dict:
    """调用外部API"""

@mcp.tool()
def list_endpoints() -> list:
    """列出可用API端点"""
```

## 输出风格

保持简短，突出结果：

```text
结果：<创建的MCP Server或部署结果>
关键数据：<端口/地址/传输模式/状态>
下一步：<一个建议动作（如：配置到宿主/测试调用）>
```

确认模板（涉及发布/部署/付费时）：
```text
确认动作：<动作>
影响：<部署/发布/扣费>
金额：<UT价格/资源消耗>
是否继续？
```

## 安全

- 不生成包含硬编码密钥、密码、Token的MCP Server代码
- 暴露外部服务时提醒用户注意访问控制和认证
- Docker部署建议使用非root用户运行
- 生产环境MCP Server必须配置超时和限流
- 不将内部网络/私有服务暴露为MCP Tool
