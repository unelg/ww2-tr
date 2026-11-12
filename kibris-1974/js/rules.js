// Kıbrıs 1974 — oyun kuralları. Arayüzden bağımsızdır (Node'da da çalışır).
var Oyun = globalThis.Oyun = globalThis.Oyun || {};
(function (O) {
  'use strict';
  const R = {};
  O.Rules = R;

  R.MAX_TURNS = 10;
  R.STAGE1_END = 5;
  R.MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  // state.weather burada gündüz/gece bilgisini taşır
  R.WEATHER = {
    gunduz: { label: 'Gündüz', icon: '☀', note: 'Türk hava ve donanma desteği var. Türk hava üstünlüğü nedeniyle Rum birliklerinin hareketi −1.' },
    gece: { label: 'Gece', icon: '☾', note: 'Hava desteği yok, tüm birliklerin hareketi −1. Rum karşı taarruzları gece daha olasıdır.' },
  };
  R.DIFFICULTY = {
    kolay: { label: 'Kolay', grAtk: 0.85, grRep: 1, trAir: 1 },
    normal: { label: 'Normal', grAtk: 1, grRep: 1, trAir: 0 },
    zor: { label: 'Zor', grAtk: 1.15, grRep: 2, trAir: -1 },
  };
  R.TERRAIN_LABEL = { clear: 'Ova', forest: 'Ormanlık dağ', hills: 'Tepelik arazi / geçit', mountain: 'Sarp dağ', sea: 'Deniz', sba: 'İngiliz üs bölgesi' };
  R.SIDE_LABEL = { TR: 'Türk', GR: 'Rum/Yunan' };

  // --------------------------------------------------------------- yardımcılar
  function Heap() { this.a = []; }
  Heap.prototype.size = function () { return this.a.length; };
  Heap.prototype.push = function (k, v) {
    const a = this.a; a.push([k, v]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      const t = a[p]; a[p] = a[i]; a[i] = t; i = p;
    }
  };
  Heap.prototype.pop = function () {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        const t = a[m]; a[m] = a[i]; a[i] = t; i = m;
      }
    }
    return top;
  };
  R.Heap = Heap;

  // mulberry32 — durum içinde saklanan tohumlu rastgele sayı üreteci
  R.random = function (state) {
    let t = (state.rng = (state.rng + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  R.d6 = function (state) { return 1 + Math.floor(R.random(state) * 6); };

  R.hex = function (i) { return O.MAP.hexes[i]; };
  R.type = function (u) { return O.UNIT_TYPES[u.type]; };
  R.enemy = function (s) { return s === 'TR' ? 'GR' : 'TR'; };
  R.passable = function (h) { return h.terrain !== 'sea' && h.terrain !== 'sba'; };
  R.isRough = function (h) { return h.terrain === 'forest' || h.terrain === 'hills' || h.terrain === 'mountain'; };
  R.hexDist = function (a, b) {
    const A = O.MAP.hexes[a], B = O.MAP.hexes[b];
    return Math.max(Math.abs(A.q - B.q), Math.abs(A.r - B.r), Math.abs(A.s - B.s));
  };
  R.adjacent = function (a, b) { return O.MAP.hexes[a].nbrs.indexOf(b) >= 0; };
  R.cityHex = function (name) { const c = O.MAP.cityByName[name]; return c ? c.hex : -1; };
  R.alive = function (state, u) { return state.units.indexOf(u) >= 0; };

  R.turnInfo = function (t) { return O.TURNS[Math.max(0, Math.min(O.TURNS.length, t) - 1)]; };
  R.dateLabel = function (t) {
    const d = R.turnInfo(t);
    return d.day + ' ' + R.MONTHS[d.month] + ' 1974, ' + R.WEATHER[d.light].label.toLowerCase();
  };
  R.placeName = function (i) {
    const h = O.MAP.hexes[i];
    if (h.city) return h.city.name;
    if (h.near) return h.near + ' yakını';
    return R.TERRAIN_LABEL[h.terrain];
  };

  R.log = function (state, text, kind) {
    state.log.push({ turn: state.turn, phase: state.phase, text: text, kind: kind || 'info' });
    if (state.log.length > 600) state.log.splice(0, state.log.length - 600);
  };

  R.occupancy = function (state) {
    const occ = new Array(O.MAP.hexes.length).fill(null);
    for (const u of state.units) occ[u.hex] = u;
    return occ;
  };
  R.unitAt = function (state, hex) {
    for (const u of state.units) if (u.hex === hex) return u;
    return null;
  };
  R.unitById = function (state, id) {
    for (const u of state.units) if (u.id === id) return u;
    return null;
  };
  // side tarafının birliklerinin kontrol bölgesi (komşu kara altıgenleri)
  R.zoc = function (state, side) {
    const z = new Uint8Array(O.MAP.hexes.length);
    for (const u of state.units) {
      if (u.side !== side) continue;
      for (const nb of O.MAP.hexes[u.hex].nbrs) if (R.passable(O.MAP.hexes[nb])) z[nb] = 1;
    }
    return z;
  };
  R.hasAdjacentEnemy = function (state, u) {
    for (const nb of O.MAP.hexes[u.hex].nbrs) {
      const o = R.unitAt(state, nb);
      if (o && o.side !== u.side) return true;
    }
    return false;
  };

  // ------------------------------------------------------------------ kontrol
  R.setOwner = function (state, i, side) {
    const h = O.MAP.hexes[i];
    if (!R.passable(h) || state.owner[i] === side) return;
    state.owner[i] = side;
    state.ownerVer++;
    if (h.city && !state.quiet) {
      if (side === 'GR') R.log(state, h.city.name + (h.city.side === 'TR' ? ' Rum kuvvetlerinin eline geçti!' : ' Rum kuvvetlerince geri alındı.'), 'bad');
      else R.log(state, h.city.name + (h.city.side === 'TR' ? ' Türk kuvvetlerince geri alındı!' : ' Türk kuvvetlerince alındı!'), 'good');
    }
  };

  // ------------------------------------------------------------------- hareket
  R.unitMP = function (state, u) {
    const T = R.type(u);
    if (T.static) return 0;
    let mp = T.mp;
    if (state.weather === 'gece') mp -= 1;
    else if (u.side === 'GR') mp -= 1; // gündüz Türk hava üstünlüğü
    if (!u.inSupply) mp -= 1;
    return Math.max(1, mp);
  };
  R.moveCost = function (state, u, from, to) {
    const T = R.type(u);
    let c = 1;
    if (to.terrain === 'mountain') c = T.mountain ? 2 : 3;
    else if (R.isRough(to)) c = T.mountain ? 1 : 2;
    if (T.motor && R.isRough(to)) c += 1;
    return c;
  };

  // Birliğin bu hamlede gidebileceği altıgenler (Dijkstra). Düşman kontrol bölgesine giren durur.
  R.reachable = function (state, u) {
    const map = O.MAP, n = map.hexes.length;
    const cost = new Float64Array(n).fill(Infinity);
    const prev = new Int32Array(n).fill(-1);
    const dests = new Set();
    const res = { start: u.hex, cost: cost, prev: prev, dests: dests };
    if (u.mpLeft <= 0 || u.attacked || u.acted || R.type(u).static) return res;
    const occ = R.occupancy(state);
    const ezoc = R.zoc(state, R.enemy(u.side));
    const fresh = !u.moved;
    const done = new Uint8Array(n);
    const heap = new Heap();
    cost[u.hex] = 0;
    heap.push(0, u.hex);
    while (heap.size()) {
      const top = heap.pop(), d = top[0], cur = top[1];
      if (done[cur]) continue;
      done[cur] = 1;
      if (cur !== u.hex && ezoc[cur]) continue;
      const from = map.hexes[cur];
      for (const nb of from.nbrs) {
        const h = map.hexes[nb];
        if (!R.passable(h)) continue;
        const o = occ[nb];
        if (o && o.side !== u.side) continue;
        let nd = d + R.moveCost(state, u, from, h);
        if (nd > u.mpLeft) {
          // Hiç hareket etmemiş birlik her zaman en az bir altıgen ilerleyebilir.
          if (cur === u.hex && fresh && !o) nd = u.mpLeft; else continue;
        }
        if (nd < cost[nb]) { cost[nb] = nd; prev[nb] = cur; heap.push(nd, nb); }
      }
    }
    for (let i = 0; i < n; i++) if (i !== u.hex && cost[i] < Infinity && !occ[i]) dests.add(i);
    return res;
  };
  R.path = function (reach, dest) {
    const p = [];
    let c = dest;
    while (c !== -1 && c !== reach.start) { p.push(c); c = reach.prev[c]; }
    p.push(reach.start);
    return p.reverse();
  };
  R.moveUnit = function (state, u, dest, reach) {
    reach = reach || R.reachable(state, u);
    if (!reach.dests.has(dest)) return null;
    const path = R.path(reach, dest);
    const ezoc = R.zoc(state, R.enemy(u.side));
    u.mpLeft = Math.max(0, u.mpLeft - reach.cost[dest]);
    if (ezoc[dest]) u.mpLeft = 0;
    u.moved = true;
    u.entrench = 0;
    u.hex = dest;
    for (let k = 1; k < path.length; k++) R.setOwner(state, path[k], u.side);
    return { path: path };
  };

  // ------------------------------------------------------------------ muharebe
  R.terrainDefMult = function (h) {
    let m = 1;
    const mods = [];
    if (h.terrain === 'mountain') { m *= 1.6; mods.push('Sarp dağ ×1,6'); }
    if (h.terrain === 'forest') { m *= 1.4; mods.push('Ormanlık dağ ×1,4'); }
    if (h.terrain === 'hills') { m *= 1.3; mods.push('Tepelik/geçit ×1,3'); }
    if (h.city && !h.city.airport) {
      const cm = h.city.major ? 1.5 : 1.3;
      m *= cm; mods.push((h.city.major ? 'Büyük şehir' : 'Şehir') + ' ×' + String(cm).replace('.', ','));
    }
    if (h.river) { m *= 1.2; mods.push('Nehir ×1,2'); }
    if (h.fort === 2) { m *= 2; mods.push((h.fortLine || 'Tahkimat') + ' ×2'); }
    else if (h.fort === 1) { m *= 1.5; mods.push((h.fortLine || 'Tahkimat') + ' ×1,5'); }
    return { m: m, mods: mods };
  };
  R.ENTRENCH = [1, 1.15, 1.3];

  R.defenseStrength = function (state, u) {
    const T = R.type(u), h = O.MAP.hexes[u.hex];
    const mods = [];
    let v = (T.def * u.steps) / T.steps;
    mods.push('Temel ' + T.def + ' × ' + u.steps + '/' + T.steps + ' kademe');
    const tm = R.terrainDefMult(h);
    v *= tm.m;
    Array.prototype.push.apply(mods, tm.mods);
    if (u.entrench) { v *= R.ENTRENCH[u.entrench]; mods.push('Mevzi ' + u.entrench + ' ×' + String(R.ENTRENCH[u.entrench]).replace('.', ',')); }
    if (!u.inSupply) { v *= 0.75; mods.push('İkmalsiz ×0,75'); }
    if (u.disrupted) { v *= 0.7; mods.push('Sarsılmış ×0,7'); }
    return { value: v, mods: mods };
  };
  R.attackStrength = function (state, u, defHex) {
    const T = R.type(u), h = O.MAP.hexes[defHex];
    const mods = [];
    let v = (T.atk * u.steps) / T.steps;
    if (T.armor && (R.isRough(h) || h.city)) { v *= 0.6; mods.push('Zırh engebe/şehirde ×0,6'); }
    if (!u.inSupply) { v *= 0.5; mods.push('İkmalsiz ×0,5'); }
    if (u.disrupted) { v *= 0.7; mods.push('Sarsılmış ×0,7'); }
    if (u.side === 'TR' && state.weather === 'gunduz' && h.coastal) { v *= 1.25; mods.push('Donanma ateş desteği ×1,25'); }
    if (u.side === 'GR') {
      const dm = R.DIFFICULTY[state.difficulty].grAtk;
      if (dm !== 1) { v *= dm; mods.push('Zorluk ×' + String(dm).replace('.', ',')); }
    }
    return { value: v, mods: mods };
  };

  R.ODDS_T = [0.5, 1, 1.5, 2, 3, 4, 5];
  R.ODDS_LABEL = ['<1:2', '1:2', '1:1', '1,5:1', '2:1', '3:1', '4:1', '5:1'];
  R.oddsCol = function (ratio) {
    let c = 0;
    for (const t of R.ODDS_T) if (ratio >= t - 1e-9) c++;
    return c;
  };
  // Sonuç tablosu: satır = oran sütunu, sütun = zar (1..6)
  R.CRT = [
    ['A2', 'A2', 'A1', 'A1', 'A1', '-'],
    ['A2', 'A1', 'A1', '-', '-', 'EX'],
    ['A1', 'A1', '-', 'EX', 'EX', 'DR'],
    ['A1', '-', 'EX', 'EX', 'DR', 'D1'],
    ['A1', 'EX', 'EX', 'DR', 'D1', 'D1R'],
    ['EX', 'EX', 'DR', 'D1', 'D1R', 'D1R'],
    ['EX', 'DR', 'D1', 'D1R', 'D1R', 'D2R'],
    ['DR', 'D1', 'D1R', 'D1R', 'D2R', 'D2R'],
  ];
  R.RESULTS = {
    A2: { a: 2, d: 0, r: false, text: 'Saldıran 2 kademe kaybetti' },
    A1: { a: 1, d: 0, r: false, text: 'Saldıran 1 kademe kaybetti' },
    '-': { a: 0, d: 0, r: false, text: 'Sonuçsuz çatışma' },
    EX: { a: 1, d: 1, r: false, text: 'Karşılıklı kayıp' },
    DR: { a: 0, d: 0, r: true, text: 'Savunan geri çekildi' },
    D1: { a: 0, d: 1, r: false, text: 'Savunan 1 kademe kaybetti' },
    D1R: { a: 0, d: 1, r: true, text: 'Savunan 1 kademe kaybetti ve geri çekildi' },
    D2R: { a: 0, d: 2, r: true, text: 'Savunan 2 kademe kaybetti ve geri çekildi' },
  };

  R.canAttack = function (state, u) {
    return u.side === state.phase && !u.attacked && !u.acted && R.type(u).atk > 0;
  };
  R.attackOdds = function (state, attackers, defHex) {
    const def = R.unitAt(state, defHex);
    let A = 0;
    const att = attackers.map(function (u) {
      const s = R.attackStrength(state, u, defHex);
      A += s.value;
      return { unit: u, value: s.value, mods: s.mods };
    });
    const D = def ? R.defenseStrength(state, def) : { value: 1, mods: [] };
    const ratio = D.value > 0 ? A / D.value : 99;
    const col = R.oddsCol(ratio);
    return { A: A, D: D.value, defMods: D.mods, att: att, ratio: ratio, col: col, label: R.ODDS_LABEL[col], defender: def };
  };

  R.stepLoss = function (state, u, n, why) {
    const lost = Math.min(n, u.steps);
    u.steps -= lost;
    state.stats.lost[u.side] += lost;
    if (u.steps <= 0) {
      const k = state.units.indexOf(u);
      if (k >= 0) state.units.splice(k, 1);
      state.stats.destroyed[u.side]++;
      R.log(state, u.name + ' imha edildi' + (why ? ' (' + why + ')' : '') + '.', u.side === 'TR' ? 'bad' : 'good');
      return true;
    }
    return false;
  };

  // Geri çekilme yeri seç: boş, düşman kontrol bölgesi dışında, saldıranlardan uzak
  R.findRetreat = function (state, u, attackerHexes) {
    const occ = R.occupancy(state);
    const ez = R.zoc(state, R.enemy(u.side));
    let best = -1, bestScore = Infinity;
    for (const nb of O.MAP.hexes[u.hex].nbrs) {
      const h = O.MAP.hexes[nb];
      if (!R.passable(h) || occ[nb]) continue;
      let s = 0;
      if (ez[nb]) s += 10;
      if (state.owner[nb] !== u.side) s += 3;
      let dsum = 0;
      for (const ah of attackerHexes) dsum += R.hexDist(nb, ah);
      s -= (2 * dsum) / Math.max(1, attackerHexes.length);
      if (h.fort) s -= 1;
      if (R.isRough(h) || h.city) s -= 0.5;
      if (s < bestScore) { bestScore = s; best = nb; }
    }
    return best < 0 ? null : { hex: best, throughZoc: !!ez[best] };
  };

  R.resolveAttack = function (state, attackers, defHex, forcedDie) {
    const odds = R.attackOdds(state, attackers, defHex);
    const def = odds.defender;
    if (!def || !attackers.length) return null;
    const die = forcedDie || R.d6(state);
    const code = R.CRT[odds.col][die - 1];
    const res = R.RESULTS[code];
    const out = {
      odds: odds, die: die, code: code, text: res.text, side: attackers[0].side,
      attackerNames: attackers.map(function (u) { return u.name; }), defenderName: def.name,
      defHex: defHex, attLost: 0, defLost: 0, destroyed: false, retreatedTo: -1, vacated: false,
      survivors: [],
    };
    const attackerHexes = attackers.map(function (u) { return u.hex; });
    for (const u of attackers) { u.attacked = true; u.mpLeft = 0; }

    for (let k = 0; k < res.a; k++) {
      const living = attackers.filter(function (u) { return R.alive(state, u); });
      if (!living.length) break;
      living.sort(function (a, b) { return b.steps - a.steps || R.type(b).atk - R.type(a).atk; });
      R.stepLoss(state, living[0], 1, 'saldırı kaybı');
      out.attLost++;
    }
    if (res.d) {
      out.defLost = Math.min(res.d, def.steps);
      out.destroyed = R.stepLoss(state, def, res.d);
    }
    let extra = '';
    if (!out.destroyed && res.r) {
      const rt = R.findRetreat(state, def, attackerHexes);
      if (!rt) {
        extra = ' Çekilecek yer yok: +1 kademe kayıp.';
        out.defLost++;
        out.destroyed = R.stepLoss(state, def, 1, 'kuşatıldı');
      } else {
        def.hex = rt.hex;
        def.entrench = 0;
        out.retreatedTo = rt.hex;
        R.setOwner(state, rt.hex, def.side);
        if (rt.throughZoc) {
          extra = ' Düşman ateşi altında çekildi: +1 kademe kayıp.';
          out.defLost++;
          out.destroyed = R.stepLoss(state, def, 1, 'çekilirken');
        }
      }
    }
    out.vacated = !R.unitAt(state, defHex);
    out.survivors = attackers.filter(function (u) { return R.alive(state, u); });
    const who = out.attackerNames.join(' + ');
    out.summary = who + ' → ' + def.name + ' (' + R.placeName(defHex) + '): oran ' + odds.label + ', zar ' + die + '. ' + res.text + '.' + extra;
    R.log(state, out.summary, out.side === 'TR' ? 'combat-tr' : 'combat-de');
    return out;
  };

  // Muharebe sonrası boşalan altıgene ilerleme
  R.advance = function (state, u, hex) {
    if (!R.alive(state, u) || R.unitAt(state, hex) || !R.adjacent(u.hex, hex)) return null;
    const path = [u.hex, hex];
    u.hex = hex;
    u.entrench = 0;
    u.moved = true;
    u.mpLeft = 0;
    R.setOwner(state, hex, u.side);
    return { path: path };
  };

  // ---------------------------------------------------------------- hava gücü
  // Türk hava kuvvetleri gündüz üstündür; Rum tarafının hava gücü yoktur.
  R.airFor = function (state, side) {
    if (side !== 'TR' || state.weather === 'gece') return 0;
    const base = state.stage === 2 ? 6 : 4;
    return Math.max(0, base + R.DIFFICULTY[state.difficulty].trAir);
  };
  R.airStrike = function (state, side, target) {
    if (state.air[side] <= 0 || !target || target.side === side) return null;
    state.air[side]--;
    const h = O.MAP.hexes[target.hex];
    let mod = 0;
    if (h.terrain === 'clear' && !h.city && !h.fort) mod += 1;
    if (h.fort || h.terrain === 'forest' || h.terrain === 'mountain') mod -= 1;
    const die = R.d6(state);
    const v = die + mod;
    const out = { side: side, die: die, mod: mod, hex: target.hex, targetName: target.name, outcome: 'miss', destroyed: false };
    if (v >= 6) {
      out.outcome = 'loss';
      target.disrupted = true;
      target.entrench = Math.max(0, target.entrench - 1);
      out.destroyed = R.stepLoss(state, target, 1, 'hava saldırısı');
    } else if (v >= 4) {
      out.outcome = 'disrupt';
      target.disrupted = true;
      target.entrench = Math.max(0, target.entrench - 1);
    }
    const what = { miss: 'isabet sağlayamadı', disrupt: 'hedefi sarstı', loss: 'hedefe ağır kayıp verdirdi (1 kademe)' }[out.outcome];
    R.log(state, 'Türk Hava Kuvvetleri → ' + target.name + ' (' + R.placeName(target.hex) + '): zar ' + die + (mod ? (mod > 0 ? '+' : '') + mod : '') + ', ' + what + '.', 'air-tr');
    return out;
  };

  // ------------------------------------------------------------------ takviye
  R.repFor = function (state, side) {
    if (side === 'GR') return R.DIFFICULTY[state.difficulty].grRep;
    return state.stage === 2 ? 2 : 1;
  };
  R.canReplace = function (state, u) {
    const T = R.type(u);
    return u.side === state.phase && state.rep[u.side] > 0 && u.steps < T.steps && u.inSupply && !u.moved && !u.attacked && !u.acted;
  };
  R.replace = function (state, u) {
    if (!R.canReplace(state, u)) return false;
    state.rep[u.side]--;
    u.steps++;
    u.acted = true;
    u.mpLeft = 0;
    R.log(state, u.name + ' ikmal ve yedeklerle takviye edildi (+1 kademe).', u.side === 'TR' ? 'info' : 'info-de');
    return true;
  };

  // -------------------------------------------------------------------- ikmal
  // Türk ikmal kaynakları: çıkarma plajı, Türk elindeki limanlar ve Türk bölgeleri (hava ikmali / yerel stok).
  // Rum ikmal kaynakları: Rum elindeki şehirler.
  R.isSource = function (state, side, h) {
    if (state.owner[h.i] !== side) return false;
    if (side === 'TR') return h.beach || !!h.enclave || !!(h.city && h.city.port);
    return !!h.city;
  };
  // potential=true: sahipliği yok say (yapay zekânın "girersem ikmalde olur muyum" tahmini için)
  R.computeSupply = function (state, side, potential) {
    const map = O.MAP, n = map.hexes.length;
    const sup = new Uint8Array(n);
    const occ = R.occupancy(state);
    const ez = R.zoc(state, R.enemy(side));
    const ok = function (i) {
      const h = map.hexes[i];
      if (!R.passable(h) || (!potential && state.owner[i] !== side)) return false;
      const o = occ[i];
      if (o && o.side !== side) return false;
      if (ez[i] && !(o && o.side === side)) return false;
      return true;
    };
    const q = [];
    for (let i = 0; i < n; i++) {
      const h = map.hexes[i];
      if (R.passable(h) && R.isSource(state, side, h) && ok(i)) { sup[i] = 1; q.push(i); }
    }
    while (q.length) {
      const cur = q.pop();
      for (const nb of map.hexes[cur].nbrs) if (!sup[nb] && ok(nb)) { sup[nb] = 1; q.push(nb); }
    }
    return sup;
  };

  // ------------------------------------------------------------ yerleştirme
  R.makeUnit = function (state, d) {
    const T = O.UNIT_TYPES[d.type];
    return {
      id: state.nextId++, type: d.type, name: d.name, side: T.side, nat: T.nat,
      hex: -1, steps: T.steps, mpLeft: 0, moved: false, attacked: false, acted: false,
      entrench: 0, disrupted: false, inSupply: true, oos: 0,
    };
  };
  R.nearestHex = function (state, lat, lon, pred) {
    const k = O.Geo.toKm(lat, lon);
    const occ = R.occupancy(state);
    let best = -1, bd = Infinity;
    for (const h of O.MAP.hexes) {
      if (!R.passable(h) || occ[h.i] || !pred(h)) continue;
      const d = Math.hypot(h.x - k.x, h.y - k.y);
      if (d < bd) { bd = d; best = h.i; }
    }
    return best;
  };
  R.beachHexes = function () { return O.MAP.hexes.filter(function (h) { return h.beach; }).map(function (h) { return h.i; }); };
  R.SMALL_ENCLAVES = ['Lefke', 'Erenköy', 'Mağusa'];
  R.inDropZone = function (i) {
    const h = O.MAP.hexes[i];
    if (h.enclave === 'Lefkoşa') return true;
    return h.nbrs.some(function (nb) { return O.MAP.hexes[nb].enclave === 'Lefkoşa'; });
  };
  // Bir hexin etrafında (en çok dist adım) ilk uygun boş altıgen
  function freeNear(state, center, dist, pred) {
    const occ = R.occupancy(state);
    let best = -1, bd = Infinity;
    for (const h of O.MAP.hexes) {
      if (!R.passable(h) || occ[h.i] || !pred(h)) continue;
      const d = R.hexDist(center, h.i);
      if (d <= dist && d < bd) { bd = d; best = h.i; }
    }
    return best;
  }
  R.spawnHex = function (state, side, d) {
    const occ = R.occupancy(state);
    if (side === 'GR') {
      const notTr = function (h) { return state.owner[h.i] === 'GR'; };
      if (d.at) {
        const ch = R.cityHex(d.at);
        if (ch < 0 || state.owner[ch] !== 'GR') return -2; // hedef yer düştü: takviye iptal
        return freeNear(state, ch, 2, notTr);
      }
      return R.nearestHex(state, d.lat, d.lon, notTr);
    }
    const mine = function (h) { return state.owner[h.i] === 'TR'; };
    if (d.at === 'beach') {
      for (const b of R.beachHexes()) if (state.owner[b] === 'TR' && !occ[b]) return b;
      for (const b of R.beachHexes()) {
        if (state.owner[b] !== 'TR') continue;
        const x = freeNear(state, b, 2, mine);
        if (x >= 0) return x;
      }
      const g = R.cityHex('Girne');
      if (state.owner[g] === 'TR') return freeNear(state, g, 1, mine);
      return -1;
    }
    if (d.at === 'any') {
      const sup = R.computeSupply(state, 'TR');
      const anchor = R.cityHex('Lefkoşa Türk kesimi');
      return freeNear(state, anchor, 30, function (h) {
        return mine(h) && sup[h.i] && R.SMALL_ENCLAVES.indexOf(h.enclave) < 0;
      });
    }
    const ch = R.cityHex(d.at);
    if (ch >= 0 && state.owner[ch] === 'TR') return freeNear(state, ch, 2, mine);
    return -1;
  };
  R.spawnReinforcements = function (state, side) {
    const list = (side === 'TR' ? O.TR_REINF : O.GR_REINF).filter(function (r) {
      return r.turn === state.turn && (!r.diff || r.diff.indexOf(state.difficulty) >= 0) && !state.spawned[side + ':' + r.name];
    }).concat(state.delayed[side]);
    state.delayed[side] = [];
    for (const d of list) {
      const hx = R.spawnHex(state, side, d);
      if (hx === -2) {
        state.spawned[side + ':' + d.name] = true;
        R.log(state, d.name + ' gelemedi: indirileceği yer artık Türk kontrolünde.', 'good');
        continue;
      }
      if (hx < 0) {
        state.delayed[side].push(d);
        R.log(state, d.name + ' gecikti: ' + (side === 'TR' && d.at === 'beach' ? 'plaj çevresinde boş yer yok ya da plaj Rum kontrolünde.' : 'indirilecek uygun yer yok.'), 'info');
        continue;
      }
      state.spawned[side + ':' + d.name] = true;
      const u = R.makeUnit(state, d);
      u.hex = hx;
      u.inSupply = true;
      state.units.push(u);
      R.setOwner(state, hx, side);
      R.log(state, side === 'TR'
        ? 'Takviye: ' + u.name + ' ' + R.placeName(hx) + ' bölgesine ulaştı.'
        : 'Rum takviyesi: ' + u.name + ' cepheye geldi.', side === 'TR' ? 'good' : 'info-de');
    }
  };

  // ------------------------------------------------------------- tur akışı
  R.newGame = function (opts) {
    opts = opts || {};
    const seed = (opts.seed != null ? opts.seed : (Date.now() ^ Math.floor(Math.random() * 1e9))) | 0;
    const state = {
      version: 1, game: O.GAME_ID, gameVersion: O.VERSION, seed: seed, rng: seed, turn: 1,
      maxTurns: R.MAX_TURNS, stage: 1, phase: 'deploy', difficulty: opts.difficulty || 'normal', weather: 'gunduz',
      units: [], owner: [], ownerVer: 0, air: { TR: 0, GR: 0 }, rep: { TR: 0, GR: 0 }, log: [], result: null,
      nextId: 1, delayed: { TR: [], GR: [] }, spawned: {}, stats: { lost: { TR: 0, GR: 0 }, destroyed: { TR: 0, GR: 0 } },
      deployHome: {}, stage1: null,
    };
    for (const h of O.MAP.hexes) state.owner.push(R.passable(h) ? (h.enclave ? 'TR' : 'GR') : null);

    const beach = R.beachHexes();
    for (const d of O.TR_START) {
      const u = R.makeUnit(state, d);
      const T = R.type(u);
      let hx = -1;
      if (d.at === 'beach') hx = freeNear(state, beach[0], 1, function (h) { return h.beach; });
      else if (d.at) hx = R.cityHex(d.at);
      else if (T.drop) hx = R.nearestHex(state, d.lat, d.lon, function (h) { return R.inDropZone(h.i); });
      else if (T.militia) hx = R.nearestHex(state, d.lat, d.lon, function (h) { return h.enclave === 'Lefkoşa'; });
      else hx = R.nearestHex(state, d.lat, d.lon, function (h) { return h.coastal && R.hexDist(h.i, beach[0]) <= 1; });
      u.hex = hx;
      state.units.push(u);
      state.deployHome[u.id] = hx;
    }
    for (const d of O.GR_START) {
      const u = R.makeUnit(state, d);
      let hx = d.at ? R.cityHex(d.at) : -1;
      if (hx < 0 || R.unitAt(state, hx)) {
        const c = d.at ? O.MAP.hexes[hx] : null;
        hx = R.nearestHex(state, c ? c.lat : d.lat, c ? c.lon : d.lon, function (h) {
          return !h.enclave && !h.beach && !R.inDropZone(h.i);
        });
      }
      u.hex = hx;
      u.entrench = 1;
      state.units.push(u);
    }
    R.log(state, 'Konuşlanma: paraşüt taburlarının iniş noktalarını seçin. Çıkarma birlikleri Pentemili\'de.', 'phase');
    return state;
  };

  // Konuşlanmada bir birlik nereye konabilir?
  R.canDeployTo = function (state, u, hex) {
    const h = O.MAP.hexes[hex];
    const T = R.type(u);
    if (state.phase !== 'deploy' || u.side !== 'TR' || T.static || !R.passable(h) || R.unitAt(state, hex)) return false;
    if (state.stage === 1) {
      if (T.drop) return R.inDropZone(hex);
      if (T.militia) return h.enclave === 'Lefkoşa';
      return h.beach || (h.coastal && R.beachHexes().some(function (b) { return R.hexDist(b, hex) <= 1; }));
    }
    if (state.owner[hex] !== 'TR' || R.SMALL_ENCLAVES.indexOf(h.enclave) >= 0) return false;
    if (!state._deploySup || state._deploySupVer !== state.ownerVer) {
      state._deploySup = Array.from(R.computeSupply(state, 'TR'));
      state._deploySupVer = state.ownerVer;
    }
    return !!state._deploySup[hex];
  };
  R.deployMove = function (state, u, hex) {
    if (!R.canDeployTo(state, u, hex)) return false;
    u.hex = hex;
    return true;
  };
  R.resetDeploy = function (state) {
    if (state.phase !== 'deploy') return;
    const movable = state.units.filter(function (u) { return u.side === 'TR' && state.deployHome[u.id] != null; });
    for (const u of movable) u.hex = -1;
    for (const u of movable) {
      const home = state.deployHome[u.id];
      u.hex = !R.unitAt(state, home) ? home : freeNear(state, home, 3, function (h) { return R.canDeployTo(state, u, h.i); });
    }
  };
  R.finishDeploy = function (state) {
    if (state.phase !== 'deploy') return;
    delete state._deploySup;
    state.quiet = true;
    for (const u of state.units) if (u.side === 'TR') R.setOwner(state, u.hex, 'TR');
    state.quiet = false;
    if (state.stage === 1) {
      for (const u of state.units) {
        if (u.side === 'TR') u.entrench = R.type(u).militia ? 2 : 0;
      }
      R.startTurn(state, 1);
    } else {
      for (const u of state.units) u.entrench = u.side === 'TR' ? (R.type(u).static ? 2 : 1) : 2;
      R.startTurn(state, R.STAGE1_END + 1);
    }
  };

  R.beginPhase = function (state, side) {
    const sup = R.computeSupply(state, side);
    for (const u of state.units.slice()) {
      if (u.side !== side) continue;
      u.inSupply = !!sup[u.hex];
      if (!u.inSupply) {
        u.oos++;
        if (u.oos >= 3) {
          R.log(state, u.name + ' ikmalsiz kaldı ve eriyor (−1 kademe).', side === 'TR' ? 'bad' : 'good');
          if (R.stepLoss(state, u, 1, 'ikmalsizlik')) continue;
        }
      } else {
        u.oos = 0;
      }
      u.moved = false; u.attacked = false; u.acted = false;
      u.mpLeft = R.unitMP(state, u);
    }
    state.air[side] = R.airFor(state, side);
    state.rep[side] = R.repFor(state, side);
  };
  R.endPhase = function (state, side) {
    for (const u of state.units) {
      if (u.side !== side) continue;
      if (!u.moved && !u.attacked && !R.type(u).static) u.entrench = Math.min(2, u.entrench + 1);
      if (R.type(u).static && u.entrench < 2) u.entrench++;
      u.disrupted = false;
    }
  };
  // Önce Türk hamlesi (saldıran), sonra Rum hamlesi
  R.startTurn = function (state, t) {
    const info = R.turnInfo(t);
    state.turn = t;
    state.stage = info.stage;
    state.weather = info.light;
    state.phase = 'TR';
    R.log(state, t + '. Tur · ' + R.dateLabel(t), 'turn');
    R.spawnReinforcements(state, 'TR');
    R.beginPhase(state, 'TR');
    R.log(state, 'Türk hamlesi: ' + state.air.TR + ' hava saldırısı, ' + state.rep.TR + ' takviye hakkı.', 'phase');
  };
  R.endTurkishPhase = function (state) {
    if (state.phase !== 'TR') return;
    R.endPhase(state, 'TR');
    state.phase = 'GR';
    R.spawnReinforcements(state, 'GR');
    R.beginPhase(state, 'GR');
  };
  R.endEnemyPhase = function (state) {
    if (state.phase !== 'GR') return;
    R.endPhase(state, 'GR');
    if (!state.units.some(function (u) { return u.side === 'TR'; })) { R.finish(state); return; }
    if (state.turn === R.STAGE1_END) {
      state.phase = 'interlude';
      state.stage1 = R.evaluateStage1(state);
      R.log(state, '22 Temmuz 16.00: ateşkes. ' + state.stage1.title, 'phase');
      return;
    }
    if (state.turn >= state.maxTurns) { R.finish(state); return; }
    R.startTurn(state, state.turn + 1);
  };
  // Ateşkes arası: ikinci harekât kuvvetleri gelir, oyuncu birliklerini yeniden dizer
  R.beginStage2 = function (state) {
    if (state.phase !== 'interlude') return;
    state.phase = 'deploy';
    state.stage = 2;
    state.turn = R.STAGE1_END + 1;
    state.weather = 'gunduz';
    R.log(state, 'Ateşkes dönemi: ikinci harekât için kuvvet toplanıyor. Birliklerinizi Türk kontrolündeki bölgede yeniden dizin.', 'phase');
    R.spawnReinforcements(state, 'TR');
    R.spawnReinforcements(state, 'GR');
    // Rum tarafı da yeniden toplanır: ateşkeste her birlik 1 kademe toparlanır
    for (const u of state.units) {
      if (u.side === 'GR' && u.steps < R.type(u).steps) u.steps++;
      if (u.side === 'TR' && u.steps < R.type(u).steps) u.steps++;
    }
    state.deployHome = {};
    for (const u of state.units) if (u.side === 'TR' && !R.type(u).static) state.deployHome[u.id] = u.hex;
  };
  R.finish = function (state) {
    state.phase = 'over';
    state.result = R.evaluate(state);
    R.log(state, '16 Ağustos 18.00: ateşkes. ' + state.result.title + ' · Skor ' + state.result.score.total, 'phase');
  };

  // ------------------------------------------------------------------- hedefler
  // Girne/plaj ile Lefkoşa Türk kesimi arasında Türk kontrolünde, Rum birliği bulunmayan kara yolu var mı?
  R.corridorOpen = function (state) {
    const map = O.MAP;
    const occ = R.occupancy(state);
    const ok = function (i) {
      const o = occ[i];
      return R.passable(map.hexes[i]) && state.owner[i] === 'TR' && !(o && o.side === 'GR');
    };
    const starts = R.beachHexes().concat([R.cityHex('Girne')]).filter(ok);
    const seen = new Uint8Array(map.hexes.length);
    const q = starts.slice();
    for (const s of starts) seen[s] = 1;
    while (q.length) {
      const c = q.pop();
      if (map.hexes[c].enclave === 'Lefkoşa') return true;
      for (const nb of map.hexes[c].nbrs) if (!seen[nb] && ok(nb)) { seen[nb] = 1; q.push(nb); }
    }
    return false;
  };
  R.objectives = function (state) {
    const list = [];
    for (const c of O.MAP.cities) {
      if (!c.vp) continue;
      list.push({ name: c.name, vp: c.vp, held: state.owner[c.hex] === 'TR', hold: !!c.hold, stage: c.stage || 1, hex: c.hex });
    }
    list.push({ name: 'Girne–Lefkoşa koridoru', vp: O.CORRIDOR_VP, held: R.corridorOpen(state), hold: false, stage: 1, corridor: true });
    list.sort(function (a, b) { return (a.stage - b.stage) || (b.vp - a.vp); });
    return list;
  };
  R.turkishVP = function (state) {
    return R.objectives(state).reduce(function (a, o) { return a + (o.held ? o.vp : 0); }, 0);
  };
  R.maxVP = function () {
    let v = O.CORRIDOR_VP;
    for (const c of O.MAP.cities) v += c.vp || 0;
    return v;
  };
  R.evaluateStage1 = function (state) {
    const girne = state.owner[R.cityHex('Girne')] === 'TR';
    const cor = R.corridorOpen(state);
    const tk = state.owner[R.cityHex('Lefkoşa Türk kesimi')] === 'TR';
    let title, text;
    if (girne && cor && tk) {
      title = 'Birinci harekât hedeflerine ulaşıldı';
      text = 'Köprübaşı Lefkoşa Türk kesimiyle birleşti ve Girne alındı. Tarihte de 22 Temmuz akşamı ulaşılan sonuç buydu.';
    } else if (cor || girne) {
      title = 'Birinci harekâtta kısmi başarı';
      const done = [], missing = [];
      (girne ? done : missing).push('Girne');
      (cor ? done : missing).push('Lefkoşa bağlantısı');
      if (!tk) missing.push('Lefkoşa Türk kesimi (kaybedildi)');
      text = 'Ulaşılan: ' + done.join(', ') + '. Eksik: ' + missing.join(', ') + '. İkinci harekâta zayıf bir köprübaşıyla giriyorsunuz.';
    } else {
      title = 'Köprübaşı sıkışık kaldı';
      text = 'Ne Girne alınabildi ne de Lefkoşa ile bağlantı kuruldu. Ateşkes köprübaşını kurtardı; ikinci harekât zor geçecek.';
    }
    return { title: title, text: text, girne: girne, corridor: cor, tk: tk, vp: R.turkishVP(state) };
  };
  R.VP_TIERS = [
    { min: 25, winner: 'TR', title: 'Harekât hedeflerine ulaşıldı', text: 'Ateşkes hattı tarihteki gibi Lefke\'den Lefkoşa üzerinden Mağusa\'ya uzanıyor. Kıbrıs Türk bölgeleri birleşti.' },
    { min: 18, winner: 'TR', title: 'Büyük ölçüde başarılı', text: 'Kuzeyin büyük bölümü alındı ama bazı hedefler ateşkese kadar ulaşılamadı.' },
    { min: 10, winner: 'draw', title: 'Kısmi başarı', text: 'Girne–Lefkoşa hattı tutuluyor, ancak Mesarya ve batı hedefleri büyük ölçüde Rum kuvvetlerinde kaldı.' },
    { min: -Infinity, winner: 'GR', title: 'Harekât başarısız', text: 'Rum ve Yunan kuvvetleri köprübaşını sınırlamayı başardı; harekât hedeflerinin çoğuna ulaşılamadı.' },
  ];
  R.HISTORY_NOTE = 'Tarihte: 20 Temmuz 1974\'te başlayan harekâtta köprübaşı 22 Temmuz\'da Lefkoşa ile birleşti ve Girne alındı; ' +
    '14–16 Ağustos\'taki ikinci harekâtla hat Lefke\'den Mağusa\'ya uzandı. Savaşta iki toplumdan binlerce kişi hayatını kaybetti ya da kayboldu, ' +
    'çok sayıda insan evini terk etmek zorunda kaldı. Kayıpların akıbeti bugün hâlâ araştırılıyor.';
  R.evaluate = function (state) {
    const vp = R.turkishVP(state);
    let res = null;
    for (const t of R.VP_TIERS) if (vp >= t.min) { res = { winner: t.winner, title: t.title, text: t.text, vp: vp }; break; }
    res.turn = state.turn;
    res.score = R.score(state);
    return res;
  };
  R.checkSuddenDeath = function () { /* bu senaryoda ani bitiş yok */ };

  // ------------------------------------------------------------------- skor
  R.SCORE_MULT = { kolay: 0.75, normal: 1, zor: 1.3 };
  R.RANKS = [
    { min: 1800, title: 'Mareşal' },
    { min: 1500, title: 'Orgeneral' },
    { min: 1250, title: 'Korgeneral' },
    { min: 1000, title: 'Tümgeneral' },
    { min: 750, title: 'Tuğgeneral' },
    { min: -Infinity, title: 'Albay' },
  ];
  R.score = function (state) {
    const vp = R.turkishVP(state);
    const early = state.stage1 && state.stage1.corridor && state.stage1.girne;
    const parts = [
      { label: 'Hedef puanı (' + vp + ' × 40)', value: vp * 40 },
      { label: early ? 'Birinci harekât hedefleri zamanında' : 'Birinci harekât hedefleri zamanında değil', value: early ? 150 : 0 },
      { label: 'Rum/Yunan kayıpları (' + state.stats.lost.GR + ' kademe × 12)', value: state.stats.lost.GR * 12 },
      { label: 'Türk kayıpları (' + state.stats.lost.TR + ' kademe × −10)', value: -state.stats.lost.TR * 10 },
    ];
    const base = parts.reduce(function (a, p) { return a + p.value; }, 0);
    const mult = R.SCORE_MULT[state.difficulty] || 1;
    const total = Math.max(0, Math.round(base * mult));
    let rank = R.RANKS[R.RANKS.length - 1].title;
    for (const r of R.RANKS) if (total >= r.min) { rank = r.title; break; }
    return { parts: parts, base: base, mult: mult, total: total, rank: rank };
  };
})(Oyun);
