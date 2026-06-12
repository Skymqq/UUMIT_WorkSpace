#!/usr/bin/env python3
"""Create digital asset from uploaded file"""
import json, urllib.request

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

# Create first digital asset from uploaded file
# file_id from upload: f3a097c2d8004b2d - but need to check exact ID
# The file URL: https://oss.uumit.com/uumit-service/prod/attachments/2026/06/10/f3a097c2d8004b2d.md
# filename: uumit-service/prod/attachments/2026/06/10/f3a097c2d8004b2d.md

# First, let's check how existing assets reference files
# The URL is: https://oss.uumit.com/uumit-service/prod/attachments/2026/06/10/f3a097c2d8004b2d.md
# The asset_source is "file" which means upload via file

# Let's try creating the digital asset
print("Creating digital asset 1: AI副业赚钱实战指南")
r = post("/api/v1/digital-assets", {
    "title": "AI副业赚钱实战指南·50个已验证方法",
    "summary": "一份全面的AI副业赚钱指南，包含50个经过验证的实操方法。涵盖AI写作、AI设计、AI编程、AI数据分析、AI视频创作等热门领域，每个方法都包含具体步骤、所需工具和收益预期。适合希望利用AI工具开展副业的个人创作者和自由职业者。",
    "tags": ["AI副业", "赚钱", "AI工具", "知识变现", "副业指南", "自由职业", "被动收入"],
    "file_id": "f3a097c2d8004b2d",
    "file_name": "ai-side-hustle-guide.md",
    "price_ut": "199.00",
    "delivery_mode": "knowledge_file",
    "asset_source": "file"
})
if r["ok"]:
    print(f"  Created! {json.dumps(r['data'], ensure_ascii=False)[:300]}")
else:
    print(f"  FAIL: {r.get('code')}: {r.get('body','')[:200]}")
    
# Try alternative - maybe need different field names
print("\nTrying alternative field names...")
r2 = post("/api/v1/digital-assets", {
    "title": "AI副业赚钱实战指南·50个已验证方法",
    "summary": "一份全面的AI副业赚钱指南，包含50个经过验证的实操方法。",
    "tags": ["AI副业", "赚钱", "AI工具"],
    "file_id": "f3a097c2d8004b2d",
    "filename": "ai-side-hustle-guide.md",
    "price": "199.00",
    "delivery_mode": "knowledge_file"
})
if r2["ok"]:
    print(f"  Created! {json.dumps(r2['data'], ensure_ascii=False)[:300]}")
else:
    print(f"  FAIL: {r2.get('code')}: {r2.get('body','')[:200]}")

# Check what fields the upload returns that we need
print("\nNote: The upload script returned data.filename but not an explicit file_id.")
print("The file_id in existing assets is a UUID (e.g., 72f2ee43-a48b-4252-8a52-b8a4e8ad56f9)")
print("Need to find how to get the file_id from the uploaded file.")
