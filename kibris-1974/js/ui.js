// Kıbrıs 1974 — arayüz, etkileşim ve oyun akışı.
var Oyun = globalThis.Oyun = globalThis.Oyun || {};
(function (O) {
  'use strict';
  const R = O.Rules, V = O.View;
  const SAVE_KEY = 'kibris-1974-kayit';
  const UI = {
    state: null, sel: null, reach: null, targets: new Set(), mode: 'normal', hover: -1,
    busy: false, speed: 1, lastCombatHex: -1, userZoomed: false,
  };
  O.UI = UI;

  const $ = function (id) { return document.getElementById(id); };
  const esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  const delay = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  const num = function (v) { return (Math.round(v * 10) / 10).toString().replace('.', ','); };

  // ------------------------------------------------------------ yardımcılar
  UI.isDone = function (u) {
    const st = UI.state;
    if (!st || st.phase !== 'TR' || u.side !== 'TR') return false;
    if (u.attacked || u.acted) return true;
    const canMove = u.mpLeft > 0 && !R.type(u).static;
    return !canMove && !R.hasAdjacentEnemy(st, u);
  };
  function readyAttackers(defHex) {
    const st = UI.state;
    return st.units.filter(function (u) {
      return u.side === 'TR' && R.canAttack(st, u) && R.adjacent(u.hex, defHex);
    });
  }
  function computeTargets() {
    UI.targets = new Set();
    const st = UI.state;
    if (!st || st.phase !== 'TR') return;
    if (UI.mode === 'air') {
      for (const u of st.units) if (u.side === 'GR') UI.targets.add(u.id);
      return;
    }
    if (UI.sel && UI.sel.side === 'TR' && R.canAttack(st, UI.sel)) {
      for (const nb of O.MAP.hexes[UI.sel.hex].nbrs) {
        const e = R.unitAt(st, nb);
        if (e && e.side === 'GR') UI.targets.add(e.id);
      }
    }
  }
  function selectUnit(u) {
    UI.sel = u;
    const st = UI.state;
    UI.reach = (u && st.phase === 'TR' && u.side === 'TR') ? R.reachable(st, u) : null;
    computeTargets();
    refresh();
  }
  function deselect() {
    UI.sel = null; UI.reach = null; UI.mode = 'normal';
    computeTargets();
    refresh();
  }
  function toast(msg, ms) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.add('hidden'); }, ms || 2200);
  }

  // ------------------------------------------------------------ modallar
  function openModal(html, onBind, kind) {
    UI.modalKind = kind || null;
    $('modalCard').innerHTML = html;
    $('modal').classList.remove('hidden');
    if (onBind) onBind($('modalCard'));
  }
  function closeModal() {
    UI.modalKind = null;
    $('modal').classList.add('hidden');
    $('modalCard').innerHTML = '';
  }
  UI.closeModal = closeModal;
  UI.showEnd = function () { showEnd(); };
  UI.showBoard = function () { showBoard(); };

  function hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  }
  function save(silent) {
    if (!UI.state || UI.state.phase === 'over') return false;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(UI.state));
      if (!silent) toast('Oyun kaydedildi.');
      return true;
    } catch (e) {
      if (!silent) toast('Kayıt yapılamadı (tarayıcı depolaması kapalı olabilir).');
      return false;
    }
  }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const st = JSON.parse(raw);
      if (!st || st.version !== 1 || !Array.isArray(st.units)) return false;
      startWithState(st);
      toast('Kayıtlı oyun yüklendi.');
      return true;
    } catch (e) {
      toast('Kayıt okunamadı.');
      return false;
    }
  }

  function showIntro() {
    const canLoad = hasSave();
    openModal(
      '<h2>Kıbrıs 1974</h2>' +
      '<p class="sub">Harekât simülasyonu · 20 Temmuz – 16 Ağustos 1974 · sürüm ' + esc(O.VERSION) + '</p>' +
      '<p>15 Temmuz 1974\'te Yunanistan\'daki askerî yönetimin desteklediği bir darbe Kıbrıs Cumhurbaşkanı Makarios\'u devirdi. Türkiye, 1960 Garanti Antlaşması\'na dayanarak 20 Temmuz sabahı adaya çıkarma yaptı.</p>' +
      '<p>Siz Türk kuvvetlerini yönetiyorsunuz. Çıkarma birlikleri Girne\'nin batısındaki <b>Pentemili</b>\'de karaya çıkıyor; paraşüt taburları Lefkoşa Türk kesiminin çevresine iniyor. Karşınızda Rum Milli Muhafız Ordusu ve adadaki Yunan alayı (ELDİK) var; onları yapay zekâ yönetir.</p>' +
      '<p><b>Birinci harekât (20–22 Temmuz):</b> Beşparmak Dağları\'nı aşın, köprübaşını Lefkoşa Türk kesimiyle birleştirin ve Girne\'yi alın. <b>Ateşkes</b> sırasında takviyeler gelir. <b>İkinci harekât (14–16 Ağustos):</b> batıda Güzelyurt ve Lefke\'ye, doğuda Mağusa\'ya ulaşın.</p>' +
      '<p class="hint">Birlik adları ve konumları yaklaşıktır; harekât, tabur ve alay ölçeğinde oyunlaştırılmıştır.</p>' +
      '<h3>Zorluk</h3>' +
      '<div class="diff">' +
      '<label><input type="radio" name="diff" value="kolay">Kolay<small>Daha fazla hava desteği, zayıf karşı taarruz</small></label>' +
      '<label><input type="radio" name="diff" value="normal" checked>Normal<small>Tarihî ölçekte bir direniş</small></label>' +
      '<label><input type="radio" name="diff" value="zor">Zor<small>Güçlü direniş, ek Rum birlikleri</small></label>' +
      '</div>' +
      '<div class="row end">' +
      (canLoad ? '<button id="mLoad">Kayıtlı oyunu yükle</button>' : '') +
      '<button id="mBoard">Skor tablosu</button>' +
      '<button id="mRules">Kurallar</button>' +
      '<button id="mStart" class="primary">Çıkarmaya hazırlan</button>' +
      '</div>',
      function (el) {
        el.querySelector('#mStart').onclick = function () {
          const d = el.querySelector('input[name=diff]:checked').value;
          closeModal();
          newGame(d);
        };
        el.querySelector('#mRules').onclick = function () { showHelp(showIntro); };
        el.querySelector('#mBoard').onclick = function () { showBoard(showIntro); };
        const l = el.querySelector('#mLoad');
        if (l) l.onclick = function () { closeModal(); if (!load()) showIntro(); };
      },
      'intro'
    );
  }

  // ------------------------------------------------------------ ortak skor tablosu
  const Board = O.Board;
  function boardStatusHtml() {
    if (Board.status === 'off') return '<p class="hint">Ortak skor tablosu yalnızca oyunun claude.ai\'deki sayfasında, oturum açıkken çalışır. Bu kopyada skorlar yalnızca bu tarayıcıda saklanır.</p>';
    if (Board.status === 'loading' && !Board.rows.length) return '<p class="hint">Skor tablosu yükleniyor…</p>';
    if (Board.status === 'slow') return '<p class="hint">Skor tablosuna şu an ulaşılamıyor; bağlantı gelince kendiliğinden güncellenecek.</p>';
    if (Board.status === 'error') return '<p class="hint">Skor tablosu açılamadı. Sayfayı daha sonra yeniden açmayı deneyin.</p>';
    return '';
  }
  function boardTableHtml(limit, withDelete) {
    const rows = Board.rows.slice(0, limit);
    if (!rows.length) return Board.status === 'ready' ? '<p class="hint">Henüz skor yok. İlk skoru siz ekleyin.</p>' : '';
    const diff = function (d) { return R.DIFFICULTY[d] ? R.DIFFICULTY[d].label : '—'; };
    const body = rows.map(function (r, i) {
      const me = r.id === Board.myId;
      return '<tr' + (me ? ' class="me"' : '') + '>' +
        '<td class="num">' + (i + 1) + '</td>' +
        '<td>' + esc(Board.nameOf(r.id)) + '</td>' +
        '<td class="num"><b>' + esc(r.total) + '</b></td>' +
        '<td>' + esc(r.rank || '') + '</td>' +
        '<td>' + esc(diff(r.difficulty)) + '</td>' +
        '<td class="wide-col">' + esc(r.outcome || '') + '</td>' +
        '<td class="num">' + esc(r.vp != null ? r.vp : '') + '</td>' +
        '<td class="wide-col">' + esc(r.version ? 'v' + r.version : '') + '</td>' +
        '<td class="wide-col">' + esc(String(r.at || '').slice(0, 10)) + '</td>' +
        (withDelete ? '<td>' + (me ? '' : '<button class="mini" data-del="' + esc(r.id) + '">Sil</button>') + '</td>' : '') +
        '</tr>';
    }).join('');
    return '<div class="table-wrap"><table class="board"><thead><tr><th>#</th><th>Oyuncu</th><th>Skor</th><th>Rütbe</th><th>Zorluk</th>' +
      '<th class="wide-col">Sonuç</th><th>Puan</th><th class="wide-col">Sürüm</th><th class="wide-col">Tarih</th>' + (withDelete ? '<th></th>' : '') +
      '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }
  function bindDeletes(el) {
    el.querySelectorAll('button[data-del]').forEach(function (b) {
      b.onclick = async function () {
        if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Emin misiniz?'; return; }
        b.disabled = true;
        if (!(await Board.remove(b.getAttribute('data-del')))) { b.textContent = 'Silinemedi'; }
      };
    });
  }
  function showBoard(back) {
    const mine = Board.myRow();
    openModal(
      '<h2>Ortak skor tablosu</h2>' +
      '<p class="sub">Her oyuncunun en iyi skoru · sürüm ' + esc(O.VERSION) + '</p>' +
      boardStatusHtml() +
      (mine ? '<p class="hint">Sizin en iyi skorunuz: <b>' + esc(mine.total) + '</b> (' + esc(mine.rank || '') + ') · ' + esc(mine.games || 1) + ' oyun</p>' : '') +
      boardTableHtml(100, Board.isOwner) +
      (Board.isOwner && Board.rows.length ? '<p class="hint">Sayfanın sahibi olarak istenmeyen kayıtları silebilirsiniz.</p>' : '') +
      '<div class="row end"><button id="bdBack" class="primary">' + (back ? 'Geri' : 'Kapat') + '</button></div>',
      function (el) {
        el.querySelector('#bdBack').onclick = function () { if (back) back(); else closeModal(); };
        bindDeletes(el);
      },
      'board'
    );
    UI.boardBack = back || null;
  }
  // Sonuç ekranındaki tablo bölümü
  function renderBoardSlot() {
    const slot = document.getElementById('boardSlot');
    const st = UI.state;
    if (!slot || !st || !st.result) return;
    const sc = st.result.score;
    const key = st.seed + ':' + st.turn + ':' + sc.total;
    const sent = UI.boardSent && UI.boardSent[key];
    let action = '';
    if (Board.available()) {
      if (sent) action = '<p class="' + (sent.ok ? 'record' : 'hint') + '">' + esc(sent.text) + '</p>';
      else if (Board.canSubmit()) action = '<button id="bdSend" class="primary">Skoru ortak tabloya ekle</button>';
      else action = '<p class="hint">Skor eklemek için bu sayfada oturum açmış olmanız ve en az "Katkıda bulunan" erişiminiz olması gerekir.</p>';
    }
    slot.innerHTML = '<h3>Ortak skor tablosu</h3>' + boardStatusHtml() + action + boardTableHtml(5, false) +
      (Board.rows.length > 5 ? '<p><button id="bdAll" class="mini">Tüm tabloyu göster</button></p>' : '');
    const send = slot.querySelector('#bdSend');
    if (send) send.onclick = async function () {
      send.disabled = true;
      send.textContent = 'Gönderiliyor…';
      const res = await Board.submit(st);
      UI.boardSent = UI.boardSent || {};
      UI.boardSent[key] = res.ok
        ? { ok: true, text: res.improved ? 'Skorunuz ortak tabloya eklendi.' : 'Kaydedildi. Tablodaki en iyi skorunuz (' + res.best + ') daha yüksek olduğu için o kalıyor.' }
        : { ok: false, text: res.reason === 'denied' ? 'Bu sayfada skor yazma izniniz yok.' : res.reason === 'full' ? 'Skor tablosu dolu.' : 'Skor gönderilemedi, birazdan yeniden deneyin.' };
      if (!res.ok && res.reason === 'error') delete UI.boardSent[key];
      renderBoardSlot();
    };
    const all = slot.querySelector('#bdAll');
    if (all) all.onclick = function () { showBoard(showEnd); };
  }

  function showHelp(back) {
    const crt = R.CRT.map(function (row, i) {
      return '<tr><th>' + R.ODDS_LABEL[i] + '</th>' + row.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>';
    }).join('');
    openModal(
      '<h2>Kurallar</h2>' +
      '<p class="sub">Her tur yarım gündür (gündüz veya gece). Önce siz, sonra Rum ve Yunan kuvvetleri (yapay zekâ) oynar. Birinci harekât 5 tur, ikinci harekât 5 turdur; aradaki ateşkeste takviyeler gelir.</p>' +
      '<h3>Başlangıç</h3><ul>' +
      '<li>Konuşlanmada paraşüt taburlarını yeşil iniş bölgesine (Lefkoşa Türk kesimi ve hemen çevresi), mücahitleri Türk kesimi içine, çıkarma birliklerini Pentemili plajına ya da yanına yerleştirin.</li>' +
      '<li>Lefke, Erenköy ve Mağusa Suriçi\'ndeki mücahitler kuşatılmıştır ve yerlerinden ayrılamaz; bu bölgeleri ikinci harekâtta kurtarmanız gerekir.</li></ul>' +
      '<h3>Hareket</h3><ul>' +
      '<li>Birliğinize tıklayın; beyaz altıgenlere gidebilir. Her altıgende tek birlik bulunabilir.</li>' +
      '<li>Maliyet: ova 1, tepe/orman/geçit 2, Beşparmak\'ın sarp sırtları 3 (komandolar 2; tanklar engebede +1). Hareket etmemiş birlik her zaman 1 altıgen gidebilir.</li>' +
      '<li><b>Kontrol bölgesi:</b> Düşmana komşu bir altıgene giren birlik o tur durur.</li>' +
      '<li><b>Gece</b> tüm birliklerin hareketi −1. <b>Gündüz</b> Türk hava üstünlüğü nedeniyle Rum birliklerinin hareketi −1.</li></ul>' +
      '<h3>Saldırı</h3><ul>' +
      '<li>Birliğiniz seçiliyken kırmızı halkalı düşmana tıklayın. Düşmana komşu tüm hazır birlikleriniz saldırıya katılabilir. Saldıran birlik o tur bir daha hareket edemez.</li>' +
      '<li>Toplam saldırı ÷ savunma = oran; oran sütunu ve zar sonucu belirler. Savunan çekilirse saldıranlardan biri boşalan altıgene ilerleyebilir.</li>' +
      '<li>Savunma çarpanları: sarp dağ ×1,6, orman ×1,4, tepe/geçit ×1,3, şehir ×1,3 (Lefkoşa ×1,5), Türk bölgelerinin mevzileri ve Mağusa surları ×1,5, mevzi ×1,15 / ×1,3.</li>' +
      '<li>Tanklar engebeli araziye ve şehre saldırırken ×0,6. <b>Donanma ateş desteği:</b> gündüz kıyı altıgenlerine yapılan Türk saldırıları ×1,25.</li></ul>' +
      '<table class="crt"><tr><th>Oran</th><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th></tr>' + crt + '</table>' +
      '<p class="mods">A1/A2: saldıran 1/2 kademe kaybeder · EX: iki taraf 1\'er kademe · DR: savunan çekilir · D1: savunan 1 kademe · D1R/D2R: savunan 1/2 kademe kaybeder ve çekilir · –: sonuç yok</p>' +
      '<h3>İkmal, takviye, hava</h3><ul>' +
      '<li><b>İkmal:</b> Türk birlikleri; çıkarma plajına, Türk elindeki bir limana (Girne, Mağusa) ya da bir Türk bölgesine, Rum birliği ve boş Rum kontrol bölgesinden geçmeyen, Türk kontrolündeki altıgenlerle bağlı olmalıdır. İkmalsiz birlik: saldırı ×0,5, savunma ×0,75, hareket −1; üç tur üst üste ikmalsiz kalırsa her tur 1 kademe kaybeder.</li>' +
      '<li><b>Takviye:</b> Her tur 1 (ikinci harekâtta 2) hak; hareket etmemiş, ikmalli, hasarlı birliğe +1 kademe.</li>' +
      '<li><b>Hava saldırısı:</b> Yalnız gündüz; birinci harekâtta 4, ikinci harekâtta 6 sorti. Hedefi sarsar (saldırı/savunma ×0,7) ya da 1 kademe kaybettirir. Önce hava saldırısı, sonra kara taarruzu yapmak etkilidir.</li>' +
      '<li>Rum tarafının hava gücü yoktur, ama gece karşı taarruzlara daha yatkındır. 21–22 Temmuz gecesi havaalanı Rum elindeyse bir Yunan komando taburu iner.</li></ul>' +
      '<h3>Hedefler ve sonuç</h3><ul>' +
      '<li>Haritadaki rakamlar hedef puanlarıdır. Ayrıca <b>Girne–Lefkoşa koridoru</b> (plaj ya da Girne ile Lefkoşa Türk kesimi arasında Türk kontrolünde, Rum birliği bulunmayan kara bağlantısı) 5 puandır. Elinizdeki Türk bölgelerini kaybederseniz o puanları da kaybedersiniz.</li>' +
      '<li>Birinci harekâtın sonunda (22 Temmuz) Girne, koridor ve Lefkoşa Türk kesimi değerlendirilir. Oyunun sonunda (16 Ağustos) toplam puana bakılır: 25+ hedeflere ulaşıldı (tarihteki ateşkes hattı) · 18–24 büyük ölçüde başarılı · 10–17 kısmi başarı · 10\'un altı başarısız.</li>' +
      '<li><b>Skor:</b> hedef puanı × 40, birinci harekât hedefleri zamanında +150, verdirilen her Rum/Yunan kademesi +12, kaybedilen her Türk kademesi −10; sonra zorluk çarpanı (Kolay ×0,75, Zor ×1,3). Rütbe: Albay, Tuğgeneral (750), Tümgeneral (1000), Korgeneral (1250), Orgeneral (1500), Mareşal (1800).</li></ul>' +
      '<h3>Kısayollar</h3><p><kbd>Enter</kbd> turu bitir · <kbd>N</kbd> sıradaki birlik · <kbd>H</kbd> hava saldırısı · <kbd>T</kbd> takviye · <kbd>Esc</kbd> seçimi bırak · <kbd>+</kbd>/<kbd>−</kbd> yakınlaştır</p>' +
      '<h3>Harita</h3><div class="legend">' +
      '<i style="background:#b3262e"></i><span>Türk Silahlı Kuvvetleri. Pul üzerindeki rakamlar tam güçteki saldırı-savunma-hareket değerleridir; sağdaki noktalar kalan kademeyi gösterir.</span>' +
      '<i style="background:#8a3a2a"></i><span>Kıbrıs Türk mücahitleri</span>' +
      '<i style="background:#3f6696"></i><span>Rum Milli Muhafız Ordusu</span>' +
      '<i style="background:#24467a"></i><span>Yunan birlikleri (ELDİK, komandolar)</span>' +
      '<i style="background:#efe5c4;border:2px dashed #8e1b1b"></i><span>Kıbrıs Türk bölgesi (Temmuz 1974 başı); kenarları tahkimatlı</span>' +
      '<i style="background:repeating-linear-gradient(45deg,#f1d6d0,#f1d6d0 3px,#d8a8a0 3px,#d8a8a0 5px)"></i><span>Türk kuvvetlerinin aldığı bölge</span>' +
      '<i style="background:#c9b08a"></i><span>Beşparmak Dağları (sarp)</span>' +
      '<i style="background:#d9d3c4"></i><span>İngiliz üs bölgesi (girilemez)</span>' +
      '</div>' +
      '<div class="row end"><button id="mBack" class="primary">Tamam</button></div>',
      function (el) {
        el.querySelector('#mBack').onclick = function () { if (back) back(); else closeModal(); };
      }
    );
  }

  function showMenu() {
    if (UI.busy) return;
    openModal(
      '<h2>Menü</h2>' +
      '<div class="row">' +
      '<button id="mNew" class="primary">Yeni oyun</button>' +
      (hasSave() ? '<button id="mLoad">Kayıtlı oyunu yükle</button>' : '') +
      '<button id="mSpeed">Rum hamlesi animasyon hızı: ' + (UI.speed === 1 ? 'Normal' : UI.speed > 1 ? 'Hızlı' : 'Yavaş') + '</button>' +
      '<button id="mClose">Kapat</button></div>',
      function (el) {
        el.querySelector('#mNew').onclick = function () { closeModal(); showIntro(); };
        const l = el.querySelector('#mLoad');
        if (l) l.onclick = function () { closeModal(); load(); };
        el.querySelector('#mSpeed').onclick = function () {
          UI.speed = UI.speed === 1 ? 3 : UI.speed === 3 ? 0.5 : 1;
          showMenu();
        };
        el.querySelector('#mClose').onclick = closeModal;
      }
    );
  }

  const BEST_KEY = 'kibris-1974-rekor';
  function readBest() {
    try { return JSON.parse(localStorage.getItem(BEST_KEY) || 'null'); } catch (e) { return null; }
  }
  // En iyi skoru bu tarayıcıda saklar; yeni rekor ise true döner
  function recordBest(sc, st) {
    const best = readBest();
    if (best && best.total >= sc.total) return false;
    try {
      localStorage.setItem(BEST_KEY, JSON.stringify({
        total: sc.total, rank: sc.rank, difficulty: st.difficulty, turn: st.turn, date: new Date().toISOString().slice(0, 10),
      }));
    } catch (e) { return false; }
    return true;
  }

  function showEnd() {
    const st = UI.state;
    const r = st.result;
    if (!r) return;
    const sc = r.score || R.score(st);
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* yok say */ }
    const prevBest = readBest();
    const isRecord = recordBest(sc, st);
    const best = readBest();
    const cls = r.winner === 'TR' ? 'TR' : r.winner === 'GR' ? 'DE' : 'draw';
    const parts = sc.parts.map(function (p) {
      return '<dt>' + esc(p.label) + '</dt><dd class="num">' + (p.value > 0 ? '+' : '') + p.value + '</dd>';
    }).join('') +
      (sc.mult !== 1 ? '<dt>Zorluk çarpanı (' + esc(R.DIFFICULTY[st.difficulty].label) + ')</dt><dd class="num">×' + String(sc.mult).replace('.', ',') + '</dd>' : '');
    const bestLine = isRecord
      ? '<p class="record">Yeni rekor!' + (prevBest ? ' Önceki en iyi: ' + prevBest.total : '') + '</p>'
      : best ? '<p class="hint">Bu tarayıcıdaki en iyi skor: <b>' + best.total + '</b> (' + esc(best.rank) + ', ' + esc(R.DIFFICULTY[best.difficulty] ? R.DIFFICULTY[best.difficulty].label : best.difficulty) + ')</p>' : '';
    const s1 = st.stage1 ? '<p class="hint">Birinci harekât (22 Temmuz): <b>' + esc(st.stage1.title) + '</b></p>' : '';
    const objs = R.objectives(st).map(function (o) {
      return '<span class="city-chip ' + (o.held ? 'TR' : 'DE') + '">' + (o.held ? '✓ ' : '✗ ') + esc(o.name) + ' ' + o.vp + '</span>';
    }).join('');
    openModal(
      '<h2>Ateşkes: 16 Ağustos 1974</h2>' +
      '<p class="sub">' + esc(R.DIFFICULTY[st.difficulty].label) + ' · sürüm ' + esc(O.VERSION) + '</p>' +
      '<div class="result-banner ' + cls + '">' + esc(r.title) + ' · ' + r.vp + '/' + R.maxVP() + ' puan</div>' +
      '<p>' + esc(r.text) + '</p>' + s1 +
      '<div class="cities">' + objs + '</div>' +
      '<div class="score-box"><div><div class="mods">Skor</div><div class="score-big">' + sc.total + '</div></div>' +
      '<div><div class="mods">Rütbe</div><div class="score-rank">' + esc(sc.rank) + '</div></div></div>' +
      bestLine +
      '<div id="boardSlot" class="board-slot"></div>' +
      '<dl class="stats score-parts">' + parts + '</dl>' +
      '<dl class="stats">' +
      '<dt>Türk kayıpları</dt><dd>' + st.stats.lost.TR + ' kademe, ' + st.stats.destroyed.TR + ' birlik</dd>' +
      '<dt>Rum/Yunan kayıpları</dt><dd>' + st.stats.lost.GR + ' kademe, ' + st.stats.destroyed.GR + ' birlik</dd>' +
      '</dl>' +
      '<p class="history">' + esc(R.HISTORY_NOTE) + '</p>' +
      '<div class="row end"><button id="mMap">Haritaya bak</button><button id="mNew" class="primary">Yeni oyun</button></div>',
      function (el) {
        el.querySelector('#mNew').onclick = function () { closeModal(); showIntro(); };
        el.querySelector('#mMap').onclick = closeModal;
      },
      'end'
    );
    renderBoardSlot();
  }

  // Birinci harekât sonu: ateşkes ve ikinci harekâta hazırlık
  function showInterlude() {
    const st = UI.state;
    const s1 = st.stage1;
    if (!s1) return;
    save(true);
    const objs = R.objectives(st).filter(function (o) { return o.stage === 1; }).map(function (o) {
      return '<span class="city-chip ' + (o.held ? 'TR' : 'DE') + '">' + (o.held ? '✓ ' : '✗ ') + esc(o.name) + '</span>';
    }).join('');
    openModal(
      '<h2>Ateşkes: 22 Temmuz 1974, 16.00</h2>' +
      '<div class="result-banner ' + (s1.girne && s1.corridor ? 'TR' : s1.girne || s1.corridor ? 'draw' : 'DE') + '">' + esc(s1.title) + '</div>' +
      '<p>' + esc(s1.text) + '</p>' +
      '<div class="cities">' + objs + '</div>' +
      '<p>Birleşmiş Milletler\'in çağrısıyla ateşkes ilan edildi. Cenevre\'deki görüşmeler sonuçsuz kalırsa ikinci harekât 14 Ağustos\'ta başlayacak. Bu sürede iki tank taburu, üç piyade alayı ve bir komando taburu adaya geçiyor; her iki taraftaki birlikler de toparlanıyor (+1 kademe).</p>' +
      '<p>Sonraki ekranda tüm birliklerinizi Türk kontrolündeki ve ikmali olan bölgede yeniden dizebilirsiniz.</p>' +
      '<div class="row end"><button id="mMap">Haritaya bak</button><button id="mNext" class="primary">İkinci harekâta hazırlan ▶</button></div>',
      function (el) {
        el.querySelector('#mMap').onclick = closeModal;
        el.querySelector('#mNext').onclick = function () {
          closeModal();
          R.beginStage2(st);
          UI.sel = null; UI.reach = null;
          refresh();
          toast('Birliklerinizi yeniden dizin, sonra "İkinci harekâtı başlat"a basın.', 3500);
        };
      },
      'interlude'
    );
  }
  UI.showInterlude = showInterlude;

  // ------------------------------------------------------------ saldırı ekranı
  function openAttack(defHex) {
    const st = UI.state;
    const def = R.unitAt(st, defHex);
    const cands = readyAttackers(defHex);
    if (!def || !cands.length) return;
    const chosen = new Set(cands.map(function (u) { return u.id; }));
    const render = function () {
      const att = cands.filter(function (u) { return chosen.has(u.id); });
      const odds = att.length ? R.attackOdds(st, att, defHex) : null;
      const row = odds ? R.CRT[odds.col] : null;
      const list = cands.map(function (u) {
        const s = R.attackStrength(st, u, defHex);
        return '<li><label><input type="checkbox" data-id="' + u.id + '"' + (chosen.has(u.id) ? ' checked' : '') + '> ' +
          esc(u.name) + '<small>' + esc(s.mods.join(' · ') || 'değiştirici yok') + '</small></label><b>' + num(s.value) + '</b></li>';
      }).join('');
      const crtHtml = row ? '<div class="crt-row">' + row.map(function (c, i) {
        const k = c[0] === 'A' ? 'A' : c === 'EX' ? 'EX' : c[0] === 'D' ? 'D' : '';
        return '<div class="' + k + '"><small>zar ' + (i + 1) + '</small>' + c + '</div>';
      }).join('') + '</div>' : '';
      openModal(
        '<h2>Saldırı</h2>' +
        '<p class="sub">Hedef: <b>' + esc(def.name) + '</b> · ' + esc(R.placeName(defHex)) + '</p>' +
        '<h3>Saldıran birlikler</h3><ul class="att-list">' + list + '</ul>' +
        (odds ?
          '<div class="odds"><div><div class="mods">Saldırı</div><div class="big">' + num(odds.A) + '</div></div>' +
          '<div style="font-size:22px">÷</div>' +
          '<div><div class="mods">Savunma</div><div class="big">' + num(odds.D) + '</div></div>' +
          '<div style="font-size:22px">→</div>' +
          '<div><div class="mods">Oran</div><div class="big">' + odds.label + '</div></div></div>' +
          '<div class="mods">Savunma: ' + esc(odds.defMods.join(' · ')) + '</div>' + crtHtml
          : '<p class="hint">En az bir birlik seçin.</p>') +
        '<div class="row end"><button id="aCancel">Vazgeç</button><button id="aGo" class="primary"' + (odds ? '' : ' disabled') + '>Saldır!</button></div>',
        function (el) {
          el.querySelectorAll('input[type=checkbox]').forEach(function (cb) {
            cb.onchange = function () {
              const id = Number(cb.getAttribute('data-id'));
              if (cb.checked) chosen.add(id); else chosen.delete(id);
              render();
            };
          });
          el.querySelector('#aCancel').onclick = closeModal;
          el.querySelector('#aGo').onclick = function () {
            closeModal();
            doAttack(att, defHex);
          };
        }
      );
    };
    render();
  }

  async function doAttack(attackers, defHex) {
    const st = UI.state;
    const res = R.resolveAttack(st, attackers, defHex);
    if (!res) return;
    fxCombat(res);
    UI.lastCombatHex = defHex;
    if (st.phase === 'over') { refresh(); return showEnd(); }
    if (res.vacated && res.survivors.length) {
      const adv = res.survivors.filter(function (u) { return R.adjacent(u.hex, defHex); });
      if (adv.length) {
        openModal(
          '<h2>' + esc(res.code === '-' ? 'Sonuç' : res.text) + '</h2>' +
          '<p>' + esc(res.summary) + '</p>' +
          '<p>Altıgen boşaldı. Bir birlikle ilerlemek ister misiniz?</p>' +
          '<div class="row">' + adv.map(function (u) { return '<button data-id="' + u.id + '">' + esc(u.name) + ' ilerlesin</button>'; }).join('') +
          '<button id="noAdv">Yerinde kal</button></div>',
          function (el) {
            el.querySelectorAll('button[data-id]').forEach(function (b) {
              b.onclick = async function () {
                const u = R.unitById(st, Number(b.getAttribute('data-id')));
                closeModal();
                const mv = R.advance(st, u, defHex);
                if (mv) await V.animate(u.id, mv.path, 120);
                afterAction();
                if (st.phase === 'over') showEnd();
              };
            });
            el.querySelector('#noAdv').onclick = function () { closeModal(); afterAction(); };
          }
        );
      }
    } else {
      toast(res.text + ' (oran ' + res.odds.label + ', zar ' + res.die + ')', 2800);
    }
    afterAction();
  }

  function fxCombat(res) {
    V.effect(res.defHex, '', null, 'boom');
    const parts = [];
    if (res.defLost) parts.push('−' + res.defLost);
    if (res.retreatedTo >= 0) parts.push('çekildi');
    if (res.destroyed) parts.push('imha');
    V.effect(res.defHex, parts.length ? parts.join(' ') : res.code === '-' ? 'sonuçsuz' : 'tutundu', res.side === 'TR' ? '#1d6b2a' : '#8b1a1a');
    if (res.attLost) {
      const h = res.survivors[0] ? res.survivors[0].hex : res.defHex;
      V.effect(h, 'saldıran −' + res.attLost, res.side === 'TR' ? '#8b1a1a' : '#1d6b2a');
    }
    V.dirty = true;
  }
  function fxAir(res) {
    V.effect(res.hex, '', null, 'boom');
    V.effect(res.hex, '✈ ' + ({ miss: 'ıska', disrupt: 'sarsıldı', loss: '−1 kademe' }[res.outcome]), res.side === 'TR' ? '#1d6b2a' : '#8b1a1a');
    V.dirty = true;
  }

  function doAir(target) {
    const st = UI.state;
    const res = R.airStrike(st, 'TR', target);
    UI.mode = 'normal';
    if (res) {
      fxAir(res);
      toast('Hava saldırısı: ' + ({ miss: 'isabet yok', disrupt: target.name + ' sarsıldı', loss: target.name + ' 1 kademe kaybetti' }[res.outcome]) + ' (zar ' + res.die + (res.mod ? (res.mod > 0 ? '+' : '') + res.mod : '') + ')', 2600);
    }
    afterAction();
  }

  function afterAction() {
    const st = UI.state;
    if (UI.sel && !R.alive(st, UI.sel)) UI.sel = null;
    UI.reach = UI.sel && st.phase === 'TR' && UI.sel.side === 'TR' ? R.reachable(st, UI.sel) : null;
    computeTargets();
    refresh();
  }

  // ------------------------------------------------------------ tıklama
  async function onHexClick(i) {
    const st = UI.state;
    if (!st || UI.busy || i < 0) return;
    const u = R.unitAt(st, i);
    if (st.phase === 'deploy') {
      if (u && u.side === 'TR') {
        if (R.type(u).static) { toast('Kuşatılmış bölgelerdeki mücahitler yerlerinden ayrılamaz.'); return; }
        selectUnit(UI.sel === u ? null : u);
        return;
      }
      if (UI.sel && R.canDeployTo(st, UI.sel, i)) {
        R.deployMove(st, UI.sel, i);
        refresh();
        return;
      }
      if (UI.sel && !u) toast(st.stage === 1 ? 'Paraşütçüler yeşil iniş bölgesine, mücahitler Lefkoşa Türk kesimine, çıkarma birlikleri plaja yerleşebilir.' : 'Birlikler yalnızca Türk kontrolündeki ve ikmali olan boş altıgenlere yerleşebilir.');
      deselect();
      return;
    }
    if (st.phase !== 'TR') return;
    if (UI.mode === 'air') {
      if (u && u.side === 'GR') doAir(u);
      else { UI.mode = 'normal'; computeTargets(); refresh(); }
      return;
    }
    if (u && u.side === 'TR') { selectUnit(UI.sel === u ? null : u); return; }
    if (u && u.side === 'GR') {
      if (readyAttackers(i).length) openAttack(i);
      else { selectUnit(null); toast(u.name + ': saldırabilecek komşu birliğiniz yok.'); }
      return;
    }
    if (UI.sel && UI.reach && UI.reach.dests.has(i)) {
      const mover = UI.sel;
      const mv = R.moveUnit(st, mover, i, UI.reach);
      if (!mv) return;
      UI.busy = true;
      UI.reach = null;
      refresh();
      await V.animate(mover.id, mv.path, 70);
      UI.busy = false;
      afterAction();
      if (st.phase === 'over') showEnd();
      return;
    }
    deselect();
  }

  function nextUnit() {
    const st = UI.state;
    if (!st || st.phase !== 'TR' || UI.busy) return;
    const list = st.units.filter(function (u) { return u.side === 'TR' && !UI.isDone(u) && !R.type(u).static; });
    if (!list.length) { toast('Hareket edecek birlik kalmadı.'); return; }
    const k = UI.sel ? list.indexOf(UI.sel) : -1;
    const u = list[(k + 1) % list.length];
    selectUnit(u);
    scrollToHex(u.hex);
  }
  function scrollToHex(i) {
    const wrap = $('mapWrap');
    const p = V.hexXY(i);
    const x = p.x * V.zoom, y = p.y * V.zoom;
    const offX = Math.max(0, (wrap.clientWidth - V.WIDTH * V.zoom) / 2);
    const left = x + offX - wrap.clientWidth / 2, top = y - wrap.clientHeight / 2;
    if (x + offX < wrap.scrollLeft + 40 || x + offX > wrap.scrollLeft + wrap.clientWidth - 40 ||
      y < wrap.scrollTop + 40 || y > wrap.scrollTop + wrap.clientHeight - 40) {
      wrap.scrollTo({ left: left, top: top, behavior: 'smooth' });
    }
  }

  // ------------------------------------------------------------ tur akışı
  function newGame(diff) {
    const st = R.newGame({ difficulty: diff });
    startWithState(st);
    toast('Paraşüt taburlarının iniş noktalarını seçin, sonra "Harekâtı başlat"a basın.', 3800);
  }
  function startWithState(st) {
    UI.state = st;
    V.state = st;
    UI.sel = null; UI.reach = null; UI.mode = 'normal'; UI.lastCombatHex = -1; UI.busy = false;
    V.anims.clear(); V.effects = [];
    computeTargets();
    refresh();
    requestAnimationFrame(function () { UI.centerOn(R.cityHex(st.stage === 2 ? 'Lefkoşa' : 'Girne')); });
    if (st.phase === 'GR') runEnemy();
    else if (st.phase === 'interlude') showInterlude();
    else if (st.phase === 'over') showEnd();
  }

  async function runEnemy() {
    const st = UI.state;
    UI.busy = true;
    UI.sel = null; UI.reach = null; UI.mode = 'normal';
    computeTargets();
    refresh();
    toast(st.turn + '. Tur — Rum ve Yunan kuvvetlerinin hamlesi', 1600);
    await delay(500 / UI.speed);
    const hooks = {
      moved: async function (u, path) {
        refreshLight();
        if (UI.speed >= 3) { V.dirty = true; return; }
        await V.animate(u.id, path, 85 / UI.speed);
      },
      combat: async function (res) {
        fxCombat(res);
        UI.lastCombatHex = res.defHex;
        refreshLight();
        await delay(650 / UI.speed);
      },
      air: async function (res) {
        fxAir(res);
        refreshLight();
        await delay(450 / UI.speed);
      },
    };
    try {
      await O.AI.runEnemyPhase(st, hooks);
    } catch (e) {
      console.error(e);
      R.log(st, 'Yapay zekâ hatası: ' + e.message, 'bad');
    }
    if (UI.state !== st) return; // bu arada yeni oyun başlatıldı
    R.endEnemyPhase(st);
    UI.busy = false;
    UI.lastCombatHex = -1;
    refresh();
    if (st.phase === 'over') { showEnd(); return; }
    if (st.phase === 'interlude') { showInterlude(); return; }
    save(true);
    toast(st.turn + '. Tur — Sıra sizde. ' + R.WEATHER[st.weather].icon + ' ' + R.WEATHER[st.weather].label, 2600);
  }

  function endTurn() {
    const st = UI.state;
    if (!st || UI.busy) return;
    if (st.phase === 'deploy') {
      R.finishDeploy(st);
      UI.sel = null; UI.reach = null;
      save(true);
      refresh();
      toast(st.turn + '. Tur — ' + R.dateLabel(st.turn) + '. Harekât başladı.', 2600);
      return;
    }
    if (st.phase !== 'TR') return;
    R.endTurkishPhase(st);
    runEnemy();
  }

  // ------------------------------------------------------------ paneller
  function phaseLabel(st) {
    return { deploy: st.stage === 2 ? 'Ateşkes: Yeniden Diziliş' : 'Çıkarma ve İniş', TR: 'Türk Hamlesi', GR: 'Rum Hamlesi', interlude: 'Ateşkes', over: 'Harekât Bitti' }[st.phase];
  }
  function refreshLight() {
    renderLog();
    renderVP();
    V.dirty = true;
  }
  function refresh() {
    const st = UI.state;
    V.ui = UI;
    V.dirty = true;
    if (!st) return;
    const w = R.WEATHER[st.weather];
    $('turnInfo').innerHTML = st.phase === 'deploy'
      ? '<b>' + (st.stage === 2 ? 'Ateşkes' : 'Çıkarma') + '</b> · ' + (st.stage === 2 ? 'Ağustos 1974' : '20 Temmuz 1974, şafak')
      : '<b>' + st.turn + '/' + st.maxTurns + '. Tur</b> · ' + (st.stage === 2 ? 'İkinci harekât' : 'Birinci harekât') + ' · ' + esc(R.dateLabel(st.turn)) + ' ' + w.icon;

    // aşama kutusu
    let ph = '<span class="phase-tag ' + st.phase + '">' + phaseLabel(st) + '</span>';
    if (st.phase === 'deploy') {
      ph += st.stage === 1
        ? '<p class="hint">20 Temmuz şafak. Çıkarma birlikleri Pentemili\'de. Paraşüt taburlarını Lefkoşa Türk kesimi ve çevresindeki yeşil altıgenlere indirin; mücahit sancaklarını Türk kesimi içinde dizebilirsiniz. Bir birliğe, sonra yeşil altıgene tıklayın.</p>' +
          '<p class="hint">İpucu: Beşparmak sırtı tek altıgen kalınlığında ama sarp. Geçitleri (Boğaz) iki yönden sıkıştırın; paraşütçüleri Rum birliklerine doğrudan komşu bırakmayın.</p>'
        : '<p class="hint">Ateşkes dönemi. Yeni gelen tanklar ve piyade alayları dahil tüm birliklerinizi Türk kontrolündeki ve ikmali olan bölgede yeniden dizin.</p>' +
          '<p class="hint">Hedefler: batıda Güzelyurt ve kuşatılmış Lefke, doğuda Değirmenlik, Geçitkale ve Mağusa. Tanklar Mesarya ovasında güçlüdür.</p>';
    } else if (st.phase !== 'over') {
      ph += '<div class="weather">' + w.icon + ' <b>' + esc(w.label) + '</b> — ' + esc(w.note) + '</div>';
      if (st.phase === 'GR') ph += '<p class="hint">Rum ve Yunan kuvvetleri harekette…</p>';
    } else if (st.result) {
      ph += '<p><b>' + esc(st.result.title) + '</b></p>';
    }
    $('phaseBox').innerHTML = ph;

    renderUnit();
    renderActions();
    renderVP();
    renderLog();
  }

  function renderUnit() {
    const st = UI.state, u = UI.sel;
    const box = $('unitBox');
    if (!u || !R.alive(st, u)) {
      box.innerHTML = '<h3>Birlik</h3><p class="hint">' + (st.phase === 'TR'
        ? 'Bir birliğe tıklayın. Beyaz altıgenler gidilebilecek yerleri, kırmızı halkalar saldırılabilecek düşmanları gösterir.'
        : st.phase === 'deploy' ? 'Yerleştirmek için bir birliğe tıklayın.' : 'Bilgi için bir birliğin üzerine gelin.') + '</p>';
      return;
    }
    const T = R.type(u), nat = O.NATION[u.nat];
    const d = R.defenseStrength(st, u);
    const tags = [];
    if (!u.inSupply) tags.push('<span class="tag warn">İkmalsiz (' + u.oos + '. tur)</span>');
    if (u.disrupted) tags.push('<span class="tag bad">Sarsılmış</span>');
    if (u.attacked) tags.push('<span class="tag">Saldırdı</span>');
    if (u.acted) tags.push('<span class="tag">Takviye aldı</span>');
    if (T.static) tags.push('<span class="tag">Sabit garnizon</span>');
    box.innerHTML = '<h3>Birlik</h3>' +
      '<div class="unit-head"><span class="unit-swatch" style="background:' + nat.fill + '"></span><div><div class="unit-name">' + esc(u.name) + '</div>' +
      '<div class="unit-type">' + esc(nat.label + ' ' + T.label) + ' · ' + esc(R.placeName(u.hex)) + '</div></div></div>' +
      '<dl class="stats">' +
      '<dt>Kademe</dt><dd class="pips">' + '●'.repeat(u.steps) + '○'.repeat(T.steps - u.steps) + '</dd>' +
      '<dt>Saldırı</dt><dd>' + num((T.atk * u.steps) / T.steps) + '</dd>' +
      '<dt>Savunma</dt><dd>' + num(d.value) + ' <span class="mods">(' + esc(d.mods.slice(1).join(', ') || 'açık arazi') + ')</span></dd>' +
      '<dt>Hareket</dt><dd>' + (T.static ? '—' : (u.side === st.phase ? u.mpLeft + ' / ' : '') + R.unitMP(st, u)) + '</dd>' +
      '<dt>Mevzi</dt><dd>' + (u.entrench ? u.entrench + '. seviye' : 'yok') + '</dd>' +
      '</dl>' + tags.join('');
  }

  function renderActions() {
    const st = UI.state;
    const box = $('actions');
    if (st.phase === 'deploy') {
      box.innerHTML = '<button id="bReset">Başlangıç dizilişi</button><button id="bStart" class="primary">' + (st.stage === 2 ? 'İkinci harekâtı başlat ▶' : 'Harekâtı başlat ▶') + '</button>';
      $('bReset').onclick = function () { R.resetDeploy(st); deselect(); };
      $('bStart').onclick = endTurn;
      return;
    }
    if (st.phase === 'over') {
      box.innerHTML = '<button id="bRes" class="wide primary">Sonucu göster</button>';
      $('bRes').onclick = showEnd;
      return;
    }
    if (st.phase === 'interlude') {
      box.innerHTML = '<button id="bInt" class="wide primary">Ateşkes raporu ve ikinci harekât ▶</button>';
      $('bInt').onclick = showInterlude;
      return;
    }
    const my = st.phase === 'TR' && !UI.busy;
    const canRep = my && UI.sel && R.canReplace(st, UI.sel);
    box.innerHTML =
      '<button id="bAir"' + (my && st.air.TR > 0 ? '' : ' disabled') + (UI.mode === 'air' ? ' class="active"' : '') + '>✈ Hava saldırısı (' + st.air.TR + ')</button>' +
      '<button id="bRep"' + (canRep ? '' : ' disabled') + ' title="Seçili hasarlı birliğe +1 kademe">⟲ Takviye (' + st.rep.TR + ')</button>' +
      '<button id="bNext"' + (my ? '' : ' disabled') + '>Sıradaki birlik</button>' +
      '<button id="bEnd" class="primary"' + (my ? '' : ' disabled') + '>Turu bitir ⏭</button>';
    $('bAir').onclick = function () {
      UI.mode = UI.mode === 'air' ? 'normal' : 'air';
      if (UI.mode === 'air') { UI.sel = null; UI.reach = null; toast('Hava saldırısı: bir düşman birliğine tıklayın.'); }
      computeTargets();
      refresh();
    };
    $('bRep').onclick = function () { if (UI.sel && R.replace(st, UI.sel)) { toast(UI.sel.name + ' takviye edildi.'); afterAction(); } };
    $('bNext').onclick = nextUnit;
    $('bEnd').onclick = endTurn;
  }

  function renderVP() {
    const st = UI.state;
    const vp = R.turkishVP(st);
    const max = R.maxVP();
    const pct = function (v) { return (Math.max(0, Math.min(max, v)) / max) * 100; };
    const seg = [[0, 9, '#b8463d'], [10, 17, '#d9b44a'], [18, 24, '#8fbf6a'], [25, max, '#2f7d3a']];
    const bar = seg.map(function (x) { return '<span style="width:' + (pct(x[1] + 1) - pct(x[0])) + '%;background:' + x[2] + '"></span>'; }).join('');
    const tier = R.VP_TIERS.find(function (t) { return vp >= t.min; });
    const objs = R.objectives(st).map(function (o) {
      const title = (o.hold ? 'Elde tutulmalı' : 'Alınması gereken hedef') + (o.stage === 2 ? ' (ikinci harekât)' : ' (birinci harekât)');
      return '<span class="city-chip ' + (o.held ? 'TR' : 'DE') + '" title="' + title + '">' + (o.held ? '✓ ' : '') + esc(o.name) + ' ' + o.vp + '</span>';
    }).join('');
    $('vpBox').innerHTML = '<h3>Hedefler</h3>' +
      '<div class="vp-line"><span>Türk hedef puanı</span><span class="vp-big">' + vp + ' <small class="mods">/ ' + max + '</small></span></div>' +
      '<div class="vp-scale">' + bar + '</div><div class="vp-marker"><i style="left:calc(' + pct(vp) + '% - 1px)"></i></div>' +
      '<div class="hint">Şu an: <b>' + esc(tier.title) + '</b> · Tarihteki ateşkes hattı ≈ ' + O.HISTORICAL_VP + ' puan.</div>' +
      '<div class="cities">' + objs + '</div>';
  }

  function renderLog() {
    const st = UI.state;
    const items = st.log.slice(-120).reverse();
    $('log').innerHTML = items.map(function (l) { return '<li class="' + esc(l.kind) + '">' + esc(l.text) + '</li>'; }).join('');
  }

  // ------------------------------------------------------------ ipucu kutusu
  function tooltipFor(i) {
    const st = UI.state;
    const h = O.MAP.hexes[i];
    if (!st || !h) return '';
    let s = '';
    if (h.terrain === 'sea') return '<span class="muted">Deniz</span>';
    if (h.terrain === 'sba') return '<b>İngiliz egemen üs bölgesi</b><br><span class="muted">Çatışmanın dışında; girilemez.</span>';
    s += '<b>' + esc(h.city ? h.city.name : (h.near ? h.near + ' yakını' : R.TERRAIN_LABEL[h.terrain])) + '</b>';
    if (h.city && h.city.vp) s += ' <span class="muted">· ' + (h.city.major ? 'ana hedef' : h.city.vp + ' zafer puanı') + '</span>';
    s += '<br>' + esc(R.TERRAIN_LABEL[h.terrain]);
    if (h.river) s += ' · ' + esc(h.river) + ' nehri';
    if (h.fort) s += ' · <b>' + esc(h.fortLine) + '</b>';
    if (h.city && h.city.port) s += ' · liman';
    s += '<br><span class="muted">' + (h.enclave ? esc(h.enclave) + ' Türk bölgesi · ' : '') + (h.beach ? 'Çıkarma plajı · ' : '') + (st.owner[i] === 'GR' ? 'Rum kontrolünde' : 'Türk kontrolünde') + (h.coastal ? ' · kıyı' : '') + '</span>';
    s += '<br><span class="muted">Savunma çarpanı ×' + num(R.terrainDefMult(h).m) + '</span>';
    const u = R.unitAt(st, i);
    if (u) {
      const T = R.type(u);
      s += '<hr style="border:none;border-top:1px solid #444;margin:5px 0">' + '<b>' + esc(u.name) + '</b><br>' +
        esc(O.NATION[u.nat].label + ' ' + T.label) + ' · ' + u.steps + '/' + T.steps + ' kademe<br>' +
        'Savunma ' + num(R.defenseStrength(st, u).value) + (u.entrench ? ' · mevzi ' + u.entrench : '') +
        (!u.inSupply ? ' · <span style="color:#ffd84d">ikmalsiz</span>' : '') + (u.disrupted ? ' · <span style="color:#ff9b21">sarsılmış</span>' : '');
      if (st.phase === 'TR' && u.side === 'GR') {
        const att = readyAttackers(i);
        if (att.length) {
          const o = R.attackOdds(st, att, i);
          s += '<br><span style="color:#ffb3a8">Tüm komşularla saldırı: ' + o.label + '</span>';
        }
      }
    } else if (UI.reach && UI.reach.dests.has(i)) {
      s += '<br><span style="color:#cfe8ff">Hareket maliyeti: ' + UI.reach.cost[i] + '</span>';
    }
    return s;
  }

  // ------------------------------------------------------------ başlangıç
  // Ada geniş olduğu için harita okunabilir bir büyüklükte açılır ve çatışma bölgesine ortalanır
  UI.fitZoom = function () {
    const wrap = $('mapWrap');
    const z = Math.min(wrap.clientWidth / V.WIDTH, wrap.clientHeight / V.HEIGHT);
    V.setZoom(Math.max(window.innerWidth < 700 ? 0.6 : 0.85, Math.min(1.6, z)));
  };
  UI.centerOn = function (i) {
    const wrap = $('mapWrap');
    const p = V.hexXY(i);
    const offX = Math.max(0, (wrap.clientWidth - V.WIDTH * V.zoom) / 2);
    wrap.scrollTo({ left: p.x * V.zoom + offX - wrap.clientWidth / 2, top: p.y * V.zoom - wrap.clientHeight / 2 });
  };

  UI.init = function () {
    V.init($('map'));
    V.ui = UI;
    const canvas = $('map');
    const tip = $('tooltip');
    canvas.addEventListener('mousemove', function (e) {
      const p = V.clientToLogical(e.clientX, e.clientY);
      const i = V.pick(p.x, p.y);
      if (i !== UI.hover) { UI.hover = i; V.dirty = true; }
      if (i >= 0 && UI.state) {
        tip.innerHTML = tooltipFor(i);
        tip.classList.remove('hidden');
        const tw = tip.offsetWidth, th = tip.offsetHeight;
        let x = e.clientX + 16, y = e.clientY + 16;
        if (x + tw > window.innerWidth - 8) x = e.clientX - tw - 12;
        if (y + th > window.innerHeight - 8) y = e.clientY - th - 12;
        tip.style.left = x + 'px';
        tip.style.top = y + 'px';
      } else tip.classList.add('hidden');
    });
    canvas.addEventListener('mouseleave', function () { UI.hover = -1; tip.classList.add('hidden'); V.dirty = true; });
    canvas.addEventListener('click', function (e) {
      const p = V.clientToLogical(e.clientX, e.clientY);
      onHexClick(V.pick(p.x, p.y));
    });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); deselect(); });

    $('btnZoomIn').onclick = function () { UI.userZoomed = true; V.setZoom(V.zoom * 1.2); };
    $('btnZoomOut').onclick = function () { UI.userZoomed = true; V.setZoom(V.zoom / 1.2); };
    $('btnZoomFit').onclick = function () { UI.userZoomed = false; UI.fitZoom(); };
    $('btnHelp').onclick = function () { showHelp(); };
    $('btnSave').onclick = function () { if (!UI.busy) save(false); };
    $('btnMenu').onclick = showMenu;
    $('btnBoard').onclick = function () { showBoard(); };
    $('ver').textContent = 'v' + O.VERSION;
    Board.onChange(function () {
      if (UI.modalKind === 'board') showBoard(UI.boardBack);
      else if (UI.modalKind === 'end') renderBoardSlot();
    });
    Board.init();
    $('modal').addEventListener('click', function (e) {
      if (e.target === $('modal') && UI.state && !$('modalCard').querySelector('#mStart')) closeModal();
    });
    window.addEventListener('resize', function () { if (!UI.userZoomed) UI.fitZoom(); });
    window.addEventListener('keydown', function (e) {
      if (!$('modal').classList.contains('hidden')) {
        if (e.key === 'Escape' && UI.state && !$('modalCard').querySelector('#mStart')) closeModal();
        return;
      }
      if (e.key === 'Escape') deselect();
      else if (e.key === 'Enter') endTurn();
      else if (e.key === 'n' || e.key === 'N') nextUnit();
      else if ((e.key === 'h' || e.key === 'H') && UI.state && UI.state.phase === 'TR' && UI.state.air.TR > 0 && !UI.busy) {
        UI.mode = 'air'; UI.sel = null; UI.reach = null; computeTargets(); refresh(); toast('Hava saldırısı: bir düşman birliğine tıklayın.');
      } else if ((e.key === 't' || e.key === 'T') && UI.sel && R.canReplace(UI.state, UI.sel)) {
        R.replace(UI.state, UI.sel); afterAction();
      } else if (e.key === '+' || e.key === '=') { UI.userZoomed = true; V.setZoom(V.zoom * 1.2); }
      else if (e.key === '-') { UI.userZoomed = true; V.setZoom(V.zoom / 1.2); }
    });

    UI.fitZoom();
    // arka planda haritayı göster
    V.state = R.newGame({ seed: 7 });
    UI.state = null;
    showIntro();
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', UI.init);
    else UI.init();
  }
})(Oyun);
