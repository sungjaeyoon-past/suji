import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'fs';

const COMPLEXES = [
  { name: '신정마을주공1', complexNo: '3745' },
  { name: '용인수지신정마을9단지', complexNo: '3746' },
  { name: '한국', complexNo: '3741' },
  { name: '현대', complexNo: '2225' },
  { name: '동부', complexNo: '3740' },
  { name: '동보', complexNo: '3739' },
  { name: '동천마을현대홈타운1차', complexNo: '3705' },
  { name: '동천마을현대홈타운2차', complexNo: '3706' },
  { name: '동천디이스트', complexNo: '9390' },
  { name: '써니벨리', complexNo: '8361' },
  { name: '성동마을강남', complexNo: '3093' },
];

const browser = await chromium.launch({
  headless: false,
  args: ['--disable-blink-features=AutomationControlled']
});

const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  viewport: { width: 1280, height: 800 }
});

const page = await context.newPage();
await page.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => false });
});

if (!existsSync('resources/maps')) mkdirSync('resources/maps', { recursive: true });

// 먼저 단지별 좌표를 API에서 가져오기
const complexCoords = {};

for (const c of COMPLEXES) {
  console.log(`${c.name}...`);

  // 단지 페이지 접속 - 좌표 지정 안 함 (자동 이동)
  await page.goto(`https://new.land.naver.com/complexes/${c.complexNo}?a=APT&b=A1&e=RETAIL`, {
    waitUntil: 'networkidle', timeout: 30000
  });
  await page.waitForTimeout(4000);

  // 지도 영역에서 해당 단지의 선택된 마커 위치 확인
  // 네이버 부동산 지도는 단지 클릭시 해당 단지로 자동 이동됨
  // 상단 필터 바와 좌측 패널을 제외한 순수 지도 영역만 캡처

  // 상단 필터 바 높이 확인
  const filterBarBottom = await page.evaluate(() => {
    const bar = document.querySelector('.filter_wrap, .complex_filter, [class*="filter_bar"]');
    if (bar) return bar.getBoundingClientRect().bottom;
    // 대안: 상단 고정 요소들의 아래쪽
    const header = document.querySelector('.header_wrap, #header');
    if (header) return header.getBoundingClientRect().bottom;
    return 80; // 기본값
  });

  // 좌측 패널 너비
  const panelRight = await page.evaluate(() => {
    const panel = document.querySelector('#complexOverviewList, .complex_list_wrap, #listContents');
    if (panel) return panel.getBoundingClientRect().right;
    return 400;
  });

  const mapX = Math.max(panelRight, 380);
  const mapY = Math.max(filterBarBottom, 40);
  const mapW = 1280 - mapX - 160; // 오른쪽 패널 잘라내기
  const mapH = 800 - mapY;

  await page.screenshot({
    path: `resources/maps/${c.name}.png`,
    clip: { x: mapX, y: mapY, width: mapW, height: mapH }
  });
  console.log(`  캡처 (x=${mapX}, y=${mapY}, ${mapW}x${mapH})`);
}

await browser.close();
console.log('완료');
