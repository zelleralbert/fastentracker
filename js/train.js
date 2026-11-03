import { state, save, tomb, range } from './store.js';
import { EXS, BANDS, exById, topSet, byDay, isRecord, suggestNext, bandById, bandKg, bandRange, resistTxt, kgNum, num,
  fmtDay, dayKey, rangeStart, bodyweightFn, loadOf, loadsByDay, workoutLoads, fmtLoad, fmtPct } from './logic.js';
import { $, esc, stats, items, lineChart, loadBars } from './ui.js';
import { note as cleanNote } from './merge.js';

const ex = () => exById(state.ex);
const sets = () => state.train.filter(x => x.ex === state.ex);
const setTxt = x => `${x.reps}${x.kg > 0 ? `×${kgNum(x.kg)}kg` : ''}${x.b && bandById(x.b) ? ' ' + bandById(x.b).name : ''}`;
const delta = d => {
  if (d == null) return '';
  const up = d > 0.0005, down = d < -0.0005;
  return `<span class="delta ${up ? 'up' : down ? 'down' : ''}">${up ? '▲' : down ? '▼' : '■'} ${fmtPct(d)}</span>`;
};
let msgTimer, band = '';          // gewähltes Widerstandsband für den nächsten Satz ('' = keins)

function fillInputs() {
  const e = ex(), s = suggestNext(sets(), e), l = sets().slice(-1)[0];
  $('tReps').value = s ? s.reps : l ? l.reps : '';
  $('tKg').value = e.band ? '' : s ? (s.kg || '') : l && l.kg ? l.kg : '';
  band = e.band ? (s ? s.band : l && l.b ? l.b : '') : '';
  $('tNote').value = '';
}

export function initTrain() {
  $('tSave').onclick = () => {
    const e = ex();
    const reps = Math.round(Number(String($('tReps').value).replace(',', '.')));
    const kg = e.band ? 0 : Math.round((parseFloat(String($('tKg').value).replace(',', '.')) || 0) * 2) / 2;
    if (!(reps >= 1 && reps <= 500)) return alert('Bitte die Anzahl der Wiederholungen eingeben.');
    if (kg < 0 || kg > 500) return alert('Ungültiges Gewicht.');
    const b = e.band ? band : '';
    const prevSet = sets().slice(-1)[0];
    if (prevSet && Date.now() - prevSet.t < 1500 && prevSet.reps === reps && prevSet.kg === kg && (prevSet.b || '') === b) return; // versehentlicher Doppeltipp
    const record = isRecord(sets(), reps, kg + bandKg(b));
    const entry = { t: Date.now(), ex: e.id, reps, kg };
    if (b) entry.b = b;
    const note = cleanNote($('tNote').value);
    if (note) entry.n = note;
    state.train.push(entry);
    save();
    $('tNote').value = '';
    const m = $('tMsg');
    m.textContent = record ? 'Neuer Rekord' : 'Gespeichert';
    m.hidden = false; clearTimeout(msgTimer); msgTimer = setTimeout(() => { m.hidden = true; }, 2500);
    renderTrain();
  };
  for (const id of ['tReps', 'tKg', 'tNote']) $(id).addEventListener('keydown', e => { if (e.key === 'Enter') $('tSave').click(); });
  fillInputs();
}

// Bandauswahl nur bei Übungen mit Band (Split Squats, Lateral Raises, Dead Bugs); Chin-ups und Dips ohne Band
function renderBands(e) {
  const box = $('tBands');
  box.hidden = !e.band;
  $('tKg').hidden = $('tTimes').hidden = $('tKgLbl').hidden = !!e.band;   // mit Band kein Zusatzgewicht
  if (!e.band) return;
  box.innerHTML = '';
  for (const b of [{ id: '', name: 'Kein Band', color: 'transparent' }, ...BANDS]) {
    const el = document.createElement('button');
    el.className = 'band';
    el.setAttribute('aria-pressed', band === b.id);
    el.innerHTML = `<i style="background:${b.color};${b.id ? '' : 'border:1px dashed var(--faint)'}"></i>${b.name}`;
    el.onclick = () => { band = b.id; renderTrain(); };
    box.appendChild(el);
  }
}

