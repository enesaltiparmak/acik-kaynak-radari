# Olay Müdahale Runbook'u: "API anahtarım sızdı"

Bu projede iki gizli değer var:

| Sır | Nerede | Yetkisi | Ömrü |
| --- | --- | --- | --- |
| `GH_DATA_TOKEN` (fine-grained PAT) | GitHub Secrets | Herkese açık depoları **okuma**; hiçbir yazma izni yok | 90 gün |
| `GITHUB_TOKEN` (otomatik) | Actions çalışırken | Yalnızca bu deponun `contents: write`'ı, yalnızca snapshot job'unda | Job bitince geçersiz |

## 1. Tespit (0–15 dk)

Sızıntı belirtileri:
- GitHub'dan "secret scanning alert" e-postası veya Security → Secret scanning uyarısı
- CI'daki **gitleaks** adımı kırmızı
- Snapshot workflow'unda beklenmeyen hız sınırı hataları (token başkası tarafından kullanılıyor olabilir)
- Token'ın bir log, ekran görüntüsü, commit veya sohbet mesajında görülmesi

**Yapılacak:** Ne sızdı, nerede göründü, ilk ne zaman göründü? Not alın (saat dahil).

## 2. İptal (hemen, 5 dk)

1. <https://github.com/settings/personal-access-tokens> → `radar-veri` → **Revoke**.
2. Sızan değer `GITHUB_TOKEN` ise: o workflow çalıştırmasını iptal edin (Actions → run → Cancel). Bu token job bitince zaten geçersizleşir.
3. Depo ayarlarında Actions'ı geçici olarak kapatın (Settings → Actions → Disable), saldırgan bir workflow tetiklemiş olabilir.

## 3. Yenileme (15 dk)

1. Yeni fine-grained token: <https://github.com/settings/personal-access-tokens/new>, aynı ayarlar (Public repositories, izin yok, 90 gün).
2. Settings → Secrets and variables → Actions → `GH_DATA_TOKEN` → **Update**.
3. Yerel `.env` dosyasını güncelleyin (asla commit etmeyin).
4. Actions'ı açıp `snapshot` workflow'unu elle çalıştırın; yeşil olduğunu doğrulayın.

## 4. İnceleme (1 saat)

- Sızıntı bir commit'teyse: değeri geçmişten silmek **yetmez**, token zaten iptal edildi. Yine de `git filter-repo` ile temizleyip zorla push edin ve forkların da kopyası olabileceğini kabul edin.
- Actions → tüm çalıştırmalar: tanımadığınız tetikleme, değişmiş workflow dosyası, yeni dal var mı?
- `data` dalında beklenmeyen commit var mı? (`git log origin/data`)
- Settings → Deploy keys, Webhooks, Collaborators: yeni eklenen bir şey var mı?
- Cloudflare → Workers & Pages → Deployments: beklenmeyen dağıtım var mı?
- Token salt okunur olduğu için olası etki: sizin adınıza hız sınırı tüketimi. Yazma yetkisi yoktu.

## 5. Bildirim ve kayıt

- Tarih/saat, ne sızdı, nasıl fark edildi, ne zaman iptal edildi, etki ve kök neden ile kısa bir olay notu yazın.
- Gerekirse ilgili kişilere bildirin (öğretim elemanı, topluluk yöneticileri).
- Kök neden için kalıcı önlem ekleyin (ör. yeni bir gitleaks kuralı, eğitim notu).

## Önleyici önlemler (zaten açık)

- Token salt okunur ve 90 günlük; süre dolmadan takvime yenileme hatırlatıcısı.
- Sırlar yalnızca ihtiyaç duyan adımın `env:` bloğunda; `persist-credentials: false`.
- `pull_request_target` yasak; fork PR'ları sırlara erişemez.
- Push protection ve secret scanning açık; gitleaks CI'da.
