import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const COMPLEXES = [
  // 수지구청역
  { name: '신정마을주공1', seq: '8341' },
  { name: '용인수지신정마을9단지', seq: '8342' },
  { name: '한국', seq: '8347' },
  { name: '현대', seq: '8349' },
  { name: '동부', seq: '8321' },
  { name: '동보', seq: '8322' },
  // 동천역
  { name: '동천마을현대홈타운1차', seq: '8404' },
  { name: '동천마을현대홈타운2차', seq: '8403' },
  { name: '동천디이스트', seq: '20085365' },
  { name: '써니벨리', seq: '53281' },
  // 성복역
  { name: '성동마을강남', seq: '8411' },
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
await page.goto('https://asil.kr', { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(8000);

console.log('=== 아실 매물 수집 ===');
const allListings = {};

for (const c of COMPLEXES) {
  console.log(`\n--- ${c.name} (seq: ${c.seq}) ---`);

  try {
    const salePage = await context.newPage();
    await salePage.goto(`https://asil.kr/app/sale_of_apt.jsp?os=pc&user=0&apt=${c.seq}`, {
      waitUntil: 'load', timeout: 30000
    });
    await salePage.waitForTimeout(3000);

    const fullText = await salePage.evaluate(() => document.body.innerText);

    const saleListings = [];
    const lines = fullText.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('매매') && (line.includes('억') || line.includes('만'))) {
        saleListings.push({
          priceArea: line,
          detail: lines[i + 1]?.trim() || '',
          desc: lines[i + 2]?.trim() || '',
        });
      }
    }

    console.log(`  매매 매물: ${saleListings.length}건`);
    allListings[c.name] = saleListings;
    await salePage.close();
  } catch (e) {
    console.log(`  에러: ${e.message.substring(0, 100)}`);
    allListings[c.name] = [];
  }
}

writeFileSync('asil-listings.json', JSON.stringify(allListings, null, 2));
console.log('\n=== asil-listings.json 저장 ===');

let total = 0;
for (const [name, listings] of Object.entries(allListings)) {
  console.log(`  ${name}: ${listings.length}건`);
  total += listings.length;
}
console.log(`  총: ${total}건`);

await browser.close();
