// Kıbrıs 1974 — canvas ile harita ve birlik çizimi.
var Oyun = globalThis.Oyun = globalThis.Oyun || {};
(function (O) {
  'use strict';
  const G = O.Geo;
  const V = {};
  O.View = V;

  const PX = 20; // altıgen yarıçapı (piksel, yakınlaştırma 1)
  const MARGIN = 16;
  const S = PX / G.HEX_SIZE; // km başına piksel
  V.PX = PX;
  V.WIDTH = Math.ceil((G.COLS + 0.5) * G.HEX_W * S + MARGIN * 2);
  V.HEIGHT = Math.ceil(((G.ROWS - 1) * G.ROW_H + 2 * G.HEX_SIZE) * S + MARGIN * 2);

  const C = {
    sea: '#9ec3d8', seaLine: '#7fa3ba', anadolu: '#d9d3c4', anadoluHatch: 'rgba(90,80,60,0.18)', mountain: '#c9b08a',
    clearTR: '#efe5c4', clearFR: '#dcd6c4', forestTR: '#b9cc98', forestFR: '#aab79a',
    hillsTR: '#e0cd9c', hillsFR: '#cfc3a5', grid: 'rgba(90,75,45,0.20)', coast: '#5f7f94',
    border: '#8e1b1b', river: '#4a7fae', fort: '#3a2e22', city: '#262626',
    deCtrl: 'rgba(75,85,100,0.30)', trCtrl: 'rgba(179,38,46,0.20)',
    reach: 'rgba(255,255,255,0.62)', reachEdge: 'rgba(30,90,170,0.55)', target: '#e0322b',
    select: '#ffd23f', deploy: 'rgba(80,160,90,0.22)', label: '#3b3226',
  };

  V.hexXY = function (i) {
    const h = O.MAP.hexes[i];
    return { x: h.x * S + MARGIN, y: h.y * S + MARGIN };
  };
  V.llXY = function (lat, lon) {
    const k = G.toKm(lat, lon);
    return { x: k.x * S + MARGIN, y: k.y * S + MARGIN };
  };
  function corners(x, y, r) {
    const pts = [];
    for (let k = 0; k < 6; k++) {
      const a = (Math.PI / 180) * (60 * k - 30);
      pts.push([x + r * Math.cos(a), y + r * Math.sin(a)]);
    }
    return pts;
  }
  function hexPath(ctx, x, y, r) {
    const p = corners(x, y, r);
    ctx.beginPath();
    ctx.moveTo(p[0][0], p[0][1]);
    for (let k = 1; k < 6; k++) ctx.lineTo(p[k][0], p[k][1]);
    ctx.closePath();
  }
  // d yönündeki komşu ile ortak kenarın köşeleri
  function edge(x, y, d) {
    const p = corners(x, y, PX);
    return [p[(6 - d) % 6], p[(7 - d) % 6]];
  }

  V.pick = function (lx, ly) {
    let best = -1, bd = Infinity;
    for (const h of O.MAP.hexes) {
      const x = h.x * S + MARGIN, y = h.y * S + MARGIN;
      const d = (x - lx) * (x - lx) + (y - ly) * (y - ly);
      if (d < bd) { bd = d; best = h.i; }
    }
    return bd <= PX * PX * 1.1 ? best : -1;
  };

  V.init = function (canvas) {
    V.canvas = canvas;
    V.ctx = canvas.getContext('2d');
    V.bg = document.createElement('canvas');
    V.bgKey = '';
    V.zoom = 1;
    V.anims = new Map();
    V.effects = [];
    V.dirty = true;
    V.resize();
    const loop = function () {
      if (V.dirty || V.anims.size || V.effects.length) {
        V.dirty = false;
        V.draw();
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  };
  V.resize = function () {
    V.dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = Math.round(V.WIDTH * V.zoom), h = Math.round(V.HEIGHT * V.zoom);
    V.canvas.style.width = w + 'px';
    V.canvas.style.height = h + 'px';
    V.canvas.width = Math.round(w * V.dpr);
    V.canvas.height = Math.round(h * V.dpr);
    V.bgKey = '';
    V.dirty = true;
  };
  V.setZoom = function (z) {
    V.zoom = Math.max(0.45, Math.min(2.5, z));
    V.resize();
  };
  V.clientToLogical = function (cx, cy) {
    const r = V.canvas.getBoundingClientRect();
    return { x: ((cx - r.left) / r.width) * V.WIDTH, y: ((cy - r.top) / r.height) * V.HEIGHT };
  };
  V.logicalToClient = function (x, y) {
    const r = V.canvas.getBoundingClientRect();
    return { x: r.left + (x / V.WIDTH) * r.width, y: r.top + (y / V.HEIGHT) * r.height };
  };

  // ------------------------------------------------------------ statik katman
  function terrainColor(h) {
    if (h.terrain === 'forest') return C.forestTR;
    if (h.terrain === 'hills') return C.hillsTR;
    if (h.terrain === 'mountain') return C.mountain;
    return C.clearTR;
  }
  function smoothLine(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
  }
  function haloText(ctx, text, x, y, font, color, halo, align) {
    ctx.font = font;
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = halo || 'rgba(255,250,235,0.9)';
    ctx.lineWidth = 3;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function drawStatic(ctx, state) {
    const map = O.MAP;
    ctx.fillStyle = C.sea;
    ctx.fillRect(0, 0, V.WIDTH, V.HEIGHT);
    // deniz dokusu
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    for (let y = 8; y < V.HEIGHT; y += 9) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(V.WIDTH, y); ctx.stroke();
    }

    for (const h of map.hexes) {
      if (h.terrain === 'sea') continue;
      const p = V.hexXY(h.i);
      hexPath(ctx, p.x, p.y, PX + 0.6);
      ctx.fillStyle = h.terrain === 'sba' ? C.anadolu : terrainColor(h);
      ctx.fill();
    }
    // arazi dokuları
    for (const h of map.hexes) {
      const p = V.hexXY(h.i);
      if (h.terrain === 'forest') {
        ctx.fillStyle = 'rgba(60,95,45,0.55)';
        for (const o of [[-7, -5], [5, -7], [-2, 3], [8, 4], [-9, 7]]) {
          ctx.beginPath();
          ctx.moveTo(p.x + o[0], p.y + o[1] - 4);
          ctx.lineTo(p.x + o[0] + 3, p.y + o[1] + 2);
          ctx.lineTo(p.x + o[0] - 3, p.y + o[1] + 2);
          ctx.closePath();
          ctx.fill();
        }
      } else if (h.terrain === 'hills') {
        ctx.strokeStyle = 'rgba(125,95,45,0.55)';
        ctx.lineWidth = 1.2;
        for (const o of [[-6, -3], [5, 4], [-3, 8]]) {
          ctx.beginPath();
          ctx.arc(p.x + o[0], p.y + o[1] + 3, 4.5, Math.PI * 1.15, Math.PI * 1.85);
          ctx.stroke();
        }
      } else if (h.terrain === 'mountain') {
        ctx.fillStyle = 'rgba(95,70,40,0.55)';
        for (const o of [[-6, 2], [5, -3], [2, 8]]) {
          ctx.beginPath();
          ctx.moveTo(p.x + o[0] - 6, p.y + o[1] + 4);
          ctx.lineTo(p.x + o[0], p.y + o[1] - 5);
          ctx.lineTo(p.x + o[0] + 6, p.y + o[1] + 4);
          ctx.closePath();
          ctx.fill();
        }
      } else if (h.terrain === 'sba') {
        ctx.strokeStyle = C.anadoluHatch;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x - 10, p.y + 6); ctx.lineTo(p.x + 6, p.y - 10);
        ctx.moveTo(p.x - 4, p.y + 12); ctx.lineTo(p.x + 12, p.y - 4);
        ctx.stroke();
      }
    }
    // kontrol katmanı
    for (const h of map.hexes) {
      if (h.terrain === 'sea' || h.terrain === 'sba') continue;
      const own = state ? state.owner[h.i] : null;
      if (!own) continue;
      const p = V.hexXY(h.i);
      // Türk bölgeleri her zaman hafif kırmızı; el değiştiren yerler taralı
      if (h.enclave && own === 'TR') {
        hexPath(ctx, p.x, p.y, PX);
        ctx.fillStyle = 'rgba(179,38,46,0.12)';
        ctx.fill();
      }
      const orig = h.enclave ? 'TR' : 'GR';
      if (own === orig) continue;
      hexPath(ctx, p.x, p.y, PX);
      ctx.fillStyle = own === 'GR' ? 'rgba(63,102,150,0.28)' : C.trCtrl;
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = own === 'GR' ? 'rgba(30,60,110,0.25)' : 'rgba(150,20,30,0.2)';
      ctx.lineWidth = 1;
      for (let k = -PX * 2; k < PX * 2; k += 5) {
        ctx.beginPath(); ctx.moveTo(p.x + k, p.y - PX); ctx.lineTo(p.x + k + PX * 2, p.y + PX); ctx.stroke();
      }
      ctx.restore();
    }
    // tahkimat altıgenleri
    for (const h of map.hexes) {
      if (!h.fort) continue;
      const p = V.hexXY(h.i);
      hexPath(ctx, p.x, p.y, PX - 2.5);
      ctx.strokeStyle = h.fort === 2 ? 'rgba(58,46,34,0.55)' : 'rgba(58,46,34,0.35)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 2]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // ızgara
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 0.8;
    for (const h of map.hexes) {
      if (h.terrain === 'sea' || h.terrain === 'sba') continue;
      const p = V.hexXY(h.i);
      hexPath(ctx, p.x, p.y, PX);
      ctx.stroke();
    }
    // kıyı çizgisi ve sınırlar
    for (const h of map.hexes) {
      const land = h.terrain !== 'sea';
      if (!land) continue;
      const p = V.hexXY(h.i);
      for (let d = 0; d < 6; d++) {
        const ni = h.dirNbrs[d];
        const n = ni >= 0 ? map.hexes[ni] : null;
        let style = null, width = 0, dash = null;
        if (n && n.terrain === 'sea') { style = C.coast; width = 1.6; }
        else if (h.enclave && n && n.terrain !== 'sea' && n.enclave !== h.enclave) {
          style = C.border; width = 2.4; dash = [5, 3];
        } else if (h.terrain !== 'sba' && n && n.terrain === 'sba') { style = '#6b6252'; width = 1.6; dash = [2, 2]; }
        if (!style) continue;
        const e = edge(p.x, p.y, d);
        ctx.strokeStyle = style;
        ctx.lineWidth = width;
        ctx.setLineDash(dash || []);
        ctx.beginPath(); ctx.moveTo(e[0][0], e[0][1]); ctx.lineTo(e[1][0], e[1][1]); ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    // çıkarma plajı
    for (const h of map.hexes) {
      if (!h.beach) continue;
      const p = V.hexXY(h.i);
      ctx.strokeStyle = '#8e1b1b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x - 6, p.y - PX + 2); ctx.lineTo(p.x, p.y - PX + 9); ctx.lineTo(p.x + 6, p.y - PX + 2);
      ctx.stroke();
    }
    // dekoratif etiketler
    for (const l of G.GEO.LABELS) {
      const p = V.llXY(l.lat, l.lon);
      const st = {
        country: ['700 15px Georgia, serif', 'rgba(70,60,45,0.55)'],
        'country-small': ['700 11px Georgia, serif', 'rgba(70,60,45,0.6)'],
        sea: ['italic 600 14px Georgia, serif', 'rgba(40,75,105,0.65)'],
        'sea-small': ['italic 600 10px Georgia, serif', 'rgba(40,75,105,0.7)'],
        land: ['700 16px Georgia, serif', 'rgba(110,90,55,0.45)'],
        terrain: ['italic 600 10px Georgia, serif', 'rgba(55,80,40,0.75)'],
        river: ['italic 600 9px Georgia, serif', 'rgba(40,90,140,0.9)'],
        strait: ['italic 700 8.5px Georgia, serif', 'rgba(30,65,100,0.85)'],
        sba: ['italic 600 9px system-ui, sans-serif', 'rgba(80,70,50,0.8)'],
        beach: ['800 9px system-ui, sans-serif', '#8e1b1b'],
      }[l.kind];
      if (l.rot) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((l.rot * Math.PI) / 180);
        ctx.font = st[0];
        ctx.fillStyle = st[1];
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(l.text, 0, 0);
        ctx.restore();
        continue;
      }
      ctx.font = st[0];
      ctx.fillStyle = st[1];
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (l.kind === 'country' || l.kind === 'land') {
        const spaced = l.text.split('').join(' ');
        ctx.fillText(spaced, p.x, p.y);
      } else ctx.fillText(l.text, p.x, p.y);
      if (l.sub) { ctx.font = 'italic 9px Georgia, serif'; ctx.fillText(l.sub, p.x, p.y + 11); }
    }
    // şehirler
    for (const c of map.cities) {
      const p = V.hexXY(c.hex);
      const own = state ? state.owner[c.hex] : null;
      const r = c.major ? 6 : c.vp >= 2 ? 4.2 : c.vp >= 1 ? 3.4 : 2.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y - 8, r, 0, Math.PI * 2);
      ctx.fillStyle = own === 'TR' ? '#b3262e' : '#2f4b73';
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = '#fffaf0';
      ctx.stroke();
      if (c.port) {
        ctx.fillStyle = '#fffaf0';
        ctx.font = '700 6px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('⚓', p.x, p.y - 8);
      }
      const label = c.name + (c.vp ? ' ' + c.vp : '');
      const font = c.major ? '800 12px system-ui, sans-serif' : c.vp >= 2 ? '700 10px system-ui, sans-serif' : c.vp ? '600 9px system-ui, sans-serif' : '500 8.5px system-ui, sans-serif';
      haloText(ctx, label, p.x, p.y - 8 - r - 6, font, C.label);
    }
  }

  // ------------------------------------------------------------ birlikler
  function drawSymbol(ctx, sym, x, y, w, h, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x - w / 2, y - h / 2, w, h);
    const l = x - w / 2, r = x + w / 2, t = y - h / 2, b = y + h / 2;
    ctx.beginPath();
    if (sym === 'inf' || sym === 'mech' || sym === 'mtn' || sym === 'gar' || sym === 'para') {
      ctx.moveTo(l, t); ctx.lineTo(r, b); ctx.moveTo(r, t); ctx.lineTo(l, b);
    }
    if (sym === 'cav') { ctx.moveTo(l, b); ctx.lineTo(r, t); }
    ctx.stroke();
    if (sym === 'arm' || sym === 'mech') {
      ctx.beginPath();
      ctx.ellipse(x, y, w * 0.33, h * 0.3, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (sym === 'mtn') {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(x - 3, b); ctx.lineTo(x, b - 3.5); ctx.lineTo(x + 3, b); ctx.closePath(); ctx.fill();
    }
    if (sym === 'para') {
      ctx.beginPath();
      ctx.arc(x, t, w * 0.28, Math.PI, 0);
      ctx.stroke();
    }
    if (sym === 'gar') {
      ctx.strokeRect(l - 2, t - 2, w + 4, h + 4);
    }
  }

  V.drawCounter = function (ctx, state, u, x, y, opts) {
    const T = O.UNIT_TYPES[u.type];
    const nat = O.NATION[u.nat];
    const w = 30, h = 25;
    ctx.save();
    if (opts.dim) ctx.globalAlpha = 0.6;
    // gölge
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x - w / 2 + 1.5, y - h / 2 + 1.5, w, h);
    ctx.fillStyle = nat.fill;
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.lineWidth = 1;
    ctx.strokeStyle = nat.edge;
    ctx.strokeRect(x - w / 2 + 0.5, y - h / 2 + 0.5, w - 1, h - 1);
    drawSymbol(ctx, T.sym, x - 3, y - 5, 15, 9, nat.fg);
    // kademe noktaları
    for (let k = 0; k < T.steps; k++) {
      ctx.beginPath();
      ctx.arc(x + w / 2 - 4, y - h / 2 + 4.5 + k * 5, 1.7, 0, Math.PI * 2);
      ctx.fillStyle = k < u.steps ? nat.fg : 'rgba(0,0,0,0.35)';
      ctx.fill();
    }
    // Karton pul gibi tam güç değerleri; hasar sağdaki kademe noktalarından okunur
    ctx.fillStyle = nat.fg;
    ctx.font = '700 8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(T.atk + '-' + T.def + '-' + (T.static ? '0' : T.mp), x - 2, y + 7.5);
    // mevzi
    if (u.entrench) {
      ctx.fillStyle = '#7a5a2e';
      for (let k = 0; k < u.entrench; k++) ctx.fillRect(x - w / 2 + 1 + k * 7, y + h / 2 + 1, 6, 2.5);
    }
    if (u.disrupted) {
      ctx.strokeStyle = '#ff9b21';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 2]);
      ctx.strokeRect(x - w / 2 - 1.5, y - h / 2 - 1.5, w + 3, h + 3);
      ctx.setLineDash([]);
    }
    if (!u.inSupply) {
      ctx.fillStyle = '#ffd400';
      ctx.beginPath(); ctx.arc(x - w / 2 + 1, y - h / 2 + 1, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.fillStyle = '#000'; ctx.font = '800 7px system-ui'; ctx.fillText('!', x - w / 2 + 1, y - h / 2 + 1.5);
    }
    ctx.restore();
    if (opts.selected) {
      ctx.strokeStyle = C.select;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(x - w / 2 - 2.5, y - h / 2 - 2.5, w + 5, h + 5);
    }
    if (opts.target) {
      ctx.strokeStyle = C.target;
      ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2); ctx.stroke();
    }
  };

  // ------------------------------------------------------------ çizim döngüsü
  V.draw = function () {
    const ctx = V.ctx, state = V.state, ui = V.ui || {};
    const k = V.zoom * V.dpr;
    const key = (state ? state.ownerVer : 'x') + '|' + V.zoom + '|' + V.dpr + '|' + (state ? state.seed : '');
    if (V.bgKey !== key) {
      V.bg.width = V.canvas.width;
      V.bg.height = V.canvas.height;
      const b = V.bg.getContext('2d');
      b.setTransform(k, 0, 0, k, 0, 0);
      drawStatic(b, state);
      V.bgKey = key;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(V.bg, 0, 0);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    if (!state) return;
    const R = O.Rules;

    // konuşlanma bölgesi
    if (state.phase === 'deploy' && ui.sel) {
      for (const h of O.MAP.hexes) {
        if (!R.canDeployTo(state, ui.sel, h.i)) continue;
        const p = V.hexXY(h.i);
        hexPath(ctx, p.x, p.y, PX - 1);
        ctx.fillStyle = C.deploy;
        ctx.fill();
      }
    }
    // erişilebilir altıgenler
    if (ui.reach && ui.sel) {
      for (const i of ui.reach.dests) {
        const p = V.hexXY(i);
        hexPath(ctx, p.x, p.y, PX - 2);
        ctx.fillStyle = C.reach;
        ctx.fill();
        ctx.strokeStyle = C.reachEdge;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      // yol önizlemesi
      if (ui.hover >= 0 && ui.reach.dests.has(ui.hover)) {
        const path = R.path(ui.reach, ui.hover);
        ctx.strokeStyle = 'rgba(30,30,30,0.75)';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        path.forEach(function (i, n) { const p = V.hexXY(i); if (n) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
        ctx.stroke();
        ctx.setLineDash([]);
        const p = V.hexXY(ui.hover);
        ctx.fillStyle = 'rgba(30,30,30,0.8)';
        ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
      }
    }
    // seçili / üzerinde
    if (ui.hover >= 0) {
      const p = V.hexXY(ui.hover);
      hexPath(ctx, p.x, p.y, PX - 1);
      ctx.strokeStyle = 'rgba(20,20,20,0.55)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    if (ui.lastCombatHex >= 0) {
      const p = V.hexXY(ui.lastCombatHex);
      hexPath(ctx, p.x, p.y, PX - 2);
      ctx.strokeStyle = 'rgba(224,50,43,0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    const targets = ui.targets || new Set();
    const now = performance.now();
    const order = state.units.slice().sort(function (a, b) { return (V.anims.has(a.id) ? 1 : 0) - (V.anims.has(b.id) ? 1 : 0); });
    for (const u of order) {
      let p = V.hexXY(u.hex);
      const an = V.anims.get(u.id);
      if (an) {
        const t = Math.min(1, (now - an.start) / an.dur);
        const segs = an.pts.length - 1;
        const f = t * segs;
        const s = Math.min(segs - 1, Math.floor(f));
        const local = f - s;
        const a = an.pts[s], b = an.pts[s + 1];
        p = { x: a.x + (b.x - a.x) * local, y: a.y + (b.y - a.y) * local };
        if (t >= 1) { V.anims.delete(u.id); an.done(); }
      }
      const isSel = ui.sel === u;
      const dim = state.phase === u.side && u.side === 'TR' && ui.isDone && ui.isDone(u);
      V.drawCounter(ctx, state, u, p.x, p.y, { selected: isSel, target: targets.has(u.id), dim: dim });
    }
    for (const [id, an] of V.anims) if (!R.unitById(state, id)) { V.anims.delete(id); an.done(); }

    // efektler
    V.effects = V.effects.filter(function (e) { return now - e.start < e.dur; });
    for (const e of V.effects) {
      const t = (now - e.start) / e.dur;
      if (e.kind === 'boom') {
        ctx.strokeStyle = 'rgba(255,120,30,' + (1 - t) + ')';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(e.x, e.y, 8 + t * 22, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.globalAlpha = Math.max(0, 1 - t * t);
        haloText(ctx, e.text, e.x, e.y - 18 - t * 18, '800 12px system-ui, sans-serif', e.color || '#111', 'rgba(255,255,255,0.95)');
        ctx.globalAlpha = 1;
      }
    }
  };

  V.animate = function (unitId, path, msPerHex) {
    if (!path || path.length < 2 || !msPerHex) { V.dirty = true; return Promise.resolve(); }
    return new Promise(function (resolve) {
      const prev = V.anims.get(unitId);
      if (prev) prev.done();
      V.anims.set(unitId, {
        pts: path.map(V.hexXY), start: performance.now(), dur: msPerHex * (path.length - 1), done: resolve,
      });
    });
  };
  V.effect = function (hex, text, color, kind) {
    const p = V.hexXY(hex);
    V.effects.push({ x: p.x, y: p.y, text: text, color: color, kind: kind || 'text', start: performance.now(), dur: kind === 'boom' ? 600 : 1600 });
  };
})(Oyun);
