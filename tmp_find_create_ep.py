#!/usr/bin/env python3
"""Find the correct create digital asset endpoint"""
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
        return {"ok": False, "code": e.code, "body": e.read().decode()[:500]}

def post(path, data):
    body = json.dumps(data).encode()
    headers = {"X-Api-Key": key, "X-Platform-User-Id": uid, "Content-Type": "application/json"}
    req = urllib.request.Request(f"https://api.uumit.com{path}", data=body, headers=headers)
    try:
        resp = urllib.request.urlopen(req, timeout=20)
        return {"ok": True, "data": json.loads(resp.read())}
    except urllib.error.HTTPError as e:
        return {"ok": False, "code": e.code, "body": e.read().decode()[:500]}

# Try various create endpoints
endpoints = [
    ("POST", "/api/v1/digital-assets/create"),
    ("POST", "/api/v1/digital-assets/upload"),
    ("POST", "/api/v1/knowledge-assets"),
    ("POST", "/api/v1/knowledge-assets/create"),
    ("POST", "/api/v1/assets"),
    ("POST", "/api/v1/assets/create"),
    ("POST", "/api/v1/contents"),
    ("POST", "/api/v1/files/create-asset"),
    ("POST", "/api/v1/upload/file/create-asset"),
    ("GET", "/api/v1/digital-assets/create"),  # might return form schema
]

for method, ep in endpoints:
    if method == "GET":
        r = get(ep)
    else:
        r = post(ep, {"title": "test", "file_name": "test.md", "summary": "test"})
    body = str(r.get("data", r.get("body", "")))[:150]
    print(f"  {method:5s} {ep:45s} -> code={r.get('code','?')} | {body}")
