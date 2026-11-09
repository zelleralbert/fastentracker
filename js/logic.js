// Formatierung und Berechnungen ohne DOM – von App, Zusammenfassung und Tests genutzt.
import { pad, dayKey, normBand } from './merge.js';
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
// Chin-ups und Dips bewegen den ganzen Körper (100 %), 
// bei Dead Bugs bewegen sich nur Arm und Bein. band = Übung mit Widerstandsband (zählt zusätzlich zum Körpergewicht).
// pair = Zusatzgewicht (ältere Einträge) gilt für zwei Hände (Kurzhanteln).
export const EXS = [
  { id: 'chin', name: 'Chin-ups', hint: '0 kg = Körpergewicht', unit: 'Wdh.', bw: 1 },
  { id: 'dips', name: 'Dips', hint: '0 kg = Körpergewicht', unit: 'Wdh.', bw: 1 },
  { id: 'lat', name: 'Lateral Raises', hint: 'Wiederholungen', unit: 'Wdh.', bw: 0, band: true, pair: true },
  { id: 'dead', name: 'Dead Bugs', hint: 'Wiederholungen pro Seite', unit: 'Wdh.', bw: 0.2, band: true },
  { id: 'dl', name: 'Deadlifts', hint: 'Wiederholungen · Stange praktisch ohne Gewicht', unit: 'Wdh.', bw: 0, band: true },
  { id: 'fs', name: 'Squats', hint: 'Wiederholungen · Stange praktisch ohne Gewicht', unit: 'Wdh.', bw: 0, band: true },
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
// Band-Kombination (siehe normBand in merge.js): Liste {b: Band, n: 1 oder 2 (Schleife)}
export const parseBand = s => { const c = normBand(s); return c ? c.split('+').map(t => ({ b: bandById(t.replace(/2$/, '')), n: t.endsWith('2') ? 2 : 1 })) : []; };
export const bandKg = s => parseBand(s).reduce((a, p) => a + p.n * p.b.mid, 0);
export const bandRange = s => {
  const p = parseBand(s);
  return p.length ? `${Math.round(p.reduce((a, q) => a + q.n * q.b.kg[0], 0))}–${Math.round(p.reduce((a, q) => a + q.n * q.b.kg[1], 0))} kg` : '';
};
export const bandName = s => parseBand(s).map(p => (p.n === 2 ? `${p.b.name}-Schleife` : p.b.name)).join(' + ');
// Zusätzlicher Widerstand eines Satzes in kg (Zusatzgewicht plus Band), ohne Körpergewicht
export const level = x => x.kg + bandKg(x.b);
const lv = x => Math.round(level(x) * 100) / 100;

// Bestes Set: höchster Zusatzwiderstand, bei Gleichstand mehr Wiederholungen
export const topSet = sets => sets.reduce((b, x) => !b || lv(x) > lv(b) || (lv(x) === lv(b) && x.reps > b.reps) ? x : b, null);
// Workouts: Sätze, zwischen denen höchstens 4 Stunden Pause liegen – auch über Mitternacht hinweg (bei wanderndem Schlafrhythmus liegt das
// Training zu jeder Uhrzeit). Aufsteigend nach Zeit; jedes Workout ist eine Liste von Sätzen.
export const SESSION_GAP = 4 * H;
export function byDay(sets) {
  const out = [];
  for (const x of [...sets].sort((a, b) => a.t - b.t)) {
    const g = out[out.length - 1];
    if (g && x.t - g[g.length - 1].t <= SESSION_GAP) g.push(x); else out.push([x]);
  }
  return out;
}
export const sessionEnd = s => s[s.length - 1].t;
// Läuft das Workout noch? (letzter Satz vor weniger als 4 Stunden)
export const isCurrent = (endT, now) => now - endT < SESSION_GAP;
export const isRecord = (prev, reps, lvl) => prev.length > 0 && !prev.some(x => lv(x) > lvl + 1e-9 || (Math.abs(lv(x) - lvl) < 1e-9 && x.reps >= reps));

// Text für Zusatzgewicht und Band eines Satzes (z. B. „ · 5 kg · Gelb“)
export const resistTxt = x => `${x.kg > 0 ? ` · ${kgNum(x.kg)} kg` : ''}${bandName(x.b) ? ` · ${bandName(x.b)}` : ''}`;

/* ---- Einheiten-Typen: 3er-Welle Leicht → Leicht → Schwer ---- */
// pct = Anteil der Wiederholungen der letzten Schwer-Einheit. l = erste, k = zweite leichte Einheit (so weiß die App, wo du in der
// Welle stehst); o = früher (vor dem Start der Typen, wird nicht verglichen).
export const WTYPES = [
  { id: 'l', name: 'Leicht', pct: 0.7 }, { id: 'k', name: 'Leicht', pct: 0.7 },
  { id: 'p', name: 'Schwer', pct: 1 }, { id: 'o', name: 'Früher', pct: 1 },
];
export const wtypeById = id => WTYPES.find(t => t.id === id) || WTYPES[2];
// Sätze ohne Typ zählen als Schwer
export const wtypeOf = x => (WTYPES.some(t => t.id === x.w) ? x.w : 'p');
// Typ eines Trainingstags: der des zuletzt gespeicherten Satzes
export const dayTypeOf = day => wtypeOf(day.reduce((a, x) => (x.t >= a.t ? x : a), day[0]));
// Typ des letzten abgeschlossenen Workouts, das in der Welle zählt (das laufende und frühere Einheiten ‚o‘ werden übersprungen)
const lastCounted = (train, now) => {
  const days = byDay(train).filter(d => !isCurrent(sessionEnd(d), now) && dayTypeOf(d) !== 'o');
  return days.length ? dayTypeOf(days[days.length - 1]) : '';
};
// Nächster Typ in der Welle: Leicht (1) → Leicht (2) → Schwer → Leicht (1); ohne Vorgänger Schwer
export const nextType = (train, now) => ({ '': 'p', l: 'k', k: 'p', p: 'l' }[lastCounted(train, now)]);
// Welcher Leicht-Typ (l oder k) ist als Nächstes dran, falls du heute leicht trainieren willst?
export const lightId = (train, now) => (lastCounted(train, now) === 'l' ? 'k' : 'l');
// Typ des heutigen Workouts. Gewählter Typ (gilt 6 Stunden), sonst der des Workouts, das gerade läuft (letzter Satz vor weniger als 4 Stunden –
// auch über Mitternacht hinweg), sonst der nächste in der Welle.
export function currentWType(train, now, chosen) {
  if (chosen && chosen.w && now - chosen.at >= 0 && now - chosen.at < 6 * H) return chosen.w;
  const last = train.reduce((a, x) => (!a || x.t > a.t ? x : a), null);
  if (last && isCurrent(last.t, now)) return wtypeOf(last);
  return nextType(train, now);
}
export const cyclePos = id => ({ l: 1, k: 2, p: 3 }[id] || 0);

export const BAND_TOP = 12;      // alle Sätze mit so vielen Wiederholungen: nächstes Band probieren
// Nächster Widerstand für ein Band bzw. eine Kombination: der kleinste Schritt nach oben – ein Band eine Stufe stärker, ein weiteres Band
// dazu oder eine Schleife (höchstens 3 verschiedene Bänder). Gibt die Schreibweise zurück, '' wenn nichts passt.
export function nextBand(cur) {
  const base = parseBand(cur);
  if (!base.length) return '';
  const str = m => normBand([...m].map(([id, n]) => id + (n === 2 ? '2' : '')).join('+'));
  const m0 = new Map(base.map(p => [p.b.id, p.n])), cands = [];
  for (const [id, n] of m0) {
    const nx = BANDS[BANDS.findIndex(b => b.id === id) + 1];
    if (nx && !m0.has(nx.id)) { const m = new Map(m0); m.delete(id); m.set(nx.id, n); cands.push(str(m)); }
    if (n === 1) { const m = new Map(m0); m.set(id, 2); cands.push(str(m)); }
  }
  if (m0.size < 3) for (const b of BANDS) if (!m0.has(b.id)) cands.push(str(new Map([...m0, [b.id, 1]])));
  return cands.filter(c => bandKg(c) > bandKg(cur) + 0.5).sort((a, b) => bandKg(a) - bandKg(b))[0] || '';
}
// Tage seit der letzten Gewichtsmessung (null ohne Messung)
export const weightAgeDays = (weights, now) => {
  const t = Math.max(0, ...weights.filter(w => w.t <= now + 12 * H).map(w => w.t));
  return t ? Math.floor((now - t) / D) : null;
};

// Ziel für heute, abgeleitet aus der letzten Schwer-Einheit der Übung (gibt es keine, aus der letzten Einheit):
// Gewicht und Band bleiben gleich, die Zahl der Sätze auch. Schwer: schwächster Satz (bei Gleichstand der letzte) eine
// Wiederholung mehr, letzter Satz so viele wie möglich. Leicht: Anteil der Wiederholungen.
export function suggestNext(sets, ex, now = Date.now(), type = 'p') {
  const days = byDay(sets).filter(d => !isCurrent(sessionEnd(d), now));
  if (!days.length) return null;
  const counted = days.filter(d => dayTypeOf(d) !== 'o');
  const refDay = [...counted].reverse().find(d => dayTypeOf(d) === 'p') || counted[counted.length - 1] || days[days.length - 1];
  // Arbeitswiderstand = stärkster Widerstand mit mindestens zwei Sätzen (ein einzelner Test-Satz bestimmt den Vorschlag nicht)
  const count = k => refDay.filter(x => lv(x) === k).length;
  const lvls = [...new Set(refDay.map(lv))], multi = lvls.filter(k => count(k) >= 2);
  const top = Math.max(...(multi.length ? multi : lvls));
  const grp = refDay.filter(x => lv(x) === top), ref = grp[grp.length - 1];
  const r = grp.map(x => x.reps), t = wtypeById(type);
  let target;
  if (t.id === 'p') { target = r.slice(); target[target.lastIndexOf(Math.min(...target))] += ex.inc || 1; }   // bei Gleichstand der letzte (müdeste) Satz
  else { target = r.map(v => Math.max(1, Math.round(v * t.pct))); }
  const up = ex.band && t.id === 'p' && ref.b && r.every(v => v >= BAND_TOP) ? nextBand(ref.b) : '';
  return {
    day: refDay[0].t, last: r.join(' / ') + resistTxt(ref), next: target.join(' / ') + resistTxt(ref), reps: target[0],
    kg: ref.kg, band: ref.b || '', type: t.id, amrap: t.id === 'p', bandUp: up ? { from: ref.b, to: up } : null,
  };
}

/* ---- Bewegte Last ---- */
// Körpergewicht zu einem Zeitpunkt: gewichteter Trend der Messungen bis zu diesem Tag (eine Messung am selben Tag zählt mit);
// liegt der Zeitpunkt vor der ersten Messung, gilt die erste. Ohne Messungen null.
export function bodyweightFn(weights) {
  const pts = [...weights].sort((a, b) => a.t - b.t).map(w => ({ t: w.t, v: w.kg }));
  return t => {
    if (!pts.length) return null;
    let lo = 0, hi = pts.length - 1, ans = 0;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (pts[m].t <= t + 12 * H) { ans = m; lo = m + 1; } else hi = m - 1; }
    // Gewichtet: neuere Messungen zählen mehr (Halbwertszeit 2 Tage, nur die letzten 14 Tage). So glättet der Wert Wasserschwankungen,
    // hinkt aber bei seltenen Messungen nicht hinterher.
    let sw = 0, s = 0;
    for (let i = ans; i >= 0 && (i === ans || pts[ans].t - pts[i].t <= 14 * D); i--) { const w = Math.pow(0.5, (pts[ans].t - pts[i].t) / (2 * D)); sw += w; s += w * pts[i].v; }
    return s / sw;
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
// Bewegte Last je Workout für eine Übung: [{t (Beginn), end (letzter Satz), load, reps, n, w (Einheiten-Typ), d}]
export function loadsByDay(sets, ex, bwFn) {
  return withChange(byDay(sets).map(d => ({ t: d[0].t, end: sessionEnd(d), load: loadOf(d, ex, bwFn), reps: d.reduce((a, x) => a + x.reps, 0), n: d.length, w: dayTypeOf(d) }))
    .filter(x => x.load != null && x.load > 0));
}
// Bewegte Last je Trainingstag über alle Übungen: [{t, load, per:{übung: kg}, w, d}]
export function workoutLoads(train, bwFn) {
  const valid = [];
  for (const x of train) {
    const ex = EXS.find(e => e.id === x.ex); if (!ex) continue;              // ausgeblendete Übungen (z. B. Neck Bridge) zählen nicht
    const l = setLoad(x, ex, bwFn(x.t)); if (l != null) valid.push({ x, ex, l });
  }
  const byX = new Map(valid.map(v => [v.x, v]));
  return withChange(byDay(valid.map(v => v.x)).map(g => {
    const o = { t: g[0].t, end: sessionEnd(g), load: 0, per: {}, w: dayTypeOf(g) };
    for (const x of g) { const v = byX.get(x); o.load += v.l; o.per[v.ex.id] = (o.per[v.ex.id] || 0) + v.l; }
    return o;
  }));
}

// Vergleich der aktuellen Einheit (heute, sonst die letzte) mit früheren Einheiten derselben Übung.
// loads: Ausgabe von loadsByDay (aufsteigend). Prozent = Anteil, z. B. 0,067 für +6,7 %.
// Eine Schwer-Einheit wird nur mit früheren Schwer-Einheiten verglichen. Eine leichte Einheit zeigt
// nur, wie viel Prozent der letzten Schwer-Einheit sie ausmacht (light = true), nie einen Fortschritt oder Rückschritt.
export function compareLoads(loads, now) {
  if (!loads.length) return null;
  const cur = loads[loads.length - 1], isToday = isCurrent(cur.end, now);
  const before = loads.slice(0, -1).filter(l => l.w === 'p');
  const pct = (a, b) => (b > 0 ? a / b - 1 : null);
  if (cur.w !== 'p') {
    const ref = before[before.length - 1] || null;
    return { cur, isToday, light: true, type: cur.w, ref, share: ref ? cur.load / ref.load : null, before, pctVs: l => (l.load > 0 ? cur.load / l.load : null) };
  }
  const last = before[before.length - 1] || null;
  const recent = before.slice(-3), avg = recent.length >= 2 ? recent.reduce((a, l) => a + l.load, 0) / recent.length : null;
  const best = before.length ? before.reduce((m, l) => (l.load > m.load ? l : m)) : null;
  return {
    cur, before, isToday, light: false, type: 'p',
    last, pctLast: last ? pct(cur.load, last.load) : null,
    avg, avgN: recent.length, pctAvg: avg ? pct(cur.load, avg) : null,
    best, pctBest: best ? pct(cur.load, best.load) : null, isBest: !!best && cur.load > best.load,
    pctVs: l => pct(cur.load, l.load),
  };
}
