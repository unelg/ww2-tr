# Kıbrıs 1974

1974 Kıbrıs harekâtını konu alan, altıgen haritalı, sıra tabanlı bir strateji oyunu.
Siz Türk kuvvetlerini yönetirsiniz; Rum Milli Muhafız Ordusu ve adadaki Yunan alayını (ELDİK) yapay zekâ yönetir.

> **Arka plan:** 15 Temmuz 1974'te Yunanistan'daki askerî yönetimin desteklediği bir darbe Cumhurbaşkanı
> Makarios'u devirdi. Türkiye 1960 Garanti Antlaşması'na dayanarak 20 Temmuz'da adaya çıkarma yaptı.
> Birinci harekât 22 Temmuz'daki ateşkesle, ikinci harekât 16 Ağustos'taki ateşkesle sona erdi.
> Savaşta iki toplumdan binlerce kişi hayatını kaybetti ya da kayboldu, çok sayıda insan evini terk etmek zorunda kaldı.

Oyun, harekâtı tabur ve alay ölçeğinde canlandıran bir simülasyondur. Birlik adları, konumları ve güç
değerleri yaklaşıktır ve oyun dengesi için düzenlenmiştir. Ada haritası gerçek kıyı çizgisinden ~4 km'lik
altıgenlere dönüştürülmüştür; Kıbrıs Türk bölgelerinin (Lefkoşa, Lefke, Erenköy, Mağusa Suriçi) sınırları
yaklaşıktır. Güneydeki küçük Türk mahalleleri (Baf, Limasol, Larnaka) bu ölçekte gösterilmemiştir.

## Nasıl oynanır

`index.html` dosyasını bir tarayıcıda açmanız yeterli; kurulum gerekmez.

1. **Çıkarma ve iniş (20 Temmuz şafak):** Çıkarma birlikleri Pentemili plajında. Paraşüt taburlarını
   Lefkoşa Türk kesimi ve çevresindeki yeşil altıgenlere yerleştirin.
2. **Birinci harekât (5 tur, 20–22 Temmuz):** Beşparmak Dağları'nı aşın, köprübaşını Lefkoşa Türk
   kesimiyle birleştirin, Girne'yi alın. Rum kuvvetleri özellikle gece karşı taarruz yapar.
3. **Ateşkes:** Ateşkes raporunda birinci harekâtın sonucu görünür. Tank ve piyade takviyeleri gelir;
   birliklerinizi Türk kontrolündeki bölgede yeniden dizersiniz.
4. **İkinci harekât (5 tur, 14–16 Ağustos):** Batıda Güzelyurt ve kuşatılmış Lefke'ye, doğuda
   Değirmenlik, Geçitkale, İskele, Kantara ve Mağusa'ya ulaşın.

### Temel kurallar

| Konu | Kural |
|---|---|
| Tur | Yarım gün (gündüz/gece); önce Türk, sonra Rum/Yunan hamlesi; toplam 10 tur |
| Gündüz | Türk hava saldırısı (4, ikinci harekâtta 6) ve donanma ateş desteği (kıyıya saldırı ×1,25); Rum birliklerinin hareketi −1 |
| Gece | Hava desteği yok; herkesin hareketi −1; Rum karşı taarruzları daha olası |
| Arazi | Beşparmak sırtları sarp (hareket 3, savunma ×1,6); Trodos ormanlık; Mesarya ovası tanklara uygun |
| Tahkimat | Türk bölgelerinin kenar mevzileri ×1,5; Lefkoşa ve Mağusa surları ×2 |
| İkmal | Türk birlikleri plaja, Türk elindeki bir limana (Girne, Mağusa) ya da bir Türk bölgesine bağlı olmalı |
| Kuşatılmış bölgeler | Lefke, Erenköy ve Mağusa Suriçi'ndeki mücahitler yerlerinden ayrılamaz |
| Hedefler | Haritadaki şehir puanları + Girne–Lefkoşa koridoru (5); tarihteki ateşkes hattı ≈ 27 puan |
| Sonuç | 25+ hedeflere ulaşıldı · 18–24 büyük ölçüde başarılı · 10–17 kısmi başarı · 10 altı başarısız |
| Skor | Hedef puanı ×40, birinci harekât hedefleri zamanında +150, Rum/Yunan kademe kaybı ×12, Türk kademe kaybı ×−10, zorluk çarpanı |

Ayrıntılı kurallar ve sonuç tablosu oyun içindeki **Kurallar** penceresindedir.

### Ortak skor tablosu

Oyun claude.ai'de yayınlanan sayfasında açıldığında sonuç ekranından skorunuzu ortak tabloya
ekleyebilirsiniz (her oyuncunun en iyi skoru tutulur). Yerel dosyada tablo kapalıdır.

## Dosyalar

```
index.html          Sayfa iskeleti
css/style.css       Arayüz stilleri
js/geo.js           Kıbrıs kıyısı, dağlar, Türk bölgeleri ve altıgen harita üretimi
js/data.js          Birlik türleri, savaş düzeni, takviyeler, tur takvimi, sürüm
js/rules.js         Kural motoru (hareket, muharebe, ikmal, hava, iki aşamalı akış, hedefler, skor)
js/ai.js            Rum/Yunan savunma yapay zekâsı (+ testler için Türk saldırı yapay zekâsı)
js/render.js        Canvas çizimi
js/board.js         Ortak skor tablosu (claude.ai veri deposu)
js/ui.js            Etkileşim, paneller, ateşkes ekranı, kaydet/yükle
tests/sim.js        Kural testleri ve denge simülasyonu
tests/print-map.js  Haritanın ASCII önizlemesi
```

```bash
node tests/sim.js 10        # yapı testleri + her zorlukta 10 simüle oyun
node tests/sim.js 0 trace   # tek oyunun tur tur özeti
node tests/print-map.js     # haritayı metin olarak yazdır
```

Kural motoru ve yapay zekâ, [Çakmak Hattı 1943](../README.md) oyununun motorundan uyarlanmıştır.

## Sürüm geçmişi

- **0.1.0** — İlk oynanabilir sürüm: iki aşamalı harekât, çıkarma ve paraşüt indirme, gündüz/gece,
  Rum/Yunan savunma yapay zekâsı, ateşkes ekranı, skor ve ortak skor tablosu
