# 랜딩 critique 기록 (references/critique.md 형식)

방향: The page is the object, seed 483763358. 물건은 냉장고에 붙이는 "하루 스티커 판".
idea: 이 페이지에서 릴리의 하루 일곱 습관과 편 끝에 받는 스티커가, 일곱 칸짜리 하루 스티커 판이 된다.
live thing: 그림 속 비스킷이 문 칫솔을 누르면 EP01의 실제 릴리 목소리("찾았다!")가 나오고, 아래 하루 판의 이 닦기 칸에 칫솔 스티커가 붙는다.

```
ROUND 1
Seen in one second: 종이 판과 그 뒤의 방, 그런데 판이 릴리 얼굴을 가림
Idea (one sentence): 하루 일곱 습관이 스티커 판이 된다
Live thing: 칫솔 누르기, 목소리, 스티커
Layout words by section: hero=card-over-room / show=split / day=pinned-stack / letter=sheet / faq=two-column text / reply=card-on-field / footer=postcard back
Scores: design 5.5 · usability 6 · creativity 7 · content 7 → overall 6.2
Caps applied: inspect FAIL 3개 → 6.0 이하
Top three problems:
1. 휴대폰 레이아웃이 통째로 안 먹음(.back-card 닫는 괄호 누락) → 고침
2. 첫 화면 판이 릴리를 가리고 제목이 30px로 작음 → 제목 개구로 키움
3. 그림 3장만 셈, 크기 12단계 → 그림 추가, 5단계로 정리

ROUND 2
Seen in one second: 판의 큰 손글씨 제목, 노란 단추
Layout words by section: 같음
Scores: design 6.5 · usability 7 · creativity 7.5 · content 7.5 → overall 6.95
Caps applied: 휴대폰 eyebrow FAIL → 6.0 이하
Top three problems:
1. 쪽지 옆 그림이 이 클로즈업으로 잘림(mobile-page-01, desktop-page-01) → EP01 첫 장면으로 교체
2. 밤 섹션 오른쪽 위가 비고 그림이 반만 보임 → 높이 줄이고 정사각으로 자름
3. 짧은 글이 제목 바로 위에 붙어 eyebrow로 읽힘 → 간격, 서명 정리

ROUND 3
Seen in one second: 방의 릴리, 오른쪽 종이 판의 "릴리랑 2분 영어 그림책"
Layout words by section: hero=offset-card-over-room / show=split / day=pinned-stack / letter=picture+sheet / faq=picture+two-column text / reply=card-on-field / footer=postcard back
Scores: design 7.2 · usability 7.8 · creativity 7.5 · content 7.5 → overall 7.45
Caps applied: 없음(inspect 0 FAIL)
Top three problems (남은 것):
1. 휴대폰에서 첫 화면 판이 화면 절반 넘게 덮어 그림 크기가 데스크톱보다 약함
2. 하루 판의 닫힌 칸은 글만 있어서, 판이 "스티커 판"으로 보이는 힘은 열린 이 닦기 칸 하나에 몰림
3. 영상이 없음(no-footage). EP01 화면 녹화 한 컷이 생기면 쇼케이스에 넣을 자리
```

남은 WARN과 이유
- palette-cream: 종이 #f3f1ec는 낮은 채도의 뼈색이고 판(종이)에만 쓴다. 바탕은 돌색 #dedad2.
- font-not-dealt: Boska는 한글이 없고 CSP 밖(fontshare)이다. 개구(제목)와 고운바탕(본문)으로 바꿈.
- no-footage: 정직하게 쓸 영상이 아직 없다. 실제 EP01 화면 녹화가 생기면 넣는다.
- off-centre @768: 23px과 40px의 차이는 고정된 맛보기 표(왼쪽 아래)가 잡히는 것으로 보인다. 본문 여백은 양쪽 같다.
