// Kural testleri ve denge simülasyonu.
// Kullanım: node tests/sim.js [oyun_sayısı]
// Türk tarafı "pasif" oynar (yerinde kalır, takviye kullanır, yeni birlikleri cepheye yollar);
// gerçek bir oyuncu bundan daha iyisini yapabilmelidir.
'use strict';
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function load() {
  const ctx = vm.createContext({ console });
  for (const f of ['geo.js', 'data.js', 'rules.js', 'ai.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
  }
  return vm.runInContext('Oyun', ctx);
}
const O = load();
const R = O.Rules;
const M = O.MAP;

// ---------------------------------------------------------------- yapı testleri
function connected(set) {
  const arr = [...set];
  if (!arr.length) return true;
  const seen = new Set([arr[0]]);
  const q = [arr[0]];
  while (q.length) {
    const c = q.pop();
    for (const nb of M.hexes[c].nbrs) if (set.has(nb) && !seen.has(nb)) { seen.add(nb); q.push(nb); }
  }
  return seen.size === set.size;
}

function structuralTests() {
  for (const c of M.cities) assert.ok(c.hex >= 0, 'şehir yerleşmedi: ' + c.name);
  const ist = M.hexes[R.cityHex('İstanbul')];
  assert.strictEqual(ist.country, 'TR');
  // Türk Trakyası tek parça olmalı (Gelibolu dahil)
  const tr = new Set(M.hexes.filter((h) => R.passable(h) && h.country === 'TR').map((h) => h.i));
  assert.ok(connected(tr), 'Türk toprakları bağlantısız');
  for (const f of ['Çakmak Hattı', 'Çatalca Hattı', 'Bolayır Hattı']) {
    const s = new Set(M.hexes.filter((h) => h.fortLine === f).map((h) => h.i));
    assert.ok(s.size > 0, f + ' boş');
    assert.ok(connected(s), f + ' kesintili');
  }
  // Çakmak Hattı: hat altıgenleri çıkarılınca sınırdan İstanbul'a kara yolu kalmamalı
  const line = new Set(M.hexes.filter((h) => h.fortLine === 'Çakmak Hattı' || (h.city && h.city.name === 'Vize') || (h.city && h.city.name === 'Hayrabolu') || (h.city && h.city.name === 'Malkara')).map((h) => h.i));
  const start = R.cityHex('Edirne');
  const seen = new Set([start]);
  const q = [start];
  while (q.length) {
    const c = q.pop();
    for (const nb of M.hexes[c].nbrs) {
      if (seen.has(nb) || line.has(nb) || !R.passable(M.hexes[nb])) continue;
      seen.add(nb); q.push(nb);
    }
  }
  assert.ok(!seen.has(R.cityHex('İstanbul')), 'Çakmak Hattı İstanbul yolunu kesmiyor');
  assert.ok(!seen.has(R.cityHex('Gelibolu')), 'Çakmak Hattı Gelibolu yolunu kesmiyor');

  const st = R.newGame({ seed: 1 });
  const hexes = new Set();
  for (const u of st.units) {
    assert.ok(u.hex >= 0, 'birlik yerleşmedi: ' + u.name);
    assert.ok(!hexes.has(u.hex), 'üst üste birlik: ' + u.name);
    hexes.add(u.hex);
    const h = M.hexes[u.hex];
    assert.strictEqual(h.country === 'TR', u.side === 'TR', 'yanlış ülkede: ' + u.name);
  }
  // ilk turda tüm Türk birlikleri ikmalde olmalı
  R.finishDeploy(st);
  R.endGermanPhase(st);
  for (const u of st.units) if (u.side === 'TR') assert.ok(u.inSupply, 'ikmalsiz başlangıç: ' + u.name);

  // CRT ve oran testleri
  assert.strictEqual(R.oddsCol(0.4), 0);
  assert.strictEqual(R.oddsCol(1), 2);
  assert.strictEqual(R.oddsCol(1.5), 3);
  assert.strictEqual(R.oddsCol(2.99), 4);
  assert.strictEqual(R.oddsCol(7), 7);
  for (const row of R.CRT) for (const c of row) assert.ok(R.RESULTS[c], 'CRT kodu yok: ' + c);

  // ZOC: düşmana komşu altıgene giren birlik durur
  const s2 = R.newGame({ seed: 2 });
  R.finishDeploy(s2);
  for (const u of s2.units) {
    if (u.side !== 'DE') continue;
    const r = R.reachable(s2, u);
    const ez = R.zoc(s2, 'TR');
    for (const d of r.dests) {
      const p = R.path(r, d);
      for (let k = 1; k < p.length - 1; k++) assert.ok(!ez[p[k]], 'ZOC ihlali: ' + u.name);
    }
  }
  console.log('Yapı testleri: TAMAM');
}

// ---------------------------------------------------------------- pasif Türk
function passiveTurkish(st) {
  // takviyeleri en hasarlı birliğe
  while (st.rep.TR > 0) {
    const c = st.units.filter((u) => u.side === 'TR' && R.canReplace(st, u));
    if (!c.length) break;
    c.sort((a, b) => a.steps - b.steps);
    R.replace(st, c[0]);
  }
  // yeni gelen / geride kalan birlikler en yakın boş tahkimat altıgenine
  const fortFree = M.hexes.filter((h) => h.fort && st.owner[h.i] === 'TR' && !R.unitAt(st, h.i));
  for (const u of st.units) {
    if (u.side !== 'TR' || u.moved || R.type(u).static || R.hasAdjacentEnemy(st, u) || M.hexes[u.hex].fort) continue;
    const r = R.reachable(st, u);
    let best = -1, bd = Infinity;
    for (const h of fortFree) {
      if (R.unitAt(st, h.i)) continue;
      const d = R.hexDist(u.hex, h.i);
      if (d < bd) { bd = d; best = h.i; }
    }
    if (best < 0) continue;
    let dest = -1, dd = Infinity;
    for (const d of r.dests) { const x = R.hexDist(d, best); if (x < dd) { dd = x; dest = d; } }
    if (dest >= 0 && dd < R.hexDist(u.hex, best)) R.moveUnit(st, u, dest, r);
  }
}

async function playGame(seed, difficulty) {
  const st = R.newGame({ seed, difficulty });
  R.finishDeploy(st);
  let guard = 0;
  while (st.phase !== 'over' && guard++ < 100) {
    await O.AI.runGermanPhase(st, {});
    if (st.phase === 'over') break;
    R.endGermanPhase(st);
    passiveTurkish(st);
    R.endTurkishPhase(st);
  }
  return st;
}

async function balance(n) {
  for (const diff of ['kolay', 'normal', 'zor']) {
    const res = { DE: 0, TR: 0, draw: 0 };
    let vpSum = 0, istFall = 0, fallTurn = 0, lostTR = 0, lostDE = 0, scoreSum = 0;
    const ranks = {};
    const t0 = Date.now();
    for (let i = 0; i < n; i++) {
      const st = await playGame(1000 + i, diff);
      assert.ok(st.result, 'sonuç yok');
      res[st.result.winner]++;
      vpSum += st.result.vp;
      scoreSum += st.result.score.total;
      ranks[st.result.score.rank] = (ranks[st.result.score.rank] || 0) + 1;
      if (st.owner[R.cityHex('İstanbul')] === 'DE') { istFall++; fallTurn += st.turn; }
      lostTR += st.stats.lost.TR; lostDE += st.stats.lost.DE;
    }
    console.log(
      `${diff.padEnd(6)} n=${n}  Mihver:${res.DE} Türk:${res.TR} Berabere:${res.draw}  ` +
      `ort. Mihver ZP=${(vpSum / n).toFixed(1)}  İstanbul düştü=${istFall}` +
      (istFall ? ` (ort. tur ${(fallTurn / istFall).toFixed(1)})` : '') +
      `  kayıp TR/DE=${(lostTR / n).toFixed(1)}/${(lostDE / n).toFixed(1)}  skor=${(scoreSum / n).toFixed(0)} ${JSON.stringify(ranks)}` +
      `  ${((Date.now() - t0) / n).toFixed(0)} ms/oyun`
    );
  }
}

// 16. turdan sonra devam: uzatma, takviye, savaşı bitirme
async function extensionTest() {
  const st = await playGame(77, 'kolay');
  assert.strictEqual(st.phase, 'over');
  assert.ok(st.result.score && st.result.score.total >= 0, 'skor yok');
  if (!R.canContinue(st)) { console.log('Uzatma testi: İstanbul düştü, atlandı'); return; }
  const unitsBefore = st.units.length;
  assert.ok(R.continueWar(st));
  assert.strictEqual(st.turn, 17);
  assert.ok(st.extended && st.result16 && !st.result);
  for (let k = 0; k < 6 && st.phase !== 'over'; k++) {
    await O.AI.runGermanPhase(st, {});
    if (st.phase === 'over') break;
    R.endGermanPhase(st);
    passiveTurkish(st);
    if (k < 5) R.endTurkishPhase(st);
  }
  if (st.phase === 'TR') {
    assert.ok(R.endWar(st));
    assert.strictEqual(st.phase, 'over');
  }
  assert.ok(st.result && st.result.score, 'uzatma sonucu yok');
  assert.ok(!R.canContinue(st), 'ikinci kez uzatılmamalı');
  assert.ok(st.log.some((l) => /Tümen.*ulaştı|takviyesi/.test(l.text) && l.turn > 16), 'uzatma takviyesi gelmedi');
  console.log(`Uzatma testi: TAMAM (tur ${st.turn}, birlik ${unitsBefore}→${st.units.length}, skor ${st.result16.score.total}→${st.result.score.total})`);
}

(async () => {
  structuralTests();
  await extensionTest();
  const n = Number(process.argv[2] || 10);
  if (n > 0) await balance(n);
})().catch((e) => { console.error(e); process.exit(1); });
