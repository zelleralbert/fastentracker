import { RANGES } from './logic.js';
import { sanitize } from './merge.js';

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
export const state = sanitize(read(KEY, {}));

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
