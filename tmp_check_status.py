#!/usr/bin/env python3
"""
Check what's actually published and verify prices
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

# Check status distribution
status_dist = {}
for a in all_items:
    s = a.get("status", "?")
    status_dist[s] = status_dist.get(s, 0) + 1
print("Status distribution:", status_dist)

# Show published items with their actual prices
published = [a for a in all_items if a.get("status") == "published"]
print("\n=== Published items (%d) ===" % len(published))
for a in published:
    aid = a.get("id", "?")[:8]
    title = a.get("title", "?")[:35]
    qscore = a.get("quality_score", "?")
    actual_price = a.get("actual_price_ut", "?")
    suggested_price = a.get("suggested_price_ut", "?")
    print("[%s] %-35s q=%s actual=%s suggested=%s" % (aid, title, qscore, actual_price, suggested_price))

# Show analyzed items (ready to publish)
analyzed = [a for a in all_items if a.get("status") == "analyzed"]
print("\n=== Analyzed items (%d) ===" % len(analyzed))
for a in analyzed:
    aid = a.get("id", "?")[:8]
    title = a.get("title", "?")[:35]
    qscore = a.get("quality_score", "?")
    qstatus = a.get("quality_assessment_status", "?")
    qgate = a.get("quality_gate_status", "?")
    print("[%s] %-35s q=%s qstatus=%s qgate=%s" % (aid, title, qscore, qstatus, qgate))
