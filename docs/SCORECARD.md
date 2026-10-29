# OpenSSF Scorecard: Önce / Sonra

Kartın doğrulama testi: CI/CD sertleştirmesinin etkisini [OpenSSF Scorecard](https://scorecard.dev) ile ölçmek.

## Yöntem

1. **Önce (29 Ekim 2026, 17:48 TSİ):** Uygulama 12 commit hâlinde, sertleştirilmemiş tek bir veri workflow'uyla depoya yüklendi. Bu workflow `permissions: write-all` kullanıyordu, Actions sürüm etiketiyle (`@v4`) bağlıydı ve harden-runner yoktu. Depoda lisans, güvenlik politikası ve bağımlılık güncelleme aracı da yoktu. Scorecard bu durumda çalıştırıldı.
2. **Sertleştirme:** 8 commit ve depo ayarları eklendi: branch protection, CODEOWNERS incelemesi ve zorunlu `build` + `secrets` kontrolleri.
3. **Sonra (29 Ekim 2026, 18:10 TSİ):** Scorecard aynı sürümle yeniden çalıştırıldı.

Araç: Scorecard v5.6.0, resmî Linux yayını (SHA-256 checksum doğrulandı), WSL Ubuntu üzerinde, salt okunur token ile. Windows sürümü bir dosya yolu hatası yüzünden workflow'ları göremediği için kullanılmadı: `ossf/scorecard` deposunun kendisinde bile "no workflows found" diyordu.

```bash
scorecard --repo=github.com/enesaltiparmak/acik-kaynak-radari --format=json
```

Ham sonuçlar: [`scorecard/once.json`](scorecard/once.json), [`scorecard/sonra.json`](scorecard/sonra.json). Her `main` push'unda ayrıca `scorecard.yml` workflow'u çalışır ve sonucu GitHub Security sekmesine yükler.

## Sonuçlar

| Kontrol | Önce | Sonra | Ne değişti |
| --- | :-: | :-: | --- |
| **Toplam** | **3.0** | **6.9** | |
| Token-Permissions | 0 | 10 | `write-all` kaldırıldı. Varsayılan `permissions: {}`, her job yalnızca ihtiyacı olan yetkiyi alıyor. `contents: write` yalnızca snapshot job'unda. |
| Pinned-Dependencies | 0 | 10 | Tüm üçüncü taraf Actions 40 karakterlik commit SHA ile sabitlendi. CI'daki `check-workflows.mjs` sabitlenmemiş bir `uses:` görünce derlemeyi kırar. |
| SAST | 0 | 10 | CodeQL eklendi: JavaScript ve GitHub Actions workflow analizi. |
| Dependency-Update-Tool | 0 | 10 | Dependabot eklendi (npm + github-actions, haftalık). |
| Security-Policy | 0 | 9 | `SECURITY.md` ve `/.well-known/security.txt` eklendi. |
| License | 0 | 10 | MIT lisansı eklendi. |
| Dangerous-Workflow | 10 | 10 | Başta da yoktu. `pull_request_target` ve satır içi `${{ }}` enjeksiyonu CI'da kontrol edilerek bu durum korunuyor. |
| Binary-Artifacts | 10 | 10 | Depoda derlenmiş dosya yok. |
| Vulnerabilities | 10 | 10 | Bilinen zafiyetli bağımlılık yok. |
| Code-Review | 0 | 0 | Tek geliştirici; commit'ler PR ile değil doğrudan geldi. |
| Maintained | 0 | 0 | Depo 90 günden yeni. |
| Contributors, Fuzzing, CII-Best-Practices | 0 | 0 | Bu proje kapsamında değil. |
| Branch-Protection | ölçülemedi | ölçülemedi | Bu kontrol `public_repo` yazma yetkili token istiyor. Veri token'ımız bilinçli olarak yetkisiz olduğu için verilmedi. Koruma GitHub ayarlarında açık (ekran görüntüsü raporda). |
| CI-Tests, Packaging, Signed-Releases | ölçülemedi | ölçülemedi | PR veya sürüm (release) yok. |

## Kalan riskler ve sonraki adımlar

- **Code-Review = 0:** Branch protection açık, ancak tek geliştirici kendi PR'ını onaylayamadığı için yönetici bypass'ı kapatılmadı. İkinci bir inceleyici eklenirse "Do not allow bypassing" açılmalı.
- **Puan 7'nin altında (6.9):** Bonus eşiği için sonraki değişikliklerin PR ile gelmesi (Code-Review, CI-Tests) ve [OpenSSF Best Practices](https://www.bestpractices.dev) rozeti için başvuru en kolay adımlar.
