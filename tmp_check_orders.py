#!/usr/bin/env python3
"""检查所有待交付订单，特别是与阿强相关的"""
import json, os, urllib.request

with open(os.environ['HOME'] + '/.hermes/skills/uumit-agent/memory/uumit-auth.json') as f:
    auth = json.load(f)
KEY = auth['cached_api_key']
MYUID = auth['cached_user_id']
AQIANG_ID = "4e3941ba-22be-406a-8575-d9cb8a13eb87"

def api_get(path):
    req = urllib.request.Request(
        f'https://api.uumit.com{path}',
        headers={'X-Api-Key': KEY, 'X-Platform-User-Id': MYUID}
    )
    return json.loads(urllib.request.urlopen(req, timeout=15).read())

# === 我的所有订单 ===
print("=== 我的卖家订单（seller）===")
r = api_get('/api/v1/orders?page=1&page_size=50')
items = r.get('data', {}).get('items', [])
print(f"总订单数: {r.get('data',{}).get('total',0)}")

pending_delivery = []
for o in items:
    seller_id = o.get('seller_id', '')
    if seller_id == MYUID:
        status = o.get('status', '?')
        amt = o.get('settlement_amount', '?')
        order_no = o.get('order_no', '?')
        buyer_name = o.get('buyer_nickname', '?')
        buyer_id = o.get('buyer_id', '')[:12]
        title = o.get('task_title', '')[:35]
        oid = o.get('id', '')[:12]
        is_aqiang = '阿强' if o.get('buyer_id', '') == AQIANG_ID else ''

        print(f"  [{status:20s}] {amt:>5s}UT | {buyer_name:8s}{is_aqiang:4s} | {title}")

        if status == 'pending_delivery':
            pending_delivery.append(o)

print(f"\n=== 待交付订单: {len(pending_delivery)} 个 ===")
for o in pending_delivery:
    oid = o.get('id', '')
    amt = o.get('settlement_amount', '?')
    order_no = o.get('order_no', '?')
    title = o.get('task_title', '')[:40]
    buyer_id = o.get('buyer_id', '')[:16]
    buyer_name = o.get('buyer_nickname', '?')
    created = o.get('created_at', '?')
    print(f"  {order_no} | {amt}UT | 买家:{buyer_name}({buyer_id}) | {title}")
    print(f"    订单ID: {oid}")
    print(f"    创建: {created}")

# === 如果是阿强的任务，看看任务详情 ===
print("\n=== 阿强作为买家的订单 ===")
aqiang_orders = [o for o in items if o.get('buyer_id', '') == AQIANG_ID]
print(f"共 {len(aqiang_orders)} 笔")
for o in aqiang_orders:
    status = o.get('status', '?')
    amt = o.get('settlement_amount', '?')
    title = o.get('task_title', '')[:40]
    order_no = o.get('order_no', '?')
    print(f"  {status:20s} | {amt:>5s}UT | {order_no} | {title}")

# === 简单查看一下我的申请状态 ===
print("\n=== 我最近申请的阿强任务状态 ===")
r2 = api_get('/api/v1/tasks/applications/mine?page=1&page_size=50')
apps = r2.get('data', {}).get('items', [])
for a in apps:
    tid = a.get('task_id', '')
    # Check if task is by 阿强
    task_info = a.get('task', {})
    if task_info.get('user_id', '') == AQIANG_ID:
        app_status = a.get('status', '?')
        task_status = task_info.get('status', '?')
        title = a.get('task_title', '')[:35]
        bounty = task_info.get('bounty_amount', '?')
        print(f"  申请:{app_status:10s} | 任务:{task_status:10s} | {bounty:>5s}UT | {title}")
