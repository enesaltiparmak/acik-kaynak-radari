import '@fontsource-variable/georama';
import '@fontsource-variable/roboto-mono';
import './style.css';
import { loadData, simulation } from './data.js';
import { setupPalette } from './palette.js';
import { growth } from '../scripts/lib.mjs';

// Chart.js ayrı parça olarak yüklenir; KPI ve tablo grafik kütüphanesini beklemeden çizilir.
let charts = null;
const chartsReady = import('./charts.js').then((m) => { charts = m; if (state.data) renderCharts(derived()); });
chartsReady.catch(() => { /* grafikler yüklenemezse özet cümleleri ve tablolar yine görünür */ });

const $ = (id) => document.getElementById(id);
const nf = new Intl.NumberFormat('tr-TR');
const dtf = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Istanbul' });
const df = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeZone: 'Europe/Istanbul' });
const STALE_HOURS = 36;
const PAGE = 25;

const DEFAULT_FILTERS = { q: '', lang: '', period: 7, min: 0, gfi: false };
const state = {
  data: null,
  filters: { ...DEFAULT_FILTERS },
  sort: { key: 'delta', dir: -1 },
  selected: null,
  shown: PAGE,
};

/** Küçük DOM yardımcısı: metinler her zaman textContent ile eklenir (XSS'e karşı). */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) el.append(c instanceof Node ? c : String(c));
  return el;
}

/* ---------- Tema ---------- */
function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem('radar:theme'); } catch { /* depolama kapalı */ }
  const theme = saved ?? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  document.documentElement.dataset.theme = theme;
}
function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  document.querySelector('meta[name="theme-color"]').content = next === 'light' ? '#f6f7f9' : '#0f1115';
  try { localStorage.setItem('radar:theme', next); } catch { /* depolama kapalı */ }
  if (state.data) renderCharts(derived());
}

/* ---------- Türetilmiş veri ---------- */
function enrich() {
  const { latest, history } = state.data;
  const today = latest.generatedAt?.slice(0, 10);
  return latest.repos.map((r) => {
    const points = history.repos[r.id] ?? [];
    const g = growth(points, state.filters.period, today);
    return { ...r, delta: g.delta, spanDays: g.spanDays, points };
  });
}

function matches(r) {
  const f = state.filters;
  if (f.lang && r.lang !== f.lang) return false;
  if (f.gfi && !(r.gfi > 0)) return false;
  if (r.stars < f.min) return false;
  if (f.q) {
    const q = f.q.toLocaleLowerCase('tr-TR');
    const hay = `${r.id} ${r.desc} ${r.topics.join(' ')} ${r.lang ?? ''}`.toLocaleLowerCase('tr-TR');
    if (!hay.includes(q)) return false;
  }
  return true;
}

const SORTERS = {
  name: (r) => r.id.toLowerCase(),
  lang: (r) => r.lang ?? '',
  stars: (r) => r.stars,
  delta: (r) => r.delta ?? -Infinity,
  forks: (r) => r.forks,
  issues: (r) => r.issues,
  gfi: (r) => r.gfi,
  pushedAt: (r) => r.pushedAt,
};

function derived() {
  const all = enrich();
  const rows = all.filter(matches);
  const key = SORTERS[state.sort.key];
  rows.sort((a, b) => {
    const x = key(a);
    const y = key(b);
    return (x < y ? -1 : x > y ? 1 : 0) * state.sort.dir || b.stars - a.stars;
  });
  return { all, rows };
}

/* ---------- Durum bandı ve meta ---------- */
function setStatus(kind, message, { retry = false } = {}) {
  const el = $('status');
  if (!kind) { el.hidden = true; el.replaceChildren(); return; }
  el.hidden = false;
  el.dataset.kind = kind;
  el.replaceChildren(
    h('span', { class: 'mono' }, kind === 'error' ? '✖ hata: ' : '⚠ uyarı: '),
    message,
    retry ? h('button', { type: 'button', class: 'ghost-btn', onclick: refresh }, 'Tekrar dene') : null,
  );
}

