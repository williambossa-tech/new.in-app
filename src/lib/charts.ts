// Gráficos em SVG (sem dependências): usados na tela, no PDF e no Excel (como imagem).
export const CHART_COLORS = ["#6a3df5", "#17b5a6", "#ffc83d", "#ff6b5b", "#4cc26b", "#1d2b4f"];
const INK = "#222b45";
const MUTED = "#8a91a5";
const GRID = "#ebe9f5";
const FONT = "Plus Jakarta Sans, Plus Jakarta Sans Variable, sans-serif";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const nice = (max: number) => {
  if (max <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= max) return m * p;
  return 10 * p;
};
const fmt = (v: number, unit = "") => `${Number.isInteger(v) ? v : v.toFixed(1).replace(".", ",")}${unit}`;

export type Series = { name: string; values: number[]; color?: string };

/** Barras verticais (agrupadas quando há mais de uma série). */
export function barChart(o: { title: string; categories: string[]; series: Series[]; unit?: string; max?: number; width?: number; height?: number }) {
  const W = o.width ?? 640, H = o.height ?? 300;
  const pad = { l: 44, r: 16, t: 48, b: 46 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const step = o.max ? o.max / 4 : Math.max(1, nice(Math.max(1, ...o.series.flatMap((s) => s.values)) / 4));
  const vmax = o.max ?? step * 4;
  const groupW = iw / Math.max(1, o.categories.length);
  const barW = Math.min(36, (groupW * 0.7) / o.series.length);
  const y = (v: number) => pad.t + ih - (v / vmax) * ih;
  let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT}">`;
  out += `<rect width="${W}" height="${H}" rx="16" fill="white"/>`;
  out += `<text x="${pad.l - 28}" y="26" font-size="15" font-weight="600" fill="${INK}">${esc(o.title)}</text>`;
  for (let i = 0; i <= 4; i++) {
    const v = (vmax / 4) * i, yy = y(v);
    out += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${yy}" y2="${yy}" stroke="${GRID}"/>`;
    out += `<text x="${pad.l - 8}" y="${yy + 4}" font-size="10" fill="${MUTED}" text-anchor="end">${fmt(v, o.unit)}</text>`;
  }
  o.categories.forEach((c, ci) => {
    const gx = pad.l + ci * groupW + (groupW - barW * o.series.length) / 2;
    o.series.forEach((s, si) => {
      const v = s.values[ci] ?? 0, x = gx + si * barW, yy = y(v);
      const color = s.color ?? CHART_COLORS[si % CHART_COLORS.length];
      out += `<rect x="${x + 2}" y="${yy}" width="${barW - 4}" height="${Math.max(0, pad.t + ih - yy)}" rx="5" fill="${color}"/>`;
      if (v > 0) out += `<text x="${x + barW / 2}" y="${yy - 5}" font-size="10" font-weight="600" fill="${INK}" text-anchor="middle">${fmt(v, o.unit)}</text>`;
    });
    out += `<text x="${pad.l + ci * groupW + groupW / 2}" y="${H - pad.b + 18}" font-size="11" fill="${MUTED}" text-anchor="middle">${esc(c)}</text>`;
  });
  if (o.series.length > 1) {
    let lx = pad.l;
    o.series.forEach((s, si) => {
      out += `<rect x="${lx}" y="${H - 16}" width="10" height="10" rx="3" fill="${s.color ?? CHART_COLORS[si % CHART_COLORS.length]}"/>`;
      out += `<text x="${lx + 15}" y="${H - 7}" font-size="11" fill="${INK}">${esc(s.name)}</text>`;
      lx += 30 + s.name.length * 7;
    });
  }
  return out + "</svg>";
}

/** Barras horizontais (ranking). */
export function hBarChart(o: { title: string; labels: string[]; values: number[]; unit?: string; color?: string; width?: number }) {
  const W = o.width ?? 640, rowH = 26, top = 48;
  const H = top + Math.max(1, o.labels.length) * rowH + 18;
  const lw = 92, iw = W - lw - 56;
  const vmax = nice(Math.max(1, ...o.values));
  let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT}">`;
  out += `<rect width="${W}" height="${H}" rx="16" fill="white"/>`;
  out += `<text x="16" y="26" font-size="15" font-weight="600" fill="${INK}">${esc(o.title)}</text>`;
  if (!o.labels.length) out += `<text x="16" y="${top + 16}" font-size="12" fill="${MUTED}">Sem dados no período</text>`;
  o.labels.forEach((l, i) => {
    const yy = top + i * rowH, w = (o.values[i] / vmax) * iw;
    out += `<text x="${lw - 10}" y="${yy + 16}" font-size="12" fill="${INK}" text-anchor="end">${esc(l)}</text>`;
    out += `<rect x="${lw}" y="${yy + 4}" width="${iw}" height="16" rx="8" fill="#f3efff"/>`;
    out += `<rect x="${lw}" y="${yy + 4}" width="${Math.max(4, w)}" height="16" rx="8" fill="${o.color ?? CHART_COLORS[0]}"/>`;
    out += `<text x="${lw + Math.max(4, w) + 8}" y="${yy + 16}" font-size="11" font-weight="600" fill="${INK}">${fmt(o.values[i], o.unit)}</text>`;
  });
  return out + "</svg>";
}
