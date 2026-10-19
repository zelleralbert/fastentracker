import { RANGES } from './logic.js';

// Zentraler Datenstand. Der Schlüssel bleibt 'fasten-v1', damit bestehende Daten erhalten bleiben.
export const KEY = 'fasten-v1';
const DEF = () => ({ plan: '16:8', custom: 16, current: null, history: [], sleep: [], sleepNow: null, weight: [], train: [], ex: 'chin', deleted: {}, mod: 0 });

const read = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) || fb; } catch { return fb; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

export const state = Object.assign(DEF(), read(KEY, {}));
if (!state.deleted || Array.isArray(state.deleted)) state.deleted = {};

const listeners = { save: [], change: [] };
export const on = (ev, fn) => listeners[ev].push(fn);

export const saveLocal = () => write(KEY, state);
// Jede Nutzeränderung: Zeitstempel setzen, lokal speichern, Sync anstoßen.
export function save() { state.mod = Date.now(); saveLocal(); listeners.save.forEach(f => f()); }
// Kompletten Stand ersetzen (nach Sync/Import), Objekt-Identität bleibt erhalten.
export function replaceState(next) {
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, DEF(), next);
  saveLocal();
  listeners.change.forEach(f => f());
}
export const tomb = k => { state.deleted[k] = Date.now(); };

// Nur Ansichtseinstellungen dieses Geräts (werden nicht synchronisiert).
export const ui = read('tagwerk-ui', {});
export const saveUi = () => write('tagwerk-ui', ui);
export const range = () => (RANGES.includes(ui.range) ? ui.range : 7);
