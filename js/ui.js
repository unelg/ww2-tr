// Çakmak Hattı 1943 — arayüz, etkileşim ve oyun akışı.
var Oyun = globalThis.Oyun = globalThis.Oyun || {};
(function (O) {
  'use strict';
  const R = O.Rules, V = O.View;
  const SAVE_KEY = 'cakmak-hatti-1943-kayit';
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
      for (const u of st.units) if (u.side === 'DE') UI.targets.add(u.id);
      return;
    }
    if (UI.sel && UI.sel.side === 'TR' && R.canAttack(st, UI.sel)) {
      for (const nb of O.MAP.hexes[UI.sel.hex].nbrs) {
        const e = R.unitAt(st, nb);
        if (e && e.side === 'DE') UI.targets.add(e.id);
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
  function openModal(html, onBind) {
    $('modalCard').innerHTML = html;
    $('modal').classList.remove('hidden');
    if (onBind) onBind($('modalCard'));
  }
  function closeModal() {
    $('modal').classList.add('hidden');
    $('modalCard').innerHTML = '';
  }
  UI.closeModal = closeModal;

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
      '<h2>Çakmak Hattı 1943</h2>' +
      '<p class="sub">Alternatif tarih · Trakya harekâtı · Ocak – Nisan 1943</p>' +
      '<p>Türkiye savaşın başından beri tarafsız. Adını Mareşal Fevzi Çakmak\'tan alan ve Karadeniz kıyısındaki Kıyıköy\'den Vize, Lüleburgaz ve Hayrabolu üzerinden Saros Körfezi\'ne uzanan <b>Çakmak Hattı</b> bu senaryoda tamamlanmış; 1. Ordu sığınaklarına yerleşmiştir.</p>' +
      '<p><b>4 Ocak 1943</b> sabahı, Stalingrad\'da sarsılan Mihver, Boğazları ele geçirip Karadeniz\'e yol açmak için Bulgaristan ve işgal altındaki Yunan Trakyası\'ndan sınırı geçer. Panzer tümenleri Ergene ovasına, dağ tümenleri Istranca\'ya yüklenir.</p>' +
      '<p>Görev: <b>İstanbul\'u ve Gelibolu Yarımadası\'nı korumak</b>, 16 hafta boyunca dayanmak. Bahara doğru İngiliz hava ve kara desteği gelecek.</p>' +
      '<h3>Zorluk</h3>' +
      '<div class="diff">' +
      '<label><input type="radio" name="diff" value="kolay">Kolay<small>Zayıf taarruz, 2:1 altı saldırı yok</small></label>' +
      '<label><input type="radio" name="diff" value="normal" checked>Normal<small>Tarihî ölçekte bir taarruz</small></label>' +
      '<label><input type="radio" name="diff" value="zor">Zor<small>Güçlü Luftwaffe, ek panzer tümeni</small></label>' +
      '</div>' +
      '<div class="row end">' +
      (canLoad ? '<button id="mLoad">Kayıtlı oyunu yükle</button>' : '') +
      '<button id="mRules">Kurallar</button>' +
      '<button id="mStart" class="primary">Konuşlanmaya başla</button>' +
      '</div>',
      function (el) {
        el.querySelector('#mStart').onclick = function () {
          const d = el.querySelector('input[name=diff]:checked').value;
          closeModal();
          newGame(d);
        };
        el.querySelector('#mRules').onclick = function () { showHelp(showIntro); };
        const l = el.querySelector('#mLoad');
        if (l) l.onclick = function () { closeModal(); if (!load()) showIntro(); };
      }
    );
  }

  function showHelp(back) {
    const crt = R.CRT.map(function (row, i) {
      return '<tr><th>' + R.ODDS_LABEL[i] + '</th>' + row.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>';
    }).join('');
    openModal(
      '<h2>Kurallar</h2>' +
      '<p class="sub">Her tur bir haftadır. Önce Mihver (yapay zekâ), sonra siz oynarsınız. 16. turun sonunda oyun biter.</p>' +
      '<h3>Hareket</h3><ul>' +
      '<li>Birliğinize tıklayın; beyaz altıgenlere gidebilir. Her altıgende tek birlik bulunabilir.</li>' +
      '<li>Maliyet: açık arazi 1, orman/tepe 2 (motorlu +1, karda +1, dağ tümenleri 1), nehre giriş +1. Hareket etmemiş birlik her zaman 1 altıgen gidebilir.</li>' +
      '<li><b>Kontrol bölgesi:</b> Düşmana komşu bir altıgene giren birlik o tur durur.</li>' +
      '<li>Garnizonlar (Edirne, İstanbul, Gelibolu) yerinden oynamaz.</li></ul>' +
      '<h3>Saldırı</h3><ul>' +
      '<li>Birliğiniz seçiliyken kırmızı halkalı düşmana tıklayın. Düşmana komşu tüm hazır birlikleriniz saldırıya katılabilir. Saldıran birlik o tur bir daha hareket edemez.</li>' +
      '<li>Toplam saldırı ÷ savunma = oran. Oran sütunu ve zar sonucu belirler. Savunan çekilirse saldıranlardan biri boşalan altıgene ilerleyebilir.</li>' +
      '<li>Savunma çarpanları: Çakmak/Çatalca hattı ×2, Bolayır ve Edirne kalesi ×1,5, orman/tepe ×1,4, şehir ×1,3 (İstanbul ×1,6), nehir ×1,2, mevzi ×1,15 / ×1,3.</li>' +
      '<li>Zırhlı birlikler orman, tepe ve şehre saldırırken ×0,6. Kar: saldırı ×0,8; çamur: motorlu saldırı ×0,8.</li>' +
      '<li>Çekilecek boş altıgen yoksa ya da çekilme düşman kontrol bölgesine olursa +1 kademe kayıp.</li></ul>' +
      '<table class="crt"><tr><th>Oran</th><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th></tr>' + crt + '</table>' +
      '<p class="mods">A1/A2: saldıran 1/2 kademe kaybeder · EX: iki taraf 1\'er kademe · DR: savunan çekilir · D1: savunan 1 kademe · D1R/D2R: savunan 1/2 kademe kaybeder ve çekilir · –: sonuç yok</p>' +
      '<h3>Mevzi, ikmal, takviye, hava</h3><ul>' +
      '<li><b>Mevzi:</b> Bir tur boyunca hareket etmeyen ve saldırmayan birlik mevzi kazanır (en çok 2). Hareket edince sıfırlanır. Başlangıçta tüm birlikleriniz 2. seviyededir.</li>' +
      '<li><b>İkmal:</b> Birlik, düşman birliği ve boş düşman kontrol bölgesinden geçmeyen, kendi kontrolünüzdeki altıgenlerden oluşan bir yolla bir limana (İstanbul, Tekirdağ, Silivri, Gelibolu, Eceabat) bağlı olmalıdır. İkmalsiz birlik: saldırı ×0,5, savunma ×0,75, hareket −1; üst üste iki tur ikmalsiz kalırsa her tur 1 kademe kaybeder. (Sarı ünlem işareti)</li>' +
      '<li><b>Takviye:</b> Her tur 1 (6. turdan sonra 2) hak. Hareket etmemiş, ikmalli ve hasarlı birliğe +1 kademe verir; birlik o tur başka bir şey yapamaz.</li>' +
      '<li><b>Hava saldırısı:</b> Düşman birliğini sarsar (saldırı/savunma ×0,7, mevzi −1) ya da 1 kademe kaybettirir. Karda uçuş yoktur. Önce hava saldırısı, sonra kara taarruzu yapmak etkilidir.</li></ul>' +
      '<h3>Zafer</h3><ul>' +
      '<li>Mihver <b>İstanbul</b>\'u alırsa oyun anında biter.</li>' +
      '<li>Aksi halde 16. turun sonunda Mihver\'in elindeki Türk şehirlerinin puanı (haritadaki rakamlar) toplanır; sizin aldığınız sınır ötesi şehirler bu puandan düşülür: ' +
      '0–4 Türk Kesin Zaferi · 5–10 Türk Zaferi · 11–16 Berabere · 17+ Mihver Zaferi.</li></ul>' +
      '<h3>Kısayollar</h3><p><kbd>Enter</kbd> turu bitir · <kbd>N</kbd> sıradaki birlik · <kbd>H</kbd> hava saldırısı · <kbd>T</kbd> takviye · <kbd>Esc</kbd> seçimi bırak · <kbd>+</kbd>/<kbd>−</kbd> yakınlaştır</p>' +
      '<h3>Harita</h3><div class="legend">' +
      '<i style="background:#b3262e"></i><span>Türk birliği. Pul üzerindeki rakamlar tam güçteki saldırı-savunma-hareket değerleridir; sağdaki noktalar kalan kademeyi gösterir, güç kademeyle orantılı düşer.</span>' +
      '<i style="background:#c2a25b"></i><span>İngiliz birliği</span>' +
      '<i style="background:#5b6672"></i><span>Alman birliği</span>' +
      '<i style="background:#3d6b4f"></i><span>Bulgar birliği</span>' +
      '<i style="background:repeating-linear-gradient(45deg,#cfd3d8,#cfd3d8 3px,#9aa3ad 3px,#9aa3ad 5px)"></i><span>Mihver\'in ele geçirdiği Türk toprağı</span>' +
      '<i style="background:#efe5c4;border:2px dashed #3a2e22"></i><span>Tahkimat altıgeni</span>' +
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
      '<button id="mSpeed">Mihver animasyon hızı: ' + (UI.speed === 1 ? 'Normal' : UI.speed > 1 ? 'Hızlı' : 'Yavaş') + '</button>' +
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

  function showEnd() {
    const st = UI.state;
    const r = st.result;
    if (!r) return;
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* yok say */ }
    const cls = r.winner === 'TR' ? 'TR' : r.winner === 'DE' ? 'DE' : 'draw';
    openModal(
      '<h2>Harekât sona erdi</h2>' +
      '<p class="sub">' + esc(R.dateLabel(st.turn)) + ' · ' + esc(R.DIFFICULTY[st.difficulty].label) + '</p>' +
      '<div class="result-banner ' + cls + '">' + esc(r.title) + '</div>' +
      '<p>' + esc(r.text) + '</p>' +
      '<dl class="stats">' +
      '<dt>Mihver zafer puanı</dt><dd>' + r.vp + '</dd>' +
      '<dt>Türk kayıpları</dt><dd>' + st.stats.lost.TR + ' kademe, ' + st.stats.destroyed.TR + ' birlik imha</dd>' +
      '<dt>Mihver kayıpları</dt><dd>' + st.stats.lost.DE + ' kademe, ' + st.stats.destroyed.DE + ' birlik imha</dd>' +
      '</dl>' +
      '<div class="row end"><button id="mMap">Haritaya bak</button><button id="mNew" class="primary">Yeni oyun</button></div>',
      function (el) {
        el.querySelector('#mNew').onclick = function () { closeModal(); showIntro(); };
        el.querySelector('#mMap').onclick = closeModal;
      }
    );
  }

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
        if (R.type(u).static) { toast('Garnizonlar kalelerinden ayrılamaz.'); return; }
        selectUnit(UI.sel === u ? null : u);
        return;
      }
      if (UI.sel && R.canDeployTo(st, UI.sel, i)) {
        R.deployMove(st, UI.sel, i);
        refresh();
        return;
      }
      if (UI.sel && !u) toast('Birlikler yalnızca Türk Trakyası\'nda boş altıgenlere yerleşebilir.');
      deselect();
      return;
    }
    if (st.phase !== 'TR') return;
    if (UI.mode === 'air') {
      if (u && u.side === 'DE') doAir(u);
      else { UI.mode = 'normal'; computeTargets(); refresh(); }
      return;
    }
    if (u && u.side === 'TR') { selectUnit(UI.sel === u ? null : u); return; }
    if (u && u.side === 'DE') {
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
    toast('Birliklerinizi yerleştirin, sonra "Savaşı başlat"a basın.', 3500);
  }
  function startWithState(st) {
    UI.state = st;
    V.state = st;
    UI.sel = null; UI.reach = null; UI.mode = 'normal'; UI.lastCombatHex = -1; UI.busy = false;
    V.anims.clear(); V.effects = [];
    computeTargets();
    refresh();
    if (st.phase === 'DE') runGerman();
    else if (st.phase === 'over') showEnd();
  }

  async function runGerman() {
    const st = UI.state;
    UI.busy = true;
    UI.sel = null; UI.reach = null; UI.mode = 'normal';
    computeTargets();
    refresh();
    toast(st.turn + '. Tur — Mihver hamlesi', 1600);
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
      await O.AI.runGermanPhase(st, hooks);
    } catch (e) {
      console.error(e);
      R.log(st, 'Yapay zekâ hatası: ' + e.message, 'bad');
    }
    if (UI.state !== st) return; // bu arada yeni oyun başlatıldı
    if (st.phase === 'over') { UI.busy = false; refresh(); showEnd(); return; }
    R.endGermanPhase(st);
    UI.busy = false;
    UI.lastCombatHex = -1;
    save(true);
    refresh();
    toast(st.turn + '. Tur — Sıra sizde. ' + R.WEATHER[st.weather].icon + ' ' + R.WEATHER[st.weather].label, 2600);
  }

  function endTurn() {
    const st = UI.state;
    if (!st || UI.busy) return;
    if (st.phase === 'deploy') {
      R.finishDeploy(st);
      UI.sel = null; UI.reach = null;
      refresh();
      runGerman();
      return;
    }
    if (st.phase !== 'TR') return;
    R.endTurkishPhase(st);
    if (st.phase === 'over') { refresh(); showEnd(); return; }
    runGerman();
  }

  // ------------------------------------------------------------ paneller
  function phaseLabel(st) {
    return { deploy: 'Konuşlanma', TR: 'Türk Hamlesi', DE: 'Mihver Hamlesi', over: 'Savaş Bitti' }[st.phase];
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
      ? '<b>Konuşlanma</b> · Ocak 1943'
      : '<b>' + st.turn + '/' + st.maxTurns + '. Tur</b> · ' + esc(R.dateLabel(st.turn)) + ' · ' + w.icon + ' ' + esc(w.label);

    // aşama kutusu
    let ph = '<span class="phase-tag ' + st.phase + '">' + phaseLabel(st) + '</span>';
    if (st.phase === 'deploy') {
      ph += '<p class="hint">Çakmak Hattı tamamlandı. Birliklerinizi Türk Trakyası\'nda dilediğiniz yere dizin: bir birliğe, sonra yeşil altıgene tıklayın. Başlangıçta tüm birlikler 2. seviye mevzidedir.</p>' +
        '<p class="hint">İpucu: İleri mevziler (Edirne, Kırklareli) zaman kazandırır ama kuşatılabilir. Hattın arkasında hareketli bir yedek bırakın.</p>';
    } else if (st.phase !== 'over') {
      ph += '<div class="weather">' + w.icon + ' <b>' + esc(w.label) + '</b> — ' + esc(w.note) + '</div>';
      if (st.phase === 'DE') ph += '<p class="hint">Mihver kuvvetleri harekette…</p>';
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
      box.innerHTML = '<button id="bReset">Önerilen diziliş</button><button id="bStart" class="primary">Savaşı başlat ▶</button>';
      $('bReset').onclick = function () { R.resetDeploy(st); deselect(); };
      $('bStart').onclick = endTurn;
      return;
    }
    if (st.phase === 'over') {
      box.innerHTML = '<button id="bRes" class="wide primary">Sonucu göster</button>';
      $('bRes').onclick = showEnd;
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
    const vp = R.germanVP(st);
    const max = 26;
    const pct = function (v) { return (Math.max(0, Math.min(max, v)) / max) * 100; };
    const seg = [[0, 4, '#2f7d3a'], [5, 10, '#8fbf6a'], [11, 16, '#d9b44a'], [17, max, '#b8463d']];
    const bar = seg.map(function (s) { return '<span style="width:' + (pct(s[1] + 1) - pct(s[0])) + '%;background:' + s[2] + '"></span>'; }).join('');
    const cities = O.MAP.cities.filter(function (c) { return c.country === 'TR' && c.vp; })
      .sort(function (a, b) { return b.vp - a.vp; })
      .map(function (c) {
        const own = st.owner[c.hex];
        return '<span class="city-chip ' + own + '" title="' + (own === 'DE' ? 'Mihver elinde' : 'Türk elinde') + '">' + esc(c.name) + ' ' + (c.major ? '★' : c.vp) + '</span>';
      }).join('');
    const tier = R.VP_TIERS.find(function (t) { return vp <= t.max; });
    $('vpBox').innerHTML = '<h3>Durum</h3>' +
      '<div class="vp-line"><span>Mihver zafer puanı</span><span class="vp-big">' + vp + '</span></div>' +
      '<div class="vp-scale">' + bar + '</div><div class="vp-marker"><i style="left:calc(' + pct(vp) + '% - 1px)"></i></div>' +
      '<div class="hint">Şu an: <b>' + esc(tier.title) + '</b> · İstanbul düşerse Mihver kazanır.</div>' +
      '<div class="cities">' + cities + '</div>';
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
    if (h.terrain === 'anadolu') return '<b>Anadolu yakası</b><br><span class="muted">Oyun dışı; takviyeler limanlardan gelir.</span>';
    s += '<b>' + esc(h.city ? h.city.name : (h.near ? h.near + ' yakını' : R.TERRAIN_LABEL[h.terrain])) + '</b>';
    if (h.city && h.city.vp) s += ' <span class="muted">· ' + (h.city.major ? 'ana hedef' : h.city.vp + ' zafer puanı') + '</span>';
    s += '<br>' + esc(R.TERRAIN_LABEL[h.terrain]);
    if (h.river) s += ' · ' + esc(h.river) + ' nehri';
    if (h.fort) s += ' · <b>' + esc(h.fortLine) + '</b>';
    if (h.city && h.city.port) s += ' · liman';
    s += '<br><span class="muted">' + esc(R.COUNTRY_LABEL[h.country]) + ' · ' + (st.owner[i] === 'DE' ? 'Mihver kontrolünde' : 'Türk kontrolünde') + '</span>';
    s += '<br><span class="muted">Savunma çarpanı ×' + num(R.terrainDefMult(h).m) + '</span>';
    const u = R.unitAt(st, i);
    if (u) {
      const T = R.type(u);
      s += '<hr style="border:none;border-top:1px solid #444;margin:5px 0">' + '<b>' + esc(u.name) + '</b><br>' +
        esc(O.NATION[u.nat].label + ' ' + T.label) + ' · ' + u.steps + '/' + T.steps + ' kademe<br>' +
        'Savunma ' + num(R.defenseStrength(st, u).value) + (u.entrench ? ' · mevzi ' + u.entrench : '') +
        (!u.inSupply ? ' · <span style="color:#ffd84d">ikmalsiz</span>' : '') + (u.disrupted ? ' · <span style="color:#ff9b21">sarsılmış</span>' : '');
      if (st.phase === 'TR' && u.side === 'DE') {
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
  UI.fitZoom = function () {
    const wrap = $('mapWrap');
    const z = Math.min(wrap.clientWidth / V.WIDTH, wrap.clientHeight / V.HEIGHT);
    V.setZoom(Math.max(0.45, Math.min(1.6, z)));
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
