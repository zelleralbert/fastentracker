// Formatierung und Berechnungen ohne DOM – von App, Zusammenfassung und Tests genutzt.
import { pad, dayKey } from './merge.js';
export { pad, dayKey };

export const H = 3600000, D = 86400000;

export const num = (v, d = 1) => v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
export const kgNum = v => num(v, v % 1 ? 1 : 0);
export const fmtClock = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s % 3600 / 60))}:${pad(s % 60)}`; };
export const fmtHM = ms => { const m = Math.round(ms / 60000); return `${Math.floor(m / 60)}:${pad(m % 60)}`; };
export const fmtDur = ms => { const m = Math.round(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${pad(m % 60)} min`; };
// Formatierer einmal anlegen – toLocaleString() erzeugt sonst bei jedem Aufruf einen neuen.
const F = o => { const f = new Intl.DateTimeFormat('de-DE', o); return t => f.format(t); };
export const fmtDate = F({ weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
export const fmtDay = F({ weekday: 'short', day: '2-digit', month: '2-digit' });
export const fmtShort = F({ day: '2-digit', month: '2-digit' });
export const hhmm = F({ hour: '2-digit', minute: '2-digit' });
export const wd = F({ weekday: 'narrow' });

export const startOfDay = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const endOfDay = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 1); return d.getTime(); };
// Tagesanfänge der letzten n Tage, älteste zuerst (sommerzeitsicher)
export function lastDays(now, n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) { const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i); out.push(d.getTime()); }
  return out;
}
export const rangeStart = (now, n) => lastDays(now, n)[0];

// Wählbare Zeiträume in Tagen
export const RANGES = [7, 30, 90, 365];
export const rangeLabel = n => n === 365 ? '1 J' : `${n} T`;
export const rangeTitle = n => n === 365 ? 'Letzte 12 Monate' : `Letzte ${n} Tage`;

// Zeitraum in Balken-Abschnitte teilen: bis 31 Tage täglich, 90 Tage wöchentlich, 1 Jahr monatlich.
// Liefert {list:[{from,to,label}], every} – `every` = jede wievielte Beschriftung angezeigt wird.
export function buckets(now, n) {
  const days = lastDays(now, n);
  const end = new Date(days[days.length - 1]); end.setDate(end.getDate() + 1);
  const endT = end.getTime();
  if (n <= 31) {
    const list = days.map((d, i) => ({ from: d, to: days[i + 1] || endT, label: n <= 7 ? wd(d) : fmtShort(d).slice(0, 5) }));
    return { list, every: n <= 7 ? 1 : 7 };
  }
  if (n <= 120) {
    const list = [];
    for (let i = 0; i < days.length; i += 7) list.push({ from: days[i], to: days[i + 7] || endT, label: fmtShort(days[i]).slice(0, 5) });
    return { list, every: 3 };
  }
  const list = [];
  const m = new Date(days[0]); m.setDate(1);
  while (m.getTime() < endT) {
    const next = new Date(m); next.setMonth(next.getMonth() + 1);
    list.push({ from: Math.max(m.getTime(), days[0]), to: Math.min(next.getTime(), endT), label: m.toLocaleDateString('de-DE', { month: 'short' }).replace('.', '') });
    m.setTime(next.getTime());
  }
  return { list, every: 2 };
}

const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
export { avg };

// Mittlere Uhrzeit; Zeiten um Mitternacht werden ab 12:00 gezählt, damit 23:30 und 00:30 → 00:00 ergeben.
export function avgClock(times) {
  if (!times.length) return '–';
  const m = times.map(t => { const d = new Date(t); return (d.getHours() * 60 + d.getMinutes() + 720) % 1440; });
  const a = Math.round(avg(m) + 720) % 1440;
  return `${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

// Gleitender Durchschnitt über die Messungen der letzten `days` Tage (inklusive aktueller).
export function movingAvg(points, days = 7) {
  return points.map(p => {
    const w = points.filter(q => q.t <= p.t && q.t > p.t - days * D);
    return { t: p.t, v: avg(w.map(q => q.v)) };
  });
}

/* ---- Training ---- */
export const EXS = [
  { id: 'chin', name: 'Chin-ups', hint: '0 kg = Körpergewicht', unit: 'Wdh.', cap: 12, step: 2.5 },
  { id: 'dips', name: 'Dips', hint: '0 kg = Körpergewicht', unit: 'Wdh.', cap: 15, step: 2.5 },
  { id: 'bss', name: 'Bulgarian Split Squats', hint: 'Wiederholungen pro Bein', unit: 'Wdh.', cap: 15, step: 2 },
  { id: 'lat', name: 'Lateral Raises', hint: 'Gewicht pro Kurzhantel', unit: 'Wdh.', cap: 15, step: 1 },
  { id: 'neck', name: 'Neck Bridge', hint: 'Haltedauer in Sekunden', unit: 'Sek.', cap: 60, step: 1, inc: 5 },
  { id: 'dead', name: 'Dead Bugs', hint: 'Wiederholungen pro Seite', unit: 'Wdh.', cap: 20, step: 1 },
];
export const exById = id => EXS.find(e => e.id === id) || EXS[0];

// Bestes Set: höchstes Gewicht, bei Gleichstand mehr Wiederholungen/Sekunden
export const topSet = sets => sets.reduce((b, x) => !b || x.kg > b.kg || (x.kg === b.kg && x.reps > b.reps) ? x : b, null);
export function byDay(sets) {
  const m = new Map();
  for (const x of sets) { const k = dayKey(x.t); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return [...m.values()];
}
export const isRecord = (prev, reps, kg) => prev.length > 0 && !prev.some(x => x.kg > kg || (x.kg === kg && x.reps >= reps));

// Vorschlag für heute auf Basis der letzten Einheit (vor heute):
// schwächsten Satz um eine Wiederholung (bzw. 5 s) steigern; schaffen alle Sätze die Obergrenze, mehr Gewicht.
export function suggestNext(sets, ex, now = Date.now()) {
  const today = dayKey(now);
  const days = byDay(sets.filter(x => dayKey(x.t) !== today));
  if (!days.length) return null;
  const last = days[days.length - 1];
  const kg = Math.max(...last.map(x => x.kg));
  const r = last.filter(x => x.kg === kg).map(x => x.reps);
  const kgTxt = k => k > 0 ? ` · ${kgNum(k)} kg` : '';
  const res = { day: last[0].t, last: r.join(' / ') + kgTxt(kg) };
  if (Math.min(...r) >= ex.cap) return { ...res, up: true, next: `${kgNum(kg + ex.step)} kg`, kg: kg + ex.step };
  const nx = r.slice(); nx[nx.indexOf(Math.min(...nx))] += ex.inc || 1;
  return { ...res, up: false, next: nx.join(' / ') + kgTxt(kg), reps: nx[0], kg };
}
