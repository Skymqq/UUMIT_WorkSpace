#!/usr/bin/env python3
"""
扫大厅单 - 批量申请，避免互刷单
v2 - 使用curl提高稳定性
"""
import json, os, sys, uuid, subprocess

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

def apply_task(task_id, skill_id, title, bounty, category):
    body = json.dumps({
        'skill_id': skill_id,
        'message': f'申请接单，可完成此{category}任务。',
        'proposed_price': str(bounty)
    }, ensure_ascii=False)

    idem_key = f'scan-{uuid.uuid4().hex[:12]}'

    cmd = [
        'curl', '-s', '--max-time', '15', '-X', 'POST',
        '-H', f'X-Api-Key: {KEY}',
        '-H', f'X-Platform-User-Id: {MYUID}',
        '-H', 'Content-Type: application/json',
        '-H', f'Idempotency-Key: {idem_key}',
        '--data-binary', body.encode('utf-8'),
        f'https://api.uumit.com/api/v1/tasks/{task_id}/applications'
    ]

    r = subprocess.run(cmd, capture_output=True, timeout=20)
    try:
        resp = json.loads(r.stdout.decode('utf-8'))
    except:
        print(f'  ❌ [{task_id[:12]}] {bounty}UT | {title[:35]:35s} | API返回空')
        return False

    if resp.get('code') == 0:
        print(f'  ✅ [{task_id[:12]}] {bounty}UT | {title[:35]:35s} | 申请成功')
        return True
    elif resp.get('code') == 4001:
        print(f'  ⏳ [{task_id[:12]}] {bounty}UT | {title[:35]:35s} | 已申请过')
        return True
    else:
        print(f'  ❌ [{task_id[:12]}] {bounty}UT | {title[:35]:35s} | {resp.get("message","未知错误")}')
        return False

# 真实技能ID
SKILL_MAP = {
    '技术开发': 'bc4784d5-0993-409a-a6fd-40eb5f7ac418',
    'AI与自动化': 'c4aff1f7-6c5e-4cc1-a357-3a87c9007f77',
    '数据处理': 'b1c26339-4954-4c73-b7e6-ae315994d6e8',
    '文案写作': '1e6ca4e2-de38-401a-8a56-8ada339ffddf',
    '设计服务': 'c3e3c780-582d-4694-8405-bb08e033132e',
    '教育培训': '6fccb55a-1386-4cf2-a58c-553e0f31c062',
    '人事行政': '61c299ba-66d8-460b-ae66-3228ad9174ba',
    '科研学术': '2e130b2d-2423-4007-82b1-abc0fe863d0f',
    '翻译服务': '8c05a600-dc2e-45de-9533-13b86dcca999',
    '动漫绘画': '36f59976-cb26-41ee-bc3a-a76dd1fa794b',
}

# 跳过互刷类别
SKIP_CATEGORIES = {'其他', '营销推广', '咨询顾问', '电商运营'}
SKIP_USER_IDS = {MYUID}

# === STEP 1: Scan hall ===
print("=== 扫大厅（跳过互刷: " + "、".join(sorted(SKIP_CATEGORIES)) + "）===")
print()

all_candidates = []
total_scanned = 0

for page in range(1, 11):  # Max 10 pages
    r = curl_get(f'/api/v1/tasks/hall?page={page}&page_size=50')
    items = r.get('data', {}).get('items', [])
    if not items:
        break

    for t in items:
        total_scanned += 1
        status = t.get('status', '')
        my_app = t.get('my_application_status')
        user_id = t.get('user_id', '')
        category = t.get('category', '')
        title = t.get('title', '无标题')
        bounty = t.get('bounty_amount', '0')
        tid = t.get('id', '')[:12]

        # Skip rules
        if status != 'open':
            continue
        if my_app is not None:
            continue
        if user_id in SKIP_USER_IDS:
            continue
        if category in SKIP_CATEGORIES:
            continue

        all_candidates.append(t)
        has_skill = '✅' if category in SKILL_MAP else '❌'
        print(f"  [{tid}] {bounty:>5s}UT | {category:8s} | {has_skill} | {title[:45]}")

print(f"\n扫描{total_scanned}条，找到 {len(all_candidates)} 个可申请非互刷任务")

# Filter only tasks with matching skills
apply_list = [t for t in all_candidates if t.get('category', '') in SKILL_MAP]
print(f"有匹配技能的: {len(apply_list)} 个")

if not apply_list:
    print("✅ 没有可申请的任务")
    sys.exit(0)

# === STEP 2: Apply ===
print("\n=== 开始申请 ===")
suc, fail, dup = 0, 0, 0

for t in apply_list:
    r = apply_task(t['id'], SKILL_MAP[t['category']],
                   t['title'], t['bounty_amount'], t['category'])
    if r:
        suc += 1
    else:
        fail += 1

print(f"\n结果: ✅ {suc} 成功 | {fail} 失败")
