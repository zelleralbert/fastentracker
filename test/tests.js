// Tests für Zusammenführung, Logik und Zusammenfassung. Laufen im Browser über test/index.html.
import { mergeDocs, sanitize, dayKey } from '../js/merge.js';
import { avgClock, movingAvg, suggestNext, isRecord, exById, buckets, rangeStart, D, H } from '../js/logic.js';
import { buildSummary } from '../js/summary.js';

const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }); }
  catch (e) { results.push({ name, ok: false, err: e.message }); }
}
function eq(a, b, msg = '') {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${msg} erwartet ${y}, bekommen ${x}`);
}
const ok = (v, msg) => { if (!v) throw new Error(msg || 'Bedingung nicht erfüllt'); };

const T = (d, h = 12, m = 0) => new Date(2026, 9, d, h, m).getTime(); // Oktober 2026, lokale Zeit
const doc = o => ({ history: [], sleep: [], weight: [], train: [], deleted: {}, mod: 0, ...o });

/* ---- mergeDocs ---- */
test('vereinigt Listen beider Geräte', () => {
  const a = doc({ train: [{ t: T(1), ex: 'chin', reps: 8, kg: 0 }], mod: 1 });
  const b = doc({ train: [{ t: T(2), ex: 'dips', reps: 10, kg: 0 }], sleep: [{ bed: T(1, 23), wake: T(2, 7) }], mod: 2 });
  const m = mergeDocs(a, b);
  eq(m.train.map(x => x.ex), ['chin', 'dips']);
  eq(m.sleep.length, 1);
});

test('identische Einträge werden nicht verdoppelt', () => {
  const x = { start: T(3, 20), end: T(4, 12), goalH: 16, reached: true };
  const m = mergeDocs(doc({ history: [x] }), doc({ history: [{ ...x }] }));
  eq(m.history.length, 1);
});

test('gelöschter Eintrag kommt vom anderen Gerät nicht zurück', () => {
  const s = { t: T(5), ex: 'chin', reps: 8, kg: 0 };
  const a = doc({ train: [], deleted: { ['t:chin' + s.t]: T(6) }, mod: 5 });
  const b = doc({ train: [s], mod: 9 });
  eq(mergeDocs(a, b).train.length, 0);
  eq(mergeDocs(b, a).train.length, 0, 'Reihenfolge egal:');
});

test('Gewicht: pro Tag gewinnt der neuere Wert', () => {
  const a = doc({ weight: [{ t: T(7), kg: 85, u: 100 }] });
  const b = doc({ weight: [{ t: T(7), kg: 84.6, u: 200 }] });
  eq(mergeDocs(a, b).weight, [{ t: T(7), kg: 84.6, u: 200 }]);
  eq(mergeDocs(b, a).weight[0].kg, 84.6);
});

test('Gewicht: nach Löschen neu eingetragen bleibt erhalten', () => {
  const a = doc({ weight: [{ t: T(8), kg: 83, u: 300 }], deleted: { ['w:' + dayKey(T(8))]: 200 } });
  const b = doc({ weight: [{ t: T(8), kg: 90, u: 100 }] });
  eq(mergeDocs(a, b).weight, [{ t: T(8), kg: 83, u: 300 }]);
});

test('Einzelwerte kommen aus dem neueren Stand', () => {
  const m = mergeDocs(doc({ plan: '16:8', mod: 1 }), doc({ plan: '18:6', mod: 2 }));
  eq(m.plan, '18:6'); eq(m.mod, 2);
});

test('beendetes Fasten startet durch alten Stand nicht neu', () => {
  const start = T(9, 20);
  const a = doc({ current: null, history: [{ start, end: T(10, 12), goalH: 16, reached: true }], mod: 5 });
  const b = doc({ current: { start, goalH: 16 }, weight: [{ t: T(10), kg: 80, u: 1 }], mod: 9 });
  const m = mergeDocs(a, b);
  eq(m.current, null); eq(m.history.length, 1); eq(m.weight.length, 1);
});

test('beendeter Schlaf startet durch alten Stand nicht neu', () => {
  const bed = T(11, 23);
  const m = mergeDocs(doc({ sleep: [{ bed, wake: T(12, 7) }], mod: 1 }), doc({ sleepNow: bed, mod: 2 }));
  eq(m.sleepNow, null);
});

test('laufendes Fasten bleibt, wenn das andere Gerät später etwas anderes ändert', () => {
  const cur = { start: T(13, 20), goalH: 16 };
  const m = mergeDocs(doc({ current: cur, mod: 5 }), doc({ current: null, weight: [{ t: T(14), kg: 80, u: 9 }], mod: 9 }));
  eq(m.current.start, cur.start); eq(m.weight.length, 1);
});

test('geänderte Startzeit: neuerer Stand gewinnt', () => {
  const m = mergeDocs(doc({ current: { start: T(13, 20), goalH: 16 }, mod: 5 }), doc({ current: { start: T(13, 19), goalH: 16 }, mod: 9 }));
  eq(m.current.start, T(13, 19));
});

test('abgebrochener Schlaf bleibt abgebrochen', () => {
  const bed = T(15, 23);
  const m = mergeDocs(doc({ sleepNow: null, deleted: { ['s:' + bed]: T(15, 23, 5) }, mod: 9 }), doc({ sleepNow: bed, mod: 5 }));
  eq(m.sleepNow, null);
});

test('Merge verändert die Eingaben nicht und ist idempotent', () => {
  const a = doc({ train: [{ t: T(1), ex: 'chin', reps: 8, kg: 0 }], mod: 1 });
  const b = doc({ train: [{ t: T(2), ex: 'dips', reps: 9, kg: 0 }], mod: 2 });
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  const m = mergeDocs(a, b);
  eq(JSON.stringify(a), sa); eq(JSON.stringify(b), sb);
  eq(mergeDocs(m, m), m);
  eq(mergeDocs(m, b), m);
});

test('gleicher Eintrag mit unterschiedlichem Inhalt: beide Geräte erhalten dasselbe Ergebnis', () => {
  const start = T(16, 20);
  const a = doc({ history: [{ start, end: T(17, 12), goalH: 16, reached: true }], mod: 3 });
  const b = doc({ history: [{ start, end: T(17, 12, 5), goalH: 16, reached: true }], mod: 4 });
  eq(mergeDocs(a, b), mergeDocs(b, a));
  const s1 = doc({ sleep: [{ bed: T(1, 23), wake: T(2, 7) }] }), s2 = doc({ sleep: [{ bed: T(1, 23), wake: T(2, 8) }] });
  eq(mergeDocs(s1, s2), mergeDocs(s2, s1));
});

test('gleicher Zeitstempel, unterschiedliche Einstellungen: Ergebnis hängt nicht von der Reihenfolge ab', () => {
  const a = doc({ plan: '16:8', mod: 5 }), b = doc({ plan: '18:6', mod: 5 });
  eq(mergeDocs(a, b), mergeDocs(b, a));
});

test('neues Fasten geht nicht verloren, wenn das andere Gerät neuer gespeichert hat', () => {
  const oldStart = T(14, 20), newStart = T(15, 20);
  const a = doc({ current: { start: newStart, goalH: 16 }, history: [{ start: oldStart, end: T(15, 12), goalH: 16, reached: true }], mod: 5 });
  const b = doc({ current: { start: oldStart, goalH: 16 }, weight: [{ t: T(15), kg: 80, u: 9 }], mod: 9 });
  eq(mergeDocs(a, b).current.start, newStart); eq(mergeDocs(b, a).current.start, newStart);
});

test('gelöschter Verlaufseintrag lässt das Fasten nicht wieder aufleben', () => {
  const start = T(14, 20);
  const a = doc({ current: null, deleted: { ['h:' + start]: T(16) }, mod: 9 });
  const b = doc({ current: { start, goalH: 16 }, mod: 5 });
  eq(mergeDocs(a, b).current, null);
});

test('beschädigte Daten werden bereinigt statt übernommen', () => {
  const bad = {
    plan: 5, custom: 'x', current: { start: 'jetzt', goalH: 16 }, ex: 'hack',
    history: [{ start: T(1), end: T(1) - 5, goalH: 16 }, null, 'x', { start: T(2), end: T(3), goalH: 16, reached: true }],
    sleep: [{ bed: T(1), wake: T(1) - 1 }, { bed: T(1, 23), wake: T(2, 7) }],
    weight: [{ t: T(1), kg: '<img src=x onerror=alert(1)>' }, { t: T(2), kg: 81 }, { t: T(3), kg: 5 }],
    train: [{ t: T(1), ex: 'chin', reps: 8, kg: '<b>' }, { t: T(2), ex: 'nope', reps: 8, kg: 0 }, { t: T(3), ex: 'dips', reps: 10, kg: 0, n: 'ok' }],
    deleted: { a: 'x', b: 5 }, mod: 'neu',
  };
  const s = sanitize(bad);
  eq([s.plan, s.custom, s.current, s.ex, s.mod], ['16:8', 16, null, 'chin', 0]);
  eq([s.history.length, s.sleep.length, s.weight.length, s.train.length], [1, 1, 1, 1]);
  eq(s.train[0].n, 'ok'); eq(s.deleted, { b: 5 });
  eq(sanitize(s), s, 'idempotent:');
});

test('ungültige Eingaben (null, Liste, Text) lassen den Merge nicht abstürzen', () => {
  for (const x of [null, undefined, [], 'text', 5]) {
    const m = mergeDocs(doc({ train: [{ t: T(1), ex: 'chin', reps: 5, kg: 0 }] }), x);
    eq(m.train.length, 1);
  }
});

test('Merge liefert immer dieselbe Schlüsselreihenfolge', () => {
  const a = mergeDocs({}, {}), b = mergeDocs(doc({ plan: '18:6', mod: 3 }), {});
  eq(Object.keys(a), Object.keys(b));
});

test('alte Stände ohne deleted/Listen funktionieren', () => {
  const m = mergeDocs({ plan: '16:8' }, { train: [{ t: 1, ex: 'chin', reps: 5, kg: 0 }] });
  eq(m.train.length, 1); eq(m.history, []); eq(m.deleted, {});
});

/* ---- Logik ---- */
test('mittlere Uhrzeit über Mitternacht', () => {
  eq(avgClock([T(1, 23, 30), T(2, 0, 30)]), '00:00');
  eq(avgClock([T(1, 6, 0), T(2, 7, 0)]), '06:30');
  eq(avgClock([]), '–');
});

test('gleitender 7-Tage-Durchschnitt', () => {
  const pts = [{ t: T(1), v: 80 }, { t: T(2), v: 82 }, { t: T(9), v: 84 }];
  const m = movingAvg(pts);
  eq(m.map(p => p.v), [80, 81, 84]);
});

test('Vorschlag: schwächsten Satz steigern, heutige Sätze ignorieren', () => {
  const now = T(20, 18);
  const sets = [
    { t: T(18, 18), ex: 'chin', reps: 10, kg: 0 }, { t: T(18, 18, 5), ex: 'chin', reps: 10, kg: 0 }, { t: T(18, 18, 9), ex: 'chin', reps: 8, kg: 0 },
    { t: T(20, 17), ex: 'chin', reps: 3, kg: 0 },
  ];
  const s = suggestNext(sets, exById('chin'), now);
  eq(s.last, '10 / 10 / 8'); eq(s.next, '10 / 10 / 9'); eq(s.up, false);
});

test('Vorschlag: mehr Gewicht, wenn alle Sätze die Obergrenze schaffen', () => {
  const sets = [12, 13, 12].map((r, i) => ({ t: T(18, 18, i), ex: 'chin', reps: r, kg: 5 }));
  const s = suggestNext(sets, exById('chin'), T(20));
  eq(s.up, true); eq(s.next, '7,5 kg');
});

test('Vorschlag: Neck Bridge steigert um 5 Sekunden', () => {
  const sets = [30, 40].map((r, i) => ({ t: T(18, 18, i), ex: 'neck', reps: r, kg: 0 }));
  eq(suggestNext(sets, exById('neck'), T(20)).next, '35 / 40');
});

test('Vorschlag: ohne frühere Einheit keiner', () => {
  eq(suggestNext([{ t: T(20, 9), ex: 'chin', reps: 5, kg: 0 }], exById('chin'), T(20, 18)), null);
});

test('Rekord-Erkennung', () => {
  const prev = [{ reps: 8, kg: 0 }, { reps: 6, kg: 5 }];
  ok(isRecord(prev, 7, 5)); ok(!isRecord(prev, 6, 5)); ok(!isRecord(prev, 9, 0)); ok(!isRecord([], 10, 0));
});

/* ---- Zeiträume ---- */
const contiguous = (list, from, to) => {
  eq(list[0].from, from, 'Beginn:'); eq(list[list.length - 1].to, to, 'Ende:');
  for (let i = 1; i < list.length; i++) eq(list[i].from, list[i - 1].to, `Lücke bei ${i}:`);
};
const endOfDay = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 1); return d.getTime(); };

test('7 und 30 Tage: ein Balken pro Tag, lückenlos', () => {
  const now = T(20, 15);
  for (const n of [7, 30]) { const b = buckets(now, n); eq(b.list.length, n); contiguous(b.list, rangeStart(now, n), endOfDay(now)); }
});

test('90 Tage: wöchentlich, lückenlos über alle Tage', () => {
  const now = T(20, 15), b = buckets(now, 90);
  eq(b.list.length, 13); contiguous(b.list, rangeStart(now, 90), endOfDay(now));
});

test('1 Jahr: monatlich, lückenlos, Monatsnamen', () => {
  const now = T(20, 15), b = buckets(now, 365);
  eq(b.list.length, 13); contiguous(b.list, rangeStart(now, 365), endOfDay(now));
  eq(b.list[b.list.length - 1].label, 'Okt');
});

/* ---- Zusammenfassung ---- */
test('Zusammenfassung mit leeren Daten', () => {
  const s = buildSummary(doc({}), T(19));
  ok(s.includes('## Letzte 7 Tage')); ok(s.includes('## Letzte 30 Tage')); ok(s.includes('## Letzte 12 Monate')); ok(s.includes('keine Einträge'));
});

test('Zusammenfassung mit Daten', () => {
  const now = T(19, 20);
  const s = buildSummary(doc({
    current: { start: now - 4 * H, goalH: 16 },
    history: [{ start: T(17, 20), end: T(18, 13), goalH: 16, reached: true }],
    sleep: [{ bed: T(18, 23), wake: T(19, 7) }],
    weight: [{ t: T(12), kg: 86 }, { t: T(19), kg: 85 }],
    train: [{ t: T(19, 18), ex: 'chin', reps: 10, kg: 0, n: 'Schulter zwickt' }, { t: T(19, 18, 3), ex: 'neck', reps: 45, kg: 0 }],
  }), now);
  ok(s.includes('Fasten läuft'), 'laufendes Fasten');
  ok(s.includes('1 abgeschlossen, 1 mit Ziel erreicht'), 'Fasten');
  ok(s.includes('Ø 8:00 h'), 'Schlaf');
  ok(s.includes('| Chin-ups | 1 | 1 | 10 Wdh. | 10 Wdh. |'), 'Training-Tabelle');
  ok(s.includes('45 Sek.'), 'Neck Bridge in Sekunden');
  ok(s.includes('Schulter zwickt'), 'Notiz');
  ok(s.includes('zuletzt 85,0 kg'), 'Gewicht');
});

/* ---- Ausgabe ---- */
const failed = results.filter(r => !r.ok);
document.getElementById('out').innerHTML =
  `<h1>${failed.length ? '✗' : '✓'} ${results.length - failed.length}/${results.length} Tests bestanden</h1>` +
  results.map(r => `<p class="${r.ok ? 'ok' : 'bad'}">${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : ' — ' + r.err}</p>`).join('');
window.testResults = { passed: results.length - failed.length, failed };
