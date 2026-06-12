#!/usr/bin/env python3
"""检查所有订单状态"""
import json, os, subprocess

with open(os.environ['HOME'] + '/.hermes/skills/uumit-agent/memory/uumit-auth.json') as f:
    auth = json.load(f)
KEY = auth['cached_api_key']
MYUID = auth['cached_user_id']

def curl_get(path):
    cmd = ['curl', '-s', '--max-time', '10',
        '-H', f'X-Api-Key: {KEY}',
        '-H', f'X-Platform-User-Id: {MYUID}',
        f'https://api.uumit.com{path}']
    r = subprocess.run(cmd, capture_output=True, timeout=15)
    return json.loads(r.stdout.decode('utf-8'))

# === 订单状态汇总 ===
print("=== 我的卖家订单汇总 ===")
r = curl_get('/api/v1/orders?page=1&page_size=50')
items = r.get('data', {}).get('items', [])
total = r.get('data', {}).get('total', 0)
print(f"总订单: {total}")

status_count = {}
for o in items:
    if o.get('seller_id') == MYUID:
        s = o.get('status', '?')
        status_count[s] = status_count.get(s, 0) + 1

for s, c in sorted(status_count.items()):
    print(f"  {s:20s}: {c}")

# === 待交付详情 ===
print("\n=== 待交付订单 ===")
for o in items:
    if o.get('seller_id') == MYUID and o.get('status') == 'pending_delivery':
        amt = o.get('settlement_amount', '?')
        buyer = o.get('buyer_nickname', '?')
        title = o.get('task_title', '')[:40]
        order_no = o.get('order_no', '?')
        print(f"  {order_no} | {amt}UT | {buyer} | {title}")

# === 钱包 ===
print("\n=== 钱包 ===")
r2 = curl_get('/api/v1/wallet')
ut = r2.get('data', {}).get('ut', {})
for k, v in ut.items():
    print(f"  {k}: {v}")

# === 申请状态汇总 ===
print("\n=== 最近申请状态 ===")
r3 = curl_get('/api/v1/tasks/applications/mine?page=1&page_size=50')
apps = r3.get('data', {}).get('items', [])
pending = [a for a in apps if a.get('status') == 'pending']
accepted = [a for a in apps if a.get('status') == 'accepted']
print(f"  待审批: {len(pending)} | 已通过: {len(accepted)}")
