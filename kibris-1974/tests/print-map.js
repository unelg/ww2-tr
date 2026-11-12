// Kıbrıs haritasının ASCII önizlemesi (geliştirme amaçlı).
const vm = require('vm'), fs = require('fs'), path = require('path');
const ctx = vm.createContext({ console });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'geo.js'), 'utf8'), ctx, { filename: 'geo.js' });
const M = vm.runInContext('Oyun.MAP', ctx);
const ch = (h) => {
  if (h.city) return h.city.side === 'TR' ? 'T' : (h.city.vp ? 'C' : 'c');
  if (h.beach) return 'B';
  if (h.terrain === 'sea') return '~';
  if (h.terrain === 'sba') return 'x';
  if (h.enclave) return h.fort ? '#' : 'e';
  if (h.pass) return 'p';
  return { clear: '.', forest: 'f', hills: 'h', mountain: 'M' }[h.terrain];
};
for (let r = 0; r < M.rows; r++) {
  let s = (r & 1) ? ' ' : '';
  for (let c = 0; c < M.cols; c++) s += ch(M.hexes[r * M.cols + c]) + ' ';
  console.log(String(r).padStart(2) + ' ' + s);
}
console.log(M.cities.map(c => `${c.name}:${M.hexes[c.hex].c},${M.hexes[c.hex].r}`).join(' '));
