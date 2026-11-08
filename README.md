# Çakmak Hattı 1943

Alternatif tarih temalı, altıgen haritalı, sıra tabanlı bir harekât oyunu.

> **Senaryo:** Türkiye tarafsızlığını korurken Trakya'daki **Çakmak Hattı**'nı tamamlamış ve
> 1. Ordu'yu sığınaklara yerleştirmiştir. **4 Ocak 1943** sabahı Mihver kuvvetleri Bulgaristan'dan
> ve işgal altındaki Yunan Trakyası'ndan sınırı geçer. Siz Türk kuvvetlerini yönetirsiniz;
> Alman/Bulgar ordusunu yapay zekâ oynar. 16 hafta boyunca İstanbul'u ve Gelibolu Yarımadası'nı
> savunmanız gerekir.

Bu bir **alternatif tarih** senaryosudur: böyle bir taarruz yaşanmamıştır. Birlik numaraları,
kuvvet değerleri ve takviye takvimi oyun dengesi için kurgulanmıştır. Haritadaki kıyılar, sınırlar,
Meriç ve Ergene nehirleri, Istranca Dağları gerçek coğrafyadan altıgenlere (≈9 km) dönüştürülmüştür;
Çakmak, Çatalca ve Bolayır hatlarının güzergâhları yaklaşıktır.

## Nasıl oynanır

Kurulum gerekmez. `index.html` dosyasını bir tarayıcıda açmanız yeterli.
İsterseniz yerel sunucuyla da açabilirsiniz:

```bash
python3 -m http.server 8000
# tarayıcıda http://localhost:8000
```

1. **Konuşlanma:** Birliklerinizi Türk Trakyası'nda dilediğiniz gibi dizin (birliğe, sonra yeşil
   altıgene tıklayın). Başlangıçta tüm birlikleriniz 2. seviye mevzidedir.
2. **Mihver hamlesi:** Yapay zekâ hava saldırıları, saldırılar ve ilerleme yapar.
3. **Türk hamlesi:** Birliğe tıklayın → beyaz altıgenlere hareket edin, kırmızı halkalı
   düşmanlara saldırın. Hava saldırısı ve takviye düğmelerini kullanın, sonra **Turu bitir**.

Ayrıntılı kurallar ve sonuç tablosu oyun içindeki **Kurallar** penceresindedir.

### Temel kurallar

| Konu | Kural |
|---|---|
| Tur | 1 tur = 1 hafta, 16 tur (4 Ocak – 19 Nisan 1943) |
| İstif | Her altıgende en fazla 1 birlik |
| Kontrol bölgesi | Düşmana komşu altıgene giren birlik durur |
| Muharebe | Saldırı ÷ savunma oranı + 1d6 → sonuç tablosu |
| Savunma çarpanları | Çakmak/Çatalca hattı ×2, Bolayır/Edirne ×1,5, orman/tepe ×1,4, şehir ×1,3 (İstanbul ×1,6), nehir ×1,2, mevzi ×1,15/×1,3 |
| İkmal | Kendi kontrolünüzdeki altıgenlerden bir limana bağlantı; kopan birlik zayıflar ve erir |
| Hava | Luftwaffe güçlü başlar, 9. turdan sonra azalır; RAF desteği 5. ve 10. turlarda artar; karda uçuş yok |
| Hava durumu | Ocak–Şubat kar ve çamur sık; Mart–Nisan daha açık |
| Zafer | İstanbul düşerse Mihver anında kazanır; aksi halde Mihver'in aldığı şehir puanlarına göre sonuç |

### Kısayollar

`Enter` turu bitir · `N` sıradaki birlik · `H` hava saldırısı · `T` takviye · `Esc` seçimi bırak · `+`/`−` yakınlaştır

## Proje yapısı

```
index.html        Sayfa iskeleti
css/style.css     Arayüz stilleri
js/geo.js         Coğrafi veriler ve altıgen harita üretimi
js/data.js        Birlik türleri, savaş düzeni, takviyeler
js/rules.js       Kural motoru (hareket, muharebe, ikmal, hava, tur akışı) — DOM'dan bağımsız
js/ai.js          Mihver yapay zekâsı
js/render.js      Canvas çizimi
js/ui.js          Etkileşim, paneller, kaydet/yükle
tests/sim.js      Kural testleri ve denge simülasyonu (Node)
tests/print-map.js Haritanın ASCII önizlemesi
```

Kural motoru ve yapay zekâ tarayıcıdan bağımsızdır; Node ile test edilebilir:

```bash
node tests/sim.js 20     # yapı testleri + her zorlukta 20 simüle oyun
node tests/print-map.js  # haritayı metin olarak yazdır
```

Simülasyonda Türk tarafı pasif oynar (yerinde kalır, takviye kullanır). Bu stratejiyle Normal
seviyede sonuç çoğunlukla "Berabere", Zor seviyede çoğunlukla "Mihver Zaferi" olur; aktif savunma,
karşı taarruz ve yedek kullanımıyla daha iyisi mümkündür.

## Geliştirme fikirleri

- Almanları oynama seçeneği (Türk yapay zekâsı)
- Demiryolu hareketi, topçu ve istihkâm birlikleri, köprü yıkma
- Boğazlarda deniz unsuru ve Karadeniz'den çıkarma
- Siyasi olaylar: Müttefik yardımının hızı, Bulgaristan'ın tutumu
- Farklı senaryolar (1941 baharı, 1944)
