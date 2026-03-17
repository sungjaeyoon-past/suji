import XLSX from 'xlsx';
import { writeFileSync, readFileSync, existsSync, readdirSync } from 'fs';

// === 메타데이터 ===
const complexMeta = {
  // 수지구청역
  '신정마을주공1': { label: '신정마을주공1', filterKey: '주공1', units: 1044, year: 2000, station: '수지구청', walk: 4 },
  '용인수지신정마을9단지': { label: '신정9단지', filterKey: '9단지', units: 812, year: 2000, station: '수지구청', walk: 8 },
  '한국': { label: '한국', filterKey: '한국', units: 416, year: 1995, station: '수지구청', walk: 1 },
  '현대': { label: '현대', filterKey: '현대', units: 1168, year: 1994, station: '수지구청', walk: 5 },
  '동부': { label: '동부', filterKey: '동부', units: 612, year: 1995, station: '수지구청', walk: 16 },
  '동보': { label: '동보', filterKey: '동보', units: 470, year: 1995, station: '수지구청', walk: 5 },
  // 동천역
  '동천마을현대홈타운1차': { label: '현대홈타운1', filterKey: '홈타운1', units: 1128, year: 2002, station: '동천', walk: 3 },
  '동천마을현대홈타운2차': { label: '현대홈타운2', filterKey: '홈타운2', units: 1128, year: 2002, station: '동천', walk: 12 },
  '동천디이스트': { label: '동천디이스트', filterKey: '디이스트', units: 1334, year: 2020, station: '동천', walk: 9 },
  '써니벨리': { label: '써니벨리', filterKey: '써니벨리', units: 627, year: 2004, station: '동천', walk: 5 },
  // 성복역
  '성동마을강남': { label: '강남빌리지', filterKey: '강남빌리지', units: 428, year: 2001, station: '성복', walk: 5 },
};

const targetNames = Object.keys(complexMeta);

// === 엑셀 파싱 (최신 실거래가 파일 자동 탐색) ===
const tradeFiles = readdirSync('resources')
  .filter(f => f.includes('실거래가') && f.endsWith('.xlsx'))
  .sort()
  .reverse();
const tradeFile = tradeFiles[0];
if (!tradeFile) { console.error('실거래가 파일 없음'); process.exit(1); }
console.log(`실거래가 파일: ${tradeFile}`);
const wb = XLSX.readFile(`resources/${tradeFile}`);
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

// 헤더: row 12 (0-indexed)
// 데이터: row 13+
const dataRows = rows.slice(13).filter(r => r[0]);

// 대상 단지 필터링
const trades = {};
for (const name of targetNames) {
  trades[name] = [];
}

for (const row of dataRows) {
  const name = String(row[5] || '').trim();
  if (!targetNames.includes(name)) continue;

  const tradeType = String(row[17] || '').trim();
  if (tradeType === '직거래') continue;

  const area = parseFloat(row[6]);
  const yearMonth = String(row[7]); // 202601
  const day = String(row[8]).padStart(2, '0');
  const priceStr = String(row[9]).replace(/,/g, '').trim();
  const price = parseInt(priceStr);
  const floor = parseInt(row[11]) || 0;

  const month = yearMonth.slice(4, 6);
  const dateStr = `${month}.${day}`;

  trades[name].push({
    date: dateStr,
    dateSort: `${yearMonth}${day}`,
    area,
    floor,
    price, // 만원 단위
    priceLabel: formatPrice(price),
  });
}

function formatPrice(manwon) {
  const eok = manwon / 10000;
  if (eok >= 1) {
    const rounded = Math.round(eok * 100) / 100;
    return `${rounded}억`;
  }
  return `${manwon.toLocaleString()}만`;
}

// 정렬: 면적 오름차순 → 층수 오름차순
for (const name of targetNames) {
  trades[name].sort((a, b) => {
    if (a.area !== b.area) return a.area - b.area;
    return a.floor - b.floor;
  });
}

// 면적 타입별 그룹핑
function groupByArea(tradeList) {
  const groups = {};
  for (const t of tradeList) {
    // 면적을 정수로 반올림해서 그룹
    const areaKey = Math.round(t.area);
    if (!groups[areaKey]) groups[areaKey] = [];
    groups[areaKey].push(t);
  }
  return Object.entries(groups)
    .sort(([a], [b]) => parseInt(a) - parseInt(b))
    .map(([areaKey, items]) => {
      // 저층(< 5층) 최신순 먼저, 그 다음 고층(>= 5층) 최신순
      const low = items.filter(i => i.floor < 5).sort((a, b) => b.dateSort.localeCompare(a.dateSort));
      const high = items.filter(i => i.floor >= 5).sort((a, b) => b.dateSort.localeCompare(a.dateSort));
      return { area: parseInt(areaKey), areaRaw: items[0].area, items: [...low, ...high] };
    });
}

