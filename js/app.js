import { on, ui, saveUi, range } from './store.js';
import { $ } from './ui.js';
import { RANGES, rangeLabel, dayKey } from './logic.js';
import { initSleep, renderSleep, renderDrift, tickSleep } from './sleep.js';
import { initTrain, renderTrain } from './train.js';
import { initWeight, renderWeight } from './weight.js';
import { initSync, renderSettings } from './sync.js';
import { initTheme } from './theme.js';

const VERSION = '2.13';
const TITLES = { sleep: 'Schlaf', train: 'Training', weight: 'Gewicht', settings: 'Einstellungen' };

// Jeder Bereich wird einzeln abgesichert: ein Fehler in einem darf die übrigen nicht blockieren.
function renderAll() {
  for (const f of [renderSegs, renderSleep, renderTrain, renderWeight, renderSettings]) {
    try { f(); } catch (e) { console.error(f.name, e); }
  }
}

function renderSegs() {
  document.querySelectorAll('.seg').forEach(s => {
    s.innerHTML = RANGES.map(n => `<button data-r="${n}" class="${range() === n ? 'on' : ''}" aria-pressed="${range() === n}">${rangeLabel(n)}</button>`).join('');
  });
}
document.addEventListener('click', e => {
  const b = e.target.closest('.seg button');
  if (!b) return;
  ui.range = Number(b.dataset.r); saveUi(); renderAll();
});

let current = 'sleep';
function showTab(t) {
  if (!TITLES[t]) t = 'sleep';
  current = t;
  document.querySelectorAll('[data-view]').forEach(v => { v.hidden = v.dataset.view !== t; });
  document.querySelectorAll('#tabs button').forEach(b => {
    b.classList.toggle('on', b.dataset.tab === t);
    if (b.dataset.tab === t) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  $('gear').classList.toggle('on', t === 'settings');
  $('title').textContent = TITLES[t];
  // Beim nächsten Start soll der zuletzt genutzte Bereich erscheinen, nicht die Einstellungen
  if (t !== 'settings') { ui.back = t; ui.tab = t; saveUi(); }
  scrollTo(0, 0);
}
document.querySelectorAll('#tabs button').forEach(b => { b.onclick = () => showTab(b.dataset.tab); });
$('gear').onclick = () => showTab(current === 'settings' ? ui.back || 'sleep' : 'settings');
$('version').textContent = 'Tagwerk ' + VERSION;

initTheme(); initSleep(); initTrain(); initWeight();
on('change', renderAll);
renderAll();
let legacyTab = null; try { legacyTab = localStorage.getItem('fasten-v1-tab'); } catch {}
showTab(ui.tab || legacyTab || 'sleep');
initSync();

// Über Mitternacht offen gelassen: „heute“, Zeiträume und Diagramme neu berechnen
let shownDay = dayKey(Date.now()), ticks = 0;
setInterval(() => {
  tickSleep();
  const d = dayKey(Date.now());
  if (d !== shownDay) { shownDay = d; renderAll(); }
  // „Nächster Schlaf“ und „Jetzt erwartet“ veralten, wenn die App stundenlang offen bleibt: alle 5 Minuten auffrischen
  else if (++ticks % 300 === 0) { try { renderDrift(); } catch (e) { console.error('renderDrift', e); } }
}, 1000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') renderAll(); });

// Service Worker: neue Version wird sofort übernommen, die Seite lädt einmal neu.
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  // Nicht mitten in einer Eingabe neu laden (sonst ginge z. B. eine halb getippte Notiz verloren)
  const typing = () => { const el = document.activeElement; return !!el && /^(INPUT|TEXTAREA)$/.test(el.tagName) && !!el.value; };
  const reload = () => { if (!reloaded) { reloaded = true; location.reload(); } };
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    if (!typing()) return reload();
    addEventListener('focusout', () => setTimeout(() => { if (!typing()) reload(); }, 300));
  });
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
