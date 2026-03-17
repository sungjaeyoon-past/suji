import { chromium } from 'playwright';
import { readdirSync, renameSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';

const DOWNLOAD_DIR = join(process.cwd(), 'resources');

const browser = await chromium.launch({
  headless: false,
  args: ['--disable-blink-features=AutomationControlled'],
});

const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  viewport: { width: 1280, height: 800 },
  acceptDownloads: true,
});

const page = await context.newPage();

console.log('=== 실거래가 다운로드 (rt.molit.go.kr) ===');

const today = new Date();
const startDate = '2026-01-01';
const endDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
console.log(`기간: ${startDate} ~ ${endDate}`);

await page.goto('https://rt.molit.go.kr/pt/xls/xls.do?mobileAt=', {
  waitUntil: 'load',
  timeout: 60000,
});
await page.waitForTimeout(3000);

// 1. 날짜 설정
await page.fill('#srhFromDt', startDate);
await page.fill('#srhToDt', endDate);
console.log('날짜 설정 완료');

// 2. 시도 선택: 경기도 (41000)
await page.selectOption('#srhSidoCd', '41000');
await page.waitForTimeout(2000);
console.log('경기도 선택');

// 3. 시군구 선택: 용인시 수지구
// 시군구 옵션 로드 대기 후 확인
const sggOptions = await page.evaluate(() => {
  const sel = document.querySelector('#srhSggCd');
  return [...sel.options].map(o => ({ value: o.value, text: o.text }));
});
console.log('시군구 옵션:');
sggOptions.filter(o => o.text.includes('용인')).forEach(o => console.log(`  ${o.value}: ${o.text}`));

// 수지구 찾기
const sujiOption = sggOptions.find(o => o.text.includes('수지'));
if (sujiOption) {
  await page.selectOption('#srhSggCd', sujiOption.value);
  console.log(`수지구 선택: ${sujiOption.value} (${sujiOption.text})`);
  await page.waitForTimeout(1000);
} else {
  console.log('수지구 못 찾음. 용인시 전체로 시도...');
  const yonginOption = sggOptions.find(o => o.text.includes('용인'));
  if (yonginOption) {
    await page.selectOption('#srhSggCd', yonginOption.value);
    console.log(`용인시 선택: ${yonginOption.value}`);
    await page.waitForTimeout(1000);
  }
}

await page.screenshot({ path: 'molit-ready.png' });

// 4. Excel 다운로드
console.log('Excel 다운로드 시작...');
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 60000 }),
  page.click('button:has-text("EXCEL 다운")'),
]);

const suggestedFilename = download.suggestedFilename();
console.log(`다운로드 파일: ${suggestedFilename}`);

// 파일 저장
const savePath = join(DOWNLOAD_DIR, suggestedFilename);
await download.saveAs(savePath);
console.log(`저장 완료: ${savePath}`);

// 기존 실거래가 파일 이름과 다르면 심볼릭 링크 또는 복사
// build.mjs가 참조하는 파일명 패턴 확인
const existingFiles = readdirSync(DOWNLOAD_DIR).filter(f => f.includes('실거래가'));
console.log('기존 실거래가 파일:', existingFiles);

await browser.close();
console.log('=== 실거래가 다운로드 완료 ===');
