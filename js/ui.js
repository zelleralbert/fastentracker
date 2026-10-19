// Kleine DOM-Helfer und Diagramme.
import { num, fmtShort } from './logic.js';

export const $ = id => document.getElementById(id);
// toggle-Ereignisse blubbern nicht, daher in der Capture-Phase abfangen
document.addEventListener('toggle', e => {
  if (e.target.open) e.target.querySelectorAll('div').forEach(el => { if (el._lazy) el._lazy(); });
}, true);
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function stats(el, list) {
  el.innerHTML = list.map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
}

// Liste mit optionalem Löschknopf. `rows` darf eine Funktion sein: Steht die Liste in einem
// zugeklappten <details>, wird sie erst beim Aufklappen gebaut (spart Zeit bei langen Verläufen).
export function items(el, rows, empty = 'Noch keine Einträge.') {
  const d = el.closest('details');
  if (typeof rows === 'function' && d && !d.open) { el.innerHTML = ''; el._lazy = () => items(el, rows(), empty); return; }
  if (typeof rows === 'function') rows = rows();
  el._lazy = null;
  el.innerHTML = '';
  if (!rows.length) { el.innerHTML = `<div class="empty">${empty}</div>`; return; }
  for (const { html, onDel, confirmText } of rows) {
    const r = document.createElement('div');
    r.className = 'item';
    r.innerHTML = `<div>${html}</div>` + (onDel ? '<button class="del" aria-label="Löschen">✕</button>' : '');
    if (onDel) r.querySelector('.del').onclick = () => { if (!confirmText || confirm(confirmText)) onDel(); };
    el.appendChild(r);
  }
}

// Balken je Abschnitt (Tag/Woche/Monat, siehe logic.buckets).
// values(from, to) → Werte im Abschnitt; angezeigt wird ihr Durchschnitt. max: Skalenobergrenze
export function bars(el, { list, every }, values, { max, low } = {}) {
  const vals = list.map(b => { const v = values(b.from, b.to); return v.length ? v.reduce((a, x) => a + x, 0) / v.length : null; });
  const top = Math.max(max || 0, ...vals.filter(v => v != null));
  el.innerHTML = list.map((b, i) => {
    const v = vals[i];
    const lbl = (list.length - 1 - i) % every === 0 ? b.label : '';
    const cls = v == null ? 'none' : low && low(v) ? 'low' : '';
    const h = v == null ? 0 : Math.max(3, v / top * 100);
    return `<div title="${fmtShort(b.from)}${v != null ? ': ' + num(v) : ''}"><i class="${cls}" style="height:${h}%"></i><span>${lbl}</span></div>`;
  }).join('');
}

// Liniendiagramm. series: [{pts:[{t,v}], line?:bool, dots?:bool, faint?:bool}]
export function lineChart(svg, { from, to, series, unit = '', digits = 1 }) {
  const all = series.flatMap(s => s.pts);
  if (all.length < 2) { svg.setAttribute('hidden', ''); return false; }
  let mn = Math.min(...all.map(p => p.v)), mx = Math.max(...all.map(p => p.v));
  if (mx - mn < 1) { mn -= .5; mx += .5; }
  const W = 320, X = t => 6 + (t - from) / (to - from || 1) * (W - 12), Y = v => 118 - (v - mn) / (mx - mn) * 96;
  let out = `<line class="grid" x1="0" x2="${W}" y1="22" y2="22"/><line class="grid" x1="0" x2="${W}" y1="118" y2="118"/>`
    + `<text class="lbl" x="${W}" y="16" text-anchor="end">${num(mx, digits)} ${unit}</text>`
    + `<text class="lbl" x="${W}" y="112" text-anchor="end">${num(mn, digits)} ${unit}</text>`
    + `<text class="lbl" x="0" y="134">${fmtShort(from)}</text><text class="lbl" x="${W}" y="134" text-anchor="end">${fmtShort(to)}</text>`;
  for (const s of series) {
    if (s.line && s.pts.length > 1) out += `<polyline class="line" points="${s.pts.map(p => X(p.t).toFixed(1) + ',' + Y(p.v).toFixed(1)).join(' ')}"/>`;
    if (s.dots) out += s.pts.map(p => `<circle class="dot${s.faint ? ' faint' : ''}" cx="${X(p.t).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="${s.faint ? 2.2 : 2.8}"/>`).join('');
  }
  svg.innerHTML = out;
  svg.removeAttribute('hidden');
  return true;
}
