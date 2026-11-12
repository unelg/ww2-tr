// Kıbrıs 1974 — yapay zekâ.
// runEnemyPhase: Rum/Yunan tarafı (savunma): köprübaşını çevreler, şehirleri tutar, zayıf
//   noktalara (özellikle gece) karşı taarruz yapar.
// runAutoTurkish: denge testleri için basit bir Türk saldırı yapay zekâsı (oyunda kullanılmaz).
var Oyun = globalThis.Oyun = globalThis.Oyun || {};
(function (O) {
  'use strict';
  const AI = {};
  O.AI = AI;
  const R = function () { return O.Rules; };

  let EXP = null;
  function expectations() {
    if (EXP) return EXP;
    EXP = R().CRT.map(function (row) {
      let a = 0, d = 0, r = 0;
      for (const code of row) { const x = R().RESULTS[code]; a += x.a; d += x.d; r += x.r ? 1 : 0; }
      return { a: a / 6, d: d / 6, r: r / 6 };
    });
    return EXP;
  }
  const NOOP = function () { return Promise.resolve(); };

  // ------------------------------------------------------------ saldırı planlama
  // opts: { minCol, value(state, target), maxRatio }
  AI.planAttack = function (state, side, skip, opts) {
    const Rl = R(), map = O.MAP;
    const occ = Rl.occupancy(state);
    const ready = state.units.filter(function (u) { return u.side === side && !u.attacked && !u.acted && Rl.type(u).atk > 0; });
    if (!ready.length) return null;
    const reach = new Map();
    for (const u of ready) if (u.mpLeft > 0) reach.set(u.id, Rl.reachable(state, u));
    const exp = expectations();
    let best = null;
    for (const t of state.units) {
      if (t.side === side || skip.has(t.id)) continue;
      const nbrs = map.hexes[t.hex].nbrs.filter(function (nb) { return Rl.passable(map.hexes[nb]); });
      const parts = [];
      const used = new Set();
      for (const nb of nbrs) {
        const o = occ[nb];
        if (o && o.side === side && !o.attacked && !o.acted && Rl.type(o).atk > 0) { parts.push({ unit: o, hex: nb }); used.add(nb); }
      }
      const free = nbrs.filter(function (nb) { return !occ[nb]; });
      const D = Rl.defenseStrength(state, t).value;
      const Deff = state.air[side] > 0 && !t.disrupted ? D * 0.8 : D;
      let A = 0;
      for (const p of parts) A += Rl.attackStrength(state, p.unit, t.hex).value;
      if (free.length) {
        const cands = ready
          .filter(function (u) { return reach.has(u.id) && !parts.some(function (p) { return p.unit === u; }); })
          .map(function (u) { return { u: u, v: Rl.attackStrength(state, u, t.hex).value }; })
          .sort(function (a, b) { return b.v - a.v; });
        for (const c of cands) {
          if (A / Deff >= (opts.maxRatio || 4.5)) break;
          const r = reach.get(c.u.id);
          let bh = -1, bc = Infinity;
          for (const nb of free) {
            if (used.has(nb) || !r.dests.has(nb)) continue;
            const h = map.hexes[nb];
            const cost = r.cost[nb] + (Rl.isRough(h) || h.city ? -0.3 : 0);
            if (cost < bc) { bc = cost; bh = nb; }
          }
          if (bh < 0) continue;
          parts.push({ unit: c.u, hex: bh });
          used.add(bh);
          A += c.v;
        }
      }
      if (!parts.length) continue;
      const col = Rl.oddsCol(A / Deff);
      if (col < opts.minCol) continue;
      const e = exp[col];
      const value = opts.value(state, t);
      const score = value * (e.d + 0.7 * e.r) - 1.3 * e.a - 0.05 * parts.length;
      if (!best || score > best.score) best = { target: t, parts: parts, col: col, score: score };
    }
    return best;
  };

  function chooseAdvancer(state, survivors, hex) {
    const Rl = R();
    const h = O.MAP.hexes[hex];
    let best = null, bs = -Infinity;
    for (const u of survivors) {
      if (!Rl.adjacent(u.hex, hex) || Rl.type(u).static) continue;
      const T = Rl.type(u);
      let s = u.steps + T.atk * 0.1;
      if (Rl.isRough(h) && T.armor) s -= 2;
      if (s > bs) { bs = s; best = u; }
    }
    return best;
  }

  async function attackLoop(state, side, hooks, opts) {
    const Rl = R();
    const skip = new Set();
    for (let guard = 0; guard < 60; guard++) {
      if (state.phase === 'over') return;
      const plan = AI.planAttack(state, side, skip, opts);
      if (!plan) return;
      const t = plan.target;
      skip.add(t.id);
      for (const p of plan.parts) {
        if (!Rl.alive(state, p.unit) || p.unit.hex === p.hex) continue;
        const r = Rl.reachable(state, p.unit);
        let dest = p.hex;
        if (!r.dests.has(dest) || Rl.unitAt(state, dest)) {
          dest = -1;
          for (const nb of O.MAP.hexes[t.hex].nbrs) if (r.dests.has(nb)) { dest = nb; break; }
        }
        if (dest < 0) continue;
        const mv = Rl.moveUnit(state, p.unit, dest, r);
        if (mv) await hooks.moved(p.unit, mv.path);
      }
      if (!Rl.alive(state, t)) continue;
      const attackers = plan.parts.map(function (p) { return p.unit; }).filter(function (u) {
        return Rl.alive(state, u) && !u.attacked && Rl.adjacent(u.hex, t.hex);
      });
      if (!attackers.length) continue;
      let odds = Rl.attackOdds(state, attackers, t.hex);
      if (odds.col < 5 && state.air[side] > 0 && !t.disrupted) {
        const ar = Rl.airStrike(state, side, t);
        if (ar) await hooks.air(ar);
        if (!Rl.alive(state, t)) continue;
        odds = Rl.attackOdds(state, attackers, t.hex);
      }
      if (odds.col < opts.minCol) continue;
      const res = Rl.resolveAttack(state, attackers, t.hex);
      if (!res) continue;
      skip.delete(t.id);
      await hooks.combat(res);
      if (res.vacated) {
        const adv = chooseAdvancer(state, res.survivors, t.hex);
        if (adv) {
          const mv = Rl.advance(state, adv, t.hex);
          if (mv) await hooks.moved(adv, mv.path);
        }
      }
    }
  }

  function replacements(state, side) {
    const Rl = R();
    while (state.rep[side] > 0) {
      const cands = state.units.filter(function (u) {
        return u.side === side && Rl.canReplace(state, u) && !Rl.hasAdjacentEnemy(state, u);
      });
      if (!cands.length) return;
      cands.sort(function (a, b) { return (Rl.type(b).steps - b.steps) - (Rl.type(a).steps - a.steps) || Rl.type(b).atk - Rl.type(a).atk; });
      Rl.replace(state, cands[0]);
    }
  }

  // ------------------------------------------------------------ Rum/Yunan savunması
  function grTargetValue(state, t) {
    const Rl = R();
    const h = O.MAP.hexes[t.hex];
    const T = Rl.type(t);
    let v = 2 + (T.steps - t.steps) * 0.8;
    if (t.steps === 1) v += 1;
    if (!t.inSupply) v += 1;
    if (h.beach) v += 3; // köprübaşını denize dökmek
    if (T.drop || T.militia) v += 1;
    if (h.city && h.city.side === 'GR' && h.city.vp) v += 3; // kaybedilen şehri geri almak
    if (h.city && h.city.side === 'TR') v += 2;
    return v;
  }

  // Türk kontrolündeki alana uzaklık (cephe hattı = 1)
  function frontDistance(state) {
    const Rl = R(), map = O.MAP, n = map.hexes.length;
    const f = new Int32Array(n).fill(999);
    const q = [];
    for (let i = 0; i < n; i++) {
      if (!Rl.passable(map.hexes[i])) continue;
      if (state.owner[i] === 'TR') { f[i] = 0; q.push(i); }
    }
    for (let k = 0; k < q.length; k++) {
      const c = q[k];
      for (const nb of map.hexes[c].nbrs) {
        if (!Rl.passable(map.hexes[nb]) || f[nb] <= f[c] + 1) continue;
        f[nb] = f[c] + 1;
        q.push(nb);
      }
    }
    return f;
  }

  function grPositionScore(state, u, hex, ctx) {
    const Rl = R();
    const h = O.MAP.hexes[hex];
    const T = Rl.type(u);
    const fd = ctx.front[hex];
    let s = 1.6 * Math.abs(Math.min(fd, 30) - 1);
    if (fd === 0) s += 1.5;
    if (Rl.isRough(h)) s -= 0.6;
    if (h.city) s -= 0.8;
    if (h.city && h.city.vp && state.owner[hex] === 'GR' && fd <= 3 && !ctx.garrisoned.has(hex)) s -= 3;
    if (!ctx.sup[hex]) s += 4;
    // aşırı tehdit altındaki tek birlik olmaktan kaçın
    let threat = 0;
    for (const t of ctx.tr) if (Rl.hexDist(t.hex, hex) <= 2) threat += (Rl.type(t).atk * t.steps) / Rl.type(t).steps;
    if (threat > 0) {
      const myDef = ((T.def * u.steps) / T.steps) * Rl.terrainDefMult(h).m;
      const r = threat / myDef;
      if (r > 2.5) s += (r - 2.5) * 1.5;
    }
    if (T.armor && Rl.isRough(h)) s += 0.5;
    return s;
  }

  async function grMoveLoop(state, hooks) {
    const Rl = R();
    const ctx = {
      front: frontDistance(state),
      sup: Rl.computeSupply(state, 'GR', true),
      tr: state.units.filter(function (t) { return t.side === 'TR'; }),
      garrisoned: new Set(),
    };
    for (const u of state.units) if (u.side === 'GR' && O.MAP.hexes[u.hex].city) ctx.garrisoned.add(u.hex);
    const movers = state.units.filter(function (u) {
      return u.side === 'GR' && !u.attacked && !u.acted && u.mpLeft > 0 && !Rl.type(u).static;
    });
    // Önce cepheye yakın olanlar, sonra yedekler
    movers.sort(function (a, b) { return ctx.front[a.hex] - ctx.front[b.hex]; });
    for (const u of movers) {
      if (!Rl.alive(state, u)) continue;
      const here = O.MAP.hexes[u.hex];
      // Tehdit altındaki hedef şehri tutan birlik yerinde kalır
      if (here.city && here.city.vp && ctx.front[u.hex] <= 2) continue;
      const r = Rl.reachable(state, u);
      let best = u.hex;
      let bs = grPositionScore(state, u, u.hex, ctx) - 0.2 - 0.4 * u.entrench;
      for (const hx of r.dests) {
        const s = grPositionScore(state, u, hx, ctx);
        if (s < bs) { bs = s; best = hx; }
      }
      if (best !== u.hex) {
        if (here.city) ctx.garrisoned.delete(u.hex);
        const mv = Rl.moveUnit(state, u, best, r);
        if (mv) {
          if (O.MAP.hexes[best].city) ctx.garrisoned.add(best);
          await hooks.moved(u, mv.path);
          ctx.front = frontDistance(state);
        }
      }
    }
  }

  AI.runEnemyPhase = async function (state, hooks) {
    hooks = Object.assign({ moved: NOOP, combat: NOOP, air: NOOP }, hooks || {});
    if (state.phase !== 'GR') return;
    const night = state.weather === 'gece';
    const opts = { minCol: night ? 3 : 4, value: grTargetValue, maxRatio: 4 };
    if (state.difficulty === 'kolay') opts.minCol++;
    replacements(state, 'GR');
    await attackLoop(state, 'GR', hooks, opts);
    await grMoveLoop(state, hooks);
    await attackLoop(state, 'GR', hooks, opts);
  };

  // ------------------------------------------------------------ test için Türk saldırısı
  function trObjectiveField(state) {
    const Rl = R(), map = O.MAP, n = map.hexes.length;
    const occ = Rl.occupancy(state);
    const gz = Rl.zoc(state, 'GR');
    const f = new Float64Array(n).fill(Infinity);
    const heap = new Rl.Heap();
    const push = function (i, w) { if (-w < f[i]) { f[i] = -w; heap.push(f[i], i); } };
    for (const c of O.MAP.cities) {
      if (!c.vp || state.owner[c.hex] === 'TR') continue;
      if (state.stage === 1 && c.stage === 2) continue;
      push(c.hex, c.vp * 4 + (c.name === 'Girne' ? 8 : 0));
    }
    if (!Rl.corridorOpen(state)) {
      for (const h of map.hexes) if (h.enclave === 'Lefkoşa' && state.owner[h.i] === 'TR') push(h.i, 16);
    }
    const done = new Uint8Array(n);
    while (heap.size()) {
      const top = heap.pop(), d = top[0], cur = top[1];
      if (done[cur]) continue;
      done[cur] = 1;
      const ch = map.hexes[cur];
      let c = ch.terrain === 'mountain' ? 3 : Rl.isRough(ch) ? 2 : 1;
      const o = occ[cur];
      if (o && o.side === 'GR') c += 5; else if (gz[cur]) c += 1;
      for (const nb of ch.nbrs) {
        if (!Rl.passable(map.hexes[nb])) continue;
        if (d + c < f[nb]) { f[nb] = d + c; heap.push(f[nb], nb); }
      }
    }
    return f;
  }
  AI.runAutoTurkish = async function (state, hooks) {
    hooks = Object.assign({ moved: NOOP, combat: NOOP, air: NOOP }, hooks || {});
    if (state.phase !== 'TR') return;
    const Rl = R();
    const opts = { minCol: 3, maxRatio: 4.5, value: function (st, t) {
      const h = O.MAP.hexes[t.hex];
      return 2 + (h.city && h.city.vp ? h.city.vp * 1.5 : 0) + (Rl.type(t).steps - t.steps) * 0.8;
    } };
    replacements(state, 'TR');
    await attackLoop(state, 'TR', hooks, opts);
    const f = trObjectiveField(state);
    const sup = Rl.computeSupply(state, 'TR', true);
    const movers = state.units.filter(function (u) { return u.side === 'TR' && !u.attacked && !u.acted && u.mpLeft > 0 && !Rl.type(u).static; });
    for (const u of movers) {
      // Lefkoşa Türk kesimini savunan mücahitler yerinde kalır
      if (Rl.type(u).militia && O.MAP.hexes[u.hex].enclave) continue;
      const r = Rl.reachable(state, u);
      let best = u.hex, bs = f[u.hex] - 0.05;
      for (const hx of r.dests) {
        const s = f[hx] + (sup[hx] ? 0 : 4) - (Rl.hasAdjacentEnemy(state, u) ? 0 : 0);
        if (s < bs) { bs = s; best = hx; }
      }
      if (best !== u.hex) { const mv = Rl.moveUnit(state, u, best, r); if (mv) await hooks.moved(u, mv.path); }
    }
    await attackLoop(state, 'TR', hooks, opts);
  };
})(Oyun);