// === 매물 데이터 로딩 ===
const listingsMap = {};
const listingsFile = existsSync('listings.json') ? 'listings.json' : 'naver-listings.json';
if (existsSync(listingsFile)) {
  const raw = JSON.parse(readFileSync(listingsFile, 'utf-8'));
  for (const [complexName, items] of Object.entries(raw)) {
    listingsMap[complexName] = items.map(item => {
      const floorStr = String(item.floor || '');
      const floorNum = parseInt(floorStr);
      const floor = isNaN(floorNum) ? (floorStr.startsWith('고') ? 15 : floorStr.startsWith('저') ? 2 : 10) : floorNum;
      // areaExclusive가 있으면 전용면적, 없으면 공급면적 기준으로 타입 분류
      const rawArea = parseInt(String(item.areaExclusive || item.area).replace(/㎡/g, ''));
      // 전용면적이 있으면 그대로, 없으면 공급면적 기준으로 타입 분류
      // 59타입: 공급 72~87㎡, 84타입: 공급 104~144㎡, 그 사이는 가까운 쪽
      let area;
      if (item.areaExclusive) {
        area = rawArea;
      } else {
        area = rawArea <= 95 ? 59 : 84;
      }
      const supplyArea = rawArea; // 공급면적 원본
      const priceStr = String(item.price || '');
      // "10억 9,000" → 만원 단위
      let price = 0;
      const eokMatch = priceStr.match(/(\d+)억\s*([\d,]*)/);
      if (eokMatch) {
        price = parseInt(eokMatch[1]) * 10000;
        const remainder = eokMatch[2] ? parseInt(eokMatch[2].replace(/,/g, '')) : 0;
        if (!isNaN(remainder)) price += remainder;
      }

      return {
        area,
        supplyArea,
        floor,
        dong: item.dong || '',
        direction: item.direction || '',
        description: (item.description || '').trim(),
        confirmDate: item.confirmDate || '',
        price,
        priceLabel: formatPrice(price),
      };
    });

    // 동일 가격 + 동일 층 중복 제거
    const seen = new Set();
    listingsMap[complexName] = listingsMap[complexName].filter(l => {
      const key = `${l.area}_${l.floor}_${l.price}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  console.log('매물 데이터 로딩 완료');
}

// 데이터 구성
const complexData = targetNames.map(name => {
  const meta = complexMeta[name];
  const tradeList = trades[name];
  const areaGroups = groupByArea(tradeList);
  const listings = listingsMap[name] || [];
  // 가격+면적 기준으로 그룹핑하여 같은 가격의 층을 합침
  const priceGroups = {};
  for (const l of listings) {
    const key = `${l.area}_${l.price}`;
    if (!priceGroups[key]) priceGroups[key] = { ...l, floorEntries: [{ floor: l.floor, dong: l.dong, direction: l.direction, description: l.description, confirmDate: l.confirmDate }] };
    else priceGroups[key].floorEntries.push({ floor: l.floor, dong: l.dong, direction: l.direction, description: l.description, confirmDate: l.confirmDate });
  }
  const grouped = Object.values(priceGroups).map(g => {
    g.floorEntries.sort((a, b) => a.floor - b.floor);
    const floorParts = g.floorEntries.map(e => {
      const dongNum = e.dong ? e.dong.replace(/동$/, '') : '';
      const label = dongNum ? `${e.floor}층(${dongNum})` : `${e.floor}층`;
      return `<span class="floor-entry" data-efloor="${e.floor}">${label}</span>`;
    });
    g.floorLabel = floorParts.join('<br>');
    g.floor = Math.max(...g.floorEntries.map(e => e.floor));
    return g;
  });
  // 가격순 정렬
  grouped.sort((a, b) => a.price - b.price);

  return {
    ...meta,
    name,
    trades: tradeList,
    areaGroups,
    listings: grouped,
  };
});

// === 지도 이미지 Base64 인코딩 (resources/maps/ 폴더에서 자동 로딩) ===
const mapImages = {};
for (const name of targetNames) {
  const mapPath = `resources/maps/${name}.png`;
  if (existsSync(mapPath)) {
    const imgBuf = readFileSync(mapPath);
    mapImages[name] = `data:image/png;base64,${imgBuf.toString('base64')}`;
  }
}

// === HTML 생성 ===
const template = readFileSync('template.html', 'utf-8');

const html = template
  .replace('__DATA__', JSON.stringify(complexData, null, 2))
  .replace('__MAP_IMAGES__', JSON.stringify(mapImages));
writeFileSync('index.html', html, 'utf-8');

console.log(`Built index.html with ${complexData.length} complexes`);
for (const c of complexData) {
  console.log(`  ${c.name}: ${c.trades.length}건, ${c.areaGroups.length}개 타입`);
}