function renderMeta() {
  const { latest, origin, error } = state.data;
  const updated = new Date(latest.generatedAt);
  $('updated').textContent = `Son güncelleme: ${dtf.format(updated)} (TSİ)`;
  $('method').textContent = latest.method ?? '';

  const ageH = (Date.now() - updated) / 36e5;
  if (origin === 'cache') {
    setStatus('warn', `Canlı veri kaynağına ulaşılamadı (${error}). Tarayıcınızda saklanan son başarılı veri gösteriliyor: ${dtf.format(updated)}.`, { retry: true });
  } else if (origin === 'bundled') {
    setStatus('warn', `Canlı veri kaynağına ulaşılamadı (${error}). Siteyle birlikte yayımlanan yedek veri gösteriliyor: ${dtf.format(updated)}.`, { retry: true });
  } else if (latest.status === 'error') {
    setStatus('warn', `GitHub'dan son veri çekme denemesi başarısız oldu (${dtf.format(new Date(latest.lastAttemptAt))}). Gösterilen veri son başarılı çekimden.`);
  } else if (ageH > STALE_HOURS) {
    setStatus('warn', `Veri ${Math.floor(ageH)} saattir güncellenmedi; günlük çekim gecikmiş olabilir.`);
  } else if (simulation()) {
    setStatus('warn', `Demo modu: durum simülasyonu "${simulation()}" açık. Normale dönmek için komut paletinden "Demo: normal" seçin.`);
  } else {
    setStatus(null);
  }
}

/* ---------- KPI ---------- */
function kpi(label, value, note) {
  return h('div', { class: 'kpi' }, h('p', { class: 'kpi-label' }, label), h('p', { class: 'kpi-value' }, value), h('p', { class: 'kpi-note' }, note));
}

function renderKpis({ all, rows }) {
  const p = state.filters.period;
  const withDelta = rows.filter((r) => r.delta != null);
  const newStars = withDelta.reduce((s, r) => s + r.delta, 0);
  const span = Math.max(0, ...withDelta.map((r) => r.spanDays));
  const gfiIssues = rows.reduce((s, r) => s + r.gfi, 0);
  const gfiRepos = rows.filter((r) => r.gfi > 0).length;
  const box = $('kpis');
  box.removeAttribute('aria-busy');
  box.replaceChildren(
    kpi('Takip edilen proje', nf.format(rows.length), rows.length === all.length ? 'tüm projeler' : `${nf.format(all.length)} projeden filtrelenen`),
    kpi('Toplam yıldız', nf.format(rows.reduce((s, r) => s + r.stars, 0)), 'filtrelenen projelerde'),
    kpi(`Son ${p} günde yeni yıldız`, withDelta.length ? `+${nf.format(newStars)}` : '—',
      withDelta.length ? `${span} günlük veriyle` : 'karşılaştırma için ikinci günün verisi bekleniyor'),
    kpi('Açık good first issue', nf.format(gfiIssues), `${nf.format(gfiRepos)} projede`),
  );
}

/* ---------- Grafikler ---------- */
function miniTable(headers, rows) {
  return h('table', { class: 'data' },
    h('thead', {}, h('tr', {}, headers.map((x, i) => h('th', { scope: 'col', class: i ? 'num' : null }, x)))),
    h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c, i) => h('td', { class: i ? 'num' : null }, c))))));
}

function renderCharts({ rows }) {
  const p = state.filters.period;
  const top = rows.filter((r) => r.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 10);
  const growthBox = $('growth-box');
  if (top.length) {
    growthBox.hidden = false;
    charts?.drawGrowth($('growth-chart'), top, selectRepo);
    const sum = top.reduce((s, r) => s + r.delta, 0);
    const span = Math.max(...top.map((r) => r.spanDays));
    const note = span < p ? ` Zaman serisi henüz ${span} günlük olduğu için artış ${span} günü kapsıyor.` : '';
    $('growth-summary').textContent = `Son ${p} günde en hızlı büyüyen proje ${top[0].id} (+${nf.format(top[0].delta)} yıldız); ilk ${top.length} proje toplam +${nf.format(sum)} yıldız kazandı.${note} Çubuğa tıklayınca zaman serisi açılır.`;
  } else {
    growthBox.hidden = true;
    $('growth-summary').textContent = rows.length
      ? `Filtrelenen projelerde son ${p} gün için yıldız artışı yok veya zaman serisi henüz tek günlük (ilk snapshot: ${df.format(new Date(state.data.latest.generatedAt))}); ikinci günlük çekimden sonra büyüme görünür.`
      : 'Filtreye uyan proje olmadığı için grafik boş.';
  }
  $('growth-table').replaceChildren(miniTable(['Proje', `+Yıldız (${p} gün)`], top.map((r) => [r.id, `+${nf.format(r.delta)}`])));

  const sel = rows.find((r) => r.id === state.selected) ?? top[0] ?? rows[0];
  const trendBox = $('trend-box');
  if (!sel || sel.points.length === 0) {
    trendBox.hidden = true;
    $('trend-name').textContent = '';
    $('trend-summary').textContent = 'Gösterilecek proje yok.';
    $('trend-table').replaceChildren();
    return;
  }
  state.selected = sel.id;
  trendBox.hidden = false;
  $('trend-name').textContent = sel.id;
  charts?.drawTrend($('trend-chart'), sel.points);
  const first = sel.points[0];
  const last = sel.points[sel.points.length - 1];
  const fmt = (d) => df.format(new Date(`${d}T12:00:00Z`));
  $('trend-summary').textContent = sel.points.length === 1
    ? `${sel.id} için şimdilik tek ölçüm var: ${fmt(last[0])} itibarıyla ${nf.format(last[1])} yıldız.`
    : `${sel.id}, ${fmt(first[0])} ile ${fmt(last[0])} arasında ${nf.format(first[1])} yıldızdan ${nf.format(last[1])} yıldıza ${last[1] >= first[1] ? 'çıktı' : 'indi'} (${last[1] - first[1] >= 0 ? '+' : ''}${nf.format(last[1] - first[1])}).`;
  $('trend-table').replaceChildren(miniTable(['Gün', 'Yıldız', 'Fork', 'Açık issue'], sel.points.map((x) => [x[0], nf.format(x[1]), nf.format(x[2]), nf.format(x[3])])));
}

