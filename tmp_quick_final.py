#!/usr/bin/env python3
"""
Quick final pass: check remaining published items with low prices and fix them
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
        return {"code": e.code, "error": e.read().decode()[:300]}

def get_price(qscore):
    if qscore >= 0.98: return 1500
    elif qscore >= 0.95: return 1280
    elif qscore >= 0.92: return 1080
    elif qscore >= 0.88: return 880
    elif qscore >= 0.82: return 680
    elif qscore >= 0.78: return 580
    else: return 500

# Get current state
all_items = []
page = 1
while True:
    resp = api_get("/api/v1/digital-assets?page=%d&page_size=100" % page)
    items = resp.get("data", {}).get("items", [])
    all_items.extend(items)
    if not resp.get("data", {}).get("has_more"):
        break
    page += 1

print("Total: %d" % len(all_items))
analyzed = [a for a in all_items if a.get("status") == "analyzed"]
published = [a for a in all_items if a.get("status") == "published"]
print("Analyzed: %d, Published: %d" % (len(analyzed), len(published)))

# Analyze: anything in analyzed state with q>=0.7 that needs publishing?
to_publish = []
for a in analyzed:
    qs = a.get("quality_score")
    if qs:
        try:
            qscore = float(qs)
            if qscore >= 0.7 and a.get("content_review_status") == "approved":
                to_publish.append((a, qscore, get_price(qscore)))
        except:
            pass

print("\nAnalyzed items to publish: %d" % len(to_publish))
for a, qs, price in to_publish:
    aid = a["id"][:8]
    title = str(a.get("title","?"))[:30]
    print("  [%s] %s q=%.2f -> %d UT" % (aid, title, qs, price))

# Published items that still need price update
needs_update = []
for a in published:
    qs = a.get("quality_score")
    if not qs: continue
    try:
        qscore = float(qs)
    except: continue
    if qscore < 0.7: continue
    actual_price = float(a.get("actual_price_ut", 0) or 0)
    if actual_price < 400:  # still old price
        needs_update.append((a, qscore, get_price(qscore)))

print("\nPublished items needing price update: %d" % len(needs_update))
for a, qs, price in needs_update:
    aid = a["id"][:8]
    title = str(a.get("title","?"))[:30]
    old_price = a.get("actual_price_ut", "?")
    print("  [%s] %s q=%.2f old=%s -> %d UT" % (aid, title, qs, old_price, price))

# Do the work: publish analyzed items first (these are quick)
if to_publish:
    print("\n=== Publishing analyzed items ===")
    for a, qs, price in to_publish:
        aid = a["id"]
        title = str(a.get("title","?"))[:25]
        print("  Publish [%s] %s @ %d UT" % (aid[:8], title, price), end=" ... ")
        result = api_post("/api/v1/digital-assets/%s/publish" % aid, {"price_ut": price})
        if result.get("code") == 0:
            print("OK")
        else:
            print("FAIL: %s" % str(result.get("error","?"))[:80])
        time.sleep(0.15)

# Then unpublish + publish for items needing price update
if needs_update:
    print("\n=== Updating published item prices ===")
    for a, qs, price in needs_update:
        aid = a["id"]
        title = str(a.get("title","?"))[:25]
        
        # Unpublish
        print("  [%s] %s: unpublish" % (aid[:8], title), end=" ... ")
        result = api_post("/api/v1/digital-assets/%s/unpublish" % aid)
        if result.get("code") == 0:
            print("OK", end="")
        else:
            print("SKIP(%s)" % str(result.get("error","?"))[:40])
            time.sleep(0.15)
            continue
        
        # Publish with new price
        print(" -> publish @ %d UT" % price, end=" ... ")
        result = api_post("/api/v1/digital-assets/%s/publish" % aid, {"price_ut": price})
        if result.get("code") == 0:
            print("OK")
        else:
            print("FAIL: %s" % str(result.get("error","?"))[:80])
        time.sleep(0.15)

print("\nDone!")
