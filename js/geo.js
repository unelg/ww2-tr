// Çakmak Hattı 1943 — coğrafya ve altıgen harita üretimi.
// Harita, gerçek enlem/boylam çizgilerinden (kıyılar, sınırlar, nehirler, tahkimat hatları)
// otomatik olarak altıgenlere dönüştürülür. Her altıgen ~9 km genişliğindedir.
var Oyun = globalThis.Oyun = globalThis.Oyun || {};
(function (O) {
  'use strict';

  const SQRT3 = Math.sqrt(3);
  const G = {
    LON0: 26.0, // haritanın batı kenarı
    LAT1: 42.1, // haritanın kuzey kenarı
    KM_LON: 84.0, // 41° enlemde 1° boylam ≈ 84 km
    KM_LAT: 111.0,
    HEX_W: 9.0, // altıgen genişliği (km), sivri tepeli altıgenler
    COLS: 30,
    ROWS: 30,
  };
  G.HEX_SIZE = G.HEX_W / SQRT3; // merkezden köşeye (km)
  G.ROW_H = 1.5 * G.HEX_SIZE;

  G.toKm = function (lat, lon) {
    return { x: (lon - G.LON0) * G.KM_LON, y: (G.LAT1 - lat) * G.KM_LAT };
  };
  G.toLatLon = function (x, y) {
    return { lat: G.LAT1 - y / G.KM_LAT, lon: G.LON0 + x / G.KM_LON };
  };
  G.hexCenterKm = function (c, r) {
    return { x: G.HEX_W * (c + 0.5 * (r & 1)) + G.HEX_W / 2, y: G.ROW_H * r + G.HEX_SIZE };
  };

  // "odd-r" ofset koordinatları; yön sırası: D, KD, KB, B, GB, GD
  const DIRS_EVEN = [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]];
  const DIRS_ODD = [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]];
  G.dirs = function (r) { return (r & 1) ? DIRS_ODD : DIRS_EVEN; };

  // ---------------------------------------------------------------------------
  // Coğrafi veriler — tüm noktalar [enlem, boylam]. Değerler yaklaşık, oyun içindir.
  // ---------------------------------------------------------------------------
  const GEO = {
    BLACK_SEA: [
      [42.2, 27.93], [42.05, 27.97], [41.98, 28.03], [41.88, 27.98], [41.75, 28.03],
      [41.63, 28.09], [41.5, 28.25], [41.35, 28.62], [41.27, 28.85], [41.22, 29.05],
      [41.18, 29.15], [41.17, 29.6], [42.2, 29.6],
    ],
    MARMARA: [
      [41.0, 29.02], [40.97, 28.85], [40.98, 28.7], [41.04, 28.45], [41.07, 28.25],
      [40.98, 28.0], [40.97, 27.8], [40.97, 27.5], [40.88, 27.4], [40.72, 27.22],
      [40.6, 27.08], [40.47, 26.95], [40.4, 26.75], [40.36, 26.72], [40.4, 27.0],
      [40.38, 27.3], [40.38, 27.75], [40.35, 27.97], [40.42, 28.4], [40.38, 28.88],
      [40.5, 29.05], [40.65, 29.25], [40.72, 29.6], [40.85, 29.6], [40.88, 29.15],
      [40.96, 29.05],
    ],
    // Ege Denizi ve Saros Körfezi
    AEGEAN: [
      [40.73, 25.8], [40.73, 26.03], [40.66, 26.2], [40.62, 26.45], [40.63, 26.65],
      [40.6, 26.8], [40.53, 26.72], [40.45, 26.5], [40.35, 26.36], [40.22, 26.2],
      [40.1, 26.08], [40.0, 26.03], [39.8, 26.0], [39.8, 25.8],
    ],
    // Boğazların Asya yakası (oyun dışı, sadece görsel)
    ANATOLIA: [
      [40.4, 26.8], [40.33, 26.74], [40.2, 26.56], [40.13, 26.5], [40.03, 26.33],
      [39.8, 26.25], [39.8, 29.7], [41.17, 29.7], [41.22, 29.1], [41.12, 29.06],
      [41.03, 29.03], [41.0, 29.02], [40.7, 28.5], [40.65, 27.6], [40.45, 27.0],
    ],
    FORESTS: [
      // Istranca (Yıldız) Dağları
      [
        [42.2, 27.2], [42.2, 27.95], [41.98, 28.02], [41.85, 27.98], [41.65, 28.08],
        [41.5, 28.25], [41.35, 28.62], [41.25, 28.62], [41.3, 28.25], [41.42, 28.0],
        [41.52, 27.75], [41.65, 27.5], [41.8, 27.3], [41.95, 27.15], [42.1, 27.1],
      ],
    ],
    HILLS: [
      // Sakar Dağı (Bulgaristan)
      [[42.2, 26.0], [42.2, 26.85], [41.95, 26.75], [41.85, 26.45], [41.9, 26.0]],
      // Ganos (Işıklar) Dağı
      [[40.93, 27.05], [40.96, 27.42], [40.85, 27.42], [40.62, 27.12], [40.6, 26.95], [40.75, 26.95]],
      // Koru Dağı
      [[40.82, 26.6], [40.8, 26.88], [40.62, 26.92], [40.64, 26.52]],
      // Gelibolu Yarımadası
      [[40.56, 26.45], [40.56, 26.9], [40.4, 26.9], [39.95, 26.4], [39.95, 25.95], [40.2, 25.95]],
    ],
    // Meriç (kuzeyden güneye) — aynı zamanda Yunan sınırı
    MERIC: [
      [41.78, 26.15], [41.72, 26.33], [41.67, 26.5], [41.6, 26.6], [41.45, 26.6],
      [41.3, 26.62], [41.15, 26.5], [41.0, 26.35], [40.9, 26.35], [40.78, 26.1],
      [40.72, 26.03],
    ],
    // Bulgar sınırı (batıdan doğuya)
    BG_BORDER: [
      [41.73, 26.15], [41.72, 26.33], [41.8, 26.6], [41.9, 27.0], [41.95, 27.35],
      [41.98, 27.8], [41.98, 28.03], [41.98, 28.3],
    ],
    ERGENE: [
      [41.3, 27.97], [41.2, 27.75], [41.17, 27.5], [41.3, 27.4], [41.33, 27.25],
      [41.27, 27.0], [41.25, 26.8], [41.2, 26.65], [41.08, 26.5], [40.98, 26.37],
    ],
    FORT_LINES: [
      {
        name: 'Çakmak Hattı', level: 2,
        pts: [
          [41.64, 28.06], [41.58, 27.82], [41.52, 27.62], [41.44, 27.45], [41.33, 27.3],
          [41.2, 27.12], [41.05, 26.98], [40.9, 26.9], [40.75, 26.9], [40.6, 26.86],
        ],
      },
      {
        name: 'Çatalca Hattı', level: 2,
        pts: [[41.38, 28.52], [41.26, 28.44], [41.14, 28.46], [41.04, 28.57]],
      },
      {
        name: 'Bolayır Hattı', level: 1,
        pts: [[40.56, 26.74], [40.47, 26.8]],
      },
    ],
    CITIES: [
      { name: 'İstanbul', lat: 41.02, lon: 28.96, vp: 10, country: 'TR', port: true, major: true },
      { name: 'Çatalca', lat: 41.143, lon: 28.461, vp: 3, country: 'TR' },
      { name: 'Gelibolu', lat: 40.41, lon: 26.67, vp: 3, country: 'TR', port: true },
      { name: 'Edirne', lat: 41.677, lon: 26.556, vp: 2, country: 'TR', fort: 1 },
      { name: 'Kırklareli', lat: 41.735, lon: 27.225, vp: 2, country: 'TR' },
      { name: 'Lüleburgaz', lat: 41.404, lon: 27.357, vp: 2, country: 'TR' },
      { name: 'Tekirdağ', lat: 40.98, lon: 27.511, vp: 2, country: 'TR', port: true },
      { name: 'Çorlu', lat: 41.159, lon: 27.8, vp: 2, country: 'TR' },
      { name: 'Eceabat', lat: 40.184, lon: 26.357, vp: 2, country: 'TR', port: true },
      { name: 'Babaeski', lat: 41.432, lon: 27.093, vp: 1, country: 'TR' },
      { name: 'Vize', lat: 41.573, lon: 27.766, vp: 1, country: 'TR' },
      { name: 'Saray', lat: 41.443, lon: 27.921, vp: 1, country: 'TR' },
      { name: 'Uzunköprü', lat: 41.267, lon: 26.687, vp: 1, country: 'TR' },
      { name: 'Hayrabolu', lat: 41.213, lon: 27.106, vp: 1, country: 'TR' },
      { name: 'Keşan', lat: 40.856, lon: 26.63, vp: 1, country: 'TR' },
      { name: 'Malkara', lat: 40.89, lon: 26.9, vp: 1, country: 'TR' },
      { name: 'Silivri', lat: 41.074, lon: 28.247, vp: 1, country: 'TR', port: true },
      { name: 'Kıyıköy', lat: 41.63, lon: 28.09, vp: 0, country: 'TR' },
      { name: 'Pınarhisar', lat: 41.622, lon: 27.52, vp: 0, country: 'TR' },
      { name: 'İpsala', lat: 40.92, lon: 26.38, vp: 0, country: 'TR' },
      { name: 'Enez', lat: 40.72, lon: 26.08, vp: 0, country: 'TR' },
      { name: 'Şarköy', lat: 40.61, lon: 27.11, vp: 0, country: 'TR' },
      { name: 'Çerkezköy', lat: 41.285, lon: 28.0, vp: 0, country: 'TR' },
      { name: 'Muratlı', lat: 41.17, lon: 27.5, vp: 0, country: 'TR' },
      // Sınır ötesi
      { name: 'Svilengrad', lat: 41.77, lon: 26.2, vp: 1, country: 'BG' },
      { name: 'Malko Tırnovo', lat: 41.98, lon: 27.53, vp: 1, country: 'BG' },
      { name: 'Topolovgrad', lat: 42.08, lon: 26.34, vp: 0, country: 'BG' },
      { name: 'Orestiada', lat: 41.5, lon: 26.52, vp: 1, country: 'GR' },
      { name: 'Dimetoka', lat: 41.35, lon: 26.5, vp: 1, country: 'GR' },
      { name: 'Sofulu', lat: 41.2, lon: 26.3, vp: 0, country: 'GR' },
    ],
    // Sadece süs: Asya yakasındaki yerleşimler
    DECOR_CITIES: [
      { name: 'Çanakkale', lat: 40.15, lon: 26.53 },
      { name: 'Lapseki', lat: 40.3, lon: 26.76 },
      { name: 'Bandırma', lat: 40.29, lon: 28.0 },
      { name: 'Bursa', lat: 40.19, lon: 29.06 },
    ],
    LABELS: [
      { text: 'BULGARİSTAN', lat: 42.04, lon: 26.75, kind: 'country' },
      { text: 'YUNANİSTAN', sub: '(Alman işgali)', lat: 41.08, lon: 26.13, kind: 'country-small' },
      { text: 'KARADENİZ', lat: 41.78, lon: 28.75, kind: 'sea' },
      { text: 'MARMARA DENİZİ', lat: 40.7, lon: 28.25, kind: 'sea' },
      { text: 'Saros Körfezi', lat: 40.62, lon: 26.3, kind: 'sea-small' },
      { text: 'Çanakkale Boğazı', lat: 40.21, lon: 26.5, kind: 'strait', rot: -38 },
      { text: 'İstanbul Boğazı', lat: 41.1, lon: 29.12, kind: 'strait', rot: -78 },
      { text: 'EGE DENİZİ', lat: 40.3, lon: 26.08, kind: 'sea-small' },
      { text: 'ANADOLU', lat: 40.12, lon: 28.0, kind: 'land' },
      { text: 'Istranca Dağları', lat: 41.79, lon: 27.72, kind: 'terrain' },
      { text: 'Ergene', lat: 41.13, lon: 27.38, kind: 'river' },
      { text: 'Meriç', lat: 41.45, lon: 26.68, kind: 'river' },
    ],
  };
  G.GEO = GEO;

  // ---------------------------------------------------------------------------
  // Geometri yardımcıları (km düzleminde)
  // ---------------------------------------------------------------------------
  function toKmList(pts) { return pts.map(function (p) { return G.toKm(p[0], p[1]); }); }

  function inPoly(p, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }
  function distSeg(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const x = a.x + t * dx, y = a.y + t * dy;
    return Math.hypot(p.x - x, p.y - y);
  }
  function distLine(p, line) {
    let d = Infinity;
    for (let i = 1; i < line.length; i++) d = Math.min(d, distSeg(p, line[i - 1], line[i]));
    return d;
  }
  // pts: [[k, v]...] k artan sırada; k için v'yi doğrusal ara değerle
  function interp(pts, k) {
    if (k <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (k <= pts[i][0]) {
        const a = pts[i - 1], b = pts[i];
        return a[1] + ((b[1] - a[1]) * (k - a[0])) / (b[0] - a[0]);
      }
    }
    return pts[pts.length - 1][1];
  }
  G.inPoly = inPoly;
  G.distLine = distLine;

  const MERIC_BY_LAT = GEO.MERIC.map(function (p) { return [p[0], p[1]]; }).reverse(); // enlem artan
  const BG_BY_LON = GEO.BG_BORDER.map(function (p) { return [p[1], p[0]]; }); // boylam artan

  G.countryAt = function (lat, lon) {
    if (lon < interp(MERIC_BY_LAT, lat)) return lat > 41.72 ? 'BG' : 'GR';
    if (lat > interp(BG_BY_LON, lon)) return 'BG';
    return 'TR';
  };

  // ---------------------------------------------------------------------------
  // Harita üretimi
  // ---------------------------------------------------------------------------
  G.buildMap = function () {
    const seas = [toKmList(GEO.BLACK_SEA), toKmList(GEO.MARMARA), toKmList(GEO.AEGEAN)];
    const anatolia = toKmList(GEO.ANATOLIA);
    const forests = GEO.FORESTS.map(toKmList);
    const hills = GEO.HILLS.map(toKmList);
    const rivers = [
      { name: 'Meriç', line: toKmList(GEO.MERIC) },
      { name: 'Ergene', line: toKmList(GEO.ERGENE) },
    ];
    const forts = GEO.FORT_LINES.map(function (f) {
      return { name: f.name, level: f.level, line: toKmList(f.pts) };
    });

    const hexes = [];
    for (let r = 0; r < G.ROWS; r++) {
      for (let c = 0; c < G.COLS; c++) {
        const k = G.hexCenterKm(c, r);
        const ll = G.toLatLon(k.x, k.y);
        let terrain, country = null;
        if (seas.some(function (p) { return inPoly(k, p); })) terrain = 'sea';
        else if (inPoly(k, anatolia)) terrain = 'anadolu';
        else {
          country = G.countryAt(ll.lat, ll.lon);
          terrain = 'clear';
          if (forests.some(function (p) { return inPoly(k, p); })) terrain = 'forest';
          else if (hills.some(function (p) { return inPoly(k, p); })) terrain = 'hills';
        }
        const q = c - (r - (r & 1)) / 2;
        hexes.push({
          i: hexes.length, c: c, r: r, q: q, s: -q - r, x: k.x, y: k.y, lat: ll.lat, lon: ll.lon,
          terrain: terrain, country: country, river: null, fort: 0, fortLine: null, city: null,
          near: null, nbrs: [], dirNbrs: [],
        });
      }
    }
    const idx = function (c, r) { return (c < 0 || r < 0 || c >= G.COLS || r >= G.ROWS) ? -1 : r * G.COLS + c; };
    const land = function (h) { return h.terrain !== 'sea' && h.terrain !== 'anadolu'; };

    for (const h of hexes) {
      h.dirNbrs = G.dirs(h.r).map(function (d) { return idx(h.c + d[0], h.r + d[1]); });
      h.nbrs = h.dirNbrs.filter(function (i) { return i >= 0; });
    }

    // Boğazlar: Trakya'ya komşu Anadolu altıgenleri suya çevrilir. Böylece Çanakkale ve
    // İstanbul boğazları haritada açık bir su yolu olarak görünür (gerçekte 1–7 km genişlikte).
    const strait = hexes.filter(function (h) {
      return h.terrain === 'anadolu' && h.nbrs.some(function (i) { return land(hexes[i]); });
    });
    for (const h of strait) { h.terrain = 'sea'; h.strait = true; }

    // Nehirler
    for (const h of hexes) {
      if (!land(h)) continue;
      for (const rv of rivers) {
        if (distLine(h, rv.line) < 4.4) { h.river = rv.name; break; }
      }
    }

    // Tahkimat hatları (yalnızca Türk toprağında)
    for (const f of forts) {
      for (const h of hexes) {
        if (!land(h) || h.country !== 'TR') continue;
        if (distLine(h, f.line) < 4.9 && f.level > h.fort) { h.fort = f.level; h.fortLine = f.name; }
      }
    }

    // Şehirler: en yakın uygun kara altıgenine yerleştir (önemli şehirler önce)
    const cities = GEO.CITIES.map(function (c) { return Object.assign({}, c); })
      .sort(function (a, b) { return (b.vp - a.vp) || (b.major ? 1 : 0) - (a.major ? 1 : 0); });
    for (const city of cities) {
      const k = G.toKm(city.lat, city.lon);
      let best = null, bd = Infinity;
      for (const h of hexes) {
        if (!land(h) || h.city || h.country !== city.country) continue;
        const d = Math.hypot(h.x - k.x, h.y - k.y);
        if (d < bd) { bd = d; best = h; }
      }
      if (!best) continue;
      best.city = city;
      city.hex = best.i;
      if (city.fort && city.fort > best.fort) { best.fort = city.fort; best.fortLine = city.name + ' Kalesi'; }
    }

    // Her kara altıgeni için en yakın yerleşim adı (ipucu kutusu için)
    const named = hexes.filter(function (h) { return h.city; });
    for (const h of hexes) {
      if (!land(h) || h.city) continue;
      let best = null, bd = Infinity;
      for (const n of named) {
        const d = Math.hypot(h.x - n.x, h.y - n.y);
        if (d < bd) { bd = d; best = n; }
      }
      if (best && bd < 26) h.near = best.city.name;
    }

    const byName = {};
    for (const c of cities) byName[c.name] = c;

    return {
      cols: G.COLS, rows: G.ROWS, hexes: hexes, cities: cities, cityByName: byName,
      rivers: rivers, forts: forts,
    };
  };

  O.Geo = G;
  O.MAP = G.buildMap();
})(Oyun);
