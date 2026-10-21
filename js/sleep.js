import { state, save, tomb, range } from './store.js';
import { H, num, plural, fmtHM, fmtDay, hhmm, avg, avgClock, rangeStart, buckets, lastDays } from './logic.js';
import { $, stats, items, bars, actogram } from './ui.js';
import { analyzeDrift } from './drift.js';

const toLocalInput = t => new Date(t - new Date(t).getTimezoneOffset() * 60000).toISOString().slice(0, 16);

function addSleep(bed, wake) {
  if (!bed || !wake || wake <= bed) return alert('Die Aufwachzeit muss nach der Einschlafzeit liegen.'), false;
  if (wake - bed < 10 * 60000) return alert('Kürzer als 10 Minuten – nicht gespeichert.'), false;
  if (wake - bed > 24 * H) return alert('Eine Nacht kann nicht länger als 24 Stunden dauern. Brich den Schlaf ab und trage die Nacht nachträglich ein.'), false;
  if (wake > Date.now() + 60000) return alert('Die Aufwachzeit liegt in der Zukunft.'), false;
  if (state.sleep.some(s => bed < s.wake && wake > s.bed)) return alert('Diese Zeit überschneidet sich mit einer bereits eingetragenen Nacht.'), false;
  state.sleep.push({ bed, wake });
  state.sleep.sort((a, b) => a.wake - b.wake);
  return true;
}

export function initSleep() {
  $('sGo').onclick = () => {
    if (!state.sleepNow) state.sleepNow = Date.now();
    else if (addSleep(state.sleepNow, Date.now())) state.sleepNow = null;
    else return;
    save(); renderSleep();
  };
  $('sCancel').onclick = () => { tomb('s:' + state.sleepNow); state.sleepNow = null; save(); renderSleep(); };
  $('sManualBtn').onclick = () => {
    const m = $('sManual'); m.hidden = !m.hidden;
    if (!m.hidden) {
      const d = new Date(); d.setHours(7, 0, 0, 0); if (d > Date.now()) d.setDate(d.getDate() - 1);
      $('sWakeIn').value = toLocalInput(d.getTime()); $('sBedIn').value = toLocalInput(d.getTime() - 8 * H);
    }
  };
  $('sSave').onclick = () => {
    if (addSleep(new Date($('sBedIn').value).getTime(), new Date($('sWakeIn').value).getTime())) { $('sManual').hidden = true; save(); renderSleep(); }
  };
}

export function renderSleep() {
  const now = state.sleepNow, s = state.sleep;
  $('sGo').textContent = now ? 'Aufgewacht' : 'Schlafen gehen';
  $('sCancel').hidden = !now;
  $('sManualBtn').hidden = !!now;
  if (now) $('sManual').hidden = true;

  const n = range(), from = rangeStart(Date.now(), n), r = s.filter(x => x.wake >= from), d = r.map(x => x.wake - x.bed);
  stats($('sStats'), [
    [d.length ? fmtHM(avg(d)) + ' h' : '–', 'Ø Schlaf'],
    [avgClock(r.map(x => x.bed)), 'Ø ins Bett'],
    [avgClock(r.map(x => x.wake)), 'Ø Aufstehen'],
  ]);
  bars($('sBars'), buckets(Date.now(), n), (a, b) => r.filter(x => x.wake >= a && x.wake < b).map(x => (x.wake - x.bed) / H),
    { max: 9, low: v => v < 7 });

  items($('sList'), () => s.filter(x => x.wake >= rangeStart(Date.now(), Math.max(n, 30))).reverse().map(x => ({
    html: `${fmtDay(x.wake)}<small>${hhmm(x.bed)} – ${hhmm(x.wake)} · ${fmtHM(x.wake - x.bed)} h</small>`,
    confirmText: 'Nacht löschen?',
    onDel: () => { tomb('s:' + x.bed); s.splice(s.indexOf(x), 1); save(); renderSleep(); },
  })), 'Noch keine Nächte erfasst.');
  renderDrift();
  tickSleep();
}

// Schlafverschiebung (Non-24): Zykluslänge, tägliche Verschiebung, Vorhersage und Aktogramm
export function renderDrift() {
  const now = Date.now(), days = Math.max(range(), 14);
  const r = analyzeDrift(state.sleep, { now, days });
  const hide = () => { $('sNext').hidden = true; $('sActoLeg').hidden = true; $('sActo').setAttribute('hidden', ''); };
  if (!r.ok) {
    stats($('sDrift'), []);
    $('sDriftNote').textContent = r.reason + '. Trage deine Nächte ein, dann wird die Verschiebung berechnet.';
    return hide();
  }
  const d = Math.round(r.driftMin), sgn = d > 0 ? '+' : d < 0 ? '−' : '±';
  stats($('sDrift'), [
    [`${sgn}${Math.abs(d)} min`, r.kind === 'stabil' ? 'pro Tag (stabil)' : `pro Tag ${r.kind}`],
    [`${num(r.periodH, 2)} h`, 'Zykluslänge'],
    [r.rotationDays ? `≈ ${Math.round(r.rotationDays)} T` : '–', 'bis zur vollen Runde'],
  ]);
  const win = n => `${fmtDay(n.bed)}, ${hhmm(n.bed)} – ${hhmm(n.wake)}`;
  $('sNext').hidden = !r.next.length;
  if (r.next.length) {
    // Hat das erwartete Fenster schon begonnen (du bist später dran), nicht eine Startzeit in der Vergangenheit als „nächster Schlaf“ nennen
    const [a, b] = r.next, running = a.bed <= now;
    $('sNext').innerHTML = (running ? `Jetzt erwartet: <b>${hhmm(a.bed)} – ${hhmm(a.wake)}</b>` : `Nächster Schlaf voraussichtlich <b>${win(a)}</b>`)
      + (b ? `<br>danach ${win(b)}` : '');
  }
  $('sDriftNote').textContent = `Schätzung aus ${plural(r.n, 'Nacht', 'Nächten')} der letzten ${days} Tage · Streuung ±${Math.round(r.spreadMin)} min. Keine ärztliche Diagnose.`;

  // Aktogramm: letzte Tage plus fünf erwartete
  const nPast = Math.min(days, 60), future = 5, nRows = nPast + future;
  const starts = lastDays(now, nPast);
  for (let i = 1; i <= future + 2; i++) { const t = new Date(starts[nPast - 1]); t.setDate(t.getDate() + i); starts.push(t.getTime()); }
  const sleeps = state.sleep.filter(x => x.wake > starts[0]);
  if (state.sleepNow) sleeps.push({ bed: state.sleepNow, wake: now });
  actogram($('sActo'), { starts, nRows, todayIdx: nPast - 1, sleeps, predicted: r.next });
  $('sActoLeg').hidden = false;
}

export function tickSleep() {
  const now = state.sleepNow, s = state.sleep;
  if (now) {
    $('sMain').textContent = fmtHM(Date.now() - now);
    $('sSub').textContent = `schläfst seit ${hhmm(now)}`;
  } else if (s.length) {
    const l = s[s.length - 1];
    $('sMain').innerHTML = `${fmtHM(l.wake - l.bed)}<small>h</small>`;
    $('sSub').textContent = `${fmtDay(l.wake)} · ${hhmm(l.bed)} – ${hhmm(l.wake)}`;
  } else {
    $('sMain').textContent = '–';
    $('sSub').textContent = 'Noch keine Nacht erfasst';
  }
}
