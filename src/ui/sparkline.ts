// Tiny inline-SVG price sparkline from a price-history series.
export function sparkline(history: number[], w = 56, h = 16): string {
  if (!history || history.length < 2) {
    return `<svg class="spark" width="${w}" height="${h}"></svg>`;
  }
  const min = Math.min(...history);
  const max = Math.max(...history);
  const span = max - min || 1;
  const n = history.length;
  const pts = history.map((v, i) => {
    const x = (i / (n - 1)) * (w - 2) + 1;
    const y = h - 1 - ((v - min) / span) * (h - 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const last = history[n - 1];
  const first = history[0];
  const color = last > first * 1.02 ? "#4a6028" : last < first * 0.98 ? "#7a2418" : "#8a6a44";
  const lastX = (w - 2) + 1;
  const lastY = h - 1 - ((last - min) / span) * (h - 2);
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="1.6" fill="${color}"/>
  </svg>`;
}
