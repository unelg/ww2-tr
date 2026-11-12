// Kıbrıs 1974 — coğrafya ve altıgen harita üretimi.
// Kıyı çizgisi, dağlar ve yerleşimler yaklaşık enlem/boylamlardan ~4 km'lik altıgenlere çevrilir.
var Oyun = globalThis.Oyun = globalThis.Oyun || {};
(function (O) {
  'use strict';

  const SQRT3 = Math.sqrt(3);
  const G = {
    LON0: 32.2, LAT1: 35.76, KM_LON: 91.0, KM_LAT: 111.0,
    HEX_W: 4.0, COLS: 56, ROWS: 40,
  };
  G.HEX_SIZE = G.HEX_W / SQRT3;
  G.ROW_H = 1.5 * G.HEX_SIZE;
  G.toKm = function (lat, lon) { return { x: (lon - G.LON0) * G.KM_LON, y: (G.LAT1 - lat) * G.KM_LAT }; };
  G.toLatLon = function (x, y) { return { lat: G.LAT1 - y / G.KM_LAT, lon: G.LON0 + x / G.KM_LON }; };
  G.hexCenterKm = function (c, r) {
    return { x: G.HEX_W * (c + 0.5 * (r & 1)) + G.HEX_W / 2, y: G.ROW_H * r + G.HEX_SIZE };
  };
  const DIRS_EVEN = [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]];
  const DIRS_ODD = [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]];
  G.dirs = function (r) { return (r & 1) ? DIRS_ODD : DIRS_EVEN; };

  // Tüm noktalar [enlem, boylam]; değerler yaklaşıktır.
  const GEO = {
    // Ada kıyısı (saat yönünde, Arnavut Burnu'ndan başlayarak)
    ISLAND: [
      [35.10, 32.27], [35.05, 32.35], [35.04, 32.43], [35.08, 32.50], [35.15, 32.56],
      [35.17, 32.63], [35.18, 32.70], [35.15, 32.78], [35.13, 32.84], [35.17, 32.91],
      [35.23, 32.94], [35.30, 32.93], [35.37, 32.92], [35.40, 32.94], [35.37, 33.03],
      [35.36, 33.12], [35.35, 33.20], [35.345, 33.26], [35.345, 33.32], [35.35, 33.40],
      [35.35, 33.50], [35.37, 33.62], [35.38, 33.75], [35.40, 33.85], [35.42, 33.95],
      [35.46, 34.05], [35.52, 34.17], [35.57, 34.28], [35.62, 34.40], [35.66, 34.50],
      [35.70, 34.59], [35.67, 34.60], [35.62, 34.50], [35.56, 34.38], [35.50, 34.27],
      [35.44, 34.15], [35.37, 34.05], [35.31, 33.96], [35.25, 33.92], [35.17, 33.93],
      [35.12, 33.955], [35.06, 33.98], [35.02, 34.05], [34.97, 34.08], [34.98, 33.98],
      [34.97, 33.85], [34.95, 33.75], [34.92, 33.65], [34.85, 33.62], [34.81, 33.60],
      [34.75, 33.47], [34.72, 33.35], [34.70, 33.20], [34.68, 33.07], [34.64, 33.02],
      [34.565, 33.04], [34.56, 32.95], [34.62, 32.88], [34.66, 32.78], [34.66, 32.65],
      [34.70, 32.55], [34.75, 32.45], [34.77, 32.41], [34.85, 32.36], [34.93, 32.33],
      [35.00, 32.29], [35.06, 32.27],
    ],
    // Beşparmak (Girne) Dağları: kuzey kıyısına paralel dar ve sarp sıradağ
    MOUNTAINS: [[
      [35.36, 32.97], [35.345, 33.10], [35.33, 33.20], [35.325, 33.30], [35.325, 33.42],
      [35.335, 33.55], [35.35, 33.70], [35.37, 33.83], [35.40, 33.97], [35.37, 33.98],
      [35.34, 33.85], [35.315, 33.70], [35.295, 33.55], [35.285, 33.42], [35.285, 33.30],
      [35.295, 33.18], [35.31, 33.08], [35.33, 32.97],
    ]],
    // Trodos Dağları
    FORESTS: [[
      [35.10, 32.50], [35.09, 32.75], [35.05, 32.98], [34.97, 33.18], [34.87, 33.22],
      [34.78, 33.12], [34.74, 32.90], [34.78, 32.65], [34.86, 32.50], [34.97, 32.42],
    ]],
    HILLS: [
      // Karpaz yarımadasının sırtı
      [[35.47, 34.05], [35.58, 34.30], [35.66, 34.52], [35.62, 34.52], [35.52, 34.28], [35.42, 34.05]],
      // Akamas ve Baf tepeleri
      [[35.08, 32.30], [35.02, 32.50], [34.86, 32.52], [34.80, 32.45], [34.95, 32.33]],
    ],
    // Dağlarda yol geçen geçitler (tepelik sayılır)
    PASSES: [[35.30, 33.35], [35.31, 33.08], [35.32, 33.52]],
    // İngiliz egemen üs bölgeleri (oyun dışı)
    SBA: [
      [[34.64, 32.88], [34.64, 33.05], [34.55, 33.05], [34.55, 32.88]], // Ağrotur
      [[35.03, 33.68], [35.03, 33.82], [34.97, 33.84], [34.97, 33.66]], // Dikelya
    ],
    // Kıbrıs Türk bölgeleri (Temmuz 1974 başı, yaklaşık)
    ENCLAVES: [
      { name: 'Lefkoşa', pts: [[35.175, 33.30], [35.175, 33.42], [35.215, 33.43], [35.27, 33.40], [35.28, 33.33], [35.255, 33.26], [35.21, 33.27]] },
      { name: 'Lefke', pts: [[35.14, 32.82], [35.13, 32.88], [35.095, 32.88], [35.095, 32.82]] },
      { name: 'Erenköy', pts: [[35.18, 32.60], [35.18, 32.65], [35.155, 32.65], [35.155, 32.60]] },
    ],
    // Çıkarma plajı (Pentemili) — buradan kuzeye deniz
    BEACH: [[35.34, 33.25], [35.345, 33.205]],
    CITIES: [
      { name: 'Lefkoşa', lat: 35.155, lon: 33.37, vp: 0, major: true, side: 'GR', port: false },
      { name: 'Lefkoşa Türk kesimi', lat: 35.19, lon: 33.36, vp: 3, side: 'TR', hold: true, walls: 'Lefkoşa surları' },
      { name: 'Girne', lat: 35.34, lon: 33.32, vp: 4, side: 'GR', port: true, stage: 1 },
      { name: 'Mağusa Suriçi', lat: 35.125, lon: 33.94, vp: 3, side: 'TR', port: true, hold: true, walls: 'Mağusa surları' },
      { name: 'Maraş', lat: 35.095, lon: 33.955, vp: 1, side: 'GR', stage: 2 },
      { name: 'Güzelyurt', lat: 35.20, lon: 32.99, vp: 3, side: 'GR', stage: 2 },
      { name: 'Lefke', lat: 35.115, lon: 32.85, vp: 2, side: 'TR', hold: true },
      { name: 'Erenköy', lat: 35.17, lon: 32.625, vp: 1, side: 'TR', hold: true },
      { name: 'Lapta', lat: 35.335, lon: 33.165, vp: 1, side: 'GR', stage: 1 },
      { name: 'Değirmenlik', lat: 35.25, lon: 33.48, vp: 1, side: 'GR', stage: 2 },
      { name: 'Geçitkale', lat: 35.25, lon: 33.73, vp: 1, side: 'GR', stage: 2 },
      { name: 'İskele', lat: 35.29, lon: 33.89, vp: 1, side: 'GR', stage: 2 },
      { name: 'Kantara', lat: 35.40, lon: 33.92, vp: 1, side: 'GR', stage: 2 },
      { name: 'Larnaka', lat: 34.92, lon: 33.62, vp: 0, side: 'GR', port: true },
      { name: 'Limasol', lat: 34.69, lon: 33.04, vp: 0, side: 'GR', port: true },
      { name: 'Baf', lat: 34.77, lon: 32.43, vp: 0, side: 'GR', port: true },
      { name: 'Polis', lat: 35.035, lon: 32.43, vp: 0, side: 'GR' },
      { name: 'Dipkarpaz', lat: 35.60, lon: 34.38, vp: 0, side: 'GR' },
      { name: 'Yenierenköy', lat: 35.53, lon: 34.19, vp: 0, side: 'GR' },
      { name: 'Akdoğan', lat: 35.13, lon: 33.63, vp: 0, side: 'GR' },
      { name: 'Dali', lat: 35.02, lon: 33.42, vp: 0, side: 'GR' },
      { name: 'Trodos', lat: 34.94, lon: 32.87, vp: 0, side: 'GR' },
      { name: 'Lefkoşa havaalanı', lat: 35.155, lon: 33.27, vp: 0, side: 'GR', airport: true },
    ],
    LABELS: [
      { text: 'AKDENİZ', lat: 35.62, lon: 33.15, kind: 'sea' },
      { text: 'AKDENİZ', lat: 34.62, lon: 33.75, kind: 'sea' },
      { text: 'Güzelyurt Körfezi', lat: 35.28, lon: 32.80, kind: 'sea-small' },
      { text: 'Mağusa Körfezi', lat: 35.22, lon: 34.10, kind: 'sea-small' },
      { text: 'BEŞPARMAK DAĞLARI', lat: 35.355, lon: 33.62, kind: 'terrain', rot: 8 },
      { text: 'TRODOS DAĞLARI', lat: 34.90, lon: 32.85, kind: 'terrain' },
      { text: 'MESARYA OVASI', lat: 35.18, lon: 33.68, kind: 'land' },
      { text: 'KARPAZ', lat: 35.57, lon: 34.33, kind: 'terrain', rot: -30 },
      { text: 'Ağrotur (İngiliz üssü)', lat: 34.535, lon: 32.96, kind: 'sba' },
      { text: 'Dikelya (İngiliz üssü)', lat: 35.05, lon: 33.75, kind: 'sba' },
      { text: 'Pentemili', lat: 35.365, lon: 33.235, kind: 'beach' },
    ],
  };
  G.GEO = GEO;

  function toKmList(pts) { return pts.map(function (p) { return G.toKm(p[0], p[1]); }); }
  function inPoly(p, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }
  G.inPoly = inPoly;

  G.buildMap = function () {
    const island = toKmList(GEO.ISLAND);
    const mountains = GEO.MOUNTAINS.map(toKmList);
    const forests = GEO.FORESTS.map(toKmList);
    const hills = GEO.HILLS.map(toKmList);
    const sbas = GEO.SBA.map(toKmList);
    const enclaves = GEO.ENCLAVES.map(function (e) { return { name: e.name, poly: toKmList(e.pts) }; });

    const hexes = [];
    for (let r = 0; r < G.ROWS; r++) {
      for (let c = 0; c < G.COLS; c++) {
        const k = G.hexCenterKm(c, r);
        const ll = G.toLatLon(k.x, k.y);
        let terrain = 'sea';
        if (inPoly(k, island)) {
          terrain = 'clear';
          if (sbas.some(function (p) { return inPoly(k, p); })) terrain = 'sba';
          else if (mountains.some(function (p) { return inPoly(k, p); })) terrain = 'mountain';
          else if (forests.some(function (p) { return inPoly(k, p); })) terrain = 'forest';
          else if (hills.some(function (p) { return inPoly(k, p); })) terrain = 'hills';
        }
        const q = c - (r - (r & 1)) / 2;
        hexes.push({
          i: hexes.length, c: c, r: r, q: q, s: -q - r, x: k.x, y: k.y, lat: ll.lat, lon: ll.lon,
          terrain: terrain, country: terrain === 'sea' ? null : 'CY', enclave: null, beach: false,
          coastal: false, river: null, fort: 0, fortLine: null, city: null, near: null, nbrs: [], dirNbrs: [],
        });
      }
    }
    const idx = function (c, r) { return (c < 0 || r < 0 || c >= G.COLS || r >= G.ROWS) ? -1 : r * G.COLS + c; };
    const land = function (h) { return h.terrain !== 'sea' && h.terrain !== 'sba'; };
    for (const h of hexes) {
      h.dirNbrs = G.dirs(h.r).map(function (d) { return idx(h.c + d[0], h.r + d[1]); });
      h.nbrs = h.dirNbrs.filter(function (i) { return i >= 0; });
    }
    for (const h of hexes) {
      if (land(h)) h.coastal = h.nbrs.some(function (i) { return hexes[i].terrain === 'sea'; }) || h.nbrs.length < 6;
    }
    const nearestLand = function (lat, lon, pred) {
      const k = G.toKm(lat, lon);
      let best = null, bd = Infinity;
      for (const h of hexes) {
        if (!land(h) || (pred && !pred(h))) continue;
        const d = Math.hypot(h.x - k.x, h.y - k.y);
        if (d < bd) { bd = d; best = h; }
      }
      return best;
    };
    // Geçitler
    for (const p of GEO.PASSES) {
      const h = nearestLand(p[0], p[1], function (x) { return x.terrain === 'mountain'; });
      if (h) { h.terrain = 'hills'; h.pass = true; }
    }
    // Türk bölgeleri
    for (const e of enclaves) {
      let any = false;
      for (const h of hexes) if (land(h) && inPoly(h, e.poly)) { h.enclave = e.name; any = true; }
      if (!any) {
        const c = e.poly.reduce(function (a, p) { return { x: a.x + p.x / e.poly.length, y: a.y + p.y / e.poly.length }; }, { x: 0, y: 0 });
        const ll = G.toLatLon(c.x, c.y);
        nearestLand(ll.lat, ll.lon).enclave = e.name;
      }
    }
    // Türk bölgelerinin kenar altıgenleri tahkimatlıdır (1963'ten beri tutulan mevziler)
    const fortifyEnclaves = function () {
      for (const h of hexes) {
        if (!h.enclave) continue;
        if (h.nbrs.some(function (i) { return land(hexes[i]) && hexes[i].enclave !== h.enclave; })) {
          h.fort = 1; h.fortLine = h.enclave === 'Mağusa' ? 'Mağusa surları' : 'Mücahit mevzileri';
        }
      }
    };
    // Çıkarma plajı
    for (const b of GEO.BEACH) {
      const h = nearestLand(b[0], b[1], function (x) { return x.coastal; });
      if (h) h.beach = true;
    }
    // Şehirler (önemliler önce)
    const cities = GEO.CITIES.map(function (c) { return Object.assign({}, c); })
      .sort(function (a, b) { return (b.vp - a.vp) || ((b.major ? 1 : 0) - (a.major ? 1 : 0)); });
    for (const city of cities) {
      const pred = function (h) {
        if (h.city) return false;
        if (city.side === 'TR' && city.name !== 'Mağusa Suriçi') return !!h.enclave;
        if (city.side === 'GR' && h.enclave && city.name !== 'Maraş') return false;
        return true;
      };
      let h = nearestLand(city.lat, city.lon, pred);
      if (city.name === 'Mağusa Suriçi') { h.enclave = 'Mağusa'; }
      h.city = city;
      city.hex = h.i;
      if (city.walls) { h.fort = 2; h.fortLine = city.walls; }
    }
    fortifyEnclaves();
    // Surlu şehirler kenar mevzilerinden güçlüdür
    for (const c of cities) if (c.walls) { hexes[c.hex].fort = 2; hexes[c.hex].fortLine = c.walls; }
    const named = hexes.filter(function (h) { return h.city; });
    for (const h of hexes) {
      if (!land(h) || h.city) continue;
      let best = null, bd = Infinity;
      for (const n of named) {
        const d = Math.hypot(h.x - n.x, h.y - n.y);
        if (d < bd) { bd = d; best = n; }
      }
      if (best && bd < 14) h.near = best.city.name;
    }
    const byName = {};
    for (const c of cities) byName[c.name] = c;
    return { cols: G.COLS, rows: G.ROWS, hexes: hexes, cities: cities, cityByName: byName, rivers: [], forts: [] };
  };

  O.Geo = G;
  O.MAP = G.buildMap();
})(Oyun);
