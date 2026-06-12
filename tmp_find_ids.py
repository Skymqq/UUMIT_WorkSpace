#!/usr/bin/env python3
"""获取失败任务的完整ID"""
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

# Scan page 1 for tasks
r = curl_get('/api/v1/tasks/hall?page=1&page_size=50')
items = r.get('data', {}).get('items', [])

# Look for the specific tasks
for t in items:
    title = t.get('title', '')
    status = t.get('status', '')
    if '分享5个实用的AI' in title or '足球高阶信息' in title or 'temu采集' in title:
        tid = t.get('id', '')
        my_app = t.get('my_application_status')
        print(f"  ID: {tid}")
        print(f"  Title: {title}")
        print(f"  Status: {status}, my_app: {my_app}")
        print(f"  Bounty: {t.get('bounty_amount','?')}")
        print()

# Also check my_applications/mine to see if the 2 failed ones have pending apps
print("\n=== 检查我的申请状态 ===")
r2 = curl_get('/api/v1/tasks/applications/mine?page=1&page_size=50')
apps = r2.get('data', {}).get('items', [])
for a in apps:
    title = a.get('task_title', '')
    if '分享5个' in title or '足球' in title:
        print(f"  Status: {a.get('status','?')} | {title}")
