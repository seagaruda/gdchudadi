#!/usr/bin/env python3
"""直接把商店图片（图标/特征图/截图）推到 Google Play。

为什么不用 `gplay metadata images apply`：gplay 2.3.2 在 images.list 时会把
"promoGraphic" 当作合法 imageType 去查，Google 返回
`Invalid value at 'image_type' ... "promoGraphic"`（HTTP 400），整条图片通道挂掉。
本脚本直接调 edits.images.upload，只用 Google 认的枚举。

用法：
  python3 scripts/gplay-upload-images.py <metadata_dir> [locale ...]
例：
  python3 scripts/gplay-upload-images.py store/metadata zh-CN zh-TW en-US
  python3 scripts/gplay-upload-images.py store/metadata --verify zh-CN
"""
import base64, json, os, subprocess, sys, tempfile, time
import urllib.request, urllib.error

KEY = os.path.expanduser('~/.gplay/service-account.json')
PKG = 'com.gdchudadi.app'
API = 'https://androidpublisher.googleapis.com/androidpublisher/v3'
UP = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3'
TOK = None
SINGULAR = ('icon', 'featureGraphic', 'tvBanner')
GALLERY = ('phoneScreenshots', 'sevenInchScreenshots', 'tenInchScreenshots',
           'tvScreenshots', 'wearScreenshots')


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
    for attempt in range(retries):
        try:
            data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
            hdr = {'Authorization': 'Bearer ' + TOK}
            if raw is None and body is not None:
                hdr['Content-Type'] = 'application/json'
            hdr.update(headers or {})
            req = urllib.request.Request(url, data=data, method=method, headers=hdr)
            resp = urllib.request.urlopen(req, timeout=300)
            payload = resp.read()
            try:
                return resp.status, json.loads(payload or b'{}')
            except json.JSONDecodeError:
                return resp.status, payload
        except urllib.error.HTTPError as e:
            body_txt = e.read()
            if e.code in (500, 502, 503, 504) and attempt < retries - 1:
                log(f'  HTTP {e.code} retry {attempt + 1}/{retries}')
                time.sleep(2 ** attempt)
                continue
            try:
                return e.code, json.loads(body_txt or b'{}')
            except Exception:
                return e.code, body_txt
        except Exception as e:
            if attempt < retries - 1:
                log(f'  transport {e!r} retry {attempt + 1}/{retries}')
                time.sleep(2 ** attempt)
                continue
            raise


def collect(root, locale):
    """返回 [(imageType, [file...])]，按 gplay 的目录约定。"""
    base = os.path.join(root, locale, 'images')
    if not os.path.isdir(base):
        return []
    out = []
    for t in SINGULAR:
        for ext in ('png', 'jpg', 'jpeg'):
            p = os.path.join(base, f'{t}.{ext}')
            if os.path.exists(p):
                out.append((t, [p]))
                break
    for t in GALLERY:
        d = os.path.join(base, t)
        if os.path.isdir(d):
            files = sorted((os.path.join(d, f) for f in os.listdir(d)
                            if f.lower().endswith(('.png', '.jpg', '.jpeg'))),
                           key=lambda p: (len(os.path.basename(p)), os.path.basename(p)))
            if files:
                out.append((t, files))
    return out


def verify(locales):
    st, ed = call('POST', f'{API}/applications/{PKG}/edits', {})
    eid = ed.get('id')
    if not eid:
        log('verify: cannot open edit', st, ed)
        return
    for loc in locales:
        for t in SINGULAR + GALLERY:
            st, res = call('GET', f'{API}/applications/{PKG}/edits/{eid}/listings/{loc}/{t}')
            if st == 200:
                imgs = res.get('images', []) if isinstance(res, dict) else []
                log(f'  live {loc}/{t}: {len(imgs)}')
            else:
                msg = res.get('error', {}).get('message') if isinstance(res, dict) else res
                log(f'  live {loc}/{t}: ERR {st} {str(msg)[:90]}')
    call('DELETE', f'{API}/applications/{PKG}/edits/{eid}')


def main():
    global TOK
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args:
        raise SystemExit(__doc__)
    root = args[0]
    locales = args[1:] or ['zh-CN']
    do_verify = '--verify' in sys.argv

    TOK = token()
    if do_verify:
        log('verify live images:')
        verify(locales)
        return

    st, ed = call('POST', f'{API}/applications/{PKG}/edits', {})
    eid = ed.get('id') if isinstance(ed, dict) else None
    if not eid:
        raise SystemExit(f'edits.insert failed {st} {ed}')
    log(f'edit {eid}')

    total = 0
    # 没有 images 目录的语系，复用树里第一个有素材的语系（避免仓库里存多份同样的图）
    fallback = None
    for loc in [locales[0]] + sorted(os.listdir(root)):
        if os.path.isdir(os.path.join(root, loc)) and collect(root, loc):
            fallback = loc
            break
    for loc in locales:
        slots = collect(root, loc)
        if not slots and fallback and fallback != loc:
            slots = collect(root, fallback)
            log(f'{loc}: 无本地素材，复用 {fallback} 的图片')
        if not slots:
            log(f'{loc}: 没有 images 目录，跳过')
            continue
        for itype, files in slots:
            for f in files:
                data = open(f, 'rb').read()
                ct = 'image/png' if f.lower().endswith('.png') else 'image/jpeg'
                st, res = call('POST',
                               f'{UP}/applications/{PKG}/edits/{eid}/listings/{loc}/{itype}?uploadType=media',
                               raw=data, headers={'Content-Type': ct})
                if st != 200:
                    call('DELETE', f'{API}/applications/{PKG}/edits/{eid}')
                    raise SystemExit(f'upload {loc}/{itype}/{os.path.basename(f)} failed {st} {res}')
                total += 1
                log(f'  {loc}/{itype} <- {os.path.basename(f)} ({len(data)//1024} KB) id={res.get("id")}')

    st, res = call('POST', f'{API}/applications/{PKG}/edits/{eid}:commit')
    if st != 200:
        raise SystemExit(f'commit failed {st} {res}')
    log(f'COMMIT OK — {total} 张图片已上线')


if __name__ == '__main__':
    main()
