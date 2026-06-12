#!/usr/bin/env python3
"""Final verification of all knowledge products"""
import json, urllib.request

with open("/home/muqiqiang/.hermes/skills/uumit-agent/memory/uumit-auth.json") as f:
    auth = json.load(f)
api_key = auth["cached_api_key"]
user_id = auth["cached_user_id"]
headers = {"X-Api-Key": api_key, "X-Platform-User-Id": user_id}
BASE = "https://api.uumit.com"

def api_get(path):
    req = urllib.request.Request(BASE + path, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

all_items = []
page = 1
while True:
    resp = api_get("/api/v1/digital-assets?page=%d&page_size=100" % page)
    items = resp.get("data", {}).get("items", [])
    all_items.extend(items)
    if not resp.get("data", {}).get("has_more"):
        break
    page += 1

print("=" * 60)
print("FINAL VERIFICATION REPORT")
print("=" * 60)
print("Total items: %d\n" % len(all_items))

# Deleted check: 7 AI-failed items removed
# Only items with quality_assessment_status=failed
failed = [a for a in all_items if a.get("quality_assessment_status") == "failed"]
print("AI-failed items remaining: %d (should be 0)" % len(failed))

# Status breakdown
analyzed = [a for a in all_items if a.get("status") == "analyzed"]
published = [a for a in all_items if a.get("status") == "published"]
print("Analyzed: %d, Published: %d" % (len(analyzed), len(published)))

# High quality published items (q>=0.7) with prices
high_pub = []
low_pub = []
for a in published:
    qs = a.get("quality_score")
    price = float(a.get("actual_price_ut", 0) or 0)
    qscore = float(qs) if qs else 0
    if qscore >= 0.7:
        high_pub.append((a, qscore, price))
    else:
        low_pub.append((a, qscore, price))

print("\n--- High-quality published (q>=0.7): %d ---" % len(high_pub))
high_pub.sort(key=lambda x: x[1], reverse=True)
for a, qs, price in high_pub:
    aid = a["id"][:8]
    title = str(a.get("title", "?"))
    print("  [%s] q=%.2f price=%.0f UT %s" % (aid, qs, price, title[:40]))

print("\n--- Low-quality published (q<0.7): %d ---" % len(low_pub))
for a, qs, price in low_pub:
    aid = a["id"][:8]
    title = str(a.get("title", "?"))
    print("  [%s] q=%.2f price=%.0f UT %s" % (aid, qs, price, title[:40]))

print("\n--- Remaining analyzed items: %d ---" % len(analyzed))
for a in analyzed:
    aid = a["id"][:8]
    title = str(a.get("title", "?"))
    qs = a.get("quality_score", "?")
    qstatus = a.get("quality_assessment_status", "?")
    print("  [%s] q=%s status=%s %s" % (aid, qs, qstatus, title[:40]))
