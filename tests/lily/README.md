# 릴리랑 시험

모든 시험은 편 설정(`window.LILY_EPISODE`)에서 기다림 지점, 대상, 장면, 단어를 읽으므로 어느 편에나 그대로 돕니다. Playwright(Python)와 Chrome이 필요합니다.

## 서버

```sh
python3 tests/lily/rangesrv.py . 4441 &   # 저장소 루트를 Range 지원으로 띄움(음원 되감기에 필요)
kill %1                                   # 끝나면 직접 끔
```

## 동작 시험

```sh
python3 tests/lily/behave.py http://127.0.0.1:4441/ep01/
```

- 첫 화면(큰 재생 단추, 스크롤 없음, FCP 1.5초 이하, 첫 화면은 장면 0, 1 그림만 받음, 긴 작업 100ms 미만), 모든 그림 decode, 무대 높이
- 기다림마다: 정확히 멈춤(시각 + 0.15초 안), 종류대로 누르면 이어짐(찾기, 거품 하나씩과 개수 칩, 스티커, 불 끄기와 끝 카드, 한 번 더 듣기)
- 8초 자동 진행, 소리 끝 끝 카드, 그냥 듣기(건너뜀, 다시 열어도 기억), 되감기(화면, 바깥), 단어 버튼은 그 줄만, 대본 줄은 그 줄 끝 기다림을 건너뜀, 3번 이어 듣기, 조금 천천히, 키보드 Enter
- 자유 놀이(반짝, 문지르기), 성능(문지르기와 거품 FPS 55 이상, CPU 4배 느리게도 기록), 콘솔 오류 0, 4xx/5xx 응답 0
- 마지막 줄 `SUMMARY 통과 / 전체`, 하나라도 실패하면 종료 코드 1
- 레인 D 파일(`lily-config.js`, `auth.js`, `gate.js`)이 아직 없는 브랜치에서는 그 404만 따로 보고하게 `--allow-missing lily-config.js,auth.js,gate.js`를 붙입니다. 합친 뒤에는 이 옵션 없이 통과해야 합니다.

화면 크기는 `--size 너비x높이`(기본 390x844). 태블릿(700px 이상)에서는 무대 비율, 첫 화면 전체가 스크롤 없이 보이는지를 더 봅니다. 모든 크기에서 가로 스크롤 0과 아이 대상 64px 이상을 봅니다.

```sh
for s in 390x844 768x1024 834x1194 1024x768 1194x834; do python3 tests/lily/behave.py http://127.0.0.1:4441/ep01/ --size $s; done
```

설정이 없는 옛 페이지(엔진 분리 전)는 설정을 다른 편에서 빌려 같은 시험을 돌립니다.

```sh
python3 tests/lily/behave.py http://127.0.0.1:4441/<옛페이지>/ --config-from http://127.0.0.1:4441/ep01/
```

## 편 목록 검사

```sh
python3 tests/lily/catalog_check.py   # 홈과 랜딩의 정적 편 목록이 src/entities/episode/catalog.js와 같은지(브라우저 없음)
```

## 캡처 비교

```sh
python3 tests/lily/shots.py http://127.0.0.1:4441/ep01/ /tmp/after --freeze      # 첫 화면, 장면마다, 끝 카드
python3 tests/lily/compare.py /tmp/before /tmp/after /tmp/diff                     # 픽셀 비교, 다르면 차이 그림
python3 tests/lily/sheet.py /tmp/side.png /tmp/before/00-first.png /tmp/after/00-first.png   # 나란히 보기
```

`--freeze`는 애니메이션을 0초에 세웁니다. 같은 페이지를 두 번 찍어도 그림 축소 때문에 몇 픽셀에서 수백 픽셀까지 달라질 수 있으니, 차이가 나면 같은 페이지끼리 한 번 더 찍어 잡음인지 확인합니다.
