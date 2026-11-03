#!/bin/sh
# 배포할 사이트 파일만 dist/에 모은다(허용 목록). 여기 없는 파일은 절대 올라가지 않는다.
set -e
cd "$(dirname "$0")/.."
rm -rf dist && mkdir dist
for f in index.html 404.html og.jpg _headers _redirects robots.txt sitemap.xml llms.txt; do cp "$f" dist/; done
# 시리즈 폴더(편은 그 아래 <시리즈>/<편>/)는 편 목록(catalog.json)의 series에서 읽는다. 목록에 있는데 폴더가 없으면 멈춘다
SERIES=$(python3 -c 'import json,re;s=[x["slug"] for x in json.load(open("src/entities/episode/catalog.json"))["series"]];assert s and all(re.fullmatch(r"[a-z][a-z0-9-]*",x) for x in s);print(" ".join(s))')
for s in $SERIES; do [ -d "$s" ] || { echo "시리즈 폴더 없음: $s"; exit 1; }; done
for d in brand src hello join me privacy $SERIES; do rsync -a --exclude '.*' --exclude 'README.md' --exclude '*worksheet*' "$d" dist/; done
# 숨김 파일(.으로 시작), 설명서, 꺼 둔 학습지는 빼고, 남은 것 중 점 파일이 있으면 멈춘다
if find dist -name ".*" | grep -q .; then echo "숨김 파일이 dist에 있음"; exit 1; fi
echo "dist: $(find dist -type f | wc -l | tr -d ' ') files, $(du -sh dist | cut -f1)"
