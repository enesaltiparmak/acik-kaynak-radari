// Snapshot betiği ile testlerin paylaştığı saf fonksiyonlar (ağ erişimi yok).

export const DAY_MS = 24 * 60 * 60 * 1000;

/** ISO tarihin gün kısmı: "2026-10-29" */
export function dayKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

/**
 * Geçmişe yeni bir günlük ölçüm ekler.
 * history.repos[id] = [[gün, yıldız, fork, açıkIssue], ...] (güne göre sıralı)
 * Aynı gün tekrar çalışırsa o günün ölçümü güncellenir.
 */
export function mergeSnapshot(history, day, repos, { keepDays = 400 } = {}) {
  const out = { version: 1, repos: { ...(history?.repos ?? {}) } };
  for (const r of repos) {
    const points = (out.repos[r.id] ?? []).filter((p) => p[0] !== day);
    points.push([day, r.stars, r.forks, r.issues]);
    points.sort((a, b) => (a[0] < b[0] ? -1 : 1));
    out.repos[r.id] = points;
  }
  const cutoff = dayKey(Date.parse(day) - keepDays * DAY_MS);
  for (const id of Object.keys(out.repos)) {
    out.repos[id] = out.repos[id].filter((p) => p[0] >= cutoff);
    if (out.repos[id].length === 0) delete out.repos[id];
  }
  return out;
}

/**
 * Son N gündeki yıldız artışı. N gün önceki (veya öncesindeki en yakın) ölçümle karşılaştırır.
 * O kadar eski ölçüm yoksa elimizdeki en eski ölçüm kullanılır ve gerçek gün sayısı döner.
 */
export function growth(points, days, today) {
  if (!points || points.length < 2) return { delta: null, spanDays: 0 };
  const last = points[points.length - 1];
  const target = dayKey(Date.parse(today ?? last[0]) - days * DAY_MS);
  let base = points[0];
  for (const p of points) {
    if (p[0] <= target) base = p;
    else break;
  }
  if (base === last) return { delta: null, spanDays: 0 };
  const spanDays = Math.round((Date.parse(last[0]) - Date.parse(base[0])) / DAY_MS);
  return { delta: last[1] - base[1], spanDays };
}
