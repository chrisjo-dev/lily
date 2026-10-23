# 릴리랑 엔진

편마다 같은 동작(재생, 진행 막대, 기다림과 8초 자동 진행, 그냥 듣기, 3번 이어 듣기, 조금 천천히, 바깥 되감기, 장면 전환, 자막, 단어 버튼, 대본, 부모님 화면, 그림 미리 받기, 잠금 훅)은 여기 있고, 편 HTML에는 **장면 그림 마크업과 설정 하나**만 둡니다. 예시는 `/ep01/index.html`.

## 새 편 만들기

1. `/ep01/index.html`을 복사해 `/epNN/index.html`로 둡니다.
2. `<head>`: 제목, 설명, OG(`https://lily.wspace.ai.kr/epNN/...`), canonical, 첫 장면 그림 preload만 바꿉니다. 엔진 CSS와 스크립트 줄(아래 "잠금 훅"의 순서)은 그대로 둡니다.
3. `<body>`:
   - `<div class="stage" id="stage">` 안에 장면마다 `<svg class="scene" id="scN" viewBox="그림 픽셀">`. 첫 장면 그림만 `href`, 나머지는 `data-src`(엔진이 장면 직전에 받아 둠). 첫 장면 말고는 `hidden`.
   - 설정 JSON 블록 `<script type="application/json" id="lily-episode">{...}</script>`. 실행되는 코드가 아니라 데이터라 CSP에 걸리지 않습니다. JSON이라 주석과 끝 쉼표는 못 씁니다. 엔진이 문서를 다 읽은 뒤 스스로 시작하고, 읽은 설정을 `window.LILY_EPISODE`에도 둡니다.
4. CSP: head의 `Content-Security-Policy` meta를 그대로 둡니다(`'unsafe-inline'` 없음). 그래서 인라인 `<script>` 코드, `onload=` 같은 속성, `style=` 속성, `<style>`을 쓰지 않습니다. 모양은 `engine.css`의 클래스로, 동적 스타일은 모듈에서 `api.el(..., { style: "..." })`(CSSOM으로 넣음)로 합니다. 글꼴 링크는 `id="lily-fonts"`인 preload를 엔진이 붙입니다.
5. 머리줄, 칩, 고리, 큰 재생 단추, 끝 카드, 자막, 조작 줄, 부모님 화면, 화면 그림 sprite(손 `#hand-shape`, `#hand-rub`, 별 `#ui-sparkle`, 터짐 `#ui-pop`)는 엔진이 만듭니다. 마크업에 넣지 않습니다.
6. 시험: `python3 tests/lily/behave.py http://127.0.0.1:4441/epNN/` 전부 통과(tests/lily/README.md).

## 화면 크기

- 휴대폰(700px 미만): 한 줄 배치. 무대 높이는 화면의 약 58%.
- 태블릿 세로(700px 이상, 세로): 같은 한 줄 배치를 화면 높이에 맞춰 크게. 무대 비율은 휴대폰과 같은 390:490.
- 태블릿 가로와 데스크톱(900px 이상, 높이 600px 이상, 가로): 왼쪽에 무대(화면 높이 가득), 오른쪽에 자막과 부모님 조작. 첫 화면이 스크롤 없이 다 보입니다.
- 장면 그림은 무대 비율대로 잘리므로(slice) 무대 비율을 바꾸면 누르는 대상이 잘려 나갈 수 있습니다. 새 편 좌표는 390:490 비율에서 보이는 영역 안에 둡니다. 누르는 대상은 장면 svg 안에 있어 무대와 함께 커집니다(태블릿에서 가장 작은 대상 86px 이상).

## 설정 필드

