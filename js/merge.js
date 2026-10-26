// Bereinigen und Zusammenführen von Datenständen (lokal, Gist, Import). Rein funktional, ohne Browser-APIs.

export const pad = n => String(n).padStart(2, '0');
export const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

export const EX_IDS = ['chin', 'dips', 'bss', 'lat', 'neck', 'dead'];
const num = v => typeof v === 'number' && Number.isFinite(v);
const inRange = (v, lo, hi) => num(v) && v >= lo && v <= hi;
// Zeitpunkte: 2000 bis 2100. Alles andere (z. B. 1e20) würde beim Formatieren eine Ausnahme auslösen und einen Bereich lahmlegen.
const isTime = v => inRange(v, 946684800000, 4102444800000);
const rec = v => v && typeof v === 'object' && !Array.isArray(v);
// Notizen: nur eine Zeile ohne Steuerzeichen, damit sie weder die Anzeige noch die Zusammenfassung für Claude umbauen
export const note = v => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').trim().slice(0, 140) : '');

// Frühere Version hatte ein Fasten-Tracking. Diese Felder gibt es nicht mehr; sanitize() lässt sie weg, und der Abgleich
// schreibt sie dadurch auch aus dem Gist heraus (siehe sync.js).
export const LEGACY_KEYS = ['history', 'current', 'plan', 'custom'];

// Eindeutiger Schlüssel pro Eintrag; derselbe Schlüssel wird für Lösch-Markierungen (tombstones) verwendet.
export const KEYS = {
  sleep: x => 's:' + x.bed,
  weight: x => 'w:' + dayKey(x.t),
  train: x => 't:' + x.ex + x.t,
};
const ORDER = {
  sleep: (x, y) => x.wake - y.wake,
  weight: (x, y) => x.t - y.t,
  train: (x, y) => x.t - y.t,
};

// Liefert immer einen vollständigen, gültigen Datenstand mit fester Schlüsselreihenfolge.
// Ungültige Einträge (z. B. aus einer beschädigten Datei) werden verworfen, nichts wird als HTML interpretiert.
export function sanitize(d) {
  d = rec(d) ? d : {};
  const list = (v, fn) => (Array.isArray(v) ? v : []).map(x => (rec(x) ? fn(x) : null)).filter(Boolean);

  const deleted = {};
  // Schlüssel sortieren: sonst unterscheiden sich gleiche Stände nur in der Reihenfolge und werden endlos neu hochgeladen
  if (rec(d.deleted)) for (const k of Object.keys(d.deleted).sort()) if (num(d.deleted[k]) && !k.startsWith('h:')) deleted[k] = d.deleted[k];

  return {
    sleep: list(d.sleep, x => isTime(x.bed) && isTime(x.wake) && x.wake > x.bed ? { bed: x.bed, wake: x.wake } : null),
    sleepNow: isTime(d.sleepNow) ? d.sleepNow : null,
    weight: list(d.weight, x => isTime(x.t) && inRange(x.kg, 20, 400)
      ? { t: x.t, kg: x.kg, ...(num(x.u) ? { u: x.u } : {}) } : null),
    train: list(d.train, x => isTime(x.t) && EX_IDS.includes(x.ex) && inRange(x.reps, 1, 3600) && inRange(x.kg, 0, 500)
      ? { t: x.t, ex: x.ex, reps: x.reps, kg: x.kg, ...(note(x.n) ? { n: note(x.n) } : {}) } : null),
    ex: EX_IDS.includes(d.ex) ? d.ex : 'chin',
    deleted,
    mod: num(d.mod) && d.mod > 0 ? d.mod : 0,
  };
}

const json = JSON.stringify;

// Listen werden vereinigt, gelöschte Einträge bleiben gelöscht, bei gleichem Schlüssel gewinnt das neuere `u`
// (bei Gleichstand ein fester Vergleich, damit beide Geräte dasselbe Ergebnis erzeugen).
// Einzelwerte (gewählte Übung …) kommen aus dem zuletzt geänderten Stand.
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

  // Ein laufender Schlaf geht nicht verloren, nur weil das andere Gerät zuletzt etwas anderes geändert hat …
  // … wurde er aber irgendwo beendet, abgebrochen oder der Eintrag gelöscht, bleibt er beendet.
  const sleepAlive = t => t != null && !out.sleep.some(s => s.bed === t) && !(('s:' + t) in dead);
  out.sleepNow = [base.sleepNow, other.sleepNow].find(sleepAlive) ?? null;
  return sanitize(out);
}