/* ---------- Tablo ---------- */
const COLUMNS = [
  { key: 'name', label: 'Proje' },
  { key: 'lang', label: 'Dil' },
  { key: 'stars', label: '★ Yıldız', num: true },
  { key: 'delta', label: 'Δ Dönem', num: true },
  { key: 'forks', label: 'Fork', num: true },
  { key: 'issues', label: 'Açık issue', num: true },
  { key: 'gfi', label: 'Good first', num: true },
  { key: 'pushedAt', label: 'Son push', num: true },
];

function renderHead() {
  $('repo-head').replaceChildren(...COLUMNS.map((c) => {
    const activeSort = state.sort.key === c.key;
    const arrow = activeSort ? (state.sort.dir === 1 ? '↑' : '↓') : '↕';
    return h('th', {
      scope: 'col',
      class: c.num ? 'num' : null,
      'aria-sort': activeSort ? (state.sort.dir === 1 ? 'ascending' : 'descending') : 'none',
    }, h('button', {
      type: 'button',
      class: 'sort-btn',
      'aria-pressed': String(activeSort),
      onclick: () => setSort(c.key),
    }, c.label, h('span', { 'aria-hidden': 'true' }, arrow)));
  }));
}

function setSort(key, dir) {
  if (dir) state.sort = { key, dir };
  else if (state.sort.key === key) state.sort.dir *= -1;
  else state.sort = { key, dir: key === 'name' || key === 'lang' ? 1 : -1 };
  render();
  document.querySelector(`#repo-head th[aria-sort]:not([aria-sort="none"]) button`)?.focus();
}

function deltaCell(r) {
  if (r.delta == null) return h('span', { class: 'est' }, 'bekleniyor');
  const cls = r.delta > 0 ? 'delta-up' : r.delta < 0 ? 'delta-down' : null;
  const sign = r.delta > 0 ? '▲ +' : r.delta < 0 ? '▼ ' : '';
  return h('span', { class: cls }, `${sign}${nf.format(r.delta)}`);
}

