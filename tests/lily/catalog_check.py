"""편 목록 원천(src/entities/episode/catalog.json)과 그 목록을 손으로 옮겨 적은 곳이 같은지 본다. 브라우저 없이 돈다.

    python3 tests/lily/catalog_check.py

- 홈과 랜딩의 정적 편 카드: 편마다 한 번씩, 그림, 맛보기(무료) 표시, 우리말 제목, 영어 제목, 주소
- 편 폴더 <시리즈>/<편>/index.html: 설정의 id, no 가 목록과 같고 free 가 없음(무료 여부는 목록 한 곳)
- sitemap.xml, llms.txt 에 편 주소, _redirects 와 목록의 legacy, 빌드 허용 목록에 시리즈 폴더
- 편 ID 정규식이 브라우저(access.js), 회원 상태(session.js), DB 마이그레이션(0002_series.sql)에서 같은지
하나라도 다르거나 목록이 비면 종료 코드 1.
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
IMG = "/src/entities/episode/img/ep-"

# 지금 화면 문구가 목록과 다른 곳(사용자 결정 전이라 화면은 그대로 둠). 정하면 HTML이나 catalog.json을 고치고 여기서 지운다
KNOWN = {
    ("hello/index.html", "daily/sleep", "title"): "잠자기",
}

def read(p):
    with open(os.path.join(ROOT, p), encoding="utf-8") as f:
        return f.read()

bad = []
try:
    data = json.loads(read("src/entities/episode/catalog.json"))
except (OSError, ValueError) as e:
    data = {}
    bad.append(f"catalog.json: 읽지 못함 {e}")
cat = data.get("episodes") or []
series = {s.get("slug") for s in data.get("series") or []}
if not cat:
    bad.append("catalog.json: 편 목록이 비었음")

ids = [e.get("id") for e in cat]
if len(set(ids)) != len(ids):
    bad.append("catalog.json: 같은 id가 두 번")
for e in cat:
    if e.get("id") != f"{e.get('series')}/{e.get('slug')}":
        bad.append(f"catalog.json: {e.get('id')} id 가 series/slug 와 다름")
    if e.get("series") not in series:
        bad.append(f"catalog.json: {e.get('id')} 시리즈 {e.get('series')} 가 series 목록에 없음")

# 1. 홈과 랜딩의 정적 카드
for page in ("index.html", "hello/index.html"):
    cards = re.findall(r'<a class="(circle[^"]*)" href="([^"]*)">(.*?)</a>', read(page))
    seen = {}
    for cls, href, inner in cards:
        im = re.search(r'src="' + re.escape(IMG) + r'([a-z]+)\.webp"', inner)
        if not im:
            bad.append(f"{page}: 편 그림이 {IMG}... 가 아닌 카드 {href}"); continue
        ep = next((e for e in cat if e["img"] == im[1]), None)
        if not ep:
            bad.append(f"{page}: 목록에 없는 편 그림 ep-{im[1]}"); continue
        if ep["id"] in seen:
            bad.append(f"{page}: {ep['id']}가 두 번 나옴"); continue
        seen[ep["id"]] = True
        b = re.search(r"<b>([^<]*)</b>", inner); s = re.search(r"<small>([^<]*)</small>", inner)
        got = {"title": b[1] if b else "", "en": s[1] if s else ""}
        for k in ("title", "en"):
            want = KNOWN.get((page, ep["id"], k), ep[k])
            if got[k] != want:
                bad.append(f"{page}: {ep['id']} {k} {got[k]!r} != {want!r}")
        free = '<span class="free">' in inner
        if free != ep["free"]:
            bad.append(f"{page}: {ep['id']} 무료 표시 {free} != catalog free {ep['free']}")
        # 홈은 모든 카드가 편으로, 랜딩은 무료 편만 편으로(나머지는 가입으로)
        if page == "index.html" or ep["free"]:
            if href != f"/{ep['id']}/":
                bad.append(f"{page}: {ep['id']} 링크 {href}")
        if page == "index.html" and ("locked" in cls) == ep["free"]:
            bad.append(f"{page}: {ep['id']} 잠금 표시가 free와 어긋남")
    for e in cat:
        if e["id"] not in seen:
            bad.append(f"{page}: {e['id']} 없음")

# 2. 편 폴더와 설정
for e in cat:
    p = f"{e['id']}/index.html"
    try:
        html = read(p)
    except OSError:
        bad.append(f"{p}: 편 페이지 없음"); continue
    m = re.search(r'<script type="application/json" id="lily-episode">(.*?)</script>', html, re.S)
    try:
        cfg = json.loads(m.group(1)) if m else None
    except ValueError as err:
        cfg = None; bad.append(f"{p}: 설정 JSON 오류 {err}")
    if not cfg:
        bad.append(f"{p}: 설정 없음"); continue
    if cfg.get("id") != e["id"] or cfg.get("no") != e["no"]:
        bad.append(f"{p}: 설정 id/no {cfg.get('id')}/{cfg.get('no')} != {e['id']}/{e['no']}")
    if "free" in cfg:
        bad.append(f"{p}: 설정에 free 가 남음(무료 여부는 catalog.json 한 곳)")
    if re.search(r"lilyrang\.co\.kr/ep[0-9]{2}/", html):
        bad.append(f"{p}: 옛 절대 주소 /epNN/ 이 남음")
    if f"https://lilyrang.co.kr/{e['id']}/" not in html:
        bad.append(f"{p}: canonical 등 새 절대 주소 없음")

# 3. sitemap, llms.txt, _redirects, 빌드 허용 목록
sitemap, llms, redirects, build = read("sitemap.xml"), read("llms.txt"), read("_redirects"), read("scripts/build-site.sh")
for e in cat:
    url = f"https://lilyrang.co.kr/{e['id']}/"
    if f"<loc>{url}</loc>" not in sitemap:
        bad.append(f"sitemap.xml: {url} 없음")
    if f"({url})" not in llms:
        bad.append(f"llms.txt: {url} 없음")
    if e.get("legacy"):
        for line in (f"/{e['legacy']}/* /{e['id']}/:splat 301", f"/{e['legacy']} /{e['id']}/ 301"):
            if line not in redirects.splitlines():
                bad.append(f"_redirects: '{line}' 없음")
legacy_lines = re.findall(r"^/(ep[0-9]{2})\b", redirects, re.M)
known_legacy = {e.get("legacy") for e in cat}
for old in legacy_lines:
    if old not in known_legacy:
        bad.append(f"_redirects: 목록에 없는 옛 주소 {old}")
if re.search(r"ep\[0-9\]|/ep[0-9]{2}", sitemap + llms):
    bad.append("sitemap.xml 또는 llms.txt 에 옛 주소가 남음")
for s in series:
    if not re.search(r"^for d in [^;]*\b" + re.escape(s) + r"\b", build, re.M):
        bad.append(f"scripts/build-site.sh: 시리즈 폴더 {s} 가 허용 목록에 없음")

# 4. 편 ID 정규식 세 곳
def grab(p, pat):
    m = re.search(pat, read(p))
    return m.group(1) if m else None
js_access = grab("src/entities/episode/access.js", r"E\.ID_RE = /(.*?)/;")
js_session = grab("src/entities/session/session.js", r"var EPISODE_RE = /(.*?)/;")
sql = grab("supabase/migrations/0002_series.sql", r"episode ~ '(\^\[a-z\][^']*)'")
if not js_access or js_access != js_session:
    bad.append(f"편 ID 정규식이 access.js({js_access})와 session.js({js_session})에서 다름")
if not sql or (js_access or "").replace("\\/", "/") != sql:
    bad.append(f"편 ID 정규식이 access.js({js_access})와 0002_series.sql({sql})에서 다름")

for b in bad:
    print("FAIL", b)
print(f"SUMMARY catalog {len(cat)} episodes, {len(bad)} mismatches")
sys.exit(1 if bad else 0)
