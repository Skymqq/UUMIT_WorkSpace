#!/usr/bin/env python3
"""Check task hall, skills, and revenue opportunities"""
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

# 1. Task hall - find tasks to apply to
print("=== Task Hall (Available Tasks) ===")
r = get("/api/v1/tasks/hall?page=1&page_size=30")
if r["ok"]:
    data = r["data"]
    items = data.get("data", {}).get("items", data.get("items", []))
    print(f"Total open tasks: {len(items)}")
    for t in items:
        title = t.get("title","")[:40]
        bounty = t.get("bounty","")
        apps = t.get("applications_count", 0)
        uid_short = t.get("user_id","")[:12]
        tid = t.get("id","")[:16]
        status = t.get("status","")
        tags = t.get("tags", [])
        print(f"  [{status:12s}] {title:40s} | {bounty:>6s} | apps={apps} | owner={uid_short}")

# 2. My skills
print("\n=== My Skills ===")
r = get("/api/v1/skills?page=1&page_size=50")
if r["ok"]:
    data = r["data"]
    items = data.get("data",{}).get("items", data.get("items", []))
    print(f"Total: {len(items)}")
    for s in items:
        print(f"  [{s.get('status',''):12s}] {s.get('name','')[:35]:35s} | {s.get('ut_price','')} UT | cat={s.get('category','')} | id={s.get('id','')[:12]}")

# 3. My wallet history / income
print("\n=== Wallet History (Recent Earnings) ===")
r = get("/api/v1/wallet/transactions?page=1&page_size=20")
if r["ok"]:
    data = r["data"]
    items = data.get("data",{}).get("items", data.get("items", []))
    print(f"Total: {len(items)}")
    for t in items:
        amt = t.get("amount","")
        typ = t.get("type","")
        desc = t.get("description","")[:40]
        created = (t.get("created_at") or "")[:16]
        print(f"  {created} | {typ:15s} | {amt:>10s} | {desc}")

# 4. Pending transactions from 4e3941ba
print("\n=== Pending Transactions (4e3941ba) ===")
r = get("/api/v1/transactions?page=1&page_size=50")
if r["ok"]:
    for t in r["data"]["items"]:
        if t.get("buyer_user_id","").startswith("4e3941ba"):
            print(f"  id={t['id'][:20]} status={t['status']} price={t.get('price_ut','')}UT")
            print(f"  frozen_at={t.get('frozen_at','-')} auto_confirm_at={t.get('auto_confirm_at','-')}")
            print(f"  buyer_nickname={t.get('buyer_nickname','unknown')}")
