# 릴리랑

4~7세 아이와 부모를 위한 하루 5분 영어 그림책. https://lilyrang.co.kr

- 정적 사이트(Cloudflare Workers 정적 자산). `sh scripts/build-site.sh`가 허용 목록으로 `dist/`를 만들고 `wrangler.jsonc`가 그 `dist/`만 배포한다. 허용 목록에 없는 폴더는 올라가지 않는다. 작업은 `develop` 브랜치에서 하고 `develop`에서 `main`으로 PR을 열어 합친다. main에 바로 커밋하지 않는다.
- 코드 구조: `src/`(FSD 계층). 계층 규칙과 공개 API는 `src/README.md`. 주소 폴더(`epNN/`, `hello/`, `join/`, `me/`, `privacy/`)에는 HTML과 편 미디어만 둔다.
- 새 편 만들기와 재생기: `src/widgets/player/README.md`. 편 설정 JSON 형식: `src/entities/episode/README.md`.
- 시험: `tests/lily/README.md`. 작업 기록은 이 저장소 이슈로, 커밋에 `Refs #번호`.
