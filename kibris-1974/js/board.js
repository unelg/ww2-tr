// Kıbrıs 1974 — ortak skor tablosu.
// Oyun claude.ai'de yayınlanan sayfada açıldığında, sayfanın paylaşılan veri deposuna
// (db yeteneği) her oyuncunun en iyi skoru tek bir kayıt olarak yazılır: scores/<oyuncu-id>.
// Yerel dosya veya başka bir sunucuda window.claude yoktur; tablo o zaman kapalı kalır.
var Oyun = globalThis.Oyun = globalThis.Oyun || {};
(function (O) {
  'use strict';
  const B = {
    status: 'off', // off | loading | slow | ready | error
    rows: [], names: {}, myId: null, canWrite: null, isOwner: false, error: null,
    db: null, user: null, listeners: [],
  };
  O.Board = B;

  B.onChange = function (fn) { B.listeners.push(fn); };
  function emit() {
    for (const fn of B.listeners) { try { fn(); } catch (e) { console.error(e); } }
  }

  async function resolveNames() {
    if (!B.user || !B.rows.length) return;
    try {
      const ps = await B.user.profiles(B.rows.map(function (r) { return r.id; }));
      const names = {};
      for (const id in ps) names[id] = ps[id].name || '';
      B.names = names;
    } catch (e) { /* adlar çözülemezse "Bir oyuncu" yazılır */ }
  }

  B.init = async function () {
    const c = typeof window !== 'undefined' ? window.claude : null;
    if (!c || typeof c.use !== 'function') { B.status = 'off'; emit(); return; }
    B.status = 'loading';
    emit();
    let db = null, user = null;
    try {
      const got = await Promise.all([c.use('db'), c.use('user')]);
      db = got[0]; user = got[1];
    } catch (e) { db = null; }
    if (!db) { B.status = 'off'; emit(); return; }
    B.db = db;
    B.user = user;
    if (user) {
      B.myId = await user.id();
      B.canWrite = await user.can('data.write');
      B.isOwner = await user.isOwner();
    }
    const timer = setTimeout(function () { if (B.status === 'loading') { B.status = 'slow'; emit(); } }, 10000);
    db.collection('scores').orderBy('total', 'desc').limit(100).onSnapshot(async function (snap) {
      B.rows = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
      if (!snap.metadata.fromCache) { clearTimeout(timer); B.status = 'ready'; }
      await resolveNames();
      emit();
    }, function (err) {
      clearTimeout(timer);
      B.status = 'error';
      B.error = err && err.code;
      emit();
    });
  };

  B.available = function () { return !!B.db && B.status !== 'error'; };
  B.canSubmit = function () { return B.available() && !!B.myId && B.canWrite !== false; };
  B.myRow = function () {
    for (const r of B.rows) if (r.id === B.myId) return r;
    return null;
  };
  B.nameOf = function (id) { return id === B.myId ? 'Siz' : (B.names[id] || 'Bir oyuncu'); };

  // Oyunun skorunu gönderir; oyuncunun önceki en iyisinden düşükse yalnızca oyun sayısı güncellenir.
  B.submit = async function (state) {
    if (!B.canSubmit()) return { ok: false, reason: 'unavailable' };
    const r = state.result;
    const sc = r.score;
    const ref = B.db.doc('scores/' + B.myId);
    const now = new Date().toISOString();
    try {
      const cur = await ref.get();
      const prev = cur.exists ? cur.data() : null;
      const games = (prev && typeof prev.games === 'number' ? prev.games : 0) + 1;
      if (prev && typeof prev.total === 'number' && prev.total >= sc.total) {
        await ref.update({ games: games, lastTotal: sc.total, lastAt: now });
        return { ok: true, improved: false, best: prev.total };
      }
      await ref.set({
        total: sc.total, rank: sc.rank, difficulty: state.difficulty, turn: state.turn,
        extended: !!state.extended, outcome: r.title, winner: r.winner, vp: r.vp,
        version: O.VERSION, at: now, games: games, lastTotal: sc.total, lastAt: now,
      });
      return { ok: true, improved: true };
    } catch (e) {
      if (e && e.code === 'invalid_argument') { B.canWrite = false; return { ok: false, reason: 'denied' }; }
      if (e && e.code === 'quota_exceeded') return { ok: false, reason: 'full' };
      return { ok: false, reason: 'error' };
    }
  };

  // Yalnızca sayfanın sahibi başkasının kaydını silebilir (db kuralı: scores yazma = owner)
  B.remove = async function (id) {
    if (!B.db || !B.isOwner) return false;
    try { await B.db.doc('scores/' + id).delete(); return true; } catch (e) { return false; }
  };
})(Oyun);
