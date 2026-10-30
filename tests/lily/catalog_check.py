"""홈과 랜딩의 정적 편 목록이 편 목록(src/entities/episode/catalog.js)과 같은지 본다. 브라우저 없이 돈다.

    python3 tests/lily/catalog_check.py

편마다 한 번씩 있는지, 그림, 맛보기(무료) 표시, 우리말 제목, 영어 제목을 비교한다. 하나라도 다르면 종료 코드 1.
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
IMG = "/src/entities/episode/img/ep-"

# 지금 화면 문구가 목록과 다른 곳(사용자 결정 전이라 화면은 그대로 둠). 정하면 HTML이나 catalog.js를 고치고 여기서 지운다
KNOWN = {
    ("index.html", "ep01", "en"): "Brush, Brush, Brush!",
    ("hello/index.html", "ep07", "title"): "잠자기",
}

def read(p):
    with open(os.path.join(ROOT, p), encoding="utf-8") as f:
        return f.read()

cat = []
for m in re.finditer(r'\{ id: "(ep\d\d)", title: "([^"]*)", en: "([^"]*)", img: "([^"]*)", free: (true|false) \}', read("src/entities/episode/catalog.js")):
    cat.append({"id": m[1], "title": m[2], "en": m[3], "img": m[4], "free": m[5] == "true"})

bad = []
if not cat:
    bad.append("catalog.js: 편 목록을 읽지 못함")

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
        if page == "index.html":
            if href != f"/{ep['id']}/":
                bad.append(f"{page}: {ep['id']} 링크 {href}")
            if ("locked" in cls) == ep["free"]:
                bad.append(f"{page}: {ep['id']} 잠금 표시가 free와 어긋남")
    for e in cat:
        if e["id"] not in seen:
            bad.append(f"{page}: {e['id']} 없음")

for b in bad:
    print("FAIL", b)
print(f"SUMMARY catalog {len(cat)} episodes, {len(bad)} mismatches")
sys.exit(1 if bad else 0)
