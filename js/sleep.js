import { state, save, tomb, range } from './store.js';
import { H, fmtHM, fmtDay, hhmm, avg, avgClock, rangeStart, buckets } from './logic.js';
import { $, stats, items, bars } from './ui.js';

const toLocalInput = t => new Date(t - new Date(t).getTimezoneOffset() * 60000).toISOString().slice(0, 16);

function addSleep(bed, wake) {
  if (!bed || !wake || wake <= bed) return alert('Die Aufwachzeit muss nach der Einschlafzeit liegen.'), false;
  if (wake - bed < 10 * 60000) return alert('Kürzer als 10 Minuten – nicht gespeichert.'), false;
  if (wake - bed > 24 * H) return alert('Eine Nacht kann nicht länger als 24 Stunden dauern.'), false;
  if (wake > Date.now() + 60000) return alert('Die Aufwachzeit liegt in der Zukunft.'), false;
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
  tickSleep();
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
