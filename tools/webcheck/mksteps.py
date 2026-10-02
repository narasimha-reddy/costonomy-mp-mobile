import json, sys
access, refresh, path = sys.argv[1], sys.argv[2], sys.argv[3]
inject = (
    "(()=>{localStorage.setItem('mp.accessToken'," + json.dumps(access) + ");"
    "localStorage.setItem('mp.refreshToken'," + json.dumps(refresh) + ");"
    "return 'stored'})()"
)
extra = json.loads(sys.argv[4]) if len(sys.argv) > 4 else []
print(json.dumps([
    {"wait": 2500},
    {"eval": inject},
    {"eval": "location.href='http://localhost:7071" + path + "'"},
    {"wait": 4500},
] + extra))
