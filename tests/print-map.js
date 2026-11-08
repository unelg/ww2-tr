// Haritayı ASCII olarak yazdırır (geliştirme amaçlı).
const vm = require('vm'), fs = require('fs'), path = require('path');
const ctx = vm.createContext({ console });
for (const f of ['geo.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
const M = vm.runInContext('Oyun.MAP', ctx);
const ch = (h) => {
  if (h.city) return h.city.vp >= 3 ? '@' : (h.city.country === 'TR' ? 'o' : 'x');
  if (h.terrain === 'sea') return '~';
  if (h.terrain === 'anadolu') return ':';
  if (h.fort) return h.fort === 2 ? '#' : '+';
  if (h.river) return '=';
  const base = { clear: h.country === 'TR' ? '.' : ',', forest: 'f', hills: 'h' }[h.terrain];
  return h.country === 'TR' ? base : base.toUpperCase();
};
for (let r = 0; r < M.rows; r++) {
  let s = (r & 1) ? ' ' : '';
  for (let c = 0; c < M.cols; c++) s += ch(M.hexes[r * M.cols + c]) + ' ';
  console.log(String(r).padStart(2) + ' ' + s);
}
for (const c of M.cities) if (c.hex == null) console.log('YERLEŞMEDİ', c.name);
console.log(M.cities.map(c => `${c.name}:${M.hexes[c.hex].c},${M.hexes[c.hex].r}`).join(' '));
