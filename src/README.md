# src: 릴리랑 코드 (FSD)

사이트 코드와 공용 그림은 모두 여기 있습니다. 주소가 되는 폴더(`/ep01/`, `/hello/`, `/join/`, `/me/`, `/privacy/`)에는 HTML과 편 미디어만 두고, 그 HTML이 `/src/...`를 그대로 불러옵니다. 빌드 도구가 없으므로 폴더 경로가 곧 공개 주소입니다(배포는 `scripts/build-site.sh`가 `src`를 `dist/`에 복사). 설계와 단계는 `plans/fsd-restructure-plan.md`(저장소 밖 `lilyrang/plans/`).

## 계층

위에서 아래로만 의존합니다. 같은 계층의 다른 슬라이스를 직접 부르지 않습니다.

| 계층 | 하는 일 | 지금 있는 슬라이스 |
|---|---|---|
| app | 라우트와 배포 설정 | 빌드 없는 지금은 각 주소 폴더 HTML의 head(CSP, 스크립트 순서), `_headers`, `wrangler.jsonc`, `scripts/build-site.sh` |
| pages | 한 화면의 조립 | `home`, `landing`, `join`, `join-callback`, `me`, `not-found`(편 화면은 `epNN/index.html` 자체) |
| widgets | 여러 기능을 묶은 큰 덩어리 | `player`(편 재생기와 상호작용 6종), `hero`, `story-row` |
| features | 사용자 행동 하나 | `gate`(맛보기 잠금) |
| entities | 제품의 대상 | `session`(회원 상태), `episode`(편 목록, 편 그림, 편 설정 형식) |
| shared | 제품을 모르는 공용 | `config`, `api`(Supabase), `lib`(글꼴 늦게 켜기), `ui`(사이트 CSS, 여러 화면이 함께 쓰는 그림) |

- shared는 아무것도 모릅니다. entities는 shared만, features는 entities와 shared만, widgets는 features 아래만, pages는 widgets 아래만 봅니다.
- 한 화면만 쓰는 그림은 그 페이지 슬라이스의 `img/`에, 두 화면 이상이 쓰는 그림은 `shared/ui/img/`에 둡니다. 편 동그라미 그림은 `entities/episode/img/`입니다.
- 슬라이스 안의 주소는 그 파일 기준 상대 주소로 찾습니다(`document.currentScript` 기준, CSS는 `url(상대)`). 다른 슬라이스의 내부 파일 주소를 코드에 적지 않습니다.
- CSP에 `'unsafe-inline'`이 없습니다. 인라인 `<script>` 코드, `on*=` 속성, `style=` 속성, `<style>`을 만들지 않습니다.

## 공개 API

빌드가 없어 ES 모듈 대신 슬라이스마다 전역 이름 하나를 둡니다. 슬라이스 밖에서는 이 이름만 씁니다.

| 슬라이스 | 전역 이름 | 내용 | 파일 |
|---|---|---|---|
| shared/config | `window.LILY_CONFIG` | `supabaseUrl`, `supabaseAnonKey`(anon 키만) | `shared/config/lily-config.js` |
| shared/api | `window.LilyShared.supabase` | `ready`, `client()`, `hasStoredSession()`, `insertAnon(table, row)` | `shared/api/supabase.js` |
| entities/session | `window.lilyAuth` | `isMember`, `onChange`, `logEvent`(가입 페이지용 `ready`, `client`, `safeNext`) | `entities/session/session.js` |
| entities/episode | `window.LilyEpisodes` | 편 목록(`id`, 제목, 영어 제목, 그림, `free`)과 그림 주소 | `entities/episode/catalog.js` |
| entities/episode | `window.LILY_EPISODE` | 지금 편의 설정(엔진이 편 HTML의 JSON에서 읽음) | 형식은 `entities/episode/README.md` |
| features/gate | `window.lilyGate` | `canPlayPast`, `onBlocked`, `resumeAt` | `features/gate/gate.js`, `gate-default.js` |
| widgets/player | `window.LilyInteractions` | 상호작용 플러그인 등록부 | `widgets/player/engine.js`, `interactions/` |

불러오는 순서(편 HTML): `shared/config/lily-config.js` → `shared/api/supabase.js` → `entities/session/session.js` → `entities/episode/catalog.js` → `features/gate/gate.js` → `features/gate/gate-default.js` → `widgets/player/engine.js` → `widgets/player/interactions/*.js`.

## React(Vite)로 옮길 때의 경계

- 위 전역 이름이 각 슬라이스의 `index.ts` export가 됩니다. 이름과 모양을 지키면 옮기는 일은 `window.X`를 `import { X }`로 바꾸는 것입니다.
- Supabase 클라이언트는 `shared/api/supabase.js` 한 곳에서만 만듭니다. 그때 이 파일만 CDN UMD와 SRI에서 npm `@supabase/supabase-js`로 바꾸고, 각 페이지 CSP의 `script-src`에서 jsdelivr 주소를 뺍니다.
- 편 목록은 `entities/episode/catalog.js` 하나에서 읽습니다. 홈과 랜딩의 목록은 첫 화면 성능 때문에 정적 HTML이고, `tests/lily/catalog_check.py`가 catalog와 같은지 봅니다.
- Vite 다중 페이지 입구(주소 폴더의 `index.html`들)로 시작하면 주소를 그대로 지킨 채 한 페이지씩 바꿀 수 있습니다. 편 미디어(`epNN/art/`, `epNN.mp3`)는 `public/epNN/`로 옮기면 주소가 같습니다.
- 그 전에 할 일: 엔진의 계산 부분(장면, 줄, 기다림 찾기)을 `entities/episode/model/`로 떼고, 시험이 엔진 전역을 읽는 것을 시험용 창구 하나로 모읍니다(계획 L3, L4).
