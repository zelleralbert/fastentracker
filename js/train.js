import { state, save, tomb } from './store.js';
import { EXS, BANDS, exById, byDay, sessionEnd, isCurrent, isRecord, suggestNext, bandName, bandKg, bandRange, bandById, resistTxt, kgNum, num, plural,
  fmtDay, bodyweightFn, loadsByDay, compareLoads, workoutLoads, withChange, wtypeById, currentWType, lightId,
  cyclePos, fmtLoad, fmtPct, endOfDay, parseBand, weightAgeDays } from './logic.js';
import { $, esc, items, loadBars, lineChart } from './ui.js';
import { note as cleanNote, normBand } from './merge.js';

const ex = () => exById(state.ex);
const sets = () => state.train.filter(x => x.ex === state.ex);
const setTxt = x => `${x.reps}${x.kg > 0 ? `×${kgNum(x.kg)}kg` : ''}${bandName(x.b) ? ' ' + bandName(x.b) : ''}`;
const delta = d => {
  if (d == null) return '';
  const up = d > 0.0005, down = d < -0.0005;
  return `<span class="delta ${up ? 'up' : down ? 'down' : ''}">${up ? '▲' : down ? '▼' : '■'} ${fmtPct(d)}</span>`;
};
const share = v => `<span class="delta">${num(v * 100, 0)} %</span>`;
let msgTimer, band = '';          // gewähltes Widerstandsband für den nächsten Satz ('' = keins)
let editing = null;               // Satz, der gerade bearbeitet wird {t, ex}
let chosen = null;                // vom Nutzer gewählter Einheiten-Typ {w, at}

// Typ des heutigen Workouts: gewählt, sonst der des zuletzt gespeicherten Satzes von heute, sonst der nächste in der Welle
const currentType = () => currentWType(state.train, Date.now(), chosen);

function fillInputs(keepBand = false) {
  const e = ex(), s = suggestNext(sets(), e, Date.now(), currentType()), l = sets().slice(-1)[0];
  $('tReps').value = s ? s.reps : l ? l.reps : '';
  $('tKg').value = e.band ? '' : s ? (s.kg || '') : l && l.kg ? l.kg : '';
  band = e.band ? (keepBand && band ? band : s ? s.band : l && l.b ? l.b : '') : '';
  $('tNote').value = '';
}

export function initTrain() {
  $('tSave').onclick = () => {
    const e = ex();
    const reps = Math.round(Number(String($('tReps').value).replace(',', '.')));
    const kg = e.band ? 0 : Math.round((parseFloat(String($('tKg').value).replace(',', '.')) || 0) * 2) / 2;
    if (!(reps >= 1 && reps <= 500)) return alert('Bitte die Anzahl der Wiederholungen eingeben.');
    if (kg < 0 || kg > 500) return alert('Ungültiges Gewicht.');
    const b = e.band ? band : '', w = currentType();
    const note0 = cleanNote($('tNote').value);
    if (editing) {   // Änderung eines gespeicherten Satzes: gleicher Zeitpunkt und Typ, neuere Fassung (u) gewinnt beim Abgleich
      const i = state.train.findIndex(x => x.t === editing.t && x.ex === editing.ex);
      editing = null;
      if (i >= 0) {
        const old = state.train[i], n = { t: old.t, ex: old.ex, reps, kg };
        if (b) n.b = b;
        if (old.w) n.w = old.w;
        if (note0) n.n = note0;
        n.u = Date.now();
        state.train[i] = n; save();
      }
      fillInputs();
      const m = $('tMsg'); m.textContent = 'Geändert'; m.hidden = false; clearTimeout(msgTimer); msgTimer = setTimeout(() => { m.hidden = true; }, 2500);
      return renderTrain();
    }
    const prevSet = sets().slice(-1)[0];
    if (prevSet && Date.now() - prevSet.t < 1500 && prevSet.reps === reps && prevSet.kg === kg && (prevSet.b || '') === b) return; // versehentlicher Doppeltipp
    const record = isRecord(sets(), reps, kg + bandKg(b));
    const entry = { t: Date.now(), ex: e.id, reps, kg };
    if (b) entry.b = b;
    entry.w = w;
    if (note0) entry.n = note0;
    state.train.push(entry);
    save();
    $('tNote').value = '';
    const m = $('tMsg');
    m.textContent = record && w === 'p' ? 'Neuer Rekord' : 'Gespeichert';
    m.hidden = false; clearTimeout(msgTimer); msgTimer = setTimeout(() => { m.hidden = true; }, 2500);
    renderTrain();
  };
  $('tCancel').onclick = () => { editing = null; fillInputs(); renderTrain(); };
  for (const id of ['tReps', 'tKg', 'tNote']) $(id).addEventListener('keydown', e => { if (e.key === 'Enter') $('tSave').click(); });
  fillInputs();
}

