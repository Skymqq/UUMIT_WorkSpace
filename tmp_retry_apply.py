#!/usr/bin/env python3
"""重试申请失败的任务 - 用临时文件方式提交"""
import json, os, subprocess, uuid

with open(os.environ['HOME'] + '/.hermes/skills/uumit-agent/memory/uumit-auth.json') as f:
    auth = json.load(f)
KEY = auth['cached_api_key']
MYUID = auth['cached_user_id']

TASKS = [
    {"id": "fca0102d-25a7-4706-8ae5-2bd400538fe1", "title": "分享5个实用的AI文案生成工具", "bounty": "100.00", "category": "文案写作"},
    {"id": "47b7ade2-4447-40c6-a951-577ef5f8b26f", "title": "足球高阶信息免费获取的爬虫", "bounty": "100.00", "category": "技术开发"},
]

SKILL_MAP = {
    '文案写作': '1e6ca4e2-de38-401a-8a56-8ada339ffddf',
    '技术开发': 'bc4784d5-0993-409a-a6fd-40eb5f7ac418',
}

for t in TASKS:
    skill_id = SKILL_MAP[t['category']]
    body = {
        'skill_id': skill_id,
        'message': f'申请接单，可完成{t["category"]}任务。',
        'proposed_price': t['bounty']
    }

    # Write to temp file
    tmpfile = f'/tmp/apply_{t["id"][:8]}.json'
    with open(tmpfile, 'w', encoding='utf-8') as f:
        json.dump(body, f, ensure_ascii=False)

    idem_key = f'retry-{uuid.uuid4().hex[:12]}'
    cmd = [
        'curl', '-s', '--max-time', '15', '-X', 'POST',
        '-H', f'X-Api-Key: {KEY}',
        '-H', f'X-Platform-User-Id: {MYUID}',
        '-H', 'Content-Type: application/json',
        '-H', f'Idempotency-Key: {idem_key}',
        '-d', f'@{tmpfile}',
        f'https://api.uumit.com/api/v1/tasks/{t["id"]}/applications'
    ]

    r = subprocess.run(cmd, capture_output=True, timeout=20)
    stdout = r.stdout.decode('utf-8')
    print(f"响应: {stdout[:300]}")
    try:
        resp = json.loads(stdout)
        if resp.get('code') == 0:
            print(f'  ✅ {t["bounty"]}UT | {t["title"][:30]} | 申请成功')
        elif resp.get('code') == 4001:
            print(f'  ⏳ {t["bounty"]}UT | {t["title"][:30]} | 已申请过')
        else:
            print(f'  ❌ {t["bounty"]}UT | {t["title"][:30]} | {resp.get("message","")}')
    except:
        print(f'  ❌ {t["bounty"]}UT | {t["title"][:30]} | 解析失败')

    os.remove(tmpfile)
