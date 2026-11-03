# 편(entities/episode)

편 목록의 원천은 `catalog.json` 하나입니다(브라우저는 `catalog.js`로 받아 `window.LilyEpisodes`에, Worker는 import). 편 동그라미 그림은 `img/ep-*.webp`입니다. 편을 더하면 `catalog.json`의 `episodes`에 한 줄(`id`=`<시리즈>/<편>`, `series`, `slug`, `no`, 제목, 영어 제목, `img`, `free`)을 더하고, 편 폴더 `<시리즈>/<편>/`를 만들고, 홈(`index.html`), 랜딩(`hello/index.html`), `sitemap.xml`, `llms.txt`도 맞춥니다. 새 시리즈는 `series`에 더하고 `scripts/build-site.sh` 허용 목록에 시리즈 폴더를 넣습니다.

누가 끝까지 듣나는 `access.js`의 `canListen`과 `catalog.json`의 `policy` 한 곳이 정합니다. `locked`는 무료가 아닌 편을 끝까지 듣는 등급(지금 `member`, 구독 도입 때 `subscriber`), `preview`는 무료가 아닌 편의 앞부분 미리듣기(지금 `true`). 무료 여부(`free`)는 편마다 `catalog.json`에만 둡니다. `python3 tests/lily/catalog_check.py`가 차이를 잡습니다. 편 HTML 만드는 법과 재생기는 `src/widgets/player/README.md`.

## 편 설정 JSON 필드

| 필드 | 뜻 |
|---|---|
| `id`, `no`, `title` | 편 id(`daily/brush`, 주소 경로와 같음, `catalog.json`과 같아야 함), 시리즈 안 번호(제목 띠와 끝 카드에 `EP01`처럼), 제목 |
| `night` | 선택. `true`면 편 전체를 밤 화면(어두운 종이, 램프 빛 고리)으로. 장면 하나만이면 그 장면에 `"night": true` |
| `audio`, `duration` | 음원 파일(편 폴더 기준), 길이(초, 메타데이터 받기 전 진행 막대용) |
| `offset` | 음악 도입 길이(기록용, 시각은 이미 포함) |
| `previewUntil` | 무료가 아닌 편에서 끝까지 들을 등급이 안 되는 사람이 들을 수 있는 끝(초, `policy.preview`일 때만). 엔진은 쓰지 않고 잠금 훅(gate.js)이 읽음. 무료 여부는 여기 두지 않고 `catalog.json`의 `free` |
| `lines` | `[시작, 끝, "대사"]`. `[[단어]]`는 대본에서 강조 |
| `scenes` | `{ id, from, name, chip, worksheetChip }` 시작 시각 순. `name`은 진행 점의 읽기 글, `chip`은 무대 왼쪽 위 작은 표(없으면 숨김), `worksheetChip`은 학습지가 있을 때만 보이는 표("학습지 1번" 같은 것) |
| `waits` | 멈춰 기다리는 곳 `{ at, type, ... }`. `at`은 보통 그 줄의 끝 시각. 아래 상호작용 표. 편의 마지막 행동인 기다림에는 `"end": true`(아래) |
| `free_play` | 기다리지 않고 언제든 노는 것 `{ scene, type, ... }` |
| `end` | 끝 카드 `{ at, sub, bg, stickers: [{ img, label }], done, tip }`. `at`부터(마지막 기다림이 채워졌을 때) 카드가 나옴. `sub`는 리본 글, `done`은 제목 아래 한 줄(없으면 "오늘 이야기를 다 들었어요."), `tip`은 아래 부모 띠(없으면 `tips`의 둘째 문단). 액자 그림은 장면 0 그림 |
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
- 한 편에 하나만 둡니다(첫 번째만 씀). 시험: `python3 tests/lily/end-flag.py http://127.0.0.1:4441/daily/brush/`