// Auswahl des Einheiten-Typs (gilt für alle Übungen des heutigen Workouts): Leicht oder Schwer, dazu die Stellung in der Welle
const CHOICES = [{ name: 'Leicht', ids: ['l', 'k'] }, { name: 'Schwer', ids: ['p'] }];
function renderTypes() {
  const cur = currentType(), box = $('tType');
  box.innerHTML = '';
  for (const c of CHOICES) {
    const b = document.createElement('button'), on = c.ids.includes(cur);
    b.className = 'chip type' + (on ? ' on' : '');
    b.setAttribute('aria-pressed', on);
    b.textContent = c.name;
    b.onclick = () => { chosen = { w: c.ids.length > 1 ? lightId(state.train, Date.now()) : c.ids[0], at: Date.now() }; fillInputs(); renderTrain(); };
    box.appendChild(b);
  }
  const pos = cyclePos(cur);
  $('tTypeHint').textContent = cur === 'p' ? 'Einheit 3 von 3 · Schwer: eine Wiederholung mehr als beim letzten Mal, letzter Satz so viele wie möglich'
    : cur === 'o' ? 'Frühere Einheit'
    : `Einheit ${pos} von 3 · Leicht: etwa 70 % der Wiederholungen der letzten Schwer-Einheit`;
}

// Bandauswahl nur bei Übungen mit Band (Lateral Raises, Dead Bugs, Deadlifts, Squats); Chin-ups und Dips ohne Band
function renderBands(e) {
  const box = $('tBands');
  box.hidden = !e.band;
  $('tKg').hidden = $('tTimes').hidden = $('tKgLbl').hidden = !!e.band;   // mit Band kein Zusatzgewicht
  if (!e.band) return;
  box.innerHTML = '';
  // Tippen: Band dazunehmen, nochmal: als Schleife (doppelter Widerstand), nochmal: wieder weg. So lassen sich Bänder kombinieren.
  const cur = new Map(parseBand(band).map(p => [p.b.id, p.n]));
  const none = document.createElement('button');
  none.className = 'band'; none.setAttribute('aria-pressed', !cur.size);
  none.innerHTML = '<i style="background:transparent;border:1px dashed var(--faint)"></i>Kein Band';
  none.onclick = () => { band = ''; renderTrain(); };
  box.appendChild(none);
  for (const b of BANDS) {
    const el = document.createElement('button'), n = cur.get(b.id) || 0;
    el.className = 'band';
    el.setAttribute('aria-pressed', n > 0);
    el.innerHTML = `<i style="background:${b.color}"></i>${b.name}${n === 2 ? ' ×2' : ''}`;
    el.onclick = () => { const m = new Map(cur); const next = (n + 1) % 3; if (next) m.set(b.id, next); else m.delete(b.id); band = normBand([...m].map(([id, k]) => id + (k === 2 ? '2' : '')).join('+')); renderTrain(); };
    box.appendChild(el);
  }
}