function renderTable({ rows }) {
  renderHead();
  const visible = rows.slice(0, state.shown);
  $('repo-body').replaceChildren(...visible.map((r) => h('tr', { class: r.id === state.selected ? 'selected' : null },
    h('td', {}, h('div', { class: 'repo-cell' },
      h('button', { type: 'button', class: 'repo-name', onclick: () => selectRepo(r.id), 'aria-label': `${r.id}: zaman serisini göster` }, r.id),
      r.desc ? h('span', { class: 'repo-desc' }, r.desc) : null,
      h('span', { class: 'repo-links' },
        h('a', { href: r.url, target: '_blank', rel: 'noopener' }, 'GitHub ↗'),
        r.gfi > 0 ? [' · ', h('a', { href: `${r.url}/issues?q=${encodeURIComponent('is:issue is:open label:"good first issue"')}`, target: '_blank', rel: 'noopener' }, 'good first issue ↗')] : null),
    )),
    h('td', {}, r.lang ?? '—'),
    h('td', { class: 'num' }, nf.format(r.stars)),
    h('td', { class: 'num' }, deltaCell(r)),
    h('td', { class: 'num' }, nf.format(r.forks)),
    h('td', { class: 'num' }, nf.format(r.issues)),
    h('td', { class: 'num' }, r.gfi > 0 ? h('span', { class: 'badge gfi' }, `✓ ${r.gfi}`) : h('span', { class: 'est' }, '0')),
    h('td', { class: 'num' }, df.format(new Date(r.pushedAt))),
  )));
  $('empty').hidden = rows.length > 0;
  $('repo-table-wrap').hidden = rows.length === 0;
  const more = $('more');
  more.hidden = rows.length <= state.shown;
  more.textContent = `Daha fazla göster (${nf.format(rows.length - state.shown)} kaldı)`;
  $('result-count').textContent = `${nf.format(rows.length)} proje listeleniyor · sıralama: ${COLUMNS.find((c) => c.key === state.sort.key).label} ${state.sort.dir === 1 ? 'artan' : 'azalan'}`;
}

/* ---------- Ana çizim ---------- */
function render() {
  if (!state.data) return;
  const d = derived();
  renderKpis(d);
  renderCharts(d);
  renderTable(d);
}

function selectRepo(id) {
  state.selected = id;
  render();
  $('trend-title').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

/* ---------- Filtreler ---------- */
function syncFilterInputs() {
  const f = state.filters;
  $('f-q').value = f.q;
  $('f-lang').value = f.lang;
  $('f-period').value = String(f.period);
  $('f-min').value = String(f.min);
  $('f-gfi').checked = f.gfi;
}

function setFilter(patch) {
  Object.assign(state.filters, patch);
  state.shown = PAGE;
  syncFilterInputs();
  render();
}

function resetFilters() {
  setFilter({ ...DEFAULT_FILTERS });
}

function fillLanguages() {
  const counts = new Map();
  for (const r of state.data.latest.repos) if (r.lang) counts.set(r.lang, (counts.get(r.lang) ?? 0) + 1);
  const langs = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  $('f-lang').replaceChildren(h('option', { value: '' }, 'Tümü'), ...langs.map(([l, n]) => h('option', { value: l }, `${l} (${n})`)));
  return langs.map(([l]) => l);
}

function bindFilters() {
  $('filters').addEventListener('submit', (e) => e.preventDefault());
  let timer;
  $('f-q').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => setFilter({ q: e.target.value.trim() }), 150);
  });
  $('f-lang').addEventListener('change', (e) => setFilter({ lang: e.target.value }));
  $('f-period').addEventListener('change', (e) => setFilter({ period: Number(e.target.value) }));
  $('f-min').addEventListener('change', (e) => setFilter({ min: Number(e.target.value) }));
  $('f-gfi').addEventListener('change', (e) => setFilter({ gfi: e.target.checked }));
  $('f-reset').addEventListener('click', resetFilters);
  document.querySelector('[data-action="reset"]').addEventListener('click', resetFilters);
  $('more').addEventListener('click', () => { state.shown += PAGE; render(); });
}

/* ---------- Yükleme ---------- */
function showSkeleton() {
  $('kpis').setAttribute('aria-busy', 'true');
  $('kpis').replaceChildren(...Array.from({ length: 4 }, () => h('div', { class: 'kpi skeleton' })));
  $('repo-body').replaceChildren(...Array.from({ length: 8 }, () => h('tr', { class: 'skeleton-row' },
    COLUMNS.map(() => h('td', {}, h('div', { class: 'skeleton' }))))));
  renderHead();
  $('growth-box').classList.add('skeleton');
  $('trend-box').classList.add('skeleton');
  $('growth-summary').textContent = 'Veri yükleniyor…';
  $('trend-summary').textContent = 'Veri yükleniyor…';
  $('result-count').textContent = '';
  $('empty').hidden = true;
}

function showFatal(message) {
  $('updated').textContent = 'Son güncelleme: veri alınamadı';
  setStatus('error', `Veri yüklenemedi (${message}). İnternet bağlantınızı kontrol edip tekrar deneyin; daha önce bu sayfayı açtıysanız son veri otomatik gösterilir.`, { retry: true });
  $('kpis').removeAttribute('aria-busy');
  $('kpis').replaceChildren(kpi('Durum', '—', 'veri yok'));
  $('repo-body').replaceChildren();
  $('growth-box').hidden = true;
  $('trend-box').hidden = true;
  $('growth-summary').textContent = 'Veri yüklenemediği için grafik çizilemedi.';
  $('trend-summary').textContent = 'Veri yüklenemediği için grafik çizilemedi.';
}

