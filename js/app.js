import { on, ui, saveUi, range } from './store.js';
import { $ } from './ui.js';
import { RANGES, rangeLabel } from './logic.js';
import { initFast, renderFast, tickFast } from './fast.js';
import { initSleep, renderSleep, tickSleep } from './sleep.js';
import { initTrain, renderTrain } from './train.js';
import { initWeight, renderWeight } from './weight.js';
import { initSync, renderSettings } from './sync.js';

const VERSION = '2.0';
const TITLES = { fast: 'Fasten', sleep: 'Schlaf', train: 'Training', weight: 'Gewicht', settings: 'Einstellungen' };

function renderAll() { renderFast(); renderSleep(); renderTrain(); renderWeight(); renderSettings(); renderSegs(); }

function renderSegs() {
  document.querySelectorAll('.seg').forEach(s => {
    s.innerHTML = RANGES.map(n => `<button data-r="${n}" class="${range() === n ? 'on' : ''}">${rangeLabel(n)}</button>`).join('');
  });
}
document.addEventListener('click', e => {
  const b = e.target.closest('.seg button');
  if (!b) return;
  ui.range = Number(b.dataset.r); saveUi(); renderAll();
});

function showTab(t) {
  if (!TITLES[t]) t = 'fast';
  document.querySelectorAll('[data-view]').forEach(v => { v.hidden = v.dataset.view !== t; });
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  $('gear').classList.toggle('on', t === 'settings');
  $('title').textContent = TITLES[t];
  if (t !== 'settings') ui.back = t;
  ui.tab = t; saveUi();
  scrollTo(0, 0);
}
document.querySelectorAll('#tabs button').forEach(b => { b.onclick = () => showTab(b.dataset.tab); });
$('gear').onclick = () => showTab(ui.tab === 'settings' ? ui.back || 'fast' : 'settings');
$('version').textContent = 'Tagwerk ' + VERSION;

initFast(); initSleep(); initTrain(); initWeight();
on('change', renderAll);
renderAll();
let legacyTab = null; try { legacyTab = localStorage.getItem('fasten-v1-tab'); } catch {}
showTab(ui.tab || legacyTab || 'fast');
initSync();

setInterval(() => { tickFast(); tickSleep(); }, 1000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') renderAll(); });

// Service Worker: neue Version wird sofort übernommen, die Seite lädt einmal neu.
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloaded) { reloaded = true; location.reload(); }
  });
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
