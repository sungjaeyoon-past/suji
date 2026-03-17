import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const COMPLEXES = [
  { name: '신정마을주공1', seq: '8341' },
  { name: '용인수지신정마을9단지', seq: '8342' },
  { name: '신정7단지(상록)공무원', seq: '8335' },
  { name: '한국', seq: '8347' },
  { name: '현대', seq: '8349' },
  { name: '한성', seq: '8348' },
  { name: '동부', seq: '8321' }, // 동부 - 추정 (8320~8325 범위)
  { name: '동보', seq: '8322' },
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

// 아실 먼저 접속 (쿠키/세션 필요)
await page.goto('https://asil.kr', { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(8000);

// Step 1: 동부 아파트 seq 찾기 - 지도에서 넓게 검색
console.log('=== 동부 아파트 찾기 ===');
await page.evaluate(() => {
  map.setCenter(new naver.maps.LatLng(37.325, 127.092));
  map.setZoom(16);
});
await page.waitForTimeout(5000);

// 마커 확인 - 지도에서 직접 동부 찾기
const aptBodies = [];
page.on('response', async (res) => {
  if (res.url().includes('apt_ver_5')) {
    try { aptBodies.push(await res.text()); } catch (e) {}
  }
});

// 여러 위치 시도
const positions = [
  [37.325, 127.092], [37.320, 127.090], [37.330, 127.095],
  [37.318, 127.095], [37.328, 127.100],
];

for (const [lat, lng] of positions) {
  await page.evaluate(({ lat, lng }) => {
    map.setCenter(new naver.maps.LatLng(lat, lng));
  }, { lat, lng });
  await page.waitForTimeout(3000);
}

// 동부 찾기
for (const body of aptBodies) {
  const re = /clickApt\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    const args = m[1].replace(/\\'/g, "'").split(',').map(s => s.trim().replace(/^'|'$/g, ''));
    if (args[1] && args[1].includes('동부') && !args[1].includes('센트레빌')) {
      console.log(`  ★ 동부 발견: seq=${args[0]}, name=${args[1]}, dong=${args[4]}`);
      COMPLEXES.find(c => c.name === '동부').seq = args[0];
    }
  }
}

// Step 2: 매물 수집 - sale_of_apt.jsp 페이지 직접 방문
console.log('\n=== 매물 수집 ===');
const allListings = {};

for (const c of COMPLEXES) {
  console.log(`\n--- ${c.name} (seq: ${c.seq}) ---`);

  // 매물 페이지 직접 접속
  const saleUrl = `https://asil.kr/app/sale_of_apt.jsp?os=pc&user=0&apt=${c.seq}`;

  try {
    // iframe이 아닌 새 탭에서 직접 접속
    const salePage = await context.newPage();
    await salePage.goto(saleUrl, { waitUntil: 'load', timeout: 30000 });
    await salePage.waitForTimeout(3000);

    // 매물 데이터 파싱
    const listings = await salePage.evaluate(() => {
      const items = [];
      // 매물 항목들 파싱
      const allElements = document.querySelectorAll('.offer_item, .sale_item, [class*="list"] > div, tr, .item');
      for (const el of allElements) {
        const text = el.textContent.trim();
        if (text.includes('매매') && (text.includes('억') || text.includes('만'))) {
          items.push(text.replace(/\s+/g, ' ').substring(0, 300));
        }
      }

      // 전체 텍스트에서 매물 파싱
      const fullText = document.body.innerText;
      return { items, fullText: fullText.substring(0, 5000) };
    });

    console.log(`  매물 항목: ${listings.items.length}건`);
    console.log(`  페이지 텍스트 (처음 2000자):`);
    console.log(`  ${listings.fullText.substring(0, 2000)}`);

    // 매매 매물만 파싱
    const saleListings = [];
    const lines = listings.fullText.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('매매') && (line.includes('억') || line.includes('만'))) {
        // 가격 + 면적 줄
        const nextLine = lines[i + 1]?.trim() || '';
        const descLine = lines[i + 2]?.trim() || '';
        saleListings.push({
          priceArea: line,
          detail: nextLine,
          desc: descLine,
        });
      }
    }

    console.log(`\n  매매 매물: ${saleListings.length}건`);
    saleListings.forEach(s => console.log(`    ${s.priceArea} | ${s.detail} | ${s.desc}`));

    allListings[c.name] = saleListings;
    await salePage.close();
  } catch (e) {
    console.log(`  에러: ${e.message.substring(0, 100)}`);
    allListings[c.name] = [];
  }
}

writeFileSync('asil-listings.json', JSON.stringify(allListings, null, 2));
console.log('\n=== asil-listings.json 저장 ===');

// 요약
let total = 0;
for (const [name, listings] of Object.entries(allListings)) {
  console.log(`  ${name}: ${listings.length}건`);
  total += listings.length;
}
console.log(`  총: ${total}건`);

await browser.close();
