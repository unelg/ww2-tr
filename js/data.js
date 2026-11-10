// Çakmak Hattı 1943 — birlik türleri, savaş düzeni, takviyeler.
// Birlik numaraları ve konuşlanmalar kurgusaldır; senaryo alternatif tarihtir.
var Oyun = globalThis.Oyun = globalThis.Oyun || {};
(function (O) {
  'use strict';

  // Oyunun sürümü: arayüzde, kayıtlarda ve ortak skor tablosunda görünür
  O.VERSION = '0.4.0';

  // atk: saldırı, def: savunma, mp: hareket puanı, steps: kademe (can) sayısı
  O.UNIT_TYPES = {
    tr_inf: { side: 'TR', nat: 'TR', label: 'Piyade Tümeni', atk: 3, def: 4, mp: 4, steps: 3, sym: 'inf' },
    tr_cav: { side: 'TR', nat: 'TR', label: 'Süvari Tümeni', atk: 2, def: 2, mp: 6, steps: 2, sym: 'cav' },
    // Türk zırhlıları: 1940'ta Fransa'dan gelen R35'ler, 1930'larda SSCB'den alınan T-26'lar,
    // 1943'te İngiltere'den gelmeye başlayan Valentine'ler
    tr_r35: { side: 'TR', nat: 'TR', label: 'Zırhlı Tugay (R35)', atk: 4, def: 4, mp: 5, steps: 2, sym: 'arm', motor: true, armor: true },
    tr_arm: { side: 'TR', nat: 'TR', label: 'Zırhlı Tugay (T-26)', atk: 4, def: 3, mp: 6, steps: 2, sym: 'arm', motor: true, armor: true },
    tr_val: { side: 'TR', nat: 'TR', label: 'Zırhlı Tugay (Valentine)', atk: 5, def: 4, mp: 5, steps: 2, sym: 'arm', motor: true, armor: true },
    tr_gar: { side: 'TR', nat: 'TR', label: 'Kale Garnizonu', atk: 1, def: 4, mp: 0, steps: 2, sym: 'gar', static: true },
    uk_arm: { side: 'TR', nat: 'UK', label: 'İngiliz Zırhlı Tugayı', atk: 6, def: 4, mp: 6, steps: 2, sym: 'arm', motor: true, armor: true },
    uk_inf: { side: 'TR', nat: 'UK', label: 'İngiliz Piyade Tümeni', atk: 5, def: 5, mp: 4, steps: 3, sym: 'inf' },

    de_pz: { side: 'DE', nat: 'DE', label: 'Panzer Tümeni', atk: 9, def: 5, mp: 7, steps: 3, sym: 'arm', motor: true, armor: true },
    de_pzg: { side: 'DE', nat: 'DE', label: 'Panzergrenadier Tümeni', atk: 7, def: 5, mp: 6, steps: 3, sym: 'mech', motor: true },
    de_inf: { side: 'DE', nat: 'DE', label: 'Piyade Tümeni', atk: 5, def: 5, mp: 4, steps: 3, sym: 'inf' },
    de_geb: { side: 'DE', nat: 'DE', label: 'Dağ Tümeni', atk: 5, def: 5, mp: 4, steps: 3, sym: 'mtn', mountain: true },
    bg_inf: { side: 'DE', nat: 'BG', label: 'Bulgar Piyade Tümeni', atk: 3, def: 4, mp: 4, steps: 3, sym: 'inf' },
  };

  O.NATION = {
    TR: { label: 'Türk', fill: '#b3262e', edge: '#6e0f15', fg: '#ffffff' },
    UK: { label: 'İngiliz', fill: '#c2a25b', edge: '#6d5822', fg: '#1d1a12' },
    DE: { label: 'Alman', fill: '#5b6672', edge: '#2a3138', fg: '#ffffff' },
    BG: { label: 'Bulgar', fill: '#3d6b4f', edge: '#1d3a28', fg: '#ffffff' },
  };

  // Türk 1. Ordusu — önerilen diziliş (oyuncu konuşlanma aşamasında değiştirebilir)
  O.TR_START = [
    { type: 'tr_gar', name: 'Edirne Garnizonu', at: 'Edirne' },
    { type: 'tr_inf', name: '4. Tümen', lat: 41.6, lon: 26.7 },
    { type: 'tr_inf', name: '8. Tümen', at: 'Kırklareli' },
    { type: 'tr_cav', name: '2. Süvari Tümeni', at: 'Babaeski' },
    { type: 'tr_cav', name: '5. Süvari Tümeni', at: 'Uzunköprü' },
    { type: 'tr_inf', name: '65. Tümen', at: 'Keşan' },
    { type: 'tr_inf', name: '46. Tümen', lat: 41.66, lon: 27.98 },
    { type: 'tr_inf', name: '22. Tümen', at: 'Vize' },
    { type: 'tr_inf', name: '23. Tümen', lat: 41.52, lon: 27.62 },
    { type: 'tr_inf', name: '62. Tümen', lat: 41.44, lon: 27.45 },
    { type: 'tr_inf', name: '17. Tümen', lat: 41.3, lon: 27.25 },
    { type: 'tr_inf', name: '54. Tümen', at: 'Hayrabolu' },
    { type: 'tr_inf', name: '28. Tümen', lat: 41.05, lon: 26.98 },
    { type: 'tr_inf', name: '39. Tümen', at: 'Malkara' },
    { type: 'tr_inf', name: '61. Tümen', lat: 40.6, lon: 26.86 },
    { type: 'tr_gar', name: 'Boğaz Garnizonu', at: 'Gelibolu' },
    { type: 'tr_inf', name: '1. Tümen', at: 'Çatalca' },
    { type: 'tr_gar', name: 'İstanbul Garnizonu', at: 'İstanbul' },
    { type: 'tr_r35', name: '1. Zırhlı Tugay', at: 'Muratlı' },
    { type: 'tr_arm', name: '2. Zırhlı Tugay', at: 'Çorlu' },
  ];

  // Mihver taarruz kuvvetleri. axis: K = İstanbul yönü, G = Gelibolu/Çanakkale yönü
  O.DE_START = [
    { type: 'bg_inf', name: 'Bulgar 8. Tümeni', lat: 41.8, lon: 26.25, axis: 'N' },
    { type: 'de_inf', name: '73. Piyade Tümeni', lat: 41.84, lon: 26.5, axis: 'N' },
    { type: 'de_inf', name: '164. Piyade Tümeni', lat: 41.95, lon: 26.55, axis: 'N' },
    { type: 'de_inf', name: '50. Piyade Tümeni', lat: 41.88, lon: 26.78, axis: 'N' },
    { type: 'de_pz', name: '11. Panzer Tümeni', lat: 41.98, lon: 26.95, axis: 'N' },
    { type: 'de_pzg', name: '60. Panzergrenadier Tümeni', lat: 42.05, lon: 27.1, axis: 'N' },
    { type: 'de_pz', name: '9. Panzer Tümeni', lat: 42.05, lon: 27.3, axis: 'N' },
    { type: 'de_inf', name: '72. Piyade Tümeni', lat: 42.02, lon: 27.45, axis: 'N' },
    { type: 'de_geb', name: '6. Dağ Tümeni', lat: 42.02, lon: 27.75, axis: 'N' },
    { type: 'bg_inf', name: 'Bulgar 2. Tümeni', lat: 42.06, lon: 27.9, axis: 'N' },
    { type: 'de_geb', name: '5. Dağ Tümeni', lat: 41.45, lon: 26.35, axis: 'S' },
    { type: 'de_inf', name: '46. Piyade Tümeni', lat: 41.25, lon: 26.35, axis: 'S' },
    { type: 'de_inf', name: '125. Piyade Tümeni', lat: 41.0, lon: 26.2, axis: 'S' },
    { type: 'de_pzg', name: '18. Panzergrenadier Tümeni', lat: 40.85, lon: 26.15, axis: 'S' },
  ];

  // diff: yalnızca belirtilen zorluk seviyelerinde gelir
  O.DE_REINF = [
    { turn: 3, type: 'de_inf', name: '76. Piyade Tümeni', lat: 42.05, lon: 26.9, axis: 'N' },
    { turn: 4, type: 'de_pz', name: '16. Panzer Tümeni', lat: 42.05, lon: 27.2, axis: 'N', diff: ['zor'] },
    { turn: 5, type: 'de_geb', name: '1. Dağ Tümeni', lat: 41.3, lon: 26.3, axis: 'S' },
    { turn: 7, type: 'de_pz', name: '13. Panzer Tümeni', lat: 42.05, lon: 27.2, axis: 'N', diff: ['normal', 'zor'] },
    { turn: 9, type: 'de_inf', name: '98. Piyade Tümeni', lat: 42.05, lon: 26.7, axis: 'N' },
  ];

  O.TR_REINF = [
    { turn: 2, type: 'tr_inf', name: '3. Tümen', at: 'İstanbul' },
    { turn: 3, type: 'tr_inf', name: '52. Tümen', at: 'Eceabat' },
    { turn: 4, type: 'tr_inf', name: '11. Tümen', at: 'İstanbul' },
    { turn: 5, type: 'tr_cav', name: '14. Süvari Tümeni', at: 'Tekirdağ' },
    { turn: 6, type: 'tr_inf', name: '41. Tümen', at: 'İstanbul' },
    { turn: 7, type: 'tr_val', name: '3. Zırhlı Tugay', at: 'İstanbul' },
    { turn: 8, type: 'tr_inf', name: '57. Tümen', at: 'Gelibolu' },
    { turn: 10, type: 'uk_arm', name: 'İngiliz 7. Zırhlı Tugayı', at: 'Eceabat' },
    { turn: 11, type: 'tr_inf', name: '20. Tümen', at: 'İstanbul' },
    { turn: 12, type: 'uk_inf', name: 'İngiliz 50. Piyade Tümeni', at: 'İstanbul' },
  ];

  // Yapay zekâ hedef ağırlıkları (eksen başına)
  O.AI_OBJECTIVES = {
    N: {
      'İstanbul': 34, 'Çatalca': 14, 'Çorlu': 8, 'Silivri': 6, 'Lüleburgaz': 7, 'Kırklareli': 5,
      'Edirne': 5, 'Babaeski': 3, 'Vize': 4, 'Saray': 4, 'Çerkezköy': 3,
    },
    S: {
      'Gelibolu': 22, 'Eceabat': 16, 'Keşan': 6, 'Uzunköprü': 5, 'Malkara': 5, 'Tekirdağ': 7,
      'Hayrabolu': 3, 'İpsala': 2,
    },
  };
})(Oyun);
