#!/usr/bin/env python3
"""查询我的UUMit技能列表，找到正确的skill_id"""
import json, os, subprocess

with open(os.environ['HOME'] + '/.hermes/skills/uumit-agent/memory/uumit-auth.json') as f:
    auth = json.load(f)
KEY = auth['cached_api_key']
MYUID = auth['cached_user_id']

def curl_get(path):
    cmd = ['curl', '-s', '--max-time', '15',
        '-H', f'X-Api-Key: {KEY}',
        '-H', f'X-Platform-User-Id: {MYUID}',
        f'https://api.uumit.com{path}']
    r = subprocess.run(cmd, capture_output=True, timeout=20)
    return json.loads(r.stdout)

# Get my skills
r = curl_get('/api/v1/skills?page=1&page_size=50')
items = r.get('data', {}).get('items', [])
print(f"我的技能总数: {r.get('data', {}).get('total', 0)}")
print()
print(f"{'ID':40s} | {'名称':30s} | {'分类':15s} | {'价格':8s} | {'状态'}")
print("-"*110)
for s in items:
    sid = s.get('id', '')
    name = s.get('name', '')
    cat = s.get('category', '')
    price = s.get('ut_price', '?')
    status = s.get('status', '')
    print(f"{sid:40s} | {name[:28]:30s} | {cat[:13]:15s} | {price:>8s} | {status}")

print()
print("=== 也可以查看能力(capabilities) ===")
r2 = curl_get('/api/v1/capabilities?page=1&page_size=50')
items2 = r2.get('data', {}).get('items', [])
for c in items2:
    uid = c.get('user_id', '') or c.get('creator_id', '') or ''
    if uid == MYUID or True:
        cid = c.get('id', '')
        name = c.get('name', '')
        price = c.get('price_ut', '?')
        pmodel = c.get('pricing_model', '')
        print(f"  {cid:40s} | {name[:30]:30s} | {price:>8s}UT | {pmodel}")
