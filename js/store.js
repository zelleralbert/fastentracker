import { RANGES } from './logic.js';
import { sanitize, LEGACY_KEYS, purgeExercises, tagDays } from './merge.js';

// Zentraler Datenstand. Der Schlüssel bleibt 'fasten-v1', damit bestehende Daten erhalten bleiben.
export const KEY = 'fasten-v1';
const DEF = () => sanitize({});

const read = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) || fb; } catch { return fb; } };
let warned = false;
// Schlägt das Speichern fehl (voller Speicher, privater Modus), einmal deutlich warnen – sonst gehen Eingaben unbemerkt verloren.
const write = (k, v) => {
  try { localStorage.setItem(k, JSON.stringify(v)); }
  catch { if (!warned) { warned = true; setTimeout(() => alert('Die Daten konnten auf diesem Gerät nicht gespeichert werden (Speicher voll oder privater Modus). Nutze die Synchronisierung oder exportiere ein Backup.'), 0); } }
};

// Beim Laden bereinigen: ein beschädigter Eintrag darf die App nicht lahmlegen.
// Daten des früheren Fasten-Trackings werden dabei gelöscht und der lokale Speicher sofort neu geschrieben.
const stored = read(KEY, {});
export const state = sanitize(stored);
if (LEGACY_KEYS.some(k => k in stored)) write(KEY, state);

const listeners = { save: [], change: [] };
export const on = (ev, fn) => listeners[ev].push(fn);

export const saveLocal = () => write(KEY, state);
// Jede Nutzeränderung: Zeitstempel setzen, lokal speichern, Sync anstoßen.
export function save() { state.mod = Date.now(); saveLocal(); listeners.save.forEach(f => f()); }
// Kompletten Stand ersetzen (nach Sync/Import), Objekt-Identität bleibt erhalten.
export function replaceState(next) {
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, sanitize(next));
  saveLocal();
  listeners.change.forEach(f => f());
}
export const tomb = k => { state.deleted[k] = Date.now(); };

// Nur Ansichtseinstellungen dieses Geräts (werden nicht synchronisiert).
export const ui = read('tagwerk-ui', {});
export const saveUi = () => write('tagwerk-ui', ui);
export const range = () => (RANGES.includes(ui.range) ? ui.range : 7);

// Einmalige Bereinigungen auf Wunsch: Die Sätze von Split Squats, Dead Bugs und Lateral Raises stammen aus der Zeit vor den
// Widerstandsbändern und sind nicht vergleichbar; Neck Bridge wurde ganz entfernt. Jede Bereinigung läuft einmal pro Gerät (Merker in `ui.purged`); der Abgleich
// bringt die Löschung auf die anderen Geräte und ins Gist. Spätere Sätze – bei Lateral Raises alle mit Band – bleiben unberührt.
const PURGES = [
  { id: 'split-dead-vor-baendern', ex: ['bss', 'dead'] },
  { id: 'lat-vor-baendern', ex: ['lat'], only: x => !x.b },
  { id: 'neck-bridge-entfernt', ex: ['neck'] },   // Neck Bridge gibt es nicht mehr
  { id: 'split-squats-entfernt', ex: ['bss'] },   // Split Squats gibt es nicht mehr
];
const donePurges = Array.isArray(ui.purged) ? ui.purged : [];
for (const p of PURGES) {
  if (donePurges.includes(p.id)) continue;
  const { doc, removed } = purgeExercises(state, p.ex, Date.now(), p.only);
  if (removed) { for (const k of Object.keys(state)) delete state[k]; Object.assign(state, doc); write(KEY, state); }
  donePurges.push(p.id);
}
ui.purged = donePurges; saveUi();

// Einmalige Markierung auf Wunsch (Version 3.5): Startpunkt der Einheiten-Typen. Bei Chin-ups und Dips ist 9 / 9 / 9 das Maximum – das
// zeigt die Einheit vom Sa., 31.10.2026, sie gilt als erste Schwer-Einheit. Das letzte Workout (Di., 03.11.2026) war „mittel“, also die
// zweite leichte Einheit; als Nächstes steht Schwer an. Ältere Einheiten werden nicht mehr verglichen.
const TAGS = [{ id: 'typen-start-2026-11', rules: [{ before: '2026-10-31', w: 'o' }, { day: '2026-10-31', w: 'p' }, { day: '2026-11-03', w: 'k' }] }];
const doneTags = Array.isArray(ui.tagged) ? ui.tagged : [];
for (const t of TAGS) {
  if (doneTags.includes(t.id)) continue;
  const { doc, tagged } = tagDays(state, t.rules);
  if (tagged) { for (const k of Object.keys(state)) delete state[k]; Object.assign(state, doc); write(KEY, state); }
  doneTags.push(t.id);
}
ui.tagged = doneTags; saveUi();
