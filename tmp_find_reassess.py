#!/usr/bin/env python3
"""Check available API endpoints for quality reassessment"""
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
        return {"ok": False, "code": e.code, "body": e.read().decode()[:1000]}

# Try more endpoint patterns
aid = "943d3694-c58f-40c2-a5a7-afe0bfc0b05e"  # RAG混合搜索架构图
endpoints = [
    ("POST", f"/api/v1/digital-assets/{aid}/reassess"),
    ("POST", f"/api/v1/digital-assets/{aid}/re-evaluate"),
    ("POST", f"/api/v1/digital-assets/{aid}/re-quality"),
    ("POST", f"/api/v1/digital-assets/{aid}/quality/re-evaluate"),
    ("POST", f"/api/v1/digital-assets/{aid}/trigger-quality"),
    ("POST", f"/api/v1/digital-assets/{aid}/quality-check"),
    ("GET", f"/api/v1/digital-assets/{aid}/quality"),
    ("GET", f"/api/v1/digital-assets/{aid}/actions"),
    ("POST", f"/api/v1/digital-assets/{aid}/submit-quality"),
    ("POST", f"/api/v1/digital-assets/reassess"),
    ("POST", f"/api/v1/digital-assets/{aid}/reassess-quality"),
    ("POST", f"/api/v1/digital-assets/batch-reassess"),
    ("POST", f"/api/v1/digital-assets/{aid}/retry"),
    ("POST", f"/api/v1/assets/content/{aid}/retry-quality"),
    ("POST", f"/api/v1/digital-assets/quality/retry"),
    ("POST", f"/api/v1/digital-assets/retry-quality"),
]

for method, ep in endpoints:
    if method == "GET":
        r = get(ep)
    else:
        r = post(ep, {})
    body_preview = str(r.get("data", r.get("body", "")))[:200]
    print(f"  {method:5s} {ep[-40:]:40s} -> {r.get('ok', False)} (code={r.get('code', '?')}) | {body_preview}")
