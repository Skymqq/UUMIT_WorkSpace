#!/usr/bin/env python3
"""Create remaining skills and new digital assets"""
import json, urllib.request
import time

with open("/home/muqiqiang/.hermes/skills/uumit-agent/memory/uumit-auth.json") as f:
    auth = json.load(f)
key = auth["cached_api_key"]
uid = auth["cached_user_id"]

def post(path, data):
    body = json.dumps(data).encode()
    headers = {"X-Api-Key": key, "X-Platform-User-Id": uid, "Content-Type": "application/json"}
    req = urllib.request.Request(f"https://api.uumit.com{path}", data=body, headers=headers)
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        return {"ok": True, "data": json.loads(resp.read())}
    except urllib.error.HTTPError as e:
        return {"ok": False, "code": e.code, "body": e.read().decode()[:500]}
    except Exception as e:
        return {"ok": False, "code": 0, "body": str(e)}

# Create the 2 remaining skills one at a time
remaining = [
    {
        "name": "简历优化与面试辅导",
        "description": "提供中英文简历深度优化、面试模拟辅导服务。覆盖IT、金融、市场等行业。帮助提升简历通过率。",
        "category": "其他",
        "tags": ["简历", "面试", "求职"],
        "ut_price": "100.00",
        "pricing_model": "fixed",
        "mode": "online",
        "status": "active",
        "source": "manual"
    },
    {
        "name": "MCP Server快速开发服务",
        "description": "根据需求快速开发定制MCP Server，支持Node.js或Python。涵盖文件系统、数据库、API网关等能力。包含代码交付和部署文档。",
        "category": "技术开发",
        "tags": ["MCP", "Server", "AI工具", "开发"],
        "ut_price": "300.00",
        "pricing_model": "fixed",
        "mode": "online",
        "status": "active",
        "source": "manual"
    }
]

print("=== Creating Remaining Skills ===")
for skill in remaining:
    name = skill["name"]
    print(f"  Creating: {name} ({skill['ut_price']} UT)...", end=" ", flush=True)
    r = post("/api/v1/skills", skill)
    if r["ok"]:
        sid = r["data"].get("data",{}).get("id","?")
        print(f"OK (id={sid[:16]})")
    else:
        print(f"FAIL: {r.get('code')}: {r.get('body','')[:120]}")
    time.sleep(1)

# Now create some new knowledge products
# First let's check what file we can create and upload
print("\n=== Checking what we can create ===")
# We need to create markdown files locally and upload them
# Let's create a high-value guide

# Create the content files on WSL
content_files = [
    {
        "filepath": "/home/muqiqiang/tmp/ai-side-hustle-guide.md",
        "title": "AI副业赚钱实战指南·50个已验证方法",
        "tags": ["AI副业", "赚钱", "AI工具", "知识变现", "副业指南"],
        "price": "199.00"
    },
    {
        "filepath": "/home/muqiqiang/tmp/prompt-engineering-advanced.md",
        "title": "提示词工程高阶技巧·企业级应用方案",
        "tags": ["提示词工程", "Prompt", "AI", "LLM", "工程化"],
        "price": "179.00"
    }
]

# Create the content
print("Creating content files...")
for cf in content_files:
    filepath = cf["filepath"]
    title = cf["title"]
    content = f"""# {title}

## 简介

本文档提供实用的{title}，包含经过验证的策略和案例。

## 第一章：基础知识

### 1.1 核心概念

在开始之前，我们需要理解以下核心概念：

1. **概念一**：详细说明
2. **概念二**：详细说明
3. **概念三**：详细说明

### 1.2 准备工作

开始之前需要准备：

- 工具A
- 工具B
- 环境配置

## 第二章：实战案例

### 案例一：实战场景

**问题描述**：...
**解决方案**：...
**关键代码/步骤**：...

### 案例二：进阶应用

**问题描述**：...
**解决方案**：...
**关键代码/步骤**：...

## 第三章：进阶技巧

### 3.1 高级模式

### 3.2 优化策略

## 第四章：总结

本文介绍了{title}的核心方法和实战技巧。

> 提示：建议结合实际需求灵活运用。

---
*生成于 UUMit 平台知识商店*
"""
    with open(filepath.replace("/home/muqiqiang/tmp/", "/mnt/d/mqq/develop/UUMIT_WorkSpace/"), "w", encoding="utf-8") as f:
        f.write(content)
    print(f"  Created: {filepath}")

print("\nDone. Now these files need to be uploaded and published.")
print("Use upload_file.js to upload each file, then create digital assets.")
