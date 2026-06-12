#!/usr/bin/env python3
"""
Phase 1: Publish items that were already unpublished (now in 'analyzed' state)
Phase 2: Continue unpublishing remaining high-quality items and publish them
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
    if qscore >= 0.98: return 1500
    elif qscore >= 0.95: return 1280
    elif qscore >= 0.92: return 1080
    elif qscore >= 0.88: return 880
    elif qscore >= 0.82: return 680
    elif qscore >= 0.78: return 580
    else: return 500

# Get all items
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

# Separate analyzed vs published
analyzed = [a for a in all_items if a.get("status") == "analyzed"]
published = [a for a in all_items if a.get("status") == "published"]

print("Analyzed: %d, Published: %d" % (len(analyzed), len(published)))

# Items to analyze (already unpublished, need to publish with new prices)
to_publish = []
for a in analyzed:
    qs = a.get("quality_score")
    if qs:
        try:
            qscore = float(qs)
            if qscore >= 0.7:
                to_publish.append((a, qscore, get_price(qscore)))
        except:
            pass

# Items still published that need higher prices
to_unpublish = []
for a in published:
    qs = a.get("quality_score")
    if qs:
        try:
            qscore = float(qs)
            if qscore >= 0.7:
                to_unpublish.append((a, qscore, get_price(qscore)))
        except:
            pass

to_publish.sort(key=lambda x: x[1], reverse=True)
to_unpublish.sort(key=lambda x: x[1], reverse=True)

print("\n=== Phase 1: PUBLISHING %d already-unpublished items ===" % len(to_publish))
ok = 0
fail = 0
for a, qscore, price in to_publish:
    aid = a["id"]
    title = str(a.get("title", "?"))[:30]
    print("[%s] %-30s q=%.2f -> %d UT" % (aid[:8], title, qscore, price), end=" ... ")
    result = api_post("/api/v1/digital-assets/%s/publish" % aid, {"price_ut": price})
    if result.get("code") == 0:
        print("OK")
        ok += 1
    else:
        err = str(result.get("error", "?"))[:100]
        print("FAIL: %s" % err)
        fail += 1
    time.sleep(0.2)
print("Phase 1 done: %d ok, %d failed" % (ok, fail))

print("\n=== Phase 2: UNPUBLISHING %d remaining high-quality items ===" % len(to_unpublish))
ok2 = 0
fail2 = 0
for a, qscore, price in to_unpublish:
    aid = a["id"]
    title = str(a.get("title", "?"))[:30]
    print("[%s] %-30s q=%.2f -> %d UT" % (aid[:8], title, qscore, price), end=" ... ")
    result = api_post("/api/v1/digital-assets/%s/unpublish" % aid)
    if result.get("code") == 0:
        print("OK")
        ok2 += 1
    else:
        err = str(result.get("error", "?"))[:100]
        print("FAIL: %s" % err)
        fail2 += 1
    time.sleep(0.2)
print("Phase 2 done: %d ok, %d failed" % (ok2, fail2))

if ok2 > 0:
    print("\n=== Phase 3: PUBLISHING the newly unpublished items ===")
    # Re-fetch to get updated status
    all_items2 = []
    page = 1
    while True:
        resp = api_get("/api/v1/digital-assets?page=%d&page_size=100" % page)
        items = resp.get("data", {}).get("items", [])
        all_items2.extend(items)
        if not resp.get("data", {}).get("has_more"):
            break
        page += 1

    analyzed2 = [a for a in all_items2 if a.get("status") == "analyzed"]
    to_publish2 = []
    for a in analyzed2:
        qs = a.get("quality_score")
        if qs:
            try:
                qscore = float(qs)
                if qscore >= 0.7:
                    to_publish2.append((a, qscore, get_price(qscore)))
            except:
                pass
    to_publish2.sort(key=lambda x: x[1], reverse=True)

    print("Found %d items to publish" % len(to_publish2))
    ok3 = 0
    fail3 = 0
    for a, qscore, price in to_publish2:
        aid = a["id"]
        title = str(a.get("title", "?"))[:30]
        print("[%s] %-30s q=%.2f -> %d UT" % (aid[:8], title, qscore, price), end=" ... ")
        result = api_post("/api/v1/digital-assets/%s/publish" % aid, {"price_ut": price})
        if result.get("code") == 0:
            print("OK")
            ok3 += 1
        else:
            err = str(result.get("error", "?"))[:100]
            print("FAIL: %s" % err)
            fail3 += 1
        time.sleep(0.2)
    print("Phase 3 done: %d ok, %d failed" % (ok3, fail3))
else:
    print("Phase 3 skipped - no items were unpublished")
