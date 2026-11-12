// Kıbrıs 1974 — birlik türleri, savaş düzeni ve takviyeler.
// Birlik adları ve konumları yaklaşıktır; tabur/alay ölçeğinde oyunlaştırılmıştır.
var Oyun = globalThis.Oyun = globalThis.Oyun || {};
(function (O) {
  'use strict';

  O.VERSION = '0.1.0';
  O.GAME_ID = 'kibris-1974';

  // İki aşama: 1 = 20–22 Temmuz, 2 = 14–16 Ağustos
  O.TURNS = [
    { stage: 1, day: 20, month: 6, light: 'gunduz' },
    { stage: 1, day: 20, month: 6, light: 'gece' },
    { stage: 1, day: 21, month: 6, light: 'gunduz' },
    { stage: 1, day: 21, month: 6, light: 'gece' },
    { stage: 1, day: 22, month: 6, light: 'gunduz' },
    { stage: 2, day: 14, month: 7, light: 'gunduz' },
    { stage: 2, day: 14, month: 7, light: 'gece' },
    { stage: 2, day: 15, month: 7, light: 'gunduz' },
    { stage: 2, day: 15, month: 7, light: 'gece' },
    { stage: 2, day: 16, month: 7, light: 'gunduz' },
  ];

  // drop: konuşlanmada iniş bölgesine yerleştirilebilir; local: kuşatılmış bölgeden ayrılmaz
  O.UNIT_TYPES = {
    tr_cik: { side: 'TR', nat: 'TR', label: 'Çıkarma Taburu', atk: 4, def: 4, mp: 3, steps: 3, sym: 'inf' },
    tr_kom: { side: 'TR', nat: 'TR', label: 'Komando Taburu', atk: 5, def: 3, mp: 4, steps: 2, sym: 'mtn', mountain: true },
    tr_para: { side: 'TR', nat: 'TR', label: 'Paraşüt Taburu', atk: 4, def: 3, mp: 3, steps: 2, sym: 'para', drop: true },
    tr_inf: { side: 'TR', nat: 'TR', label: 'Piyade Alayı', atk: 5, def: 5, mp: 3, steps: 3, sym: 'inf' },
    tr_arm: { side: 'TR', nat: 'TR', label: 'Tank Taburu (M48)', atk: 8, def: 5, mp: 6, steps: 2, sym: 'arm', motor: true, armor: true },
    tr_muc: { side: 'TR', nat: 'TM', label: 'Mücahit Sancağı', atk: 2, def: 3, mp: 2, steps: 2, sym: 'inf', militia: true },
    tr_muc_l: { side: 'TR', nat: 'TM', label: 'Mücahit Sancağı (kuşatılmış bölge)', atk: 2, def: 3, mp: 0, steps: 2, sym: 'gar', static: true, militia: true },

    gr_mm: { side: 'GR', nat: 'MM', label: 'Milli Muhafız Taburu', atk: 3, def: 4, mp: 3, steps: 3, sym: 'inf' },
    gr_lok: { side: 'GR', nat: 'MM', label: 'Rum Komando (LOK) Taburu', atk: 4, def: 3, mp: 4, steps: 2, sym: 'mtn', mountain: true },
    gr_arm: { side: 'GR', nat: 'MM', label: 'Zırhlı Tabur (T-34)', atk: 5, def: 3, mp: 5, steps: 2, sym: 'arm', motor: true, armor: true },
    gr_res: { side: 'GR', nat: 'MM', label: 'Yedek Taburu', atk: 2, def: 3, mp: 2, steps: 2, sym: 'inf', militia: true },
    gr_eldyk: { side: 'GR', nat: 'EL', label: 'ELDİK (Yunan Alayı)', atk: 5, def: 5, mp: 3, steps: 3, sym: 'inf' },
    gr_cdo: { side: 'GR', nat: 'EL', label: 'Yunan Komando Taburu', atk: 4, def: 4, mp: 3, steps: 2, sym: 'mtn', mountain: true },
  };

  O.NATION = {
    TR: { label: 'Türk', fill: '#b3262e', edge: '#6e0f15', fg: '#ffffff' },
    TM: { label: 'Kıbrıs Türk', fill: '#8a3a2a', edge: '#4a1c12', fg: '#ffffff' },
    MM: { label: 'Rum', fill: '#3f6696', edge: '#1d3556', fg: '#ffffff' },
    EL: { label: 'Yunan', fill: '#24467a', edge: '#0f2140', fg: '#ffffff' },
  };
  O.SIDE_NAME = { TR: 'Türk kuvvetleri', GR: 'Rum ve Yunan kuvvetleri' };

  // Türk başlangıç kuvvetleri. at: 'beach' çıkarma plajı; drop birlikleri konuşlanmada yerleştirilir.
  O.TR_START = [
    { type: 'tr_cik', name: '1. Çıkarma Taburu', at: 'beach' },
    { type: 'tr_cik', name: '2. Çıkarma Taburu', at: 'beach' },
    { type: 'tr_kom', name: '1. Komando Taburu', lat: 35.335, lon: 33.20 },
    { type: 'tr_para', name: '1. Paraşüt Taburu', lat: 35.215, lon: 33.30 },
    { type: 'tr_para', name: '2. Paraşüt Taburu', lat: 35.23, lon: 33.36 },
    { type: 'tr_para', name: '3. Paraşüt Taburu', lat: 35.25, lon: 33.30 },
    { type: 'tr_muc', name: 'Lefkoşa 1. Mücahit Sancağı', lat: 35.19, lon: 33.33 },
    { type: 'tr_muc', name: 'Lefkoşa 2. Mücahit Sancağı', lat: 35.185, lon: 33.40 },
    { type: 'tr_muc', name: 'Gönyeli Mücahit Sancağı', lat: 35.21, lon: 33.31 },
    { type: 'tr_muc', name: 'Boğaz Mücahit Sancağı', lat: 35.27, lon: 33.35 },
    { type: 'tr_muc_l', name: 'Mağusa Mücahit Sancağı', at: 'Mağusa Suriçi' },
    { type: 'tr_muc_l', name: 'Lefke Mücahit Sancağı', at: 'Lefke' },
    { type: 'tr_muc_l', name: 'Erenköy Mücahitleri', at: 'Erenköy' },
  ];

  // Rum ve Yunan kuvvetleri
  O.GR_START = [
    { type: 'gr_mm', name: 'MM Taburu (Girne)', at: 'Girne' },
    { type: 'gr_mm', name: 'MM Taburu (Pentemili)', lat: 35.32, lon: 33.24 },
    { type: 'gr_lok', name: 'LOK Komando (Beşparmak)', lat: 35.31, lon: 33.30 },
    { type: 'gr_mm', name: 'MM Taburu (Boğaz)', lat: 35.31, lon: 33.40 },
    { type: 'gr_mm', name: 'MM Taburu (Lapta)', at: 'Lapta' },
    { type: 'gr_eldyk', name: 'ELDİK Alayı', lat: 35.165, lon: 33.30 },
    { type: 'gr_arm', name: 'Zırhlı Tabur (Lefkoşa)', lat: 35.14, lon: 33.33 },
    { type: 'gr_mm', name: 'MM Taburu (Lefkoşa)', at: 'Lefkoşa' },
    { type: 'gr_res', name: 'Yedek Taburu (Lefkoşa doğu)', lat: 35.18, lon: 33.45 },
    { type: 'gr_mm', name: 'MM Taburu (Ortaköy)', lat: 35.21, lon: 33.24 },
    { type: 'gr_mm', name: 'MM Taburu (Değirmenlik)', at: 'Değirmenlik' },
    { type: 'gr_mm', name: 'MM Taburu (Güzelyurt)', at: 'Güzelyurt' },
    { type: 'gr_res', name: 'Yedek Taburu (Lefke çevresi)', lat: 35.12, lon: 32.90 },
    { type: 'gr_res', name: 'Yedek Taburu (Erenköy çevresi)', lat: 35.15, lon: 32.68 },
    { type: 'gr_mm', name: 'MM Taburu (Maraş)', at: 'Maraş' },
    { type: 'gr_arm', name: 'Zırhlı Tabur (Mağusa)', lat: 35.15, lon: 33.88 },
    { type: 'gr_res', name: 'Yedek Taburu (Mağusa)', lat: 35.16, lon: 33.93 },
    { type: 'gr_mm', name: 'MM Taburu (Geçitkale)', at: 'Geçitkale' },
    { type: 'gr_lok', name: 'LOK Komando (Kantara)', at: 'Kantara' },
    { type: 'gr_mm', name: 'MM Taburu (Larnaka)', at: 'Larnaka' },
    { type: 'gr_mm', name: 'MM Taburu (Limasol)', at: 'Limasol' },
    { type: 'gr_res', name: 'Yedek Taburu (Baf)', at: 'Baf' },
  ];

  // turn: o turun başında gelir. at: 'beach' | şehir adı | 'any' (Türk kontrolündeki ikmalli bölge)
  O.TR_REINF = [
    { turn: 2, type: 'tr_cik', name: '3. Çıkarma Taburu', at: 'beach' },
    { turn: 3, type: 'tr_arm', name: '1. Tank Taburu', at: 'beach' },
    { turn: 3, type: 'tr_kom', name: '2. Komando Taburu', at: 'beach' },
    { turn: 4, type: 'tr_cik', name: '4. Çıkarma Taburu', at: 'beach' },
    { turn: 5, type: 'tr_para', name: '4. Paraşüt Taburu', at: 'Lefkoşa Türk kesimi' },
    // İkinci harekât için ateşkeste toplanan kuvvet
    { turn: 6, type: 'tr_arm', name: '2. Tank Taburu', at: 'any' },
    { turn: 6, type: 'tr_arm', name: '3. Tank Taburu', at: 'any' },
    { turn: 6, type: 'tr_inf', name: '1. Piyade Alayı', at: 'any' },
    { turn: 6, type: 'tr_inf', name: '2. Piyade Alayı', at: 'any' },
    { turn: 6, type: 'tr_inf', name: '3. Piyade Alayı', at: 'any' },
    { turn: 6, type: 'tr_kom', name: '3. Komando Taburu', at: 'any' },
  ];
  O.GR_REINF = [
    { turn: 2, type: 'gr_res', name: 'Yedek Taburu (Lapta)', lat: 35.30, lon: 33.12 },
    { turn: 3, type: 'gr_mm', name: 'MM Taburu (seferberlik)', lat: 35.12, lon: 33.40 },
    { turn: 4, type: 'gr_cdo', name: 'Yunan Komando Taburu (Niki)', at: 'Lefkoşa havaalanı' },
    { turn: 6, type: 'gr_mm', name: 'MM Taburu (Mesarya)', lat: 35.18, lon: 33.60 },
    { turn: 6, type: 'gr_mm', name: 'MM Taburu (Güzelyurt yolu)', lat: 35.19, lon: 33.10 },
    { turn: 6, type: 'gr_arm', name: 'Zırhlı Tabur (yedek)', lat: 35.10, lon: 33.50 },
    { turn: 6, type: 'gr_res', name: 'Yedek Taburu (Akdoğan)', at: 'Akdoğan' },
    { turn: 7, type: 'gr_res', name: 'Yedek Taburu (Larnaka)', lat: 34.98, lon: 33.55, diff: ['normal', 'zor'] },
    { turn: 3, type: 'gr_mm', name: 'MM Taburu (ek)', lat: 35.13, lon: 33.30, diff: ['zor'] },
    { turn: 6, type: 'gr_lok', name: 'LOK Komando (ek)', lat: 35.22, lon: 33.55, diff: ['zor'] },
  ];

  // Hedefler: 'koridor' özel hedeftir (Girne/plaj ile Lefkoşa Türk kesimi kara bağlantısı)
  O.CORRIDOR_VP = 5;
  O.HISTORICAL_VP = 27; // tarihteki ateşkes hattına denk gelen toplam
})(Oyun);
