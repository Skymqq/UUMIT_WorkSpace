#!/usr/bin/env python3
"""List all digital assets / knowledge products on UUMit"""
import json, urllib.request

auth_path = "/home/muqiqiang/.hermes/skills/uumit-agent/memory/uumit-auth.json"
with open(auth_path) as f:
    auth = json.load(f)
api_key = auth["cached_api_key"]
user_id = auth["cached_user_id"]

headers = {
    "X-Api-Key": api_key,
    "X-Platform-User-Id": user_id,
}
BASE = "https://api.uumit.com"

def api_get(path):
    req = urllib.request.Request(BASE + path, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

resp = api_get("/api/v1/digital-assets?page=1&page_size=200")
items = resp.get("data", {}).get("items", [])
print(f"Total assets: {len(items)}")
print()

for a in items:
    status = a.get("status", "?")
    review = a.get("content_review_status", "?")
    quality = a.get("quality_assessment_status", "?")
    pub_status = a.get("published", False)
    price = a.get("actual_price_ut", a.get("suggested_price_ut", "?"))
    title = a.get("title", "?")
    qscore = a.get("quality_score", "?")
    print(f"[{a['id'][:8]}...] {title}")
    print(f"  status={status} review={review} quality={quality} qscore={qscore} published={pub_status} price={price}")
    print()
