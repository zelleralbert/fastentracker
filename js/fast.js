import { state, save, tomb, range } from './store.js';
import { H, num, fmtHM, fmtClock, fmtDate, fmtDay, fmtDur, hhmm, avg, rangeStart, buckets } from './logic.js';
import { $, stats, items, bars } from './ui.js';

const PLANS = [{ n: '12:12', h: 12 }, { n: '14:10', h: 14 }, { n: '16:8', h: 16 }, { n: '18:6', h: 18 }, { n: '20:4', h: 20 }, { n: 'OMAD', h: 23 }, { n: 'Eigener', h: 0 }];
const PHASES = [
  [0, 'Verdauung', 'Der Körper verarbeitet die letzte Mahlzeit. Blutzucker und Insulin sind erhöht, Nährstoffe werden aufgenommen und gespeichert.'],
  [4, 'Blutzucker sinkt', 'Die Verdauung klingt ab. Blutzucker und Insulin fallen, der Körper greift zunehmend auf gespeicherte Energie zurück.'],
  [8, 'Speicher werden genutzt', 'Die Glykogenspeicher der Leber leeren sich allmählich. Der niedrige Insulinspiegel erleichtert die Fettverbrennung.'],
  [12, 'Fettverbrennung steigt', 'Der Körper bezieht mehr Energie aus Fett. Erste Ketone entstehen, viele berichten von gleichmäßigerer Energie.'],
  [16, 'Ketose beginnt', 'Der Ketonspiegel steigt merklich. Zelluläre Aufräumprozesse (Autophagie) werden angeregt – belegt vor allem in Tier- und Zellstudien.'],
  [18, 'Erhöhte Ketose', 'Fett ist die Hauptenergiequelle. Bei vielen lässt das Hungergefühl spürbar nach.'],
  [24, 'Autophagie verstärkt', 'Zelluläre Reinigungsprozesse laufen vermutlich verstärkt. Die Insulinempfindlichkeit kann sich verbessern.'],
  [48, 'Hormonelle Anpassung', 'Das Wachstumshormon steigt an, was Muskeln und Stoffwechsel schützen kann. Ab hier nur nach ärztlicher Rücksprache.'],
  [72, 'Zellerneuerung', 'Längeres Fasten wird mit Erneuerungsprozessen im Immunsystem in Verbindung gebracht. Nur unter ärztlicher Begleitung.'],
];
const C = 2 * Math.PI * 90;
const goalH = () => state.plan === 'Eigener' ? Number(state.custom) || 16 : (PLANS.find(p => p.n === state.plan) || PLANS[2]).h;
const phaseIdx = h => PHASES.reduce((i, [t], k) => h >= t ? k : i, 0);
const toLocalInput = t => new Date(t - new Date(t).getTimezoneOffset() * 60000).toISOString().slice(0, 16);
let lastPhase = -2;

// Android-Chrome erlaubt `new Notification()` nicht – dort geht es nur über den Service Worker.
async function notify(title, body) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, icon: 'icon.svg', tag: 'tagwerk-fast' });
    else new Notification(title, { body, icon: 'icon.svg' });
  } catch {}
}

export function initFast() {
  $('fArc').style.strokeDasharray = C;
  $('fCustom').oninput = e => { state.custom = Math.min(72, Math.max(1, Number(e.target.value) || 16)); save(); tickFast(); };
  $('fGo').onclick = () => {
    const c = state.current;
    if (!c) {
      state.current = { start: Date.now(), goalH: goalH(), notified: false };
      try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch {}
    } else {
      const end = Date.now(), reached = end - c.start >= c.goalH * H;
      if (!reached && !confirm(`Ziel noch nicht erreicht (${num((end - c.start) / H)} von ${c.goalH} h). Trotzdem beenden?`)) return;
      state.history.push({ start: c.start, end, goalH: c.goalH, reached });
      state.current = null;
    }
    save(); renderFast();
  };
  $('fEditBtn').onclick = () => { $('fEdit').hidden = !$('fEdit').hidden; $('fStartIn').value = toLocalInput(state.current.start); };
  $('fStartSave').onclick = () => {
    const t = new Date($('fStartIn').value).getTime();
    if (!t || t > Date.now()) { alert('Bitte eine Zeit in der Vergangenheit wählen.'); return; }
    state.current.start = t; state.current.notified = false; save(); $('fEdit').hidden = true; renderFast();
  };
}

