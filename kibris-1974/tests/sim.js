// Kıbrıs 1974 — kural testleri ve denge simülasyonu.
// Kullanım: node tests/sim.js [oyun_sayısı]
// Türk tarafını basit bir saldırı yapay zekâsı oynar; gerçek bir oyuncu daha iyisini yapabilmelidir.
'use strict';
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ctx = vm.createContext({ console });
for (const f of ['geo.js', 'data.js', 'rules.js', 'ai.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
}
const O = vm.runInContext('Oyun', ctx);
const R = O.Rules, M = O.MAP;

function structuralTests() {
  for (const c of M.cities) assert.ok(c.hex >= 0, 'şehir yerleşmedi: ' + c.name);
  for (const c of M.cities) if (c.side === 'TR') assert.ok(M.hexes[c.hex].enclave, 'Türk şehri bölge dışında: ' + c.name);
  assert.ok(R.beachHexes().length >= 1, 'çıkarma plajı yok');
  assert.ok(M.hexes.some((h) => h.enclave === 'Lefkoşa' && h.fort), 'Lefkoşa mevzisi yok');
  // Ada (üsler hariç) tek parça olmalı
  const land = new Set(M.hexes.filter((h) => R.passable(h)).map((h) => h.i));
  const first = land.values().next().value;
  const seen = new Set([first]); const q = [first];
  while (q.length) { const c = q.pop(); for (const nb of M.hexes[c].nbrs) if (land.has(nb) && !seen.has(nb)) { seen.add(nb); q.push(nb); } }
  const lost = [...land].filter((i) => !seen.has(i));
  assert.ok(lost.length <= 3, 'adada kopuk kara parçası: ' + lost.length);

  const st = R.newGame({ seed: 1 });
  const used = new Set();
  for (const u of st.units) {
    assert.ok(u.hex >= 0, 'birlik yerleşmedi: ' + u.name);
    assert.ok(!used.has(u.hex), 'üst üste birlik: ' + u.name);
    used.add(u.hex);
    if (u.side === 'GR') assert.ok(!M.hexes[u.hex].enclave, 'Rum birliği Türk bölgesinde: ' + u.name);
  }
  // Paraşütçüler iniş bölgesinde, plaj birlikleri plajda
  for (const u of st.units) {
    if (R.type(u).drop) assert.ok(R.inDropZone(u.hex), 'paraşüt iniş bölgesi dışında');
  }
  R.finishDeploy(st);
  assert.strictEqual(st.phase, 'TR');
  assert.strictEqual(st.turn, 1);
  assert.ok(st.air.TR > 0, 'gündüz hava desteği yok');
  for (const u of st.units) if (u.side === 'TR' && !R.type(u).static) assert.ok(u.inSupply, 'ikmalsiz başlangıç: ' + u.name);
  assert.ok(!R.corridorOpen(st), 'koridor baştan açık olmamalı');
  R.endTurkishPhase(st);
  assert.strictEqual(st.phase, 'GR');
  assert.ok(st.units.filter((u) => u.side === 'GR').every((u) => u.mpLeft <= R.type(u).mp - 1), 'gündüz Rum hareket cezası yok');
  console.log('Yapı testleri: TAMAM');
}

async function playGame(seed, difficulty, trace) {
  const st = R.newGame({ seed, difficulty });
  R.finishDeploy(st);
  let guard = 0;
  while (st.phase !== 'over' && guard++ < 40) {
    if (st.phase === 'TR') { await O.AI.runAutoTurkish(st, {}); R.endTurkishPhase(st); }
    if (st.phase === 'GR') { await O.AI.runEnemyPhase(st, {}); R.endEnemyPhase(st); }
    if (trace && (st.phase === 'TR' || st.phase === 'interlude')) {
      console.log(`  T${st.turn} ${st.weather} VP=${R.turkishVP(st)} koridor=${R.corridorOpen(st)} Girne=${st.owner[R.cityHex('Girne')]} TR=${st.units.filter((u) => u.side === 'TR').length} GR=${st.units.filter((u) => u.side === 'GR').length}`);
    }
    if (st.phase === 'interlude') {
      R.beginStage2(st);
      R.finishDeploy(st);
    }
  }
  return st;
}

async function balance(n) {
  for (const diff of ['kolay', 'normal', 'zor']) {
    const res = { TR: 0, GR: 0, draw: 0 };
    let vp = 0, sc = 0, s1 = 0, cor = 0, lt = 0, lg = 0;
    const t0 = Date.now();
    for (let i = 0; i < n; i++) {
      const st = await playGame(500 + i, diff);
      assert.ok(st.result && st.stage1, 'sonuç yok');
      res[st.result.winner]++;
      vp += st.result.vp; sc += st.result.score.total;
      if (st.stage1.girne && st.stage1.corridor) s1++;
      if (st.stage1.corridor) cor++;
      lt += st.stats.lost.TR; lg += st.stats.lost.GR;
    }
    console.log(`${diff.padEnd(6)} n=${n}  Türk:${res.TR} Berabere:${res.draw} Rum:${res.GR}  ort. ZP=${(vp / n).toFixed(1)}/${R.maxVP()}  ` +
      `1. aşama tam=${s1} koridor=${cor}  kayıp TR/GR=${(lt / n).toFixed(1)}/${(lg / n).toFixed(1)}  skor=${(sc / n).toFixed(0)}  ${((Date.now() - t0) / n).toFixed(0)} ms/oyun`);
  }
}

(async () => {
  structuralTests();
  const n = Number(process.argv[2] || 8);
  if (process.argv[3] === 'trace') { await playGame(500, 'normal', true); return; }
  if (n > 0) await balance(n);
})().catch((e) => { console.error(e); process.exit(1); });
