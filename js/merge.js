// Zusammenführen zweier Datenstände (lokal + Gist). Rein funktional, ohne Browser-APIs.

export const pad = n => String(n).padStart(2, '0');
export const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

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

// Listen werden vereinigt, gelöschte Einträge bleiben gelöscht, bei gleichem Schlüssel gewinnt das neuere `u`.
// Einzelwerte (Plan, laufendes Fasten …) kommen aus dem zuletzt geänderten Stand.
export function mergeDocs(a = {}, b = {}) {
  const dead = {};
  for (const d of [a.deleted || {}, b.deleted || {}])
    for (const [k, t] of Object.entries(d)) dead[k] = Math.max(dead[k] || 0, t);

  const base = (a.mod || 0) >= (b.mod || 0) ? a : b;
  const out = { ...base, deleted: dead, mod: Math.max(a.mod || 0, b.mod || 0) };

  for (const name of Object.keys(KEYS)) {
    const m = new Map();
    for (const x of [...(a[name] || []), ...(b[name] || [])]) {
      const k = KEYS[name](x);
      if (k in dead && dead[k] >= (x.u || 0)) continue;
      const o = m.get(k);
      if (!o || (x.u || 0) > (o.u || 0)) m.set(k, x);
    }
    out[name] = [...m.values()].sort(ORDER[name]);
  }

  // Laufendes Fasten/Schlafen geht nicht verloren, nur weil das andere Gerät zuletzt etwas anderes geändert hat …
  out.current = a.current && b.current ? base.current : a.current || b.current || null;
  out.sleepNow = a.sleepNow && b.sleepNow ? base.sleepNow : a.sleepNow || b.sleepNow || null;
  // … wurde es aber irgendwo beendet oder abgebrochen, bleibt es beendet.
  if (out.current && out.history.some(h => h.start === out.current.start)) out.current = null;
  if (out.sleepNow && (out.sleep.some(s => s.bed === out.sleepNow) || ('s:' + out.sleepNow) in dead)) out.sleepNow = null;
  return out;
}