export function renderTrain() {
  const e = ex(), all = sets(), today = dayKey(Date.now());

  const box = $('tEx'); box.innerHTML = '';
  for (const x of EXS) {
    const b = document.createElement('button');
    b.className = 'chip' + (x.id === e.id ? ' on' : '');
    b.setAttribute('aria-pressed', x.id === e.id);
    b.textContent = x.name;
    b.onclick = () => { state.ex = x.id; save(); $('tMsg').hidden = true; fillInputs(); renderTrain(); };
    box.appendChild(b);
  }
  $('tReps').placeholder = e.unit;
  // Kamen die Daten erst später (Abgleich, Import), das leere Feld mit dem Vorschlag füllen – aber nie beim Tippen
  if (!$('tReps').value && document.activeElement !== $('tReps')) fillInputs();
  renderBands(e);
  $('tHint').textContent = e.band
    ? (band ? `${e.hint} · Band ${bandById(band).name}: ${bandRange(band)}, gerechnet mit ≈ ${num(bandKg(band), 0)} kg` : `${e.hint} · Band wählen`)
    : e.hint;

  const s = suggestNext(all, e);
  $('tSuggest').hidden = !s;
  if (s) $('tSuggest').innerHTML = `${fmtDay(s.day)}: ${s.last} → heute <b>${s.next}</b>`;

  const todays = all.filter(x => dayKey(x.t) === today);
  items($('tToday'), todays.map((x, i) => ({
    html: `Satz ${i + 1} · <b>${x.reps}</b> ${e.unit}${resistTxt(x)}${x.n ? `<em>${esc(x.n)}</em>` : ''}`,
    onDel: () => { tomb('t:' + x.ex + x.t); state.train.splice(state.train.indexOf(x), 1); save(); renderTrain(); },
  })), '');
  if (!todays.length) $('tToday').innerHTML = '';

  // Bewegte Last (Näherung): Wiederholungen × (Anteil des Körpergewichts + Band), Körpergewicht aus deinen Gewichtsdaten
  const bwFn = bodyweightFn(state.weight), needsBw = e.bw > 0 && !state.weight.length;
  const todayLoad = loadOf(todays, e, bwFn);
  $('tTodayLoad').textContent = needsBw ? 'Trage dein Körpergewicht im Tab Gewicht ein, dann wird die bewegte Last berechnet.'
    : todayLoad ? `Heute bewegt ≈ ${fmtLoad(todayLoad)}` : '';

  // Fortschritt im gewählten Zeitraum; die Veränderung wird zur jeweils vorigen Einheit berechnet, auch über den Zeitraum hinaus
  const n = range(), from = rangeStart(Date.now(), n), r = all.filter(x => x.t >= from), days = byDay(r);
  const loads = loadsByDay(all, e, bwFn), inRange = loads.filter(l => l.t >= from);
  const total = inRange.reduce((a, l) => a + l.load, 0), lastD = inRange.length ? inRange[inRange.length - 1].d : null;
  stats($('tStats'), [
    [days.length || '–', 'Trainingstage'],
    [total ? '≈ ' + fmtLoad(total) : '–', 'bewegt'],
    [lastD == null ? '–' : fmtPct(lastD), 'zur Vorgänger-Einheit'],
  ]);
  const shownBars = inRange.slice(-14);
  $('tLoadBars').hidden = $('tLoadLeg').hidden = !shownBars.length;
  if (shownBars.length) loadBars($('tLoadBars'), shownBars);

  const pts = days.map(d => { const b = topSet(d); return { t: b.t, v: b.reps }; });
  const shown = lineChart($('tChart'), { from, to: Date.now(), series: [{ pts, line: true, dots: true }], unit: e.unit, digits: 0 });
  $('tChartLbl').textContent = shown ? `Bestes Set pro Tag (${e.unit} beim höchsten Widerstand)` : r.length ? 'Wiederholungs-Verlauf ab dem zweiten Trainingstag im Zeitraum.' : '';

  items($('tHist'), () => loads.filter(l => l.t >= rangeStart(Date.now(), Math.max(n, 30))).reverse().map(l => {
    const d = byDay(all).find(x => dayKey(x[0].t) === dayKey(l.t)) || [], notes = d.filter(x => x.n).map(x => esc(x.n));
    return { html: `${fmtDay(l.t)}<small>${d.map(setTxt).join(' / ')} · ≈ ${fmtLoad(l.load)} ${delta(l.d)}</small>${notes.length ? `<em>${notes.join(' · ')}</em>` : ''}` };
  }), 'Noch keine Sätze für diese Übung.');

  // Alle Übungen eines Trainingstags zusammen: so lassen sich die einzelnen Workouts vergleichen
  const wl = workoutLoads(state.train, bwFn), wIn = wl.filter(l => l.t >= from);
  $('wkBars').hidden = !wIn.length;
  if (wIn.length) loadBars($('wkBars'), wIn.slice(-14));
  items($('wkList'), () => wl.filter(l => l.t >= rangeStart(Date.now(), Math.max(n, 30))).reverse().map(l => ({
    html: `${fmtDay(l.t)}<small>≈ ${fmtLoad(l.load)} ${delta(l.d)}</small><em>${EXS.filter(x => l.per[x.id]).map(x => `${x.name.replace(/ mit Band$/, '')} ${fmtLoad(l.per[x.id])}`).join(' · ')}</em>`,
  })), 'Noch keine Workouts mit bekanntem Körpergewicht.');
}
