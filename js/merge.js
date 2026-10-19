// Bereinigen und Zusammenführen von Datenständen (lokal, Gist, Import). Rein funktional, ohne Browser-APIs.

export const pad = n => String(n).padStart(2, '0');
export const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

export const EX_IDS = ['chin', 'dips', 'bss', 'lat', 'neck', 'dead'];
const num = v => typeof v === 'number' && Number.isFinite(v);
const inRange = (v, lo, hi) => num(v) && v >= lo && v <= hi;
const rec = v => v && typeof v === 'object' && !Array.isArray(v);

// Eindeutiger Schlüssel pro Eintrag; derselbe Schlüssel wird für Lösch-Markierungen (tombstones) verwendet.
export const KEYS = {
  history: x => 'h:' + x.start,
  sleep: x => 's:' + x.bed,
  weight: x => 'w:' + dayKey(x.t),
  train: x => 't:' + x.ex + x.t,
};
const ORDER = {
  history: (x, y) => x.start - y.start,
  sleep: (x, y) => x.wake - y.wake,
  weight: (x, y) => x.t - y.t,
  train: (x, y) => x.t - y.t,
};

// Liefert immer einen vollständigen, gültigen Datenstand mit fester Schlüsselreihenfolge.
// Ungültige Einträge (z. B. aus einer beschädigten Datei) werden verworfen, nichts wird als HTML interpretiert.
export function sanitize(d) {
  d = rec(d) ? d : {};
  const list = (v, fn) => (Array.isArray(v) ? v : []).map(x => (rec(x) ? fn(x) : null)).filter(Boolean);

  const current = rec(d.current) && num(d.current.start) && inRange(d.current.goalH, 1, 72)
    ? { start: d.current.start, goalH: d.current.goalH, notified: d.current.notified === true } : null;
  const deleted = {};
  // Schlüssel sortieren: sonst unterscheiden sich gleiche Stände nur in der Reihenfolge und werden endlos neu hochgeladen
  if (rec(d.deleted)) for (const k of Object.keys(d.deleted).sort()) if (num(d.deleted[k])) deleted[k] = d.deleted[k];

  return {
    plan: typeof d.plan === 'string' && d.plan.length <= 12 ? d.plan : '16:8',
    custom: inRange(d.custom, 1, 72) ? d.custom : 16,
    current,
    history: list(d.history, x => num(x.start) && num(x.end) && x.end > x.start && inRange(x.goalH, 1, 72)
      ? { start: x.start, end: x.end, goalH: x.goalH, reached: x.reached === true } : null),
    sleep: list(d.sleep, x => num(x.bed) && num(x.wake) && x.wake > x.bed ? { bed: x.bed, wake: x.wake } : null),
    sleepNow: num(d.sleepNow) ? d.sleepNow : null,
    weight: list(d.weight, x => num(x.t) && inRange(x.kg, 20, 400)
      ? { t: x.t, kg: x.kg, ...(num(x.u) ? { u: x.u } : {}) } : null),
    train: list(d.train, x => num(x.t) && EX_IDS.includes(x.ex) && inRange(x.reps, 1, 3600) && inRange(x.kg, 0, 500)
      ? { t: x.t, ex: x.ex, reps: x.reps, kg: x.kg, ...(typeof x.n === 'string' && x.n ? { n: x.n.slice(0, 140) } : {}) } : null),
    ex: EX_IDS.includes(d.ex) ? d.ex : 'chin',
    deleted,
    mod: num(d.mod) && d.mod > 0 ? d.mod : 0,
  };
}

const json = JSON.stringify;

// Listen werden vereinigt, gelöschte Einträge bleiben gelöscht, bei gleichem Schlüssel gewinnt das neuere `u`
// (bei Gleichstand ein fester Vergleich, damit beide Geräte dasselbe Ergebnis erzeugen).
// Einzelwerte (Plan, Übung …) kommen aus dem zuletzt geänderten Stand.
export function mergeDocs(a, b) {
  a = sanitize(a); b = sanitize(b);
  const dead = {};
  for (const d of [a.deleted, b.deleted]) for (const [k, t] of Object.entries(d)) dead[k] = Math.max(dead[k] || 0, t);

  const aFirst = a.mod !== b.mod ? a.mod > b.mod : json(a) >= json(b);
  const [base, other] = aFirst ? [a, b] : [b, a];
  const out = { ...base, deleted: dead, mod: Math.max(a.mod, b.mod) };

  for (const name of Object.keys(KEYS)) {
    const m = new Map();
    for (const x of [...a[name], ...b[name]]) {
      const k = KEYS[name](x);
      if (k in dead && dead[k] >= (x.u || 0)) continue;
      const o = m.get(k);
      if (!o || (x.u || 0) > (o.u || 0) || ((x.u || 0) === (o.u || 0) && json(x) > json(o))) m.set(k, x);
    }
    out[name] = [...m.values()].sort(ORDER[name]);
  }

  // Ein laufendes Fasten/Schlafen geht nicht verloren, nur weil das andere Gerät zuletzt etwas anderes geändert hat …
  // … wurde es aber irgendwo beendet, abgebrochen oder der Eintrag gelöscht, bleibt es beendet.
  const fastAlive = c => c && !out.history.some(h => h.start === c.start) && !(('h:' + c.start) in dead);
  const sleepAlive = t => t != null && !out.sleep.some(s => s.bed === t) && !(('s:' + t) in dead);
  out.current = [base.current, other.current].find(fastAlive) || null;
  out.sleepNow = [base.sleepNow, other.sleepNow].find(sleepAlive) ?? null;
  return sanitize(out);
}
