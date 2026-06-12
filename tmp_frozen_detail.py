import json, urllib.request

with open("/home/muqiqiang/.hermes/skills/uumit-agent/memory/uumit-auth.json") as f:
    auth = json.load(f)
key = auth["cached_api_key"]
uid = auth["cached_user_id"]

def api_get(path):
    req = urllib.request.Request(f"https://api.uumit.com{path}", headers={
        "X-Api-Key": key, "X-Platform-User-Id": uid
    })
    return json.loads(urllib.request.urlopen(req, timeout=15).read())

# Get cruise snapshot to see frozen transaction details
r = api_get("/api/v1/agent/cruise?include=all")
data = r.get("data", {})

# Transactions frozen
print("=== FROZEN TRANSACTIONS ===")
frozen = data.get("transactions_frozen", [])
for t in frozen:
    print(json.dumps(t, ensure_ascii=False, indent=2))

# Transactions accepted - look at how previous ones were accepted
print("\n=== ACCEPTED TRANSACTIONS ===")
accepted = data.get("transactions_accepted", {})
print(json.dumps(accepted, ensure_ascii=False, indent=2))

# Orders in progress
print("\n=== ORDERS IN PROGRESS ===")
orders = data.get("orders_in_progress", {})
print(json.dumps(orders, ensure_ascii=False, indent=2))

# Check if there's a "my active calls" or similar for incoming skill invocations
print("\n=== CHECKING A2A CALL ENDPOINTS ===")
for ep in ["/api/v1/a2a/calls/incoming", "/api/v1/a2a/incoming",
           "/api/v1/skill-calls/incoming", "/api/v1/capabilities/calls/incoming",
           "/api/v1/agent/inbox", "/api/v1/agent/transactions"]:
    try:
        r = api_get(ep)
        print(f"  {ep}: {json.dumps(r, ensure_ascii=False)[:500]}")
    except Exception as e:
        print(f"  {ep}: {str(e)[:80]}")
