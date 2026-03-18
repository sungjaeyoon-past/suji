# 작업 원칙

## 1. Think Before Coding
Don't assume. Don't hide confusion. Surface tradeoffs.

- State assumptions explicitly — If uncertain, ask rather than guess
- Present multiple interpretations — Don't pick silently when ambiguity exists
- Push back when warranted — If a simpler approach exists, say so
- Stop when confused — Name what's unclear and ask for clarification

## 2. Simplicity First
Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked
- No abstractions for single-use code
- No "flexibility" or "configurability" that wasn't requested
- No error handling for impossible scenarios
- If 200 lines could be 50, rewrite it
- The test: Would a senior engineer say this is overcomplicated? If yes, simplify.

## 3. Surgical Changes
Touch only what you must. Clean up only your own mess.

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting
- Don't refactor things that aren't broken
- Match existing style, even if you'd do it differently
- If you notice unrelated dead code, mention it — don't delete it

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused
- Don't remove pre-existing dead code unless asked
- The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution
Define success criteria. Loop until verified.

Transform imperative tasks into verifiable goals:

| Instead of... | Transform to... |
|---|---|
| "Add validation" | "Write tests for invalid inputs, then make them pass" |
| "Fix the bug" | "Write a test that reproduces it, then make it pass" |
| "Refactor X" | "Ensure tests pass before and after" |

For multi-step tasks, state a brief plan:
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]

Strong success criteria let the LLM loop independently. Weak criteria ("make it work") require constant clarification.

---

# 수지 관심 아파트 대시보드

수지구 아파트 실거래가 + 매물 정보를 모아 보여주는 모바일 대시보드.

## 기술 스택

- Node.js (ESM, .mjs)
- Playwright (브라우저 자동화 - 매물/실거래가/지도 수집)
- xlsx (엑셀 파싱)
- 순수 HTML/JS/CSS (프레임워크 없음, 단일 index.html)

## 데이터 업데이트

```bash
node update.mjs
```

한 번 실행하면 아래 순서로 전체 파이프라인 실행 (headless: false, 브라우저 뜸):

1. `scrape-trades.mjs` - rt.molit.go.kr에서 실거래가 Excel 다운 (26.01.01~오늘, 경기도 용인시 수지구)
2. `scrape-naver.mjs` - 네이버 부동산 매물 수집 (sameAddressGroup=true로 동일매물 묶기)
3. `scrape-asil.mjs` - 아실(asil.kr) 매물 수집
4. `merge-listings.mjs` - 네이버+아실 매물 병합, 동+층+가격 동일하면 중복제거
5. `capture-maps.mjs` - 네이버 부동산에서 단지별 지도 캡처
6. `build.mjs` - 실거래가 xlsx + listings.json + 지도 → index.html 생성

## 배포

GitHub Pages 자동 배포. push하면 반영됨.

```bash
git add -A && git commit -m "메시지" && git push
```

URL: https://sungjaeyoon-past.github.io/suji/

## 대상 단지 (11개)

| 역 | 단지명 (build.mjs 키) | 네이버 complexNo | 아실 seq |
|---|---|---|---|
| 수지구청 | 신정마을주공1 | 3745 | 8341 |
| 수지구청 | 용인수지신정마을9단지 | 3746 | 8342 |
| 수지구청 | 한국 | 3741 | 8347 |
| 수지구청 | 현대 | 2225 | 8349 |
| 수지구청 | 동부 | 3740 | 8321 |
| 수지구청 | 동보 | 3739 | 8322 |
| 동천 | 동천마을현대홈타운1차 | 3705 | 8404 |
| 동천 | 동천마을현대홈타운2차 | 3706 | 8403 |
| 동천 | 동천디이스트 | 9390 | 20085365 |
| 동천 | 써니벨리 | 8361 | 53281 |
| 성복 | 성동마을강남 | 3093 | 8411 |

**주의**: build.mjs의 키(단지명)는 실거래가 엑셀의 단지명과 정확히 일치해야 함.

## 단지 추가 방법

1. 네이버 부동산에서 complexNo 확인 (지도 마커 API의 markerId)
2. 아실에서 seq 확인 (clickApt 마커 파싱 또는 sale_of_apt.jsp URL)
3. 실거래가 엑셀에서 정확한 단지명 확인
4. 아래 파일에 모두 추가:
   - `build.mjs` - complexMeta (label, filterKey, units, year, station, walk)
   - `scrape-naver.mjs` - COMPLEXES 배열
   - `scrape-asil.mjs` - COMPLEXES 배열
   - `merge-listings.mjs` - complexNames 배열
   - `capture-maps.mjs` - COMPLEXES 배열

## 파일 구조

```
build.mjs            # 실거래가 xlsx + 매물 json → index.html
template.html        # HTML 템플릿 (__DATA__, __MAP_IMAGES__, __UPDATE_DATE__ 치환)
index.html           # 빌드 결과 (배포 대상)
update.mjs           # 파이프라인 진입점
scrape-trades.mjs    # 실거래가 다운로드 (rt.molit.go.kr)
scrape-naver.mjs     # 네이버 매물 수집 (API 응답 가로채기)
scrape-asil.mjs      # 아실 매물 수집 (sale_of_apt.jsp)
merge-listings.mjs   # 매물 병합/중복제거
capture-maps.mjs     # 네이버 지도 캡처
listings.json        # 병합된 매물 데이터
naver-listings.json  # 네이버 원본
asil-listings.json   # 아실 원본
resources/maps/      # 단지별 지도 캡처 PNG
resources/*.xlsx     # 실거래가 엑셀 (최신 파일 자동 탐색)
```

## 주의사항

- 기존 기능을 임의로 제거하거나 변경하지 말 것
- 네이버 부동산은 봇 감지가 있으므로 headless: false로 실행
- 네이버 API에 sameAddressGroup=true를 route 가로채기로 강제 적용
- 아실은 접속 후 8초 대기 필요 (JS 렌더링)
- 저층제외 필터: 매물은 그룹 내 개별 층수별로 필터링 (floor-entry span)
