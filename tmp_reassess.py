#!/usr/bin/env python3
"""Try to re-assess failed quality digital assets"""
import json, urllib.request, sys

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

failed_assets = [
    "4fa32ab9-bb4c-46f1-80d6-f781d2aae1e0",
    "943d3694-c58f-40c2-a5a7-afe0bfc0b05e",
    "cedcfac3-87d1-45f5-8343-5433b5a84ad4",
    "9c003cdb-854d-4246-ae70-27f23d6d0d1c",
    "00b43b3d-1dd3-4352-9f9b-fba605568b2e",
    "159ec95a-e32d-4b7f-a87f-bf4160020b28",
    "e28d0f22-b1b3-4c43-80c2-f230b49b3af6",
    "9c271058-be68-4af5-898e-eda8dbbbc386",
]

names = {
    "4fa32ab9": "vLLM推理服务架构图",
    "943d3694": "RAG混合搜索架构图",
    "cedcfac3": "多模型推理架构图",
    "9c003cdb": "AI安全护栏架构图",
    "00b43b3d": "Agentic RAG智能检索架构图",
    "159ec95a": "RAG混合搜索架构图(2)",
    "e28d0f22": "多模型推理架构图(2)",
    "9c271058": "Agentic RAG智能检索架构图(2)",
}

sep = "=" * 60
print(sep)
print("  Re-assessing 8 failed-quality assets")
print(sep)

ok = 0
fail = 0

for aid in failed_assets:
    name = names.get(aid[:8], aid[:8])
    print(f"  {name} ({aid[:12]}...)", end=" ", flush=True)
    
    # Try various endpoints
    endpoints = [
        ("reassess", f"/api/v1/digital-assets/{aid}/reassess"),
        ("re-evaluate", f"/api/v1/digital-assets/{aid}/re-evaluate"),
        ("retry-quality", f"/api/v1/digital-assets/{aid}/retry-quality"),
        ("quality/retry", f"/api/v1/digital-assets/{aid}/quality/retry"),
    ]
    
    success = False
    for label, ep in endpoints:
        r = post(ep, {})
        if r["ok"]:
            print(f"OK ({label})")
            ok += 1
            success = True
            break
    
    if not success:
        print("FAIL (all endpoints)")
        fail += 1

print()
print(sep)
print(f"  Re-assessment: {ok} submitted, {fail} failed all attempts")
print(sep)
