import { state, save, tomb, range } from './store.js';
import { EXS, exById, topSet, byDay, isRecord, suggestNext, kgNum, fmtDay, dayKey, rangeStart } from './logic.js';
import { $, esc, stats, items, lineChart } from './ui.js';

const ex = () => exById(state.ex);
const sets = () => state.train.filter(x => x.ex === state.ex);
const setTxt = x => `${x.reps}${x.kg > 0 ? ` × ${kgNum(x.kg)} kg` : ''}`;
let msgTimer;

function fillInputs() {
  const s = suggestNext(sets(), ex()), l = sets().slice(-1)[0];
  $('tReps').value = s && !s.up ? s.reps : l ? l.reps : '';
  $('tKg').value = s ? (s.kg || '') : l && l.kg ? l.kg : '';
  $('tNote').value = '';
}

export function initTrain() {
  $('tSave').onclick = () => {
    const e = ex(), max = e.unit === 'Sek.' ? 3600 : 500;
    const reps = parseInt($('tReps').value, 10);
    const kg = Math.round((parseFloat(String($('tKg').value).replace(',', '.')) || 0) * 2) / 2;
    if (!(reps >= 1 && reps <= max)) return alert(e.unit === 'Sek.' ? 'Bitte die Dauer in Sekunden eingeben.' : 'Bitte die Anzahl der Wiederholungen eingeben.');
    if (kg < 0 || kg > 500) return alert('Ungültiges Gewicht.');
    const record = isRecord(sets(), reps, kg);
    const entry = { t: Date.now(), ex: e.id, reps, kg };
    const note = $('tNote').value.trim();
    if (note) entry.n = note.slice(0, 140);
    state.train.push(entry);
    save();
    $('tNote').value = '';
    const m = $('tMsg');
    m.textContent = record ? 'Neuer Rekord' : 'Gespeichert';
    m.hidden = false; clearTimeout(msgTimer); msgTimer = setTimeout(() => { m.hidden = true; }, 2500);
    renderTrain();
  };
  fillInputs();
}

export function renderTrain() {
  const e = ex(), all = sets(), today = dayKey(Date.now());

  const box = $('tEx'); box.innerHTML = '';
  for (const x of EXS) {
    const b = document.createElement('button');
    b.className = 'chip' + (x.id === e.id ? ' on' : '');
    b.textContent = x.name;
    b.onclick = () => { state.ex = x.id; save(); $('tMsg').hidden = true; fillInputs(); renderTrain(); };
    box.appendChild(b);
  }
  $('tReps').placeholder = e.unit;
  $('tHint').textContent = e.hint;

  const s = suggestNext(all, e);
  $('tSuggest').hidden = !s;
  if (s) $('tSuggest').innerHTML = s.up
    ? `${fmtDay(s.day)}: <b>${s.last}</b> – alle Sätze ≥ ${e.cap}. Heute mit <b>${s.next}</b> versuchen.`
    : `${fmtDay(s.day)}: ${s.last} → heute <b>${s.next}</b>`;

  const todays = all.filter(x => dayKey(x.t) === today);
  items($('tToday'), todays.map((x, i) => ({
    html: `Satz ${i + 1} · <b>${x.reps}</b> ${e.unit}${x.kg > 0 ? ` × ${kgNum(x.kg)} kg` : ''}${x.n ? `<em>${esc(x.n)}</em>` : ''}`,
    onDel: () => { tomb('t:' + x.ex + x.t); state.train.splice(state.train.indexOf(x), 1); save(); fillInputs(); renderTrain(); },
  })), '');
  if (!todays.length) $('tToday').innerHTML = '';

  // Fortschritt im gewählten Zeitraum
  const n = range(), from = rangeStart(Date.now(), n), r = all.filter(x => x.t >= from), days = byDay(r), best = topSet(r);
  stats($('tStats'), [
    [days.length || '–', 'Trainingstage'],
    [r.length || '–', 'Sätze'],
    [best ? setTxt(best) : '–', 'Bestes Set'],
  ]);
  const pts = days.map(d => { const b = topSet(d); return { t: b.t, v: b.reps }; });
  const shown = lineChart($('tChart'), { from, to: Date.now(), series: [{ pts, line: true, dots: true }], unit: e.unit, digits: 0 });
  $('tChartLbl').textContent = shown ? `Bestes Set pro Tag (${e.unit} beim höchsten Gewicht)` : r.length ? 'Verlauf ab dem zweiten Trainingstag im Zeitraum.' : '';

  items($('tHist'), () => byDay(all.filter(x => x.t >= rangeStart(Date.now(), Math.max(n, 30)))).reverse().map(d => {
    const notes = d.filter(x => x.n).map(x => esc(x.n));
    return { html: `${fmtDay(d[0].t)}<small>${d.map(setTxt).join(' / ')} ${e.unit}</small>${notes.length ? `<em>${notes.join(' · ')}</em>` : ''}` };
  }), 'Noch keine Sätze für diese Übung.');
}
