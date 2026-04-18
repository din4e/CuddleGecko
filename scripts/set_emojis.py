import urllib.request, json, sys, io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

data = json.dumps({'username':'demo','password':'test123'}).encode()
req = urllib.request.Request('http://localhost:8080/api/auth/login', data=data, headers={'Content-Type':'application/json'})
token = json.loads(urllib.request.urlopen(req).read())['data']['access_token']

emojis = {
    2: '\U0001f468',
    3: '\U0001f469',
    4: '\U0001f454',
    5: '\U0001f415',
    6: '\U0001f431',
    7: '\U0001f468\u200d\U0001f3eb',
    8: '\U0001f469\u200d\U0001f373',
    9: '\U0001f436',
    10: '\U0001f468\u200d\u2695\ufe0f',
    11: '\U0001f63a',
}

for cid, emoji in emojis.items():
    body = json.dumps({'avatar_emoji': emoji}).encode('utf-8')
    req = urllib.request.Request(
        f'http://localhost:8080/api/contacts/{cid}',
        data=body,
        headers={'Content-Type': 'application/json; charset=utf-8', 'Authorization': f'Bearer {token}'},
        method='PUT'
    )
    resp = urllib.request.urlopen(req)
    name = json.loads(resp.read())['data']['name']
    print(f'OK: {name}')

print('All done!')
