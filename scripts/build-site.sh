#!/bin/sh
# 배포할 사이트 파일만 dist/에 모은다(허용 목록). 여기 없는 파일은 절대 올라가지 않는다.
set -e
cd "$(dirname "$0")/.."
rm -rf dist && mkdir dist
for f in index.html 404.html og.jpg _headers; do cp "$f" dist/; done
for d in brand common src hello join me privacy $(ls -d ep[0-9][0-9] 2>/dev/null); do rsync -a --exclude '.*' --exclude 'README.md' --exclude '*worksheet*' "$d" dist/; done
# 숨김 파일(.으로 시작), 설명서, 꺼 둔 학습지는 빼고, 남은 것 중 점 파일이 있으면 멈춘다
if find dist -name ".*" | grep -q .; then echo "숨김 파일이 dist에 있음"; exit 1; fi
echo "dist: $(find dist -type f | wc -l | tr -d ' ') files, $(du -sh dist | cut -f1)"
