#!/usr/bin/env python3
"""List all UUMit digital assets with detailed status"""
import json, urllib.request

with open("/home/muqiqiang/.hermes/skills/uumit-agent/memory/uumit-auth.json") as f:
    auth = json.load(f)
api_key = auth["cached_api_key"]
user_id = auth["cached_user_id"]
headers = {"X-Api-Key": api_key, "X-Platform-User-Id": user_id}

def api_get(path):
    req = urllib.request.Request("https://api.uumit.com" + path, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

all_items = []
page = 1
while True:
    resp = api_get("/api/v1/digital-assets?page=%d&page_size=100" % page)
    items = resp.get("data", {}).get("items", [])
    all_items.extend(items)
    has_more = resp.get("data", {}).get("has_more", False)
    if not has_more:
        break
    page += 1

print("Total assets: %d" % len(all_items))

ai_failed = [a for a in all_items if a.get("quality_assessment_status") == "failed"]
ai_passed = [a for a in all_items if a.get("quality_assessment_status") == "success"]

print("\n=== AI FAILED (quality_assessment_status=failed) ===")
failed_published = [a for a in ai_failed if a.get("published") == True]
failed_unpublished = [a for a in ai_failed if a.get("published") != True]

print("Published & failed: %d" % len(failed_published))
for a in failed_published:
    aid = a.get("id", "?")
    title = a.get("title", "?")
    price = a.get("actual_price_ut", "?")
    print("  [%s] %s price=%s" % (aid[:8], title, price))

print("\nUnpublished & failed: %d" % len(failed_unpublished))
for a in failed_unpublished:
    aid = a.get("id", "?")
    title = a.get("title", "?")
    print("  [%s] %s" % (aid[:8], title))

print("\n=== AI PASSED (unpublished, qscore >= 0.7) ===")
passed_q07 = []
for a in ai_passed:
    if a.get("published") == True:
        continue
    qs = a.get("quality_score")
    if qs and float(qs) >= 0.7:
        passed_q07.append(a)

print("Count: %d" % len(passed_q07))
for a in passed_q07:
    aid = a.get("id", "?")
    title = a.get("title", "?")
    qscore = a.get("quality_score", "?")
    suggested = a.get("suggested_price_ut", "?")
    print("  [%s] %s qscore=%s suggested=%s" % (aid[:8], title, qscore, suggested))

print("\n=== AI PASSED (unpublished, qscore < 0.7) ===")
passed_low = []
for a in ai_passed:
    if a.get("published") == True:
        continue
    qs = a.get("quality_score")
    if qs and float(qs) < 0.7:
        passed_low.append(a)

print("Count: %d" % len(passed_low))
for a in passed_low:
    aid = a.get("id", "?")
    title = a.get("title", "?")
    qscore = a.get("quality_score", "?")
    print("  [%s] %s qscore=%s" % (aid[:8], title, qscore))
