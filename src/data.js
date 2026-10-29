// Veri yükleme: önce data dalındaki canlı JSON, olmazsa tarayıcıdaki son başarılı kopya,
// o da yoksa siteyle birlikte yayımlanan kopya. Hangi kaynağın kullanıldığı arayüze bildirilir.

const DATA_BASE = import.meta.env.VITE_DATA_BASE
  ?? 'https://raw.githubusercontent.com/enesaltiparmak/acik-kaynak-radari/data';
const BUNDLED_BASE = '/data';
const CACHE_KEY = 'radar:last-good:v1';
const TIMEOUT_MS = 8000;

/**
 * Demo için durum simülasyonu:
 * ?durum=hata  canlı kaynak çöker (önbellek/yedek devreye girer)
 * ?durum=cokus hiçbir kaynak yok (hata ekranı)
 * ?durum=bos   veri gelir ama boş
 * ?durum=yavas canlı kaynak 4 sn gecikir (iskelet görünür)
 */
export function simulation() {
  const v = new URLSearchParams(location.search).get('durum');
  return ['hata', 'cokus', 'bos', 'yavas'].includes(v) ? v : null;
}

async function fetchJson(url, sim) {
  if (sim === 'hata' || sim === 'cokus') throw new Error('Simüle edilen API hatası');
  if (sim === 'yavas') await new Promise((r) => setTimeout(r, 4000));
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchPair(base, sim) {
  const [latest, history] = await Promise.all([
    fetchJson(`${base}/latest.json`, sim),
    fetchJson(`${base}/history.json`, sim),
  ]);
  if (!Array.isArray(latest?.repos) || typeof history?.repos !== 'object') {
    throw new Error('Beklenmeyen veri biçimi');
  }
  return { latest, history };
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // Kota dolu veya depolama kapalı: önbelleksiz devam edilir.
  }
}

/**
 * @returns {Promise<{latest, history, origin: 'live'|'cache'|'bundled', error?: string}>}
 */
export async function loadData() {
  const sim = simulation();
  try {
    const data = await fetchPair(DATA_BASE, sim);
    if (!sim) writeCache({ ...data, savedAt: new Date().toISOString() });
    if (sim === 'bos') data.latest = { ...data.latest, repos: [] };
    return { ...data, origin: 'live' };
  } catch (err) {
    const error = err.name === 'TimeoutError' ? 'Kaynak 8 saniyede yanıt vermedi' : err.message;
    const cached = sim === 'cokus' ? null : readCache();
    if (cached) return { latest: cached.latest, history: cached.history, origin: 'cache', error };
    try {
      const bundled = await fetchPair(BUNDLED_BASE, sim === 'hata' ? null : sim);
      return { ...bundled, origin: 'bundled', error };
    } catch {
      throw new Error(error);
    }
  }
}