export function renderFast() {
  const run = !!state.current;
  const box = $('fPlans'); box.innerHTML = '';
  if (!run) for (const p of PLANS) {
    const b = document.createElement('button');
    b.className = 'chip' + (state.plan === p.n ? ' on' : '');
    b.setAttribute('aria-pressed', state.plan === p.n);
    b.textContent = p.n;
    b.onclick = () => { state.plan = p.n; save(); renderFast(); };
    box.appendChild(b);
  }
  box.hidden = run;
  $('fCustomRow').hidden = run || state.plan !== 'Eigener';
  if (document.activeElement !== $('fCustom')) $('fCustom').value = state.custom;
  $('fGo').textContent = run ? 'Fasten beenden' : 'Fasten starten';
  $('fGo').classList.toggle('primary', !run);
  $('fLinks').hidden = !run;
  if (!run) $('fEdit').hidden = true;

  // Überblick
  const n = range(), from = rangeStart(Date.now(), n);
  const f = state.history.filter(x => x.end >= from), d = f.map(x => (x.end - x.start) / H);
  stats($('fStats'), [
    [f.length ? `${f.filter(x => x.reached).length}/${f.length}` : '–', 'Ziele erreicht'],
    [d.length ? num(avg(d)) + ' h' : '–', 'Ø Dauer'],
    [d.length ? num(Math.max(...d)) + ' h' : '–', 'Längstes'],
  ]);
  // Farbe nach dem damaligen Ziel, nicht nach dem aktuell gewählten Plan: orange, sobald im Abschnitt ein Ziel verfehlt wurde
  const bk = buckets(Date.now(), n), inB = bk.list.map(b => f.filter(x => x.end >= b.from && x.end < b.to));
  bars($('fBars'), bk, (a, b, i) => inB[i].map(x => (x.end - x.start) / H), { max: 16, low: (v, i) => inB[i].some(x => !x.reached) });

  items($('fHist'), () => state.history.filter(x => x.end >= rangeStart(Date.now(), Math.max(n, 30))).reverse().map(x => ({
    html: `${fmtDay(x.start)}, ${hhmm(x.start)}<small>${fmtDur(x.end - x.start)} · Ziel ${x.goalH} h ${x.reached ? '<span class="ok">✓</span>' : ''}</small>`,
    confirmText: 'Eintrag löschen?',
    onDel: () => { tomb('h:' + x.start); state.history.splice(state.history.indexOf(x), 1); save(); renderFast(); },
  })), 'Noch keine abgeschlossenen Fastenzeiten.');

  lastPhase = -2;
  tickFast();
}

function renderPhases(idx) {
  $('fPhases').innerHTML = PHASES.map(([t, name, text], k) =>
    `<div class="ph${k === idx ? ' now' : k < idx ? ' past' : ''}"><div class="h">${t} h</div><div><b>${name}</b><p>${text}</p></div></div>`).join('');
}

export function tickFast() {
  const c = state.current;
  if (!c) {
    $('fMain').textContent = `${goalH()}:00:00`;
    $('fSub').textContent = 'bereit';
    $('fArc').style.strokeDashoffset = C;
    $('fPhase').innerHTML = '';
    if (lastPhase !== -1) { lastPhase = -1; renderPhases(-1); }
    return;
  }
  const el = Date.now() - c.start, goal = c.goalH * H, done = el >= goal;
  $('fMain').textContent = fmtClock(done ? el - goal : goal - el);
  $('fSub').textContent = done ? 'über dem Ziel' : `noch · Ende ${hhmm(c.start + goal)}`;
  $('fArc').style.strokeDashoffset = C * (1 - Math.min(1, el / goal));
  const h = el / H, i = phaseIdx(h);
  if (i !== lastPhase) {
    lastPhase = i;
    const next = PHASES[i + 1];
    $('fPhase').innerHTML = `<b>${PHASES[i][1]}</b><p>${PHASES[i][2]}</p>` +
      (next ? `<p class="fine" data-next></p>` : '');
    renderPhases(i);
  }
  const nx = PHASES[i + 1], n = $('fPhase').querySelector('[data-next]');
  if (nx && n) n.textContent = `Als Nächstes: ${nx[1]} · in ${fmtHM(nx[0] * H - el)} h`;
  $('fSub').title = 'Start ' + fmtDate(c.start);
  if (done && !c.notified) {
    c.notified = true; save();
    notify('Fastenziel erreicht', `${c.goalH} Stunden geschafft.`);
  }
}
