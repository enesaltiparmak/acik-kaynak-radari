// Derlemeden önce data dalındaki son veriyi public/data/ altına kopyalar.
// Bu kopya, uzak veri ve tarayıcı önbelleği de yoksa son çare olarak kullanılır.
// İndirme başarısız olursa depodaki mevcut kopya ile devam edilir; derleme durmaz.

import { writeFile, mkdir } from 'node:fs/promises';

const BASE = process.env.VITE_DATA_BASE ?? 'https://raw.githubusercontent.com/enesaltiparmak/acik-kaynak-radari/data';

await mkdir('public/data', { recursive: true });
for (const file of ['latest.json', 'history.json']) {
  try {
    const res = await fetch(`${BASE}/${file}`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    JSON.parse(text);
    await writeFile(`public/data/${file}`, text);
    console.log(`prebuild: ${file} güncellendi`);
  } catch (err) {
    console.warn(`prebuild: ${file} indirilemedi (${err.message}); mevcut kopya kullanılacak`);
  }
}