| 필드 | 뜻 |
|---|---|
| `id`, `title` | 편 id(`ep01`), 머리줄 제목 |
| `audio`, `duration` | 음원 파일(편 폴더 기준), 길이(초, 메타데이터 받기 전 진행 막대용) |
| `offset` | 음악 도입 길이(기록용, 시각은 이미 포함) |
| `free`, `previewUntil` | 맛보기 편이면 `free: true`. 아니면 비회원이 들을 수 있는 끝(초). 엔진은 쓰지 않고 잠금 훅(gate.js)이 읽음 |
| `lines` | `[시작, 끝, "대사"]`. `[[단어]]`는 대본에서 강조 |
| `scenes` | `{ id, from, name, chip, worksheetChip }` 시작 시각 순. `name`은 진행 점의 읽기 글, `chip`은 무대 왼쪽 위 작은 표(없으면 숨김), `worksheetChip`은 학습지가 있을 때만 보이는 표("학습지 1번" 같은 것) |
| `waits` | 멈춰 기다리는 곳 `{ at, type, ... }`. `at`은 보통 그 줄의 끝 시각. 아래 상호작용 표. 편의 마지막 행동인 기다림에는 `"end": true`(아래) |
| `free_play` | 기다리지 않고 언제든 노는 것 `{ scene, type, ... }` |
| `end` | 끝 카드 `{ at, title, sub, bg, stickers: [{ img, label }] }`. `at`부터(마지막 기다림이 채워졌을 때) 카드가 나옴 |
| `words` | 오늘의 단어 `{ en, ko, line, icon }`. `line`은 `lines`의 번호(0부터), `icon`은 그 단어의 스티커 그림(`art/L-sticker-*.webp`, 끝 카드 스티커와 같은 것). `#symbol-id`도 되지만 지금 편은 모두 스티커 |
| `worksheet` | 선택. `{ pdf, preview, alt, items: [...], hint }`. 없거나 `null`이면 학습지 칸, `worksheetChip`, 학습지 팁을 모두 빼요. 잠시 끄려면 `"worksheet": null`로 두고 내용은 다른 이름(`worksheet_hidden`)으로 남겨 둡니다(엔진은 읽지 않음) |
| `tips` | 부모님께 문단. `["굵은 첫 문장", "나머지"]` 또는 글 하나. 학습지 이야기는 `{ "worksheet": true, "text": [...] }`로 두면 학습지가 있을 때만 보여요 |

좌표는 모두 그 장면 그림의 픽셀(= viewBox)입니다.

### 마지막 행동 `"end": true`

끝 카드는 마지막 기다림이 채워진 뒤 `end.at`이 지나면 나옵니다. `lamp-end`는 스스로 그렇게 하고, 다른 종류(`find`, `tap-sparkle` 등. 커튼, 문, 거울 같은 것)를 마지막 행동으로 쓰려면 그 기다림에 `"end": true`를 붙입니다.

```json
{ "at": 131.2, "type": "find", "target": "t-curtain", "end": true }
```

- 누르거나 8초 자동으로 채워지면 lamp-end와 같이 끝 카드가 나옵니다(소리가 끝날 때까지 기다리지 않음).
- `end.at`을 안 쓰면 그 기다림 0.1초 전이 끝 시각입니다(lamp-end 편은 지금처럼 `end.at`을 씀).
- 그냥 듣기로 건너뛰면 끝 카드는 소리가 끝날 때 나옵니다(lamp-end와 같음). 앞으로 되감으면 끝 카드가 사라지고 다시 기다립니다.
- 한 편에 하나만 둡니다(첫 번째만 씀). 시험: `python3 tests/lily/end-flag.py http://127.0.0.1:4441/ep01/`

## 상호작용 6종 (`engine/interactions/`)

각 파일 맨 위 주석에 설정 모양과 필요한 마크업이 있습니다. 기다림에 쓰면 아이가 끝내야 이어지고, 8초 동안 아무것도 안 하면 엔진이 대신 끝내고 이어 갑니다.

| 종류 | 하는 일 | 쓰는 곳 | 주요 설정 |
|---|---|---|---|
| `find` | 숨은 것을 찾아 누르면 통통 튀고 흐려짐 | waits | `target`, `bounce` |
| `pop` | 거품 여러 개 터뜨리기, 칩에 개수. 터지면 물방울 그림(`ui/pop.webp`), `word`가 있으면 그 글자도 | waits | `into`, `img`, `bubbles: [[x, y, r]]`, `word` |
| `say-sticker` | "말했어요" 누르면 스티커가 판으로 | 판은 free_play 하나, 스티커마다 waits | 판: `target`, `label`, `words`, `into`, `from`, `slots`, `images` / 기다림: `sticker` |
| `lamp-end` | 불을 끄면 어두워지고 끝 카드 | waits(마지막) | `target` |
| `scrub` | 문지르면 세균이 사라지고 글자가 떠오름. 아직 안 문질렀으면 문지르기 손(`ui/hand-rub.webp`)이 좌우로 | free_play(waits도 가능) | `target`, `brush`, `home`, `into`, `floats`, `img`, `word`, `germs`, `hint` |
| `tap-sparkle` | 누른 곳에 별 반짝(`ui/sparkle.webp`) | free_play(waits도 가능) | `target`, `into`, `keyArea` |

