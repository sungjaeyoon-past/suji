import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const COMPLEXES = [
  { name: '신정마을주공1', complexNo: '3745' },
  { name: '용인수지신정마을9단지', complexNo: '3746' },
  { name: '신정7단지(상록)공무원', complexNo: '11231' },
  { name: '한국', complexNo: '3741' },
  { name: '현대', complexNo: '2225' },
  { name: '동부', complexNo: '3740' },
  { name: '동보', complexNo: '3739' },
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

// 요청 가로채기: sameAddressGroup=false를 true로 변경
await page.route('**/api/articles/complex/**', async (route) => {
  const url = route.request().url();
  const newUrl = url.replace('sameAddressGroup=false', 'sameAddressGroup=true');
  if (newUrl !== url) {
    console.log('  [ROUTE] sameAddressGroup → true');
  }
  await route.continue({ url: newUrl });
});

console.log('=== 네이버 부동산 매물 수집 (동일매물 묶기 적용) ===');
const allListings = {};

for (const c of COMPLEXES) {
  console.log(`\n--- ${c.name} (${c.complexNo}) ---`);

  let articles = [];
  const articleHandler = async (res) => {
    const url = res.url();
    if (url.includes(`/api/articles/complex/${c.complexNo}`)) {
      try {
        const body = await res.json();
        if (body.articleList) {
          articles.push(...body.articleList);
          console.log(`  [API] ${body.articleList.length}건 수신 (총 ${body.totalCount}건, sameAddrGroup=${url.includes('sameAddressGroup=true')})`);
        }
      } catch (e) {}
    }
  };
  page.on('response', articleHandler);

  try {
    await page.goto(`https://new.land.naver.com/complexes/${c.complexNo}?ms=37.3225424,127.0969749,16&a=APT&b=A1&e=RETAIL`, {
      waitUntil: 'networkidle', timeout: 30000
    });
    await page.waitForTimeout(2000);

    // 매물 스크롤로 더 로드
    for (let i = 0; i < 20; i++) {
      const scrolled = await page.evaluate(() => {
        const el = document.querySelector('.article_box_wrap, .item_list, [class*="article_list"]');
        if (el) {
          const before = el.scrollTop;
          el.scrollTop = el.scrollHeight;
          return el.scrollTop !== before;
        }
        return false;
      });
      if (!scrolled) break;
      await page.waitForTimeout(800);
    }
  } catch (e) {
    console.log(`  에러: ${e.message.substring(0, 100)}`);
  }

  page.off('response', articleHandler);

  // 매매만 + articleNo 중복제거
  const uniqueArticles = new Map();
  for (const a of articles) {
    if (a.tradeTypeName === '매매' || a.tradeTypeCode === 'A1') {
      uniqueArticles.set(a.articleNo, a);
    }
  }

  const saleArticles = [...uniqueArticles.values()];
  console.log(`  매매 매물: ${saleArticles.length}건 (원본 ${articles.length}건)`);

  allListings[c.name] = saleArticles.map(a => ({
    complexName: c.name,
    articleNo: a.articleNo,
    price: a.dealOrWarrantPrc || a.dealPrice || '',
    area: a.area1 || a.exclusiveArea || a.areaName || '',
    areaExclusive: a.area2 || a.exclusiveUseArea || '',
    floor: a.floorInfo || a.floor || '',
    dong: a.buildingName || a.dong || '',
    direction: a.direction || a.directionName || '',
    description: a.articleFeatureDesc || a.articleName || '',
    confirmDate: a.articleConfirmYmd || '',
    sameAddrCount: a.sameAddrCnt || a.sameAddrCount || 1,
    source: 'naver',
  }));

  for (const l of allListings[c.name]) {
    console.log(`    ${l.dong} ${l.floor} | ${l.area}㎡ | ${l.price} | ${l.direction} (×${l.sameAddrCount})`);
  }
}

writeFileSync('naver-listings.json', JSON.stringify(allListings, null, 2), 'utf-8');
console.log('\n=== naver-listings.json 저장 완료 ===');

let total = 0;
for (const [name, listings] of Object.entries(allListings)) {
  console.log(`  ${name}: ${listings.length}건`);
  total += listings.length;
}
console.log(`  총: ${total}건`);

await browser.close();
