# Güvenlik Politikası

## Güvenlik açığı bildirimi

Bir güvenlik açığı bulduysanız lütfen herkese açık issue açmayın. Bunun yerine GitHub'ın özel bildirim formunu kullanın:
<https://github.com/enesaltiparmak/acik-kaynak-radari/security/advisories/new>

Bildirimlere 7 gün içinde dönüş yapılır. Makine tarafından okunabilir iletişim bilgisi: `/.well-known/security.txt`.

## Kapsam

- Yayındaki site (Cloudflare Pages) ve bu depodaki kod, workflow'lar.
- Kapsam dışı: GitHub API'nin kendisi, Cloudflare altyapısı, üçüncü taraf hizmetler.

## Uygulanan kontroller (özet)

| Kontrol | Nerede |
| --- | --- |
| Workflow'larda en az yetki (`permissions: {}` + job bazında) | `.github/workflows/*.yml` |
| `pull_request_target` yasak, CI'da otomatik kontrol | `scripts/check-workflows.mjs` |
| Üçüncü taraf Actions commit SHA ile sabit | tüm workflow'lar |
| harden-runner (veri çekiminde egress `block`) | tüm job'lar |
| Branch protection + CODEOWNERS incelemesi | GitHub ayarları, `.github/CODEOWNERS` |
| Sır taraması (gitleaks + GitHub secret scanning) | `ci.yml` |
| Bağımlılık taraması (Dependabot, npm audit, dependency review) | `dependabot.yml`, `ci.yml` |
| CSP, HSTS ve diğer güvenlik başlıkları | `public/_headers` |
| OpenSSF Scorecard | `scorecard.yml` |
