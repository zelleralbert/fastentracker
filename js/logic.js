// Formatierung und Berechnungen ohne DOM – von App, Zusammenfassung und Tests genutzt.
import { pad, dayKey } from './merge.js';
export { pad, dayKey };

export const H = 3600000, D = 86400000;

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
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
export const fmtFull = F({ day: '2-digit', month: '2-digit', year: 'numeric' });
export const hhmm = F({ hour: '2-digit', minute: '2-digit' });
const wdF = F({ weekday: 'short' });
export const wd = t => wdF(t).replace('.', ''); // „Mo“, „Di“ … statt „M“, „D“ (Di/Do waren nicht unterscheidbar)

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
// bw = Anteil des Körpergewichts, der bei einer Wiederholung bewegt wird (Näherung aus der Biomechanik):
// Chin-ups und Dips bewegen den ganzen Körper (100 %), beim Split Squat trägt das vordere Bein den Großteil,
// bei Dead Bugs bewegen sich nur Arm und Bein. band = Übung mit Widerstandsband (zählt zusätzlich zum Körpergewicht).
// pair = Zusatzgewicht (ältere Einträge) gilt für zwei Hände (Kurzhanteln).
export const EXS = [
  { id: 'chin', name: 'Chin-ups', hint: '0 kg = Körpergewicht', unit: 'Wdh.', bw: 1 },
  { id: 'dips', name: 'Dips', hint: '0 kg = Körpergewicht', unit: 'Wdh.', bw: 1 },
  { id: 'bss', name: 'Split Squats mit Band', hint: 'Wiederholungen pro Bein', unit: 'Wdh.', bw: 0.85, band: true },
  { id: 'lat', name: 'Lateral Raises mit Band', hint: 'Wiederholungen', unit: 'Wdh.', bw: 0, band: true, pair: true },
  { id: 'dead', name: 'Dead Bugs mit Band', hint: 'Wiederholungen pro Seite', unit: 'Wdh.', bw: 0.2, band: true },
];
export const exById = id => EXS.find(e => e.id === id) || EXS[0];

// Widerstandsbänder laut Produktbild (Angaben dort in lbs, hier in kg umgerechnet). Die Spannung hängt von der Dehnung ab;
// gerechnet wird mit der Mitte des Bereichs. Schwarz ist im Bild abgeschnitten (60–170 lbs angenommen).
const LB = 0.45359237;
export const BANDS = [
  { id: 'blue', name: 'Blau', lbs: [15, 25], color: '#3b82f6' },
  { id: 'green', name: 'Grün', lbs: [20, 35], color: '#22c55e' },
  { id: 'purple', name: 'Lila', lbs: [30, 50], color: '#a855f7' },
  { id: 'yellow', name: 'Gelb', lbs: [40, 80], color: '#eab308' },
  { id: 'red', name: 'Rot', lbs: [50, 125], color: '#ef4444' },
  { id: 'black', name: 'Schwarz', lbs: [60, 170], color: '#6b7280' },
].map(b => ({ ...b, kg: b.lbs.map(v => v * LB), mid: (b.lbs[0] + b.lbs[1]) / 2 * LB }));
export const bandById = id => BANDS.find(b => b.id === id);
export const bandKg = id => (bandById(id) ? bandById(id).mid : 0);
export const bandRange = id => { const b = bandById(id); return b ? `${Math.round(b.kg[0])}–${Math.round(b.kg[1])} kg` : ''; };
// Zusätzlicher Widerstand eines Satzes in kg (Zusatzgewicht plus Band), ohne Körpergewicht
export const level = x => x.kg + bandKg(x.b);
const lv = x => Math.round(level(x) * 100) / 100;

