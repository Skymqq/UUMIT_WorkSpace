#!/usr/bin/env python3
"""
Final pass: check current state and finish the work
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

print("Total: %d items" % len(all_items))

analyzed = [a for a in all_items if a.get("status") == "analyzed"]
published = [a for a in all_items if a.get("status") == "published"]
print("Analyzed: %d, Published: %d" % (len(analyzed), len(published)))

# Step A: Publish analyzed items with qscore >= 0.7
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

print("\n=== A) Publish analyzed items with q>=0.7: %d ===" % len(to_publish))
if to_publish:
    for a, qscore, price in to_publish:
        aid = a["id"]
        title = str(a.get("title", "?"))[:30]
        print("[%s] %-30s q=%.2f -> %d UT" % (aid[:8], title, qscore, price), end=" ... ")
        result = api_post("/api/v1/digital-assets/%s/publish" % aid, {"price_ut": price})
        if result.get("code") == 0:
            print("OK")
        else:
            print("FAIL: %s" % str(result.get("error","?"))[:100])
        time.sleep(0.2)

# Step B: Check published items - which have old low prices?
print("\n=== B) Published items with q>=0.7 and old prices ===")
needs_update = []
for a in published:
    qs = a.get("quality_score")
    if not qs:
        continue
    try:
        qscore = float(qs)
    except:
        continue
    if qscore < 0.7:
        continue
    actual_price = float(a.get("actual_price_ut", 0) or 0)
    new_price = get_price(qscore)
    if actual_price < 500:  # still at old price
        needs_update.append((a, qscore, new_price))

needs_update.sort(key=lambda x: x[1], reverse=True)
print("Found %d items still at low prices" % len(needs_update))
for a, qscore, price in needs_update[:10]:
    aid = a["id"][:8]
    title = str(a.get("title", "?"))[:30]
    old_price = a.get("actual_price_ut", "?")
    print("[%s] %-30s q=%.2f old=%s -> %d UT" % (aid, title, qscore, old_price, price))

# Process in small batches
batch_size = 10
for i in range(0, len(needs_update), batch_size):
    batch = needs_update[i:i+batch_size]
    print("\n--- Batch %d/%d (%d items) ---" % (i//batch_size + 1, (len(needs_update)-1)//batch_size + 1, len(batch)))
    
    # Unpublish batch
    for a, qscore, price in batch:
        aid = a["id"]
        title = str(a.get("title", "?"))[:25]
        print("  Unpublish [%s] %s" % (aid[:8], title), end=" ... ")
        result = api_post("/api/v1/digital-assets/%s/unpublish" % aid)
        if result.get("code") == 0:
            print("OK")
        else:
            print("FAIL: %s" % str(result.get("error","?"))[:80])
        time.sleep(0.2)
    
    # Wait then publish
    time.sleep(1)
    
    # Publish batch
    for a, qscore, price in batch:
        aid = a["id"]
        title = str(a.get("title", "?"))[:25]
        print("  Publish [%s] %s @ %d" % (aid[:8], title, price), end=" ... ")
        result = api_post("/api/v1/digital-assets/%s/publish" % aid, {"price_ut": price})
        if result.get("code") == 0:
            print("OK")
        else:
            print("FAIL: %s" % str(result.get("error","?"))[:80])
        time.sleep(0.2)

print("\n=== FINAL CHECK ===")
# Final state
all_items2 = []
page = 1
while True:
    resp = api_get("/api/v1/digital-assets?page=%d&page_size=100" % page)
    items = resp.get("data", {}).get("items", [])
    all_items2.extend(items)
    if not resp.get("data", {}).get("has_more"):
        break
    page += 1

print("Final total: %d" % len(all_items2))
analyzed_final = [a for a in all_items2 if a.get("status") == "analyzed"]
published_final = [a for a in all_items2 if a.get("status") == "published"]
print("Analyzed: %d, Published: %d" % (len(analyzed_final), len(published_final)))

# Show high-quality published with their new prices
print("\nAll published items with q>=0.7 and their prices:")
high_pub = []
for a in published_final:
    qs = a.get("quality_score")
    if qs:
        try:
            qscore = float(qs)
            if qscore >= 0.7:
                high_pub.append(a)
        except:
            pass
high_pub.sort(key=lambda x: float(x.get("quality_score",0)), reverse=True)

for a in high_pub:
    aid = a["id"][:8]
    title = str(a.get("title", "?"))[:35]
    qscore = a.get("quality_score", "?")
    price = a.get("actual_price_ut", "?")
    print("[%s] q=%s price=%s UT %s" % (aid, qscore, price, title))

# Show any remaining analyzed items
print("\nRemaining analyzed items:")
for a in analyzed_final:
    aid = a["id"][:8]
    title = str(a.get("title", "?"))[:35]
    qscore = a.get("quality_score", "?")
    qstatus = a.get("quality_assessment_status", "?")
    print("[%s] q=%s qstatus=%s %s" % (aid, qscore, qstatus, title))
