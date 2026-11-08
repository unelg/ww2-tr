// Çakmak Hattı 1943 — Mihver yapay zekâsı.
// Mantık: (1) takviye, (2) en iyi oranlı saldırıları planla, birlikleri konumla, gerekirse
// Luftwaffe ile savunmayı sars ve saldır, (3) kalan birlikleri hedeflere doğru ilerlet,
// (4) yeni temas noktalarında son bir saldırı turu.
var Oyun = globalThis.Oyun = globalThis.Oyun || {};
(function (O) {
  'use strict';
  const AI = {};
  O.AI = AI;

  let EXP = null;
  function expectations() {
    if (EXP) return EXP;
    const R = O.Rules;
    EXP = R.CRT.map(function (row) {
      let a = 0, d = 0, r = 0;
      for (const code of row) { const x = R.RESULTS[code]; a += x.a; d += x.d; r += x.r ? 1 : 0; }
      return { a: a / 6, d: d / 6, r: r / 6 };
    });
    return EXP;
  }

  function minCol(state) {
    if (state.difficulty === 'kolay') return 4; // en az 2:1
    return 3; // en az 1,5:1
  }

  // Hedeflere uzaklık alanı: düşük değer = daha cazip konum
  AI.field = function (state, axis) {
    const R = O.Rules, map = O.MAP, n = map.hexes.length;
    const occ = R.occupancy(state);
    const tz = R.zoc(state, 'TR');
    const f = new Float64Array(n).fill(Infinity);
    const heap = new R.Heap();
    const objs = O.AI_OBJECTIVES[axis];
    let any = false;
    for (const name in objs) {
      const hx = R.cityHex(name);
      if (hx < 0 || state.owner[hx] === 'DE') continue;
      f[hx] = -objs[name];
      heap.push(f[hx], hx);
      any = true;
    }
    if (!any) return null;
    const done = new Uint8Array(n);
    while (heap.size()) {
      const top = heap.pop(), d = top[0], cur = top[1];
      if (done[cur]) continue;
      done[cur] = 1;
      const ch = map.hexes[cur];
      // cur altıgenine girmenin maliyeti (geriye doğru arama)
      let c = R.isRough(ch) ? 2 : 1;
      if (ch.river) c += 0.5;
      const o = occ[cur];
      if (o && o.side === 'TR') c += 6;
      else if (tz[cur]) c += 1;
      for (const nb of ch.nbrs) {
        if (!R.passable(map.hexes[nb])) continue;
        const nd = d + c;
        if (nd < f[nb]) { f[nb] = nd; heap.push(nd, nb); }
      }
    }
    return f;
  };

  AI.targetValue = function (state, t) {
    const R = O.Rules;
    const h = O.MAP.hexes[t.hex];
    const T = R.type(t);
    let v = 2;
    if (h.city) v += h.city.vp * 1.5;
    v += (T.steps - t.steps) * 0.8;
    if (t.steps === 1) v += 1;
    if (!t.inSupply) v += 1;
    const d = R.hexDist(t.hex, R.cityHex('İstanbul'));
    v += Math.max(0, (30 - d) / 10);
    if (h.fort) v += 0.5;
    return v;
  };

  AI.planAttack = function (state, skip) {
    const R = O.Rules, map = O.MAP;
    const occ = R.occupancy(state);
    const ready = state.units.filter(function (u) { return u.side === 'DE' && !u.attacked && !u.acted; });
    if (!ready.length) return null;
    const reach = new Map();
    for (const u of ready) if (u.mpLeft > 0) reach.set(u.id, R.reachable(state, u));
    const exp = expectations();
    const need = minCol(state);
    let best = null;
    for (const t of state.units) {
      if (t.side !== 'TR' || skip.has(t.id)) continue;
      const nbrs = map.hexes[t.hex].nbrs.filter(function (nb) { return R.passable(map.hexes[nb]); });
      const parts = [];
      const used = new Set();
      for (const nb of nbrs) {
        const o = occ[nb];
        if (o && o.side === 'DE' && !o.attacked && !o.acted) { parts.push({ unit: o, hex: nb }); used.add(nb); }
      }
      const free = nbrs.filter(function (nb) { return !occ[nb]; });
      const D = R.defenseStrength(state, t).value;
      const Deff = state.air.DE > 0 && !t.disrupted ? D * 0.8 : D;
      let A = 0;
      for (const p of parts) A += R.attackStrength(state, p.unit, t.hex).value;
      if (free.length) {
        const cands = ready
          .filter(function (u) { return reach.has(u.id) && !parts.some(function (p) { return p.unit === u; }); })
          .map(function (u) { return { u: u, v: R.attackStrength(state, u, t.hex).value }; })
          .sort(function (a, b) { return b.v - a.v; });
        for (const c of cands) {
          if (A / Deff >= 4.5) break;
          const r = reach.get(c.u.id);
          let bh = -1, bc = Infinity;
          for (const nb of free) {
            if (used.has(nb) || !r.dests.has(nb)) continue;
            const h = map.hexes[nb];
            const cost = r.cost[nb] + (R.isRough(h) || h.city ? -0.3 : 0);
            if (cost < bc) { bc = cost; bh = nb; }
          }
          if (bh < 0) continue;
          parts.push({ unit: c.u, hex: bh });
          used.add(bh);
          A += c.v;
        }
      }
      if (!parts.length) continue;
      const col = R.oddsCol(A / Deff);
      if (col < need) continue;
      const e = exp[col];
      const value = AI.targetValue(state, t);
      const score = value * (e.d + 0.7 * e.r) - 1.3 * e.a - 0.05 * parts.length;
      if (!best || score > best.score) best = { target: t, parts: parts, col: col, score: score };
    }
    return best;
  };

  function chooseAdvancer(state, survivors, hex) {
    const R = O.Rules;
    const h = O.MAP.hexes[hex];
    let best = null, bs = -Infinity;
    for (const u of survivors) {
      if (!R.adjacent(u.hex, hex)) continue;
      const T = R.type(u);
      let s = u.steps + T.atk * 0.1;
      if ((R.isRough(h) || h.city || h.fort) && T.armor) s -= 2;
      if (!R.isRough(h) && T.motor) s += 0.5;
      if (s > bs) { bs = s; best = u; }
    }
    return best;
  }

  async function attackLoop(state, hooks) {
    const R = O.Rules;
    const skip = new Set();
    for (let guard = 0; guard < 60; guard++) {
      if (state.phase === 'over') return;
      const plan = AI.planAttack(state, skip);
      if (!plan) return;
      const t = plan.target;
      skip.add(t.id); // başarısız planı tekrar deneme; saldırı olursa aşağıda yeniden açılır
      // Saldırı mevzilerine hareket
      for (const p of plan.parts) {
        if (!R.alive(state, p.unit) || p.unit.hex === p.hex) continue;
        const r = R.reachable(state, p.unit);
        let dest = p.hex;
        if (!r.dests.has(dest) || R.unitAt(state, dest)) {
          dest = -1;
          for (const nb of O.MAP.hexes[t.hex].nbrs) if (r.dests.has(nb)) { dest = nb; break; }
        }
        if (dest < 0) continue;
        const mv = R.moveUnit(state, p.unit, dest, r);
        if (mv) await hooks.moved(p.unit, mv.path);
        if (state.phase === 'over') return;
      }
      if (!R.alive(state, t)) continue;
      const attackers = plan.parts.map(function (p) { return p.unit; }).filter(function (u) {
        return R.alive(state, u) && !u.attacked && R.adjacent(u.hex, t.hex);
      });
      if (!attackers.length) continue;
      let odds = R.attackOdds(state, attackers, t.hex);
      if (odds.col < 5 && state.air.DE > 0 && !t.disrupted) {
        const ar = R.airStrike(state, 'DE', t);
        if (ar) await hooks.air(ar);
        if (!R.alive(state, t)) continue;
        odds = R.attackOdds(state, attackers, t.hex);
      }
      if (odds.col < minCol(state)) continue;
      const res = R.resolveAttack(state, attackers, t.hex);
      if (!res) continue;
      skip.delete(t.id); // başka bir grup aynı hedefe yeniden yüklenebilir
      await hooks.combat(res);
      if (state.phase === 'over') return;
      if (res.vacated) {
        const adv = chooseAdvancer(state, res.survivors, t.hex);
        if (adv) {
          const mv = R.advance(state, adv, t.hex);
          if (mv) await hooks.moved(adv, mv.path);
        }
      }
    }
  }

  function positionScore(state, u, hex, field, sup, trUnits) {
    const R = O.Rules;
    const h = O.MAP.hexes[hex];
    const T = R.type(u);
    let s = field ? (field[hex] === Infinity ? 999 : field[hex]) : 0;
    if (!sup[hex]) s += 5;
    // Türk karşı taarruz tehdidi ve temas
    let threat = 0, contact = false;
    for (const t of trUnits) {
      const d = R.hexDist(t.hex, hex);
      if (d === 1) contact = true;
      if (d <= 2 && !R.type(t).static) threat += (R.type(t).atk * t.steps) / R.type(t).steps;
    }
    if (threat > 0) {
      const myDef = ((T.def * u.steps) / T.steps) * R.terrainDefMult(h).m;
      const ratio = threat / myDef;
      if (ratio > 2) s += (ratio - 2) * 1.5;
    }
    // Hatla temas: bir sonraki tur saldırısı için mevzi alır ve düşmanı yerinde tutar
    if (contact) s -= 1.5;
    if (T.armor && R.isRough(h)) s += 0.4;
    return s;
  }

  async function moveLoop(state, hooks) {
    const R = O.Rules;
    const fN = AI.field(state, 'N');
    const fS = AI.field(state, 'S');
    const fields = { N: fN || fS, S: fS || fN };
    const sup = R.computeSupply(state, 'DE', true);
    const movers = state.units.filter(function (u) { return u.side === 'DE' && !u.attacked && !u.acted && u.mpLeft > 0; });
    movers.sort(function (a, b) { return (R.type(b).motor ? 1 : 0) - (R.type(a).motor ? 1 : 0); });
    for (const u of movers) {
      if (state.phase === 'over') return;
      if (!R.alive(state, u)) continue;
      const trUnits = state.units.filter(function (t) { return t.side === 'TR'; });
      const field = fields[u.axis] || fields.N;
      const r = R.reachable(state, u);
      let best = u.hex, bs = positionScore(state, u, u.hex, field, sup, trUnits) - 0.05;
      for (const hx of r.dests) {
        const s = positionScore(state, u, hx, field, sup, trUnits);
        if (s < bs) { bs = s; best = hx; }
      }
      if (best !== u.hex) {
        const mv = R.moveUnit(state, u, best, r);
        if (mv) await hooks.moved(u, mv.path);
      }
    }
  }

  function replacements(state) {
    const R = O.Rules;
    while (state.rep.DE > 0) {
      const cands = state.units.filter(function (u) {
        return u.side === 'DE' && R.canReplace(state, u) && !R.hasAdjacentEnemy(state, u);
      });
      if (!cands.length) return;
      cands.sort(function (a, b) { return (R.type(b).steps - b.steps) - (R.type(a).steps - a.steps) || R.type(b).atk - R.type(a).atk; });
      R.replace(state, cands[0]);
    }
  }

  const NOOP = function () { return Promise.resolve(); };

  AI.runGermanPhase = async function (state, hooks) {
    hooks = Object.assign({ moved: NOOP, combat: NOOP, air: NOOP }, hooks || {});
    if (state.phase !== 'DE') return;
    replacements(state);
    await attackLoop(state, hooks);
    if (state.phase === 'over') return;
    await moveLoop(state, hooks);
    if (state.phase === 'over') return;
    await attackLoop(state, hooks);
  };
})(Oyun);
