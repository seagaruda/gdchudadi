#!/usr/bin/env python3
"""直接调 Android Publisher API 上传 AAB 到 internal 轨道。

为什么不用 gplay：gplay 2.3.2 上传到 internal 时会带上 userFraction=1.0，
Google 对 COMPLETED 状态拒绝该字段（COMPLETED release must not have fraction）。
这里用 resumable upload 分块 + 重试，payload 不带 fraction。

用法：
  python3 scripts/gplay-upload-internal.py <aab> <track> <versionName> <releaseNotes> [locale]
"""
import base64, json, os, subprocess, sys, tempfile, time
import urllib.request, urllib.error

KEY = os.path.expanduser('~/.gplay/service-account.json')
PKG = 'com.gdchudadi.app'
CHUNK = 4 * 1024 * 1024
TOK = None


def log(*a):
    print(time.strftime('%H:%M:%S'), *a, flush=True)


def token():
    sa = json.load(open(KEY))

    def b64u(b):
        return base64.urlsafe_b64encode(b).rstrip(b'=').decode()

    h = b64u(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
    now = int(time.time())
    c = b64u(json.dumps({"iss": sa["client_email"],
                         "scope": "https://www.googleapis.com/auth/androidpublisher",
                         "aud": "https://oauth2.googleapis.com/token",
                         "iat": now, "exp": now + 3600}).encode())
    si = f"{h}.{c}".encode()
    with tempfile.NamedTemporaryFile('w', suffix='.pem', delete=False) as f:
        f.write(sa["private_key"])
        p = f.name
    sig = subprocess.run(['openssl', 'dgst', '-sha256', '-sign', p], input=si, capture_output=True).stdout
    os.unlink(p)
    jwt = f"{h}.{c}.{b64u(sig)}"
    r = urllib.request.Request(
        'https://oauth2.googleapis.com/token',
        data=f"grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion={jwt}".encode(),
        headers={'Content-Type': 'application/x-www-form-urlencoded'})
    return json.load(urllib.request.urlopen(r, timeout=30))['access_token']


def call(method, url, body=None, raw=None, headers=None, retries=6):
    last = None
    for attempt in range(retries):
        try:
            data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
            hdr = {'Authorization': 'Bearer ' + TOK}
            if raw is None and body is not None:
                hdr['Content-Type'] = 'application/json'
            hdr.update(headers or {})
            req = urllib.request.Request(url, data=data, method=method, headers=hdr)
            resp = urllib.request.urlopen(req, timeout=600)
            payload = resp.read()
            try:
                return resp.status, json.loads(payload or b'{}'), dict(resp.headers)
            except json.JSONDecodeError:
                return resp.status, payload, dict(resp.headers)
        except urllib.error.HTTPError as e:
            body_txt = e.read()
            if e.code in (500, 502, 503, 504) and attempt < retries - 1:
                log(f'  HTTP {e.code} retry {attempt+1}/{retries}')
                time.sleep(2 ** attempt)
                last = (e.code, body_txt)
                continue
            try:
                return e.code, json.loads(body_txt or b'{}'), dict(e.headers or {})
            except Exception:
                return e.code, body_txt, dict(e.headers or {})
        except Exception as e:  # transport errors
            if attempt < retries - 1:
                log(f'  transport error {e!r} retry {attempt+1}/{retries}')
                time.sleep(2 ** attempt)
                last = e
                continue
            raise
    raise RuntimeError(f'giving up: {last}')


def main():
    global TOK
    aab, track, vname, notes = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
    locale = sys.argv[5] if len(sys.argv) > 5 else 'zh-CN'
    size = os.path.getsize(aab)
    log(f'file {aab} {size/1048576:.1f} MB -> track {track} ({vname})')

    TOK = token()
    base = f'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{PKG}'

    st, ed, _ = call('POST', f'{base}/edits', {})
    eid = ed.get('id') if isinstance(ed, dict) else None
    if not eid:
        raise SystemExit(f'edits.insert failed {st} {ed}')
    log(f'edit {eid}')

    # 1) 开启 resumable session（媒体上传必须走 /upload/ 前缀）
    upload_base = f'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/{PKG}'
    st, body, hdrs = call('POST', f'{upload_base}/edits/{eid}/bundles?uploadType=resumable', {},
                          headers={'X-Upload-Content-Type': 'application/octet-stream',
                                   'X-Upload-Content-Length': str(size)})
    loc = hdrs.get('Location') or hdrs.get('location')
    if st not in (200, 201) or not loc:
        call('DELETE', f'{base}/edits/{eid}')
        raise SystemExit(f'resumable init failed {st} {body} {hdrs}')
    log('resumable session opened')

    # 2) 分块上传
    with open(aab, 'rb') as f:
        sent = 0
        while sent < size:
            chunk = f.read(min(CHUNK, size - sent))
            start, end = sent, sent + len(chunk) - 1
            st, body, hdrs = call('PUT', loc, raw=chunk,
                                  headers={'Content-Range': f'bytes {start}-{end}/{size}',
                                           'Content-Type': 'application/octet-stream'})
            if st in (200, 201):
                sent = size
                log(f'  upload complete ({st})')
                break
            if st == 308:
                rng = (hdrs.get('Range') or hdrs.get('range') or '')
                sent = end + 1
                log(f'  {sent/1048576:.1f}/{size/1048576:.1f} MB ({rng})')
                continue
            call('DELETE', f'{base}/edits/{eid}')
            raise SystemExit(f'chunk upload failed {st} {body}')

    # 3) 写轨道（关键：completed 不能带 userFraction）
    rel = {'name': vname, 'versionCodes': [str(x) for x in [body.get('versionCode')] if x],
           'status': 'completed',
           'releaseNotes': [{'language': locale, 'text': notes}]}
    if not rel['versionCodes']:
        call('DELETE', f'{base}/edits/{eid}')
        raise SystemExit(f'no versionCode in upload response: {body}')
    log(f'versionCode {rel["versionCodes"][0]}')
    st, res, _ = call('PUT', f'{base}/edits/{eid}/tracks/{track}',
                      {'track': track, 'releases': [rel]})
    if st != 200:
        call('DELETE', f'{base}/edits/{eid}')
        raise SystemExit(f'tracks.update failed {st} {res}')
    log(f'track {track} updated: {json.dumps(res, ensure_ascii=False)[:300]}')

    # 4) 提交
    st, res, _ = call('POST', f'{base}/edits/{eid}:commit')
    if st != 200:
        raise SystemExit(f'commit failed {st} {res}')
    log('COMMIT OK')
    print(json.dumps(res, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
