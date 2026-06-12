#!/usr/bin/env python3
"""Check how to create new digital assets and upload files"""
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

# Check upload_file.js script to understand OSS upload
print("=== Upload file workflow ===")
# Look at the upload_file.js script usage
import subprocess
# Let's just check the API for file upload
r = get("/api/v1/upload/token")
if r["ok"]:
    print("upload/token:", json.dumps(r["data"], ensure_ascii=False)[:300])
elif r["code"] != 404:
    print(f"upload/token: code={r.get('code')} body={r.get('body','')[:200]}")
else:
    print("upload/token: 404")

# Check what digital asset creation requires
# First let's see an existing asset's full structure
r = get("/api/v1/digital-assets?page=1&page_size=5")
if r["ok"]:
    items = r["data"].get("data",{}).get("items", r["data"].get("items", []))
    for a in items:
        if a.get("title"):
            print(f"\n--- {a['title']} ---")
            print(f"  id={a.get('id','')}")
            print(f"  file_id={a.get('file_id','')}")
            print(f"  asset_source={a.get('asset_source','')}")
            print(f"  delivery_mode={a.get('delivery_mode','')}")
            print(f"  file_name={a.get('file_name','')}")
            break

# Check what file types are supported - see the upload script
print("\n=== upload_file.js usage ===")
try:
    with open("/home/muqiqiang/.hermes/skills/uumit-agent/scripts/upload_file.js") as f:
        content = f.read()
    # Find file type checks
    for line in content.split("\n"):
        if "ext" in line.lower() or "type" in line.lower() or "mime" in line.lower() or "allow" in line.lower():
            if "//" in line or "/*" in line:
                print(line.strip())
except:
    print("Could not read upload_file.js")