let languages = [];
async function refresh() {
  showSkeleton();
  setStatus(null);
  try {
    state.data = await loadData();
    languages = fillLanguages();
    syncFilterInputs();
    renderMeta();
    render();
  } catch (err) {
    state.data = null;
    showFatal(err.message);
  } finally {
    $('growth-box').classList.remove('skeleton');
    $('trend-box').classList.remove('skeleton');
  }
}

/* ---------- Klavye ve komut paleti ---------- */
function goTo(params) {
  const url = new URL(location.href);
  url.search = params ? `?${params}` : '';
  location.assign(url);
}

const palette = setupPalette({
  commands: () => [
    { group: 'filtre', label: state.filters.gfi ? 'Good first issue filtresini kapat' : 'Yalnız good first issue olanları göster', hint: 'G', run: () => setFilter({ gfi: !state.filters.gfi }) },
    { group: 'filtre', label: 'Dönem: son 7 gün', run: () => setFilter({ period: 7 }) },
    { group: 'filtre', label: 'Dönem: son 30 gün', run: () => setFilter({ period: 30 }) },
    { group: 'filtre', label: 'Filtreleri sıfırla', run: resetFilters },
    ...languages.slice(0, 10).map((l) => ({ group: 'dil', label: `Dil: ${l}`, run: () => setFilter({ lang: l }) })),
    { group: 'sırala', label: 'En hızlı büyüyene göre sırala', run: () => setSort('delta', -1) },
    { group: 'sırala', label: 'Yıldıza göre sırala', run: () => setSort('stars', -1) },
    { group: 'sırala', label: 'Good first issue sayısına göre sırala', run: () => setSort('gfi', -1) },
    { group: 'sırala', label: 'Son push tarihine göre sırala', run: () => setSort('pushedAt', -1) },
    { group: 'git', label: 'Proje aramaya odaklan', hint: '/', run: () => $('f-q').focus() },
    { group: 'git', label: 'Proje tablosuna git', run: () => { $('table-title').scrollIntoView(); $('repo-head').querySelector('button')?.focus(); } },
    { group: 'git', label: 'Yöntem ve sınırlar', run: () => { location.hash = 'hakkinda'; } },
    { group: 'görünüm', label: 'Açık/koyu temayı değiştir', hint: 'T', run: toggleTheme },
    { group: 'görünüm', label: 'Klavye kısayolları', hint: '?', run: () => $('help').showModal() },
    { group: 'veri', label: 'Veriyi yeniden yükle', run: refresh },
    { group: 'demo', label: 'Demo: API hatası (son veriyle aç)', run: () => goTo('durum=hata') },
    { group: 'demo', label: 'Demo: tüm kaynaklar çöktü (hata ekranı)', run: () => goTo('durum=cokus') },
    { group: 'demo', label: 'Demo: boş sonuç', run: () => goTo('durum=bos') },
    { group: 'demo', label: 'Demo: yavaş bağlantı (iskelet)', run: () => goTo('durum=yavas') },
    { group: 'demo', label: 'Demo: normal', run: () => goTo('') },
  ],
  projects: () => (state.data?.latest.repos ?? []).map((r) => ({ label: r.id, hint: r.lang ?? '', run: () => selectRepo(r.id) })),
});

function isTyping(el) {
  return el?.closest?.('input, textarea, select, [contenteditable="true"]');
}

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (palette.isOpen()) palette.close(); else palette.open();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target) || document.querySelector('dialog[open]')) return;
  if (e.key === '/') { e.preventDefault(); $('f-q').focus(); }
  else if (e.key === 'g' || e.key === 'G') setFilter({ gfi: !state.filters.gfi });
  else if (e.key === 't' || e.key === 'T') toggleTheme();
  else if (e.key === '?') $('help').showModal();
});

/* ---------- Başlat ---------- */
initTheme();
if (/Mac|iPhone|iPad/.test(navigator.platform)) {
  document.querySelectorAll('kbd[data-mod]').forEach((k) => { k.textContent = '⌘'; });
}
$('open-palette').addEventListener('click', () => palette.open());
$('open-help').addEventListener('click', () => $('help').showModal());
$('theme-toggle').addEventListener('click', toggleTheme);
bindFilters();
refresh();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js').catch(() => { /* SW olmadan da çalışır */ });
}
