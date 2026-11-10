// Çakmak Hattı 1943 — oyun kuralları. Arayüzden bağımsızdır (Node'da da çalışır).
var Oyun = globalThis.Oyun = globalThis.Oyun || {};
(function (O) {
  'use strict';
  const R = {};
  O.Rules = R;

  R.MAX_TURNS = 16;
  R.EXT_MAX_TURNS = 52; // uzatmada en fazla 1943 sonuna kadar
  R.MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  R.WEATHER = {
    acik: { label: 'Açık', icon: '☀', note: 'Normal hareket ve hava desteği.' },
    yagmur: { label: 'Yağmur ve çamur', icon: '☂', note: 'Hareket −1 (motorlu −2), hava desteği −1, motorlu saldırı ×0,8.' },
    kar: { label: 'Kar', icon: '❄', note: 'Hareket −1 (motorlu −2), engebede +1 maliyet, uçuş yok, saldırı ×0,8.' },
  };
  R.DIFFICULTY = {
    kolay: { label: 'Kolay', deAtk: 0.85, deAir: 0, deRep: 1 },
    normal: { label: 'Normal', deAtk: 1, deAir: 1, deRep: 1 },
    zor: { label: 'Zor', deAtk: 1.25, deAir: 2, deRep: 2 },
  };
  R.TERRAIN_LABEL = { clear: 'Açık arazi', forest: 'Ormanlık dağ', hills: 'Tepelik arazi', sea: 'Deniz', anadolu: 'Anadolu yakası' };
  R.COUNTRY_LABEL = { TR: 'Türkiye', BG: 'Bulgaristan', GR: 'Yunanistan (Alman işgali)' };
  R.SIDE_LABEL = { TR: 'Türk', DE: 'Mihver' };

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
  R.enemy = function (s) { return s === 'TR' ? 'DE' : 'TR'; };
  R.passable = function (h) { return h.terrain !== 'sea' && h.terrain !== 'anadolu'; };
  R.isRough = function (h) { return h.terrain === 'forest' || h.terrain === 'hills'; };
  R.hexDist = function (a, b) {
    const A = O.MAP.hexes[a], B = O.MAP.hexes[b];
    return Math.max(Math.abs(A.q - B.q), Math.abs(A.r - B.r), Math.abs(A.s - B.s));
  };
  R.adjacent = function (a, b) { return O.MAP.hexes[a].nbrs.indexOf(b) >= 0; };
  R.cityHex = function (name) { const c = O.MAP.cityByName[name]; return c ? c.hex : -1; };
  R.alive = function (state, u) { return state.units.indexOf(u) >= 0; };

  R.turnDate = function (t) { return new Date(Date.UTC(1943, 0, 4 + 7 * (t - 1))); };
  R.dateLabel = function (t) {
    const d = R.turnDate(t);
    return d.getUTCDate() + ' ' + R.MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
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
    if (h.city) {
      if (side === 'DE') {
        R.log(state, h.city.name + (h.country === 'TR' ? ' Mihver kuvvetlerinin eline geçti!' : ' Mihver tarafından geri alındı.'), 'bad');
      } else {
        R.log(state, h.city.name + (h.country === 'TR' ? ' Türk kuvvetlerince geri alındı!' : ' Türk kuvvetlerince ele geçirildi!'), 'good');
      }
    }
    R.checkSuddenDeath(state);
  };

  // ------------------------------------------------------------------- hareket
  R.unitMP = function (state, u) {
    const T = R.type(u);
    if (T.static) return 0;
    let mp = T.mp;
    if (state.weather === 'yagmur' || state.weather === 'kar') mp -= T.motor ? 2 : 1;
    if (!u.inSupply) mp -= 1;
    return Math.max(1, mp);
  };
  R.moveCost = function (state, u, from, to) {
    const T = R.type(u);
    let c = 1;
    if (R.isRough(to)) {
      c = T.mountain ? 1 : 2;
      if (T.motor) c += 1;
      if (state.weather === 'kar') c += 1;
    }
    if (to.river && !from.river) c += 1;
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
    if (h.terrain === 'forest') { m *= 1.4; mods.push('Ormanlık dağ ×1,4'); }
    if (h.terrain === 'hills') { m *= 1.4; mods.push('Tepelik ×1,4'); }
    if (h.city) {
      const cm = h.city.major ? 1.6 : 1.3;
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
    if (state.weather === 'kar') { v *= 0.8; mods.push('Kar ×0,8'); }
    else if (state.weather === 'yagmur' && T.motor) { v *= 0.8; mods.push('Çamur ×0,8'); }
    if (u.side === 'DE') {
      const dm = R.DIFFICULTY[state.difficulty].deAtk;
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
  R.airFor = function (state, side) {
    let n;
    if (side === 'DE') {
      n = 3 + R.DIFFICULTY[state.difficulty].deAir;
      if (state.turn >= 9) n -= 1; // Luftwaffe birlikleri Doğu Cephesi'ne çekiliyor
    } else {
      n = state.turn < 5 ? 1 : state.turn < 10 ? 2 : 3; // RAF desteği artıyor
    }
    if (state.weather === 'kar') return 0;
    if (state.weather === 'yagmur') n -= 1;
    return Math.max(0, n);
  };
  R.airStrike = function (state, side, target) {
    if (state.air[side] <= 0 || !target || target.side === side) return null;
    state.air[side]--;
    const h = O.MAP.hexes[target.hex];
    let mod = 0;
    if (h.terrain === 'clear' && !h.city && !h.fort) mod += 1;
    if (h.fort || h.terrain === 'forest') mod -= 1;
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
    const who = side === 'DE' ? 'Luftwaffe' : 'Türk/RAF uçakları';
    const what = { miss: 'isabet sağlayamadı', disrupt: 'hedefi sarstı', loss: 'hedefe ağır kayıp verdirdi (1 kademe)' }[out.outcome];
    R.log(state, who + ' → ' + target.name + ' (' + R.placeName(target.hex) + '): zar ' + die + (mod ? (mod > 0 ? '+' : '') + mod : '') + ', ' + what + '.', side === 'DE' ? 'air-de' : 'air-tr');
    return out;
  };

  // ------------------------------------------------------------------ takviye
  R.repFor = function (state, side) {
    if (side === 'DE') return R.DIFFICULTY[state.difficulty].deRep;
    return state.turn >= 6 ? 2 : 1;
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
      const src = side === 'TR' ? (h.city && h.city.port && h.country === 'TR') : (R.passable(h) && h.country !== 'TR');
      if (src && ok(i)) { sup[i] = 1; q.push(i); }
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
      id: state.nextId++, type: d.type, name: d.name, side: T.side, nat: T.nat, axis: d.axis || null,
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
  R.spawnHex = function (state, side, d) {
    if (side === 'DE') {
      return R.nearestHex(state, d.lat, d.lon, function (h) { return h.country !== 'TR' && state.owner[h.i] === 'DE'; });
    }
    const names = [d.at, 'İstanbul', 'Gelibolu', 'Eceabat', 'Tekirdağ'];
    const dez = R.zoc(state, 'DE');
    for (const name of names) {
      const ch = R.cityHex(name);
      if (ch < 0 || state.owner[ch] !== 'TR') continue;
      const c = O.MAP.hexes[ch];
      const ll = { lat: c.lat, lon: c.lon };
      const pick = function (avoidZoc) {
        return R.nearestHex(state, ll.lat, ll.lon, function (h) {
          return h.country === 'TR' && state.owner[h.i] === 'TR' && R.hexDist(h.i, ch) <= 3 && (!avoidZoc || !dez[h.i]);
        });
      };
      const hx = pick(true) >= 0 ? pick(true) : pick(false);
      if (hx >= 0) return hx;
    }
    return -1;
  };
  // Uzatma turlarında (16. turdan sonra) iki taraf da düzenli yedek alır
  R.extendedReinforcements = function (state, side) {
    const t = state.turn;
    if (!state.extended || t <= R.MAX_TURNS) return [];
    const out = [];
    if (side === 'TR') {
      if (t % 2 === 0) out.push({ type: 'tr_inf', name: (60 + t) + '. Tümen', at: (t % 4 === 0) ? 'Gelibolu' : 'İstanbul' });
      if (t % 6 === 0) out.push({ type: 'uk_arm', name: 'İngiliz ' + (t - 10) + '. Zırhlı Tugayı', at: 'Eceabat' });
    } else if (t % 3 === 0) {
      out.push({ type: 'de_inf', name: (300 + t) + '. Piyade Tümeni', lat: 42.05, lon: 26.9 + (t % 2) * 0.4, axis: t % 2 ? 'N' : 'S' });
    }
    return out;
  };
  R.spawnReinforcements = function (state, side) {
    const list = (side === 'TR' ? O.TR_REINF : O.DE_REINF).filter(function (r) {
      return r.turn === state.turn && (!r.diff || r.diff.indexOf(state.difficulty) >= 0);
    }).concat(R.extendedReinforcements(state, side), state.delayed[side]);
    state.delayed[side] = [];
    for (const d of list) {
      const hx = R.spawnHex(state, side, d);
      if (hx < 0) {
        state.delayed[side].push(d);
        R.log(state, d.name + ' gecikti: indirilecek uygun yer yok.', 'info');
        continue;
      }
      const u = R.makeUnit(state, d);
      u.hex = hx;
      u.inSupply = true;
      state.units.push(u);
      R.log(state, side === 'TR'
        ? 'Takviye: ' + u.name + ' ' + R.placeName(hx) + ' bölgesine ulaştı.'
        : 'Mihver takviyesi: ' + u.name + ' cepheye geldi.', side === 'TR' ? 'good' : 'info-de');
    }
  };

  // ------------------------------------------------------------- tur akışı
  R.newGame = function (opts) {
    opts = opts || {};
    const seed = (opts.seed != null ? opts.seed : (Date.now() ^ Math.floor(Math.random() * 1e9))) | 0;
    const state = {
      version: 1, gameVersion: O.VERSION, seed: seed, rng: seed, turn: 1, maxTurns: R.MAX_TURNS, phase: 'deploy',
      difficulty: opts.difficulty || 'normal', weather: 'acik', units: [], owner: [], ownerVer: 0,
      air: { TR: 0, DE: 0 }, rep: { TR: 0, DE: 0 }, log: [], result: null, nextId: 1,
      delayed: { TR: [], DE: [] }, stats: { lost: { TR: 0, DE: 0 }, destroyed: { TR: 0, DE: 0 } },
      deployHome: {},
    };
    for (const h of O.MAP.hexes) state.owner.push(R.passable(h) ? (h.country === 'TR' ? 'TR' : 'DE') : null);

    for (const d of O.TR_START) {
      const u = R.makeUnit(state, d);
      let hx = -1;
      if (d.at) {
        const ch = R.cityHex(d.at);
        if (ch >= 0 && !R.unitAt(state, ch)) hx = ch;
        else { const c = O.MAP.hexes[ch]; hx = R.nearestHex(state, c.lat, c.lon, function (h) { return h.country === 'TR'; }); }
      } else {
        hx = R.nearestHex(state, d.lat, d.lon, function (h) { return h.country === 'TR'; });
      }
      u.hex = hx;
      state.units.push(u);
      state.deployHome[u.id] = hx;
    }
    for (const d of O.DE_START) {
      const u = R.makeUnit(state, d);
      u.hex = R.nearestHex(state, d.lat, d.lon, function (h) { return h.country !== 'TR'; });
      state.units.push(u);
    }
    R.log(state, 'Konuşlanma: Çakmak Hattı tamamlandı. Birliklerinizi Türk Trakyası\'nda dilediğiniz gibi dizin.', 'phase');
    return state;
  };

  R.canDeployTo = function (state, u, hex) {
    const h = O.MAP.hexes[hex];
    return state.phase === 'deploy' && u.side === 'TR' && !R.type(u).static && R.passable(h) &&
      h.country === 'TR' && !R.unitAt(state, hex);
  };
  R.deployMove = function (state, u, hex) {
    if (!R.canDeployTo(state, u, hex)) return false;
    u.hex = hex;
    return true;
  };
  R.resetDeploy = function (state) {
    if (state.phase !== 'deploy') return;
    for (const u of state.units) if (u.side === 'TR') u.hex = -1;
    for (const u of state.units) {
      if (u.side !== 'TR') continue;
      const home = state.deployHome[u.id];
      u.hex = !R.unitAt(state, home) ? home : R.nearestHex(state, O.MAP.hexes[home].lat, O.MAP.hexes[home].lon, function (h) { return h.country === 'TR'; });
    }
  };
  R.finishDeploy = function (state) {
    if (state.phase !== 'deploy') return;
    for (const u of state.units) if (u.side === 'TR') u.entrench = 2; // aylardır hazırlanan mevziler
    R.startTurn(state, 1);
  };

  R.rollWeather = function (state) {
    if (state.turn === 1) return 'acik'; // baskın günü
    const m = R.turnDate(state.turn).getUTCMonth();
    // her ay için [açık, yağmur] olasılığı; kalanı kar
    const t = [
      [0.3, 0.3], [0.35, 0.35], [0.45, 0.45], [0.65, 0.35], [0.75, 0.25], [0.9, 0.1],
      [0.95, 0.05], [0.95, 0.05], [0.85, 0.15], [0.65, 0.35], [0.45, 0.4], [0.35, 0.35],
    ][m];
    const x = R.random(state);
    if (x < t[0]) return 'acik';
    if (x < t[0] + t[1]) return 'yagmur';
    return 'kar';
  };

  R.beginPhase = function (state, side) {
    const sup = R.computeSupply(state, side);
    for (const u of state.units.slice()) {
      if (u.side !== side) continue;
      u.inSupply = !!sup[u.hex];
      if (!u.inSupply) {
        u.oos++;
        if (u.oos >= 2) {
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
  R.startTurn = function (state, t) {
    state.turn = t;
    state.weather = R.rollWeather(state);
    state.phase = 'DE';
    R.log(state, t + '. Tur · ' + R.dateLabel(t) + ' · Hava: ' + R.WEATHER[state.weather].label, 'turn');
    R.spawnReinforcements(state, 'DE');
    R.beginPhase(state, 'DE');
  };
  R.endGermanPhase = function (state) {
    if (state.phase !== 'DE') return;
    R.endPhase(state, 'DE');
    state.phase = 'TR';
    R.spawnReinforcements(state, 'TR');
    R.beginPhase(state, 'TR');
    R.log(state, 'Türk hamlesi: ' + state.air.TR + ' hava saldırısı, ' + state.rep.TR + ' takviye hakkı.', 'phase');
  };
  R.endTurkishPhase = function (state) {
    if (state.phase !== 'TR') return;
    R.endPhase(state, 'TR');
    if (state.turn >= (state.extended ? R.EXT_MAX_TURNS : state.maxTurns)) {
      R.finish(state);
      return;
    }
    R.startTurn(state, state.turn + 1);
  };
  R.finish = function (state) {
    state.phase = 'over';
    state.result = R.evaluate(state);
    R.log(state, 'Savaş sona erdi: ' + state.result.title + ' · Skor ' + state.result.score.total, 'phase');
  };
  // 16. tur sonunda oyuncu isterse savaş sürer
  R.canContinue = function (state) {
    return state.phase === 'over' && !state.extended && state.turn >= state.maxTurns &&
      state.turn < R.EXT_MAX_TURNS && state.owner[R.cityHex('İstanbul')] !== 'DE';
  };
  R.continueWar = function (state) {
    if (!R.canContinue(state)) return false;
    state.extended = true;
    state.result16 = state.result;
    state.result = null;
    R.log(state, 'Savaş uzatıldı: cephe 16. haftadan sonra da sürüyor.', 'phase');
    R.startTurn(state, state.turn + 1);
    return true;
  };
  // Uzatmada oyuncu savaşı kendi hamlesinde bitirebilir
  R.endWar = function (state) {
    if (!state.extended || state.phase !== 'TR') return false;
    R.endPhase(state, 'TR');
    R.finish(state);
    return true;
  };

  // ------------------------------------------------------------------- zafer
  R.germanVP = function (state) {
    let vp = 0;
    for (const c of O.MAP.cities) {
      if (!c.vp || c.major) continue;
      const own = state.owner[c.hex];
      if (c.country === 'TR' && own === 'DE') vp += c.vp;
      if (c.country !== 'TR' && own === 'TR') vp -= c.vp;
    }
    return vp;
  };
  R.VP_TIERS = [
    { max: 4, winner: 'TR', title: 'Türk Kesin Zaferi', text: 'Mihver taarruzu sınırda durduruldu. Trakya neredeyse bütünüyle Türk elinde; Almanya Boğazlar hayalinden vazgeçmek zorunda.' },
    { max: 10, winner: 'TR', title: 'Türk Zaferi', text: 'Çakmak Hattı görevini yaptı. İleri mevziler kaybedilse de ordu ayakta, İstanbul ve Boğazlar güvende.' },
    { max: 16, winner: 'draw', title: 'Berabere — Yıpratma Savaşı', text: 'Cephe Trakya\'nın içlerinde kilitlendi. İki taraf da hedefine ulaşamadı; bahar savaşı belirleyecek.' },
    { max: Infinity, winner: 'DE', title: 'Mihver Zaferi', text: 'Trakya\'nın büyük kısmı düştü. İstanbul henüz direniyor ama Boğazlar tehlikede.' },
  ];
  R.evaluate = function (state) {
    const vp = R.germanVP(state);
    const ist = R.cityHex('İstanbul');
    let res = null;
    if (state.owner[ist] === 'DE') {
      res = { winner: 'DE', title: 'Mihver Kesin Zaferi', text: 'İstanbul düştü. Boğazlar Mihver denetimine geçti; savaşın seyri değişti.', vp: vp };
    } else {
      for (const t of R.VP_TIERS) if (vp <= t.max) { res = { winner: t.winner, title: t.title, text: t.text, vp: vp }; break; }
    }
    res.turn = state.turn;
    res.score = R.score(state);
    return res;
  };

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
    let totalVP = 0;
    for (const c of O.MAP.cities) if (c.country === 'TR' && c.vp && !c.major) totalVP += c.vp;
    const held = totalVP - R.germanVP(state); // sınır ötesi şehirler alınırsa toplamı aşabilir
    const istHeld = state.owner[R.cityHex('İstanbul')] !== 'DE';
    const parts = [
      { label: 'Elde tutulan şehirler (' + held + ' puan × 40)', value: held * 40 },
      { label: istHeld ? 'İstanbul elde' : 'İstanbul düştü', value: istHeld ? 200 : 0 },
      { label: 'Dayanılan hafta (' + state.turn + ' × 10)', value: state.turn * 10 },
      { label: 'Mihver kayıpları (' + state.stats.lost.DE + ' kademe × 15)', value: state.stats.lost.DE * 15 },
      { label: 'Türk kayıpları (' + state.stats.lost.TR + ' kademe × −8)', value: -state.stats.lost.TR * 8 },
    ];
    const base = parts.reduce(function (a, p) { return a + p.value; }, 0);
    const mult = R.SCORE_MULT[state.difficulty] || 1;
    const total = Math.max(0, Math.round(base * mult));
    let rank = R.RANKS[R.RANKS.length - 1].title;
    for (const r of R.RANKS) if (total >= r.min) { rank = r.title; break; }
    return { parts: parts, base: base, mult: mult, total: total, rank: rank };
  };
  R.checkSuddenDeath = function (state) {
    if (state.phase === 'over') return;
    const ist = R.cityHex('İstanbul');
    if (state.owner[ist] === 'DE') {
      state.phase = 'over';
      state.result = R.evaluate(state);
      R.log(state, 'İSTANBUL DÜŞTÜ! ' + state.result.title, 'bad');
    }
  };
})(Oyun);
