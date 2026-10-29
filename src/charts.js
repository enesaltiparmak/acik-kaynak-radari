import {
  Chart, BarController, BarElement, LineController, LineElement, PointElement,
  CategoryScale, LinearScale, Tooltip, Filler,
} from 'chart.js';

Chart.register(BarController, BarElement, LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Filler);

const nf = new Intl.NumberFormat('tr-TR');

function tokens() {
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  return {
    text: v('--text'), muted: v('--muted'), grid: v('--chart-grid'),
    bar: v('--chart-bar'), line: v('--chart-line'), surface: v('--surface'),
    mono: v('--font-mono'),
  };
}

function baseOptions(t) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 300 },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: t.surface, titleColor: t.text, bodyColor: t.text,
        borderColor: t.grid, borderWidth: 1, titleFont: { family: t.mono }, bodyFont: { family: t.mono },
      },
    },
    scales: {
      x: { ticks: { color: t.muted, font: { family: t.mono, size: 11 } }, grid: { color: t.grid } },
      y: { ticks: { color: t.muted, font: { family: t.mono, size: 11 } }, grid: { color: t.grid } },
    },
  };
}

let growthChart;
let trendChart;

/** rows: [{ id, delta }] (büyükten küçüğe) */
export function drawGrowth(canvas, rows, onPick) {
  const t = tokens();
  const opts = baseOptions(t);
  opts.indexAxis = 'y';
  opts.scales.y.ticks.callback = function (value) {
    const label = this.getLabelForValue(value);
    const short = label.split('/')[1] ?? label;
    return short.length > 22 ? `${short.slice(0, 21)}…` : short;
  };
  opts.scales.x.ticks.callback = (v) => nf.format(v);
  opts.plugins.tooltip.callbacks = { label: (ctx) => ` +${nf.format(ctx.parsed.x)} yıldız` };
  opts.onClick = (_e, els) => { if (els[0]) onPick(rows[els[0].index].id); };
  const data = {
    labels: rows.map((r) => r.id),
    datasets: [{ data: rows.map((r) => r.delta), backgroundColor: t.bar, borderRadius: 4, maxBarThickness: 22 }],
  };
  growthChart?.destroy();
  growthChart = new Chart(canvas, { type: 'bar', data, options: opts });
}

/** points: [[gün, yıldız, fork, issue]] */
export function drawTrend(canvas, points) {
  const t = tokens();
  const opts = baseOptions(t);
  opts.scales.y.ticks.callback = (v) => nf.format(v);
  opts.scales.x.ticks.maxTicksLimit = 8;
  opts.plugins.tooltip.callbacks = {
    label: (ctx) => ` ${nf.format(ctx.parsed.y)} yıldız`,
  };
  const data = {
    labels: points.map((p) => p[0].slice(5).split('-').reverse().join('.')),
    datasets: [{
      data: points.map((p) => p[1]),
      borderColor: t.line,
      backgroundColor: t.line,
      borderWidth: 2,
      tension: 0.2,
      pointRadius: points.length > 40 ? 0 : 4,
      pointHoverRadius: 6,
    }],
  };
  trendChart?.destroy();
  trendChart = new Chart(canvas, { type: 'line', data, options: opts });
}
