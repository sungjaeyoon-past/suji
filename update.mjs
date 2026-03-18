import { execSync } from 'child_process';

const steps = [
  { name: '실거래가 다운로드', cmd: 'node scrape-trades.mjs' },
  { name: '네이버 매물 수집', cmd: 'node scrape-naver.mjs' },
  { name: '아실 매물 수집', cmd: 'node scrape-asil.mjs' },
  { name: '매물 병합', cmd: 'node merge-listings.mjs' },
  { name: '지도 캡처', cmd: 'node capture-maps.mjs' },
  { name: 'HTML 빌드', cmd: 'node build.mjs' },
];

console.log('=== 데이터 업데이트 파이프라인 ===');
console.log(`시작: ${new Date().toLocaleString('ko-KR')}\n`);

for (const step of steps) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`▶ ${step.name}`);
  console.log('='.repeat(50));

  try {
    execSync(step.cmd, { stdio: 'inherit', timeout: 600000 });
    console.log(`✓ ${step.name} 완료`);
  } catch (e) {
    console.error(`✗ ${step.name} 실패: ${e.message.substring(0, 200)}`);
    process.exit(1);
  }
}

console.log(`\n${'='.repeat(50)}`);
console.log(`✓ 전체 업데이트 완료 (${new Date().toLocaleString('ko-KR')})`);
console.log('='.repeat(50));
