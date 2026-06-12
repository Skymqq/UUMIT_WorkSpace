#!/usr/bin/env python3
"""Check skills and process remaining uploads"""
import json, urllib.request

with open("/home/muqiqiang/.hermes/skills/uumit-agent/memory/uumit-auth.json") as f:
    auth = json.load(f)
key = auth["cached_api_key"]
uid = auth["cached_user_id"]

def get(path):
    req = urllib.request.Request(f"https://api.uumit.com{path}", headers={"X-Api-Key": key, "X-Platform-User-Id": uid})
    try:
        resp = urllib.request.urlopen(req, timeout=20)
        return {"ok": True, "data": json.loads(resp.read())}
    except urllib.error.HTTPError as e:
        return {"ok": False, "code": e.code, "body": e.read().decode()[:1000]}

def post(path, data):
    body = json.dumps(data).encode()
    headers = {"X-Api-Key": key, "X-Platform-User-Id": uid, "Content-Type": "application/json"}
    req = urllib.request.Request(f"https://api.uumit.com{path}", data=body, headers=headers)
    try:
        resp = urllib.request.urlopen(req, timeout=20)
        return {"ok": True, "data": json.loads(resp.read())}
    except urllib.error.HTTPError as e:
        return {"ok": False, "code": e.code, "body": e.read().decode()[:500]}

# Check all skills
print("=== All Skills ===")
r = get("/api/v1/skills?page=1&page_size=50")
if r["ok"]:
    items = r["data"].get("data",{}).get("items", r["data"].get("items", []))
    print(f"Total: {len(items)}")
    for s in items:
        status = s.get("status","")
        name = s.get("name","")[:40]
        price = s.get("ut_price","")
        created = (s.get("created_at") or "")[:16]
        sid = s.get("id","")[:16]
        if "2026-06-10T08" in created or "审核" in status:
            print(f"  NEW [{status:12s}] {name:40s} | {price} UT | {created} | {sid}")
    print()
    # Show all active skills with prices
    for s in items:
        if s.get("status") == "active":
            print(f"  ACTIVE: {s['name'][:40]:40s} | {s.get('ut_price','')} UT | {s.get('id','')[:16]}")

# Try to create remaining skills via direct API
print("\n=== Creating Remaining Skills via Direct API ===")
remaining = [
    {
        "name": "短视频脚本与分镜设计",
        "description": "提供专业短视频脚本撰写与分镜设计服务，涵盖产品种草、知识科普、Vlog叙事、剧情短片等类型。每条脚本包含台词、画面描述、时长控制和BGM建议。",
        "category": "文案写作",
        "tags": ["短视频", "脚本", "分镜", "视频创作"],
        "ut_price": "160.00",
        "pricing_model": "fixed",
        "mode": "online",
        "status": "active",
        "source": "manual"
    },
    {
        "name": "AI工作流自动化搭建服务",
        "description": "使用n8n/Make等工具搭建自定义自动化工作流，实现数据采集、文件处理、跨平台同步。按流程复杂度定价，包含部署和测试。",
        "category": "技术开发",
        "tags": ["自动化", "工作流", "RPA"],
        "ut_price": "350.00",
        "pricing_model": "fixed",
        "mode": "online",
        "status": "active",
        "source": "manual"
    },
    {
        "name": "电商产品文案与详情页优化",
        "description": "为电商产品提供卖点提炼、文案撰写、详情页结构优化服务。覆盖淘宝、京东、Shopify等平台。包含标题优化和SEO关键词布局。",
        "category": "文案写作",
        "tags": ["电商文案", "详情页", "产品描述"],
        "ut_price": "120.00",
        "pricing_model": "fixed",
        "mode": "online",
        "status": "active",
        "source": "manual"
    },
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

for skill in remaining:
    name = skill["name"]
    print(f"  Creating: {name}...", end=" ", flush=True)
    r = post("/api/v1/skills", skill)
    if r["ok"]:
        sid = r["data"].get("data",{}).get("id","?")
        print(f"OK (id={sid[:16]})")
    else:
        print(f"FAIL: {r.get('code')}: {r.get('body','')[:100]}")