누를 것은 `<g class="tgt" role="button" tabindex="0" aria-label="...">` 안에 `.halo`(숨쉬는 노란 테두리), `.pulse`, 넓은 `.hit`을 둡니다. 다 하면 사라질 그림 레이어(커튼, 그릇, 문, 마개처럼 치우는 것)는 그 `<image>`에 `class="vanish-on-done"`을 붙입니다. 노란 빛을 두르고, 기다림이 채워져 대상에 `.done`이 붙으면 0.4초 동안 흐려져 사라집니다(종류와 상관없이 `find`, `tap-sparkle` 등에 모두 씀). `lamp-end`의 켠 그림 `.lamp-on-img`도 같은 모양이고, 끈 그림 `.lamp-off-img`는 그때 나타납니다. 노란색(`fT`, `--touch`)은 아이가 누르는 것에만 씁니다. 손 모양 안내는 `<g class="hand" transform="..."><g><use href="#hand-shape"/></g></g>`(기다릴 때만 보임). 손끝이 `transform`의 원점 바로 위(0, -2)에 오고 손등은 오른쪽 아래로 놓입니다. 손은 안내일 뿐 누르는 것이 아니라 노란색이 아닙니다. 문지르는 장면(`.hit.scrub`가 있는 장면)의 손은 엔진이 `#hand-rub`로 바꿉니다.

### 화면 그림 (`engine/ui/`)

손 안내(`hand-tap.webp`, `hand-rub.webp`), 반짝 별(`sparkle.webp`), 거품 터짐(`pop.webp`), 자물쇠(`lock.webp`)는 AI로 그린 투명 webp(긴 변 256px)입니다. 원본 한 장은 `podcast/lily/art/ui/sheet-ui.png`, 자르기는 `podcast/lily/tools/build_ui.py`. 엔진은 `engine.js`가 있는 주소를 기준으로 `ui/`를 찾으므로 어느 편 주소에서도 같은 파일을 씁니다(같은 출처라 CSP `img-src 'self'`로 충분). 첫 화면 무게를 늘리지 않으려고 이 그림과 오늘의 단어 스티커는 첫 재생, 첫 기다림, 첫 누름이나 스크롤 중 먼저 오는 때에 받습니다.

새 종류가 필요하면 파일 하나를 더합니다.

```js
// engine/interactions/my-kind.js, 편 head에서 engine.js 다음에 불러옴
LilyInteractions["my-kind"] = (api, specs, episode) => {
  // specs: 이 종류의 설정 전부. 기다림이면 wait(번호), 자유 놀이면 wait = -1
  return {
    act(i) {},        // 기다림 i를 대신 끝냄(8초 자동, 조작 줄 재생 단추)
    scene(k) {},      // 장면 k로 바뀜
    seek(t) {},       // 되감기 뒤 api.isDone(i)로 상태를 다시 맞춤
    line(k, j) {},    // 자막 줄이 바뀜(k = -1이면 줄 사이로 옮김, j는 바로 앞 줄)
    ended() {},       // 소리가 끝남
  };
};
```

`api`: `$`, `el`, `onTap(node, fn)`, `toSvg(e, 장면svg)`, `replay(node, 클래스)`, `chip(글)`, `isDone(i)`, `setDone(i)`, `waiting`, `scene`, `audio`, `lines`, `sceneAt(t)`, `sceneIndex(id)`, `sceneEl(k)`, `finishWait(auto)`, `armTimer()`, `showEnd(on)`, `setEndReady(on)`, `endAt`.

## 잠금 훅

- 엔진은 재생 중 매 프레임 `window.lilyGate.canPlayPast(t, episode)`를 묻고, `false`면 멈춘 뒤 `window.lilyGate.onBlocked(t, episode, resume)`를 한 번 부릅니다. `resume()`은 그 자리에서 이어 재생합니다(다시 묻기 때문에 그때는 `true`여야 함).
- 매 프레임 불리므로 `canPlayPast`는 동기이고 가벼워야 합니다(로그인 여부는 미리 받아 둔 값으로).
- 허락을 기억하지 않습니다. 잠금 카드를 "나중에"로 닫고 다시 재생을 누르면 다음 프레임에 또 묻고, 여전히 `false`면 다시 멈추고 `onBlocked`를 부릅니다.
- 선택 훅: 시작할 때 `typeof lilyGate.resumeAt === "function"`이면 `lilyGate.resumeAt(편id)`를 부르고, 숫자를 돌려주면 그 시각에서 멈춘 채 엽니다(같은 탭에서 가입하고 돌아온 사람이 막혔던 자리부터). 주소에 `?t=`가 있으면 그쪽이 우선입니다.
- `engine/gate-default.js`는 `window.lilyGate`가 없을 때만 "항상 허용"을 넣습니다. 실제 잠금은 `engine/gate.js`가 그보다 먼저 `window.lilyGate`를 둡니다.
- 불러오는 순서(모든 편 같음): `lily-config.js` → `auth.js` → `gate.js` → `gate-default.js` → `engine.js` → `interactions/*.js`. 앞의 셋은 레인 D 파일이라 없거나 404여도 페이지는 깨지지 않습니다(그 경우 항상 허용).

## 확인용 주소

`?t=초`는 그 시각에서 멈춘 채 열고, `&w=1`이면 다음 기다림 화면까지 띄웁니다(캡처와 좌표 맞춤용).
