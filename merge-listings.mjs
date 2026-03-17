import { readFileSync, writeFileSync } from 'fs';
import XLSX from 'xlsx';

// === 네이버 데이터 로드 ===
const naverRaw = JSON.parse(readFileSync('naver-listings.json', 'utf-8'));

// === 아실 데이터 로드 및 파싱 ===
const asilRaw = JSON.parse(readFileSync('asil-listings.json', 'utf-8'));

function parseAsilListing(item) {
  // item.priceArea: "매매11억5000만104㎡" or "매매12억104㎡"
  // item.desc: "104동 6층 리모델링사업추진 입주가능 급매 하시가능"
  const pa = item.priceArea;

  // 가격 파싱: 역방향 - 끝에서 면적(2-3자리+㎡), 나머지가 가격
  const priceMatch = pa.match(/매매(.+?)(\d{2,3})㎡$/);
  let price = '';
  let area = '';
  if (priceMatch) {
    area = priceMatch[2];
    const rawPrice = priceMatch[1]; // "11억5000만" or "12억"
    const m = rawPrice.match(/(\d+)억(\d+)?만?/);
    if (m) {
      const eok = m[1];
      const man = m[2] || '';
      if (man) {
        price = `${eok}억 ${Number(man).toLocaleString()}`;
      } else {
        price = `${eok}억`;
      }
    }
  }

  // 동, 층수 파싱 - desc 필드에서 추출
  const desc = item.desc || item.detail || '';
  const dongMatch = desc.match(/(\d+)동/);
  const floorMatch = desc.match(/(\d+|고|저|중)층/);

  const dong = dongMatch ? dongMatch[1] + '동' : '';
  const floor = floorMatch ? floorMatch[1] + '층' : '';

  // 설명: 동/층 정보를 제거한 나머지
  const description = desc.replace(/^\d+동\s*(?:\d+|고|저|중)?층?\s*/, '').trim();

  return { price, area, areaExclusive: area, dong, floor, direction: '', description, source: 'asil' };
}

// === 통합 데이터 구성 ===
const complexNames = [
  '신정마을주공1', '용인수지신정마을9단지', '신정7단지(상록)공무원',
  '한국', '현대', '한성', '동부', '동보'
];

const allData = {};
let totalNaver = 0, totalAsil = 0, totalMerged = 0;

for (const name of complexNames) {
  const listings = [];

  // 네이버 매물 추가
  if (naverRaw[name]) {
    for (const n of naverRaw[name]) {
      listings.push({
        complexName: name,
        price: n.price,
        area: n.area,
        dong: n.dong,
        floor: n.floor,
        direction: n.direction,
        description: n.description,
        source: 'naver',
      });
    }
    totalNaver += naverRaw[name].length;
  }

  // 아실 매물 추가
  if (asilRaw[name]) {
    for (const a of asilRaw[name]) {
      const parsed = parseAsilListing(a);
      listings.push({
        complexName: name,
        ...parsed,
      });
    }
    totalAsil += asilRaw[name].length;
  }

  // 중복 제거: 동 + 층수 + 가격이 같으면 1건
  const deduped = [];
  const seen = new Set();
  for (const l of listings) {
    // 가격 정규화: "11억 5,000" -> "115000", "매매11억5000만" -> "115000"
    const priceNorm = normalizePrice(l.price);
    const key = `${l.dong}|${normalizeFloor(l.floor)}|${priceNorm}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(l);
    }
  }

  allData[name] = deduped;
  totalMerged += deduped.length;
  console.log(`${name}: 네이버 ${naverRaw[name]?.length || 0} + 아실 ${asilRaw[name]?.length || 0} → 병합 후 ${deduped.length}건`);
}

function normalizePrice(p) {
  if (!p) return '';
  // "11억 5,000" → "115000"
  // "11억5000만" → "115000"
  // "9억 5,000" → "95000"
  let s = String(p).replace(/\s/g, '').replace(/,/g, '');
  // "11억5000만" format
  const m1 = s.match(/(\d+)억(\d+)만?/);
  if (m1) return String(parseInt(m1[1]) * 10000 + parseInt(m1[2]));
  // "12억" format (no 만)
  const m2 = s.match(/^(\d+)억$/);
  if (m2) return String(parseInt(m2[1]) * 10000);
  // "11억 5,000" format (Naver)
  const m3 = s.match(/(\d+)억(\d+)/);
  if (m3) return String(parseInt(m3[1]) * 10000 + parseInt(m3[2]));
  return s;
}

function normalizeFloor(f) {
  if (!f) return '';
  // "7/16" → "7", "고/15" → "고", "저/16" → "저", "중/17" → "중"
  const m = String(f).match(/^(\d+|고|저|중)/);
  return m ? m[1] : f;
}

console.log(`\n=== 요약 ===`);
console.log(`네이버 원본: ${totalNaver}건`);
console.log(`아실 원본: ${totalAsil}건`);
console.log(`병합 후 (중복제거): ${totalMerged}건`);

// === JSON 저장 ===
writeFileSync('listings.json', JSON.stringify(allData, null, 2), 'utf-8');
console.log('\nlistings.json 저장 완료');

// === Excel 저장 ===
const rows = [];
for (const [name, listings] of Object.entries(allData)) {
  for (const l of listings) {
    rows.push({
      '단지명': name,
      '매매가': l.price,
      '전용면적': l.area,
      '동': l.dong,
      '층': l.floor,
      '방향': l.direction,
      '설명': l.description,
      '출처': l.source,
    });
  }
}

const ws = XLSX.utils.json_to_sheet(rows);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, '매물');

// 컬럼 너비 설정
ws['!cols'] = [
  { wch: 20 }, // 단지명
  { wch: 15 }, // 매매가
  { wch: 10 }, // 전용면적
  { wch: 8 },  // 동
  { wch: 8 },  // 층
  { wch: 8 },  // 방향
  { wch: 50 }, // 설명
  { wch: 8 },  // 출처
];

XLSX.writeFile(wb, 'listings.xlsx');
console.log('listings.xlsx 저장 완료');

// 단지별 요약
console.log('\n=== 단지별 매물 수 ===');
for (const [name, listings] of Object.entries(allData)) {
  const naverCount = listings.filter(l => l.source === 'naver').length;
  const asilCount = listings.filter(l => l.source === 'asil').length;
  console.log(`  ${name}: ${listings.length}건 (네이버 ${naverCount}, 아실 ${asilCount})`);
}
