#!/usr/bin/env python3
"""
UUMit Knowledge Products Management
1. Delete all AI-evaluation-failed assets
2. Publish top-quality assets (qscore >= 0.7) with prices 500-1500 UT
"""
import json, urllib.request

with open("/home/muqiqiang/.hermes/skills/uumit-agent/memory/uumit-auth.json") as f:
    auth = json.load(f)
api_key = auth["cached_api_key"]
user_id = auth["cached_user_id"]
headers = {"X-Api-Key": api_key, "X-Platform-User-Id": user_id, "Content-Type": "application/json"}
BASE = "https://api.uumit.com"

def api_get(path):
    req = urllib.request.Request(BASE + path, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def api_delete(path):
    req = urllib.request.Request(BASE + path, headers=headers, method="DELETE")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return {"code": e.code, "message": e.read().decode()[:300]}

def api_post(path, body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:500]
        return {"code": e.code, "error": body}

# Get all assets
all_items = []
page = 1
while True:
    resp = api_get("/api/v1/digital-assets?page=%d&page_size=100" % page)
    items = resp.get("data", {}).get("items", [])
    all_items.extend(items)
    if not resp.get("data", {}).get("has_more"):
        break
    page += 1

print("Total assets loaded: %d" % len(all_items))

# ===== STEP 1: Delete AI-failed assets =====
failed_items = [a for a in all_items if a.get("quality_assessment_status") == "failed"]
print("\n=== STEP 1: Delete AI evaluation failed assets ===")
deleted_count = 0
for a in failed_items:
    aid = a["id"]
    title = a.get("title", "?")
    print("Deleting [%s] %s ..." % (aid[:8], title))
    result = api_delete("/api/v1/digital-assets/%s" % aid)
    if result.get("code") == 0:
        print("  OK: 资产已删除")
        deleted_count += 1
    else:
        print("  FAIL: %s" % result.get("message", result.get("error", "?")))
print("Deleted %d/%d failed assets" % (deleted_count, len(failed_items)))

# ===== STEP 2: Find high-quality candidates =====
# Reload assets to get fresh state
all_items = []
page = 1
while True:
    resp = api_get("/api/v1/digital-assets?page=%d&page_size=100" % page)
    items = resp.get("data", {}).get("items", [])
    all_items.extend(items)
    if not resp.get("data", {}).get("has_more"):
        break
    page += 1

print("\n=== STEP 2: Select high-value items to publish ===")
candidates = []
for a in all_items:
    if a.get("published") == True:
        continue
    qs = a.get("quality_score")
    if qs is None:
        continue
    try:
        qscore = float(qs)
    except (ValueError, TypeError):
        continue
    if qscore >= 0.7 and a.get("content_review_status") == "approved":
        title = a.get("title", "?")
        if title and title != "None":
            candidates.append(a)

# Sort by quality descending
candidates.sort(key=lambda x: float(x.get("quality_score", 0)), reverse=True)
print("Found %d high-quality candidates (qscore>=0.7, with titles)" % len(candidates))

# Pick top items to publish - price mapping by quality score
def get_price(qscore):
    """Map quality score to price in 500-1500 UT range"""
    if qscore >= 0.98:
        return 1500
    elif qscore >= 0.95:
        return 1280
    elif qscore >= 0.92:
        return 1080
    elif qscore >= 0.88:
        return 880
    elif qscore >= 0.82:
        return 680
    elif qscore >= 0.78:
        return 580
    else:
        return 500

print("\n=== STEP 3: Premium items to publish ===")
to_publish = []
for a in candidates[:30]:  # Publish top 30 items
    qscore = float(a.get("quality_score", 0))
    price = get_price(qscore)
    to_publish.append((a, qscore, price))
    print("[%s] q=%.2f price=%d UT %s" % (a["id"][:8], qscore, price, a.get("title","?")))

# ===== STEP 3: Publish assets =====
print("\n=== STEP 4: Publishing assets ===")
ok = 0
fail = 0
for a, qscore, price in to_publish:
    aid = a["id"]
    title = a.get("title", "?")
    print("Publishing [%s] %s @ %d UT ..." % (aid[:8], title, price))
    result = api_post("/api/v1/digital-assets/%s/publish" % aid, {"price_ut": price})
    if result.get("code") == 0:
        print("  OK")
        ok += 1
    else:
        msg = result.get("message", result.get("error", "?"))
        print("  FAIL: %s" % msg[:200])
        fail += 1

print("\n=== SUMMARY ===")
print("Deleted %d AI-failed assets" % deleted_count)
print("Published %d high-value assets (total attempted: %d, failed: %d)" % (ok, len(to_publish), fail))
