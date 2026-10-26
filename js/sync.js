// Abgleich über ein geheimes GitHub-Gist, dazu Backup per Datei.
import { state, save, replaceState, on, ui, saveUi } from './store.js';
import { mergeDocs, sanitize, dayKey, LEGACY_KEYS } from './merge.js';
import { buildSummary } from './summary.js';
import { fmtDate, hhmm } from './logic.js';
import { $ } from './ui.js';

const SYNC_KEY = 'fasten-sync', DATA = 'fastentracker.json', SUMMARY = 'zusammenfassung.md';
let sync = (() => { try { return JSON.parse(localStorage.getItem(SYNC_KEY)) || {}; } catch { return {}; } })();
let timer = null, busy = false, again = false;
const store = () => { try { localStorage.setItem(SYNC_KEY, JSON.stringify(sync)); } catch {} };
const ready = () => !!(sync.token && sync.gist);
const msg = t => { $('syncMsg').textContent = t; };
// Schlägt der Abgleich fehl (z. B. Token abgelaufen), färbt sich das Einstellungs-Symbol – sonst bliebe der Fehler unbemerkt.
const flag = () => $('gear').classList.toggle('alert', ready() && !!sync.err);
// Ohne Zeitlimit bliebe ein hängender Abgleich (schlechtes Netz) für immer „beschäftigt“ und es würde nie wieder synchronisiert.
const signal = () => (typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(ui.syncTimeout || 20000) : undefined);
const slow = e => e && (e.name === 'TimeoutError' || e.name === 'AbortError');
const gh = (path, opts = {}) => fetch('https://api.github.com' + path, {
  cache: 'no-store', signal: signal(), ...opts,
  headers: { Authorization: 'Bearer ' + sync.token, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
});
const fail = r => new Error(r.status === 401 ? 'Token ungültig oder abgelaufen' : r.status === 404 ? 'Gist nicht gefunden' : 'GitHub-Fehler ' + r.status);

export async function syncNow(manual) {
  if (!ready()) return;
  if (busy) { again = true; return; }
  busy = true;
  if (manual) msg('Synchronisiere …');
  try {
    const r = await gh('/gists/' + sync.gist);
    if (!r.ok) throw fail(r);
    const g = await r.json(), f = g.files && g.files[DATA];
    const remote = f ? JSON.parse(f.truncated ? await (await fetch(f.raw_url, { cache: 'no-store', signal: signal() })).text() : f.content) : null;
    const merged = remote ? mergeDocs(state, remote) : sanitize(state);
    const out = JSON.stringify(merged);
    if (out !== JSON.stringify(sanitize(state))) replaceState(merged);

    const files = {};
    // Enthält das Gist noch Fasten-Daten der früheren Version, ohne sonstige Änderung trotzdem neu schreiben (löscht sie dort)
    const legacy = !!remote && typeof remote === 'object' && LEGACY_KEYS.some(k => k in remote);
    if (!remote || legacy || out !== JSON.stringify(sanitize(remote))) files[DATA] = { content: out };
    // Zusammenfassung bei Datenänderung, sonst höchstens stündlich aktualisieren
    if (files[DATA] || !g.files[SUMMARY] || Date.now() - (sync.sumAt || 0) > 3600000) files[SUMMARY] = { content: buildSummary(state) };
    if (Object.keys(files).length) {
      const p = await gh('/gists/' + sync.gist, { method: 'PATCH', body: JSON.stringify({ files }) });
      if (!p.ok) throw fail(p);
      if (files[SUMMARY]) sync.sumAt = Date.now();
    }
    sync.last = Date.now(); delete sync.err; store(); flag();
    msg('Zuletzt synchronisiert: ' + hhmm(sync.last));
  } catch (e) {
    const isSlow = slow(e);
    msg('Sync fehlgeschlagen: ' + (isSlow ? 'Zeitüberschreitung, das Netz ist zu langsam' : e.message || e) + (navigator.onLine ? '' : ' (offline)'));
    // Offline oder zu langsames Netz ist kein Fehler, auf den man reagieren muss (z. B. abgelaufenes Token)
    if (navigator.onLine && !isSlow) { sync.err = String(e.message || e); store(); flag(); }
  } finally {
    busy = false;
    if (again) { again = false; syncNow(false); }
  }
}

function schedule() { if (!ready()) return; clearTimeout(timer); timer = setTimeout(() => syncNow(false), 2500); }

export function renderSettings() {
  $('syncSetup').hidden = ready();
  $('syncOn').hidden = !ready();
  $('syncGistShow').textContent = sync.gist || '';
  flag();
  if (ready() && sync.last && !$('syncMsg').textContent) msg('Zuletzt synchronisiert: ' + fmtDate(sync.last));
  $('bkMsg').textContent = ui.exportAt ? 'Letzter Export: ' + fmtDate(ui.exportAt) : 'Noch kein Export.';
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tagwerk-backup-${dayKey(Date.now())}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  ui.exportAt = Date.now(); saveUi(); renderSettings();
}

async function importData(file) {
  try {
    const raw = JSON.parse(await file.text());
    const lists = ['sleep', 'weight', 'train'];
    if (!raw || typeof raw !== 'object' || !lists.some(k => Array.isArray(raw[k]))) throw new Error('keine Tagwerk-Sicherung');
    const data = sanitize(raw), count = lists.reduce((a, k) => a + data[k].length, 0);
    if (!count) throw new Error('keine gültigen Einträge gefunden');
    if (!confirm(`Sicherung mit ${count} gültigen Einträgen mit den vorhandenen Daten zusammenführen?`)) return;
    replaceState(mergeDocs(state, data));
    save();
    $('bkMsg').textContent = `${count} Einträge eingelesen und zusammengeführt.`;
  } catch (e) {
    $('bkMsg').textContent = 'Import fehlgeschlagen: ' + (e.message || e);
  }
}

export function initSync() {
  on('save', schedule);
  $('syncConnect').onclick = async () => {
    const token = $('syncToken').value.trim();
    const gist = ($('syncGist').value.match(/[0-9a-f]{20,}/i) || [''])[0].toLowerCase(); // ID oder ganzer Gist-Link
    if (!token) return msg('Bitte ein Token eingeben.');
    if ($('syncGist').value.trim() && !gist) return msg('Die Gist-ID sieht ungültig aus.');
    sync = { token, gist }; msg('Verbinde …');
    try {
      if (gist) { const c = await gh('/gists/' + gist); if (!c.ok) throw fail(c); }
      else {
        const r = await gh('/gists', { method: 'POST', body: JSON.stringify({ description: 'Tagwerk Daten', public: false, files: { [DATA]: { content: JSON.stringify(state) } } }) });
        if (!r.ok) throw r.status === 403 || r.status === 404 ? new Error('Token braucht die Berechtigung „gist“') : fail(r);
        sync.gist = (await r.json()).id;
      }
      store(); $('syncToken').value = ''; $('syncGist').value = ''; renderSettings();
      await syncNow(true);
    } catch (e) { sync = {}; store(); renderSettings(); msg('Verbinden fehlgeschlagen: ' + (e.message || e)); }
  };
  $('syncNow').onclick = () => syncNow(true);
  $('syncOff').onclick = () => {
    if (!confirm('Synchronisierung auf diesem Gerät trennen? Das Token wird hier gelöscht, deine Daten bleiben.')) return;
    sync = {}; store(); msg(''); renderSettings();
  };
  $('expBtn').onclick = exportData;
  $('impBtn').onclick = () => $('impFile').click();
  $('impFile').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) importData(f); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(false); });
  addEventListener('online', () => syncNow(false));
  syncNow(false);
}