// Bestes Set: höchster Zusatzwiderstand, bei Gleichstand mehr Wiederholungen
export const topSet = sets => sets.reduce((b, x) => !b || lv(x) > lv(b) || (lv(x) === lv(b) && x.reps > b.reps) ? x : b, null);
export function byDay(sets) {
  const m = new Map();
  for (const x of sets) { const k = dayKey(x.t); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return [...m.values()];
}
export const isRecord = (prev, reps, lvl) => prev.length > 0 && !prev.some(x => lv(x) > lvl + 1e-9 || (Math.abs(lv(x) - lvl) < 1e-9 && x.reps >= reps));

// Text für Zusatzgewicht und Band eines Satzes (z. B. „ · 5 kg · Gelb“)
export const resistTxt = x => `${x.kg > 0 ? ` · ${kgNum(x.kg)} kg` : ''}${x.b && bandById(x.b) ? ` · ${bandById(x.b).name}` : ''}`;

// Vorschlag für heute auf Basis der letzten Einheit (vor heute): Gewicht und Band bleiben gleich, nur die Wiederholungen
// steigen – der schwächste Satz (bei Gleichstand der letzte) um eine Wiederholung.
export function suggestNext(sets, ex, now = Date.now()) {
  const today = dayKey(now);
  const days = byDay(sets.filter(x => dayKey(x.t) !== today));
  if (!days.length) return null;
  const last = days[days.length - 1];
  // Arbeitswiderstand = stärkster Widerstand mit mindestens zwei Sätzen (ein einzelner Test-Satz bestimmt den Vorschlag nicht)
  const count = k => last.filter(x => lv(x) === k).length;
  const lvls = [...new Set(last.map(lv))], multi = lvls.filter(k => count(k) >= 2);
  const top = Math.max(...(multi.length ? multi : lvls));
  const grp = last.filter(x => lv(x) === top), ref = grp[grp.length - 1];
  const r = grp.map(x => x.reps);
  const nx = r.slice(); nx[nx.lastIndexOf(Math.min(...nx))] += ex.inc || 1; // bei Gleichstand der letzte (müdeste) Satz
  return { day: last[0].t, last: r.join(' / ') + resistTxt(ref), next: nx.join(' / ') + resistTxt(ref), reps: nx[0], kg: ref.kg, band: ref.b || '' };
}

/* ---- Bewegte Last ---- */
// Körpergewicht zu einem Zeitpunkt: 7-Tage-Trend der letzten Messung bis zu diesem Tag (eine Messung am selben Tag zählt mit);
// liegt der Zeitpunkt vor der ersten Messung, gilt die erste. Ohne Messungen null.
export function bodyweightFn(weights) {
  const pts = movingAvg([...weights].sort((a, b) => a.t - b.t).map(w => ({ t: w.t, v: w.kg })));
  return t => {
    if (!pts.length) return null;
    let lo = 0, hi = pts.length - 1, ans = 0;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (pts[m].t <= t + 12 * H) { ans = m; lo = m + 1; } else hi = m - 1; }
    return pts[ans].v;
  };
}

// Bewegte Last eines Satzes in kg: Wiederholungen × (Anteil des Körpergewichts + Zusatzgewicht + Band).
// Null, wenn das Körpergewicht fehlt und die Übung es braucht.
export function setLoad(set, ex, bw) {
  const body = ex.bw ? (bw == null ? null : ex.bw * bw) : 0;
  return body == null ? null : set.reps * (body + set.kg * (ex.pair ? 2 : 1) + (ex.band ? bandKg(set.b) : 0));
}
// Summe über mehrere Sätze (null, wenn bei keinem Satz das Körpergewicht bekannt ist)
export function loadOf(sets, ex, bwFn) {
  let sum = 0, known = false;
  for (const x of sets) { const l = setLoad(x, ex, bwFn(x.t)); if (l != null) { sum += l; known = true; } }
  return known ? sum : null;
}
// „870 kg“ bzw. „12,3 t“
export const fmtLoad = kg => (kg >= 10000 ? `${num(kg / 1000, 1)} t` : `${num(kg, 0)} kg`);
// Veränderung gegenüber der vorigen Einheit: „+6,7 %“, „−3,2 %“
export const fmtPct = d => (d == null ? '–' : `${d > 0.0005 ? '+' : d < -0.0005 ? '−' : '±'}${num(Math.abs(d) * 100, 1)} %`);

// Jede Einheit bekommt die Veränderung d (Anteil, z. B. 0,067) gegenüber der vorigen; die erste hat null.
export const withChange = list => list.map((x, i) => ({ ...x, d: i && list[i - 1].load > 0 ? x.load / list[i - 1].load - 1 : null }));
// Bewegte Last je Trainingstag für eine Übung: [{t, load, reps, n, d}]
export function loadsByDay(sets, ex, bwFn) {
  return withChange(byDay(sets).map(d => ({ t: d[0].t, load: loadOf(d, ex, bwFn), reps: d.reduce((a, x) => a + x.reps, 0), n: d.length }))
    .filter(x => x.load != null && x.load > 0));
}
// Bewegte Last je Trainingstag über alle Übungen: [{t, load, per:{übung: kg}, d}]
export function workoutLoads(train, bwFn) {
  const m = new Map();
  for (const x of train) {
    const ex = EXS.find(e => e.id === x.ex); if (!ex) continue;              // ausgeblendete Übungen (z. B. Neck Bridge) zählen nicht
    const l = setLoad(x, ex, bwFn(x.t)); if (l == null) continue;
    const k = dayKey(x.t), o = m.get(k) || { t: x.t, load: 0, per: {} };
    o.load += l; o.per[ex.id] = (o.per[ex.id] || 0) + l; m.set(k, o);
  }
  return withChange([...m.values()].sort((a, b) => a.t - b.t));
}