export function renderTrain() {
  const e = ex(), all = sets(), now = Date.now(), type = currentType();
  if (editing && (editing.ex !== e.id || !state.train.some(x => x.t === editing.t && x.ex === editing.ex))) editing = null;
  $('tSave').textContent = editing ? 'Änderung speichern' : 'Satz speichern'; $('tCancel').hidden = !editing;
  renderTypes();

  const box = $('tEx'); box.innerHTML = '';
  for (const x of EXS) {
    const b = document.createElement('button');
    b.className = 'chip' + (x.id === e.id ? ' on' : '');
    b.setAttribute('aria-pressed', x.id === e.id);
    b.textContent = x.name;
    b.onclick = () => { editing = null; state.ex = x.id; save(); $('tMsg').hidden = true; fillInputs(); renderTrain(); };
    box.appendChild(b);
  }
  $('tReps').placeholder = e.unit;
  // Kamen die Daten erst später (Abgleich, Import), das leere Feld mit dem Vorschlag füllen – aber nie beim Tippen
  if (!$('tReps').value && document.activeElement !== $('tReps')) fillInputs(true);
  renderBands(e);
  $('tHint').textContent = e.band
    ? (band ? `${e.hint} · ${bandName(band)}: ${bandRange(band)}, gerechnet mit ≈ ${num(bandKg(band), 0)} kg` : `${e.hint} · Band wählen (nochmal tippen: Schleife = doppelt)`)
    : e.hint;

  // Ziel für heute aus der letzten Schwer-Einheit
  const s = suggestNext(all, e, Date.now(), type), tn = wtypeById(type).name;
  $('tSuggest').hidden = !s;
  if (s) $('tSuggest').innerHTML = `${tn} · Ziel <b>${s.next}</b>${s.amrap ? ', letzter Satz so viele wie möglich' : ''}<br><span class="muted">letzte Schwer-Einheit (${fmtDay(s.day)}): ${s.last}</span>`
    + (s.bandUp ? `<br>Alle Sätze ≥ 12: ${bandName(s.bandUp.to)} (≈ ${num(bandKg(s.bandUp.to), 0)} kg) statt ${bandName(s.bandUp.from)} probieren` : '');

  // Sätze des laufenden bzw. des letzten Workouts dieser Übung (bis 24 Stunden danach), zum Ändern und Löschen
  const lastW = byDay(all).slice(-1)[0], todays = lastW && now - sessionEnd(lastW) < 24 * 3600000 ? lastW : [];
  items($('tToday'), todays.map((x, i) => ({
    html: `Satz ${i + 1} · <b>${x.reps}</b> ${e.unit}${resistTxt(x)}${x.n ? `<em>${esc(x.n)}</em>` : ''}`,
    onEdit: () => { editing = { t: x.t, ex: x.ex }; $('tReps').value = x.reps; $('tKg').value = x.kg || ''; band = x.b || ''; $('tNote').value = x.n || ''; renderTrain(); scrollTo(0, 0); },
    onDel: () => { if (editing && editing.t === x.t) editing = null; tomb('t:' + x.ex + x.t); state.train.splice(state.train.indexOf(x), 1); save(); renderTrain(); },
  })), '');
  if (!todays.length) $('tToday').innerHTML = '';

  // Bewegte Last (Näherung): Wiederholungen × (Anteil des Körpergewichts + Band), Körpergewicht aus deinen Gewichtsdaten
  const bwFn = bodyweightFn(state.weight), needsBw = e.bw > 0 && !state.weight.length;
  const loads = loadsByDay(all, e, bwFn), cmp = compareLoads(loads, now);
  const age = e.bw > 0 ? weightAgeDays(state.weight, now) : null;
  $('tCardNote').textContent = needsBw ? 'Trage dein Körpergewicht im Tab Gewicht ein, dann wird die bewegte Last berechnet.'
    : age != null && age > 7 ? `Letzte Gewichtsmessung vor ${age} Tagen – die bewegte Last ist ungenau. Bitte im Tab Gewicht eintragen.` : '';

  // Wichtigste Kennzahlen: was ich heute in dieser Übung geleistet habe und wie das zu früheren Einheiten steht
  $('tCard').hidden = !cmp;
  if (cmp) {
    const { cur } = cmp, up = v => v > 0.0005, down = v => v < -0.0005;
    const arrow = v => (up(v) ? '▲' : down(v) ? '▼' : '■'), cls = v => (up(v) ? 'up' : down(v) ? 'down' : '');
    const label = wtypeById(cur.w).name;
    $('tCardTitle').textContent = (cmp.isToday ? `Heute · ${label} · ` : `Letzte Einheit · ${fmtDay(cur.t)} · ${label} · `) + e.name;
    $('tCardLoad').textContent = `≈ ${fmtLoad(cur.load)}`;
    const pc = $('tCardPct'), refs = [];
    const row = (lbl, v) => `<div><span>${lbl}</span><span class="delta ${cls(v)}">${arrow(v)} ${fmtPct(v)}</span></div>`;
    if (cmp.light) {
      // leichte Einheit: Anteil der letzten Schwer-Einheit, kein Fortschrittsvergleich
      pc.textContent = cmp.share == null ? '' : `≈ ${num(cmp.share * 100, 0)} %`; pc.className = 'pct';
      $('tCardSub').textContent = `${plural(cur.n, 'Satz', 'Sätze')} · ${cur.reps} ${e.unit}` + (cmp.isToday ? ' bisher' : '')
        + (cmp.ref ? ` · von der letzten Schwer-Einheit (${fmtDay(cmp.ref.t)}: ${fmtLoad(cmp.ref.load)})` : ' · noch keine Schwer-Einheit als Maßstab');
    } else {
      pc.textContent = cmp.pctLast == null ? '' : `${arrow(cmp.pctLast)} ${fmtPct(cmp.pctLast)}`;
      pc.className = 'pct ' + (cmp.pctLast == null ? '' : cls(cmp.pctLast));
      $('tCardSub').textContent = `${plural(cur.n, 'Satz', 'Sätze')} · ${cur.reps} ${e.unit}` + (cmp.isToday ? ' bisher' : '')
        + (cmp.last ? ` · zur letzten Schwer-Einheit (${fmtDay(cmp.last.t)}: ${fmtLoad(cmp.last.load)})` : ' · erste Schwer-Einheit, noch kein Vergleich');
      if (cmp.avg != null) refs.push(row(`Ø letzte ${cmp.avgN} Schwer-Einheiten (≈ ${fmtLoad(cmp.avg)})`, cmp.pctAvg));
      if (cmp.best) refs.push(cmp.isBest ? `<div><span>Bisheriger Bestwert (≈ ${fmtLoad(cmp.best.load)})</span><span class="badge">Neuer Bestwert</span></div>`
        : row(`Bestwert (≈ ${fmtLoad(cmp.best.load)}, ${fmtDay(cmp.best.t)})`, cmp.pctBest));
    }
    $('tCardRefs').innerHTML = refs.join(''); $('tCardRefs').hidden = !refs.length;
  }

  // Balken: nur Schwer-Einheiten (grün = mehr als bei der vorigen Schwer-Einheit, orange = weniger)
  const perf = withChange(loads.filter(l => l.w === 'p')).slice(-8);
  $('tLoadBars').hidden = $('tLoadLeg').hidden = $('tLoadCap').hidden = perf.length < 2;
  if (perf.length >= 2) loadBars($('tLoadBars'), perf);

  // Liniendiagramm über die gesamte Zeit: Schwer-Einheiten (Linie), frühere Einheiten ohne Typ als graue Punkte; leichte Einheiten fehlen
  const pt = l => ({ t: l.t, v: Math.round(l.load) }), hard = loads.filter(l => l.w === 'p').map(pt), early = loads.filter(l => l.w === 'o').map(pt);
  const shown = hard.length + early.length >= 2 && lineChart($('tChart'), { from: Math.min(...[...hard, ...early].map(p => p.t)), to: endOfDay(Date.now()), unit: 'kg', digits: 0,
    series: [{ pts: early, dots: true, faint: true }, { pts: hard, line: true, dots: true }] });
  $('tChartCap').hidden = $('tChartLeg').hidden = !shown; if (!shown) $('tChart').setAttribute('hidden', '');
  $('tChartLeg').lastElementChild.hidden = !early.length;

  // Frühere Schwer-Einheiten; bei Schwer der Prozentwert des Fortschritts, sonst der Anteil an der jeweiligen Schwer-Einheit
  items($('tHist'), () => (cmp ? cmp.before.slice().reverse().slice(0, 20) : []).map(l => {
    const d = byDay(all).find(x => x[0].t === l.t) || [], v = cmp.pctVs(l);
    const notes = d.filter(x => x.n).map(x => esc(x.n));
    return { html: `${fmtDay(l.t)}<small>${d.map(setTxt).join(' / ')} · ≈ ${fmtLoad(l.load)} · ${cmp.light ? 'heute' : cmp.isToday ? 'heute' : 'zuletzt'} ${cmp.light ? (v == null ? '' : share(v)) : delta(v)}</small>${notes.length ? `<em>${notes.join(' · ')}</em>` : ''}` };
  }), 'Noch keine früheren Schwer-Einheiten dieser Übung.');

  // Alle Übungen eines Trainingstags zusammen (eingeklappt); Balken nur Schwer-Einheiten
  const wl = workoutLoads(state.train, bwFn), wp = withChange(wl.filter(l => l.w === 'p')), wpd = new Map(wp.map(l => [l.t, l.d]));
  $('wkBars').hidden = !wp.length;
  if (wp.length) loadBars($('wkBars'), wp.slice(-14));
  items($('wkList'), () => wl.slice().reverse().slice(0, 20).map(l => ({
    html: `${fmtDay(l.t)} · ${wtypeById(l.w).name}<small>≈ ${fmtLoad(l.load)} ${l.w === 'p' ? delta(wpd.get(l.t)) : ''}</small><em>${EXS.filter(x => l.per[x.id]).map(x => `${x.name.replace(/ mit Band$/, '')} ${fmtLoad(l.per[x.id])}`).join(' · ')}</em>`,
  })), 'Noch keine Workouts mit bekanntem Körpergewicht.');
}
