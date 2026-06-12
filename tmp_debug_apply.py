#!/usr/bin/env python3
"""调试API调用"""
import json, os, subprocess

with open(os.environ['HOME'] + '/.hermes/skills/uumit-agent/memory/uumit-auth.json') as f:
    auth = json.load(f)
KEY = auth['cached_api_key']
MYUID = auth['cached_user_id']

# Test: simple GET first
print("=== GET测试 ===")
cmd = ['curl', '-s', '--max-time', '10',
    '-H', f'X-Api-Key: {KEY}',
    '-H', f'X-Platform-User-Id: {MYUID}',
    'https://api.uumit.com/api/v1/tasks/applications/mine?page=1&page_size=3']
r = subprocess.run(cmd, capture_output=True, timeout=20)
print(f"STDOUT[:500]: {r.stdout.decode('utf-8')[:500]}")
print(f"STDERR[:200]: {r.stderr.decode('utf-8')[:200]}")

# Test: try a POST with empty body to see if the endpoint works
print("\n=== POST测试（申请一个任务）===")
import uuid
AQIANG_TASK_ID = "bc7f4244-0d5e-4e12-88c1-19595aaa6cfb"  # API接口对接 - 数据同步

body = json.dumps({
    'skill_id': 'bc4784d5-0993-409a-a6fd-40eb5f7ac418',
    'message': '申请接单，可完成技术开发任务。',
    'proposed_price': '200.00'
}, ensure_ascii=False)

print(f"Body: {body}")

cmd2 = [
    'curl', '-v', '-s', '--max-time', '15', '-X', 'POST',
    '-H', f'X-Api-Key: {KEY}',
    '-H', f'X-Platform-User-Id: {MYUID}',
    '-H', 'Content-Type: application/json',
    '-H', f'Idempotency-Key: debug-aqiang-test',
    '-d', body.encode('utf-8'),
    f'https://api.uumit.com/api/v1/tasks/{AQIANG_TASK_ID}/applications'
]
r2 = subprocess.run(cmd2, capture_output=True, timeout=20)
print(f"STDOUT: {r2.stdout.decode('utf-8')[:500]}")
print(f"STDERR: {r2.stderr.decode('utf-8')[:500]}")
