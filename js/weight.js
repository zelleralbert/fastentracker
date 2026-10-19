import { state, save, tomb, range } from './store.js';
import { num, fmtDay, dayKey, movingAvg, rangeStart, rangeLabel } from './logic.js';
import { $, stats, items, lineChart } from './ui.js';

const sign = v => (v > 0 ? '+' : v < 0 ? '−' : '±') + num(Math.abs(v));

export function initWeight() {
  $('wDate').value = dayKey(Date.now());
  $('wSave').onclick = () => {
    const kg = parseFloat(String($('wKg').value).replace(',', '.')), d = $('wDate').value;
    if (!(kg >= 20 && kg <= 400)) return alert('Bitte ein Gewicht zwischen 20 und 400 kg eingeben.');
    const t = new Date(d + 'T12:00:00').getTime();
    if (!d || isNaN(t) || t > Date.now() + 12 * 3600000) return alert('Bitte ein Datum, das nicht in der Zukunft liegt.');
    state.weight = state.weight.filter(x => dayKey(x.t) !== d);
    state.weight.push({ t, kg: Math.round(kg * 10) / 10, u: Date.now() });
    state.weight.sort((a, b) => a.t - b.t);
    save();
    $('wKg').value = ''; $('wDate').value = dayKey(Date.now());
    renderWeight();
  };
}

export function renderWeight() {
  const w = state.weight.sort((a, b) => a.t - b.t), pts = w.map(x => ({ t: x.t, v: x.kg })), trend = movingAvg(pts);
  const last = w[w.length - 1];
  if (last) {
    $('wMain').innerHTML = `${num(last.kg)}<small>kg</small>`;
    $('wSub').textContent = `${fmtDay(last.t)} · Trend ${num(trend[trend.length - 1].v)} kg`;
  } else { $('wMain').textContent = '–'; $('wSub').textContent = 'Noch kein Gewicht eingetragen'; }

  const n = range(), from = rangeStart(Date.now(), n);
  const inR = pts.filter(p => p.t >= from), tIn = trend.filter(p => p.t >= from), before = trend.filter(p => p.t < from).pop();
  const base = before || tIn[0], tl = tIn[tIn.length - 1];
  stats($('wStats'), [
    [tl ? num(tl.v) : '–', 'Trend (kg)'],
    [tl && base && (before || tIn.length > 1) ? sign(tl.v - base.v) : '–', `seit ${rangeLabel(n)} (kg)`],
    [inR.length ? `${num(Math.min(...inR.map(p => p.v)))}–${num(Math.max(...inR.map(p => p.v)))}` : '–', 'Spanne (kg)'],
  ]);
  const shown = inR.length > 1 && lineChart($('wChart'), { from, to: Date.now(), unit: 'kg', series: [{ pts: inR, dots: true, faint: true }, { pts: tIn, line: true }] });
  if (!shown) $('wChart').setAttribute('hidden', '');
  $('wLegend').hidden = !shown;

  items($('wList'), () => w.filter(x => x.t >= rangeStart(Date.now(), Math.max(n, 30))).reverse().map(x => ({
    html: `${fmtDay(x.t)}<small>${num(x.kg)} kg</small>`,
    confirmText: 'Eintrag löschen?',
    onDel: () => { tomb('w:' + dayKey(x.t)); w.splice(w.indexOf(x), 1); save(); renderWeight(); },
  })), 'Noch keine Einträge.');
}
