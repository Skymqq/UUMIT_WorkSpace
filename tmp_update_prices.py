#!/usr/bin/env python3
"""
Step 1: Unpublish high-quality items (qscore >= 0.7)
Step 2: Re-publish with 500-1500 UT prices
"""
import json, urllib.request, time

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

def api_post(path, body={}):
    data = json.dumps(body).encode()
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return {"code": 0, "data": json.loads(r.read())}
    except urllib.error.HTTPError as e:
        body_text = e.read().decode()[:500]
        return {"code": e.code, "error": body_text}

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

# Get all published items
all_items = []
page = 1
while True:
    resp = api_get("/api/v1/digital-assets?page=%d&page_size=100" % page)
    items = resp.get("data", {}).get("items", [])
    all_items.extend(items)
    if not resp.get("data", {}).get("has_more"):
        break
    page += 1

print("Total items: %d" % len(all_items))

# Find high-quality published items
high_quality = []
for a in all_items:
    if a.get("status") != "published":
        continue
    qs = a.get("quality_score")
    if qs is None:
        continue
    try:
        qscore = float(qs)
    except:
        continue
    if qscore >= 0.7:
        title = a.get("title")
        actual_price = float(a.get("actual_price_ut", 0) or 0)
        new_price = get_price(qscore)
        high_quality.append((a, qscore, actual_price, new_price))

# Sort by quality descending
high_quality.sort(key=lambda x: x[1], reverse=True)

print("\n=== Items to update (%d) ===" % len(high_quality))
for a, qscore, old_price, new_price in high_quality:
    aid = a["id"][:8]
    title = a.get("title", "?") or "?"
    print("[%s] q=%.2f old=%d UT -> new=%d UT %s" % (aid, qscore, int(old_price), new_price, title[:40]))

# Confirm and proceed
print("\n=== UNPUBLISHING items ===")
unpublish_ok = 0
unpublish_fail = 0
for a, qscore, old_price, new_price in high_quality:
    aid = a["id"]
    title = a.get("title", "?") or "?"
    print("Unpublishing [%s] %s ..." % (aid[:8], title[:30]))
    result = api_post("/api/v1/digital-assets/%s/unpublish" % aid)
    if result.get("code") == 0:
        print("  OK")
        unpublish_ok += 1
    else:
        err = result.get("error", "?")
        print("  FAIL: %s" % err[:200])
        unpublish_fail += 1
    time.sleep(0.3)  # rate limit

print("\nUnpublished: %d ok, %d failed" % (unpublish_ok, unpublish_fail))

print("\n=== REPUBLISHING items with new prices ===")
publish_ok = 0
publish_fail = 0
for a, qscore, old_price, new_price in high_quality:
    aid = a["id"]
    title = a.get("title", "?") or "?"
    print("Publishing [%s] %s @ %d UT ..." % (aid[:8], title[:30], new_price))
    result = api_post("/api/v1/digital-assets/%s/publish" % aid, {"price_ut": new_price})
    if result.get("code") == 0:
        print("  OK")
        publish_ok += 1
    else:
        err = result.get("error", "?")
        print("  FAIL: %s" % err[:200])
        publish_fail += 1
    time.sleep(0.3)

print("\n=== FINAL SUMMARY ===")
print("Unpublished: %d ok, %d failed" % (unpublish_ok, unpublish_fail))
print("Republished: %d ok, %d failed" % (publish_ok, publish_fail))
