// Tests für Zusammenführung, Logik und Zusammenfassung. Laufen im Browser über test/index.html.
import { mergeDocs, sanitize, dayKey } from '../js/merge.js';
import { avgClock, movingAvg, suggestNext, isRecord, exById, buckets, rangeStart, endOfDay, D, H } from '../js/logic.js';
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

test('unmögliche Zeitpunkte werden verworfen (sonst Ausnahme beim Formatieren)', () => {
  const s = sanitize({
    train: [{ t: 1e20, ex: 'chin', reps: 5, kg: 0 }, { t: 5, ex: 'chin', reps: 5, kg: 0 }, { t: T(1), ex: 'chin', reps: 5, kg: 0 }],
    weight: [{ t: 8.64e15 + 1, kg: 80 }, { t: T(1), kg: 80 }],
    sleep: [{ bed: 1, wake: 2 }, { bed: T(1, 23), wake: T(2, 7) }],
    history: [{ start: T(1), end: 1e300, goalH: 16 }],
    current: { start: -5, goalH: 16 }, sleepNow: 1e20,
  });
  eq([s.train.length, s.weight.length, s.sleep.length, s.history.length, s.current, s.sleepNow], [1, 1, 1, 0, null, null]);
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
  const m = mergeDocs({ plan: '16:8' }, { train: [{ t: T(1), ex: 'chin', reps: 5, kg: 0 }] });
  eq(m.train.length, 1); eq(m.history, []); eq(m.deleted, {});
});

/* ---- Zwei Geräte, zufällige Bedienung ---- */
// Simuliert zwei Geräte mit einem gemeinsamen Gist: zufällige Eingaben, Löschungen und Abgleiche in beliebiger Reihenfolge.
function simulate(seed) {
  let q = seed; const rnd = () => (q = (q * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const pick = a => a[Math.floor(rnd() * a.length)];
  let clock = T(1, 8);
  const tick = () => { clock += 60000 + Math.floor(rnd() * 3 * H); return clock; };
  const dev = [sanitize({}), sanitize({})];
  let remote = null;
  const added = { train: new Set(), sleep: new Set(), history: new Set() }, removed = new Set();
  const del = (d, key) => { d.deleted[key] = clock; removed.add(key); };

  const ops = [
    d => { const x = { t: clock, ex: pick(['chin', 'dips', 'neck']), reps: 5 + Math.floor(rnd() * 10), kg: 0 }; d.train.push(x); added.train.add('t:' + x.ex + x.t); },
    d => { if (!d.train.length) return false; const x = pick(d.train); del(d, 't:' + x.ex + x.t); d.train.splice(d.train.indexOf(x), 1); },
    d => { const day = T(1 + Math.floor(rnd() * 5)); const k = dayKey(day); d.weight = d.weight.filter(x => dayKey(x.t) !== k); d.weight.push({ t: day, kg: 80 + Math.floor(rnd() * 50) / 10, u: clock }); },
    d => { if (!d.weight.length) return false; const x = pick(d.weight); del(d, 'w:' + dayKey(x.t)); d.weight.splice(d.weight.indexOf(x), 1); },
    d => { if (d.current) return false; d.current = { start: clock, goalH: 16, notified: false }; },
    d => { if (!d.current) return false; const h = { start: d.current.start, end: clock, goalH: 16, reached: false }; d.history.push(h); added.history.add('h:' + h.start); d.current = null; },
    d => { if (d.sleepNow) return false; d.sleepNow = clock; },
    d => { if (d.sleepNow == null || clock - d.sleepNow < 11 * 60000) return false; const x = { bed: d.sleepNow, wake: clock }; d.sleep.push(x); added.sleep.add('s:' + x.bed); d.sleepNow = null; },
    d => { if (d.sleepNow == null) return false; del(d, 's:' + d.sleepNow); d.sleepNow = null; },
    d => { d.plan = pick(['16:8', '18:6', '12:12']); },
  ];
  const sync = i => { const m = remote ? mergeDocs(dev[i], remote) : sanitize(dev[i]); dev[i] = m; remote = m; };

  for (let step = 0; step < 60; step++) {
    const i = rnd() < 0.5 ? 0 : 1;
    if (rnd() < 0.3) { sync(i); continue; }
    tick();
    if (pick(ops)(dev[i]) !== false) dev[i].mod = clock;
  }
  // Alle Geräte laden zum Schluss ihren Stand und gleichen ab
  for (const i of [0, 1, 0, 1]) sync(i);
  return { dev, remote, added, removed, again: [mergeDocs(dev[0], remote), mergeDocs(dev[1], remote)] };
}

test('zwei Geräte, 300 zufällige Abläufe: beide landen beim selben Stand und bleiben stabil', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const r = simulate(seed);
    const diff = Object.keys(r.dev[0]).filter(k => JSON.stringify(r.dev[0][k]) !== JSON.stringify(r.dev[1][k]));
    ok(!diff.length, `Seed ${seed}: Geräte verschieden in ${diff.join(', ')}: ${diff.map(k => JSON.stringify(r.dev[0][k]) + ' vs ' + JSON.stringify(r.dev[1][k])).join(' | ').slice(0, 300)}`);
    eq(r.dev[0], r.remote, `Seed ${seed}: Gist verschieden –`);
    eq(r.again[0], r.dev[0], `Seed ${seed}: weiterer Abgleich ändert etwas –`);
  }
});

test('zwei Geräte: keine Einträge gehen verloren und gelöschte kommen nicht zurück', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const { remote, added, removed } = simulate(seed);
    const present = new Set([...remote.train.map(x => 't:' + x.ex + x.t), ...remote.sleep.map(x => 's:' + x.bed), ...remote.history.map(x => 'h:' + x.start)]);
    for (const set of Object.values(added)) for (const k of set) {
      if (removed.has(k)) ok(!present.has(k), `Seed ${seed}: gelöschter Eintrag ${k} ist zurück`);
      else ok(present.has(k), `Seed ${seed}: Eintrag ${k} ging verloren`);
    }
  }
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

test('Vorschlag: ein einzelner schwerer Test-Satz bestimmt nicht das Arbeitsgewicht', () => {
  const sets = [{ t: T(18, 18), ex: 'chin', reps: 10, kg: 0 }, { t: T(18, 18, 3), ex: 'chin', reps: 10, kg: 0 }, { t: T(18, 18, 6), ex: 'chin', reps: 3, kg: 10 }];
  const s = suggestNext(sets, exById('chin'), T(20));
  eq(s.last, '10 / 10'); eq(s.next, '10 / 11');
  // zwei Sätze mit Zusatzgewicht: das schwerere Gewicht zählt
  const heavy = [...sets, { t: T(18, 18, 9), ex: 'chin', reps: 4, kg: 10 }];
  eq(suggestNext(heavy, exById('chin'), T(20)).last, '3 / 4 · 10 kg');
});

test('Wochentage in den Balken sind eindeutig', () => {
  const labels = buckets(T(20, 12), 7).list.map(b => b.label);
  eq(new Set(labels).size, 7); ok(labels.every(l => l.length === 2 && !l.includes('.')), labels.join(','));
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

test('Zeiträume bleiben über das ganze Jahr lückenlos (auch an Sommer-/Winterzeit-Wechseln)', () => {
  for (let day = 0; day < 400; day += 3) {
    const now = new Date(2026, 0, 1 + day, 3 + (day % 5) * 4, 30).getTime();
    for (const n of [7, 30, 90, 365]) {
      const b = buckets(now, n);
      eq(b.list[0].from, rangeStart(now, n), `Beginn bei Tag ${day}/${n}:`);
      eq(b.list[b.list.length - 1].to, endOfDay(now), `Ende bei Tag ${day}/${n}:`);
      for (let i = 1; i < b.list.length; i++) eq(b.list[i].from, b.list[i - 1].to, `Lücke bei Tag ${day}/${n}/${i}:`);
      ok(b.list.every(x => x.to > x.from), `leerer Abschnitt bei Tag ${day}/${n}`);
    }
  }
});

test('Notizen: Zeilenumbrüche und Steuerzeichen werden entfernt', () => {
  const s = sanitize({ train: [
    { t: T(1), ex: 'chin', reps: 5, kg: 0, n: 'Zeile 1\n## Neue Überschrift\r\n- Anweisung' },
    { t: T(2), ex: 'chin', reps: 5, kg: 0, n: '\n\u0001  ' },
    { t: T(3), ex: 'chin', reps: 5, kg: 0, n: 'x'.repeat(500) },
  ] });
  eq(s.train[0].n, 'Zeile 1 ## Neue Überschrift - Anweisung');
  ok(!('n' in s.train[1]), 'leere Notiz bleibt weg');
  eq(s.train[2].n.length, 140);
});

test('Zusammenfassung: Einzahl, Jahreszahl und Einzeiligkeit der Notizen', () => {
  const now = T(19, 20);
  const md = buildSummary(sanitize({
    sleep: [{ bed: T(18, 23), wake: T(19, 7) }], weight: [{ t: T(19), kg: 85 }],
    train: [{ t: T(19, 18), ex: 'chin', reps: 10, kg: 0, n: 'a\nb' }],
  }), now);
  ok(md.includes('1 Nacht,') && !md.includes('1 Nächte'), 'Nacht');
  ok(md.includes('1 Messung,') && !md.includes('1 Messungen'), 'Messung');
  ok(md.includes('Letzte 12 Monate (20.10.2025 – 19.10.2026)'), 'Jahreszahl: ' + md.split('\n').find(l => l.includes('12 Monate')));
  ok(md.includes('Chin-ups: a b'), 'Notiz einzeilig');
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

/* ---- Auslieferung: Offline-Cache und Version ---- */
const asyncResults = [];
async function checkFiles() {
  const get = async f => { const r = await fetch('../' + f, { cache: 'no-store' }); if (!r.ok) throw new Error(`${f}: ${r.status}`); return r.text(); };
  const run = async (name, fn) => { try { await fn(); asyncResults.push({ name, ok: true }); } catch (e) { asyncResults.push({ name, ok: false, err: e.message }); } };
  const sw = await get('sw.js'), app = await get('js/app.js'), html = await get('index.html');
  const cached = new Set([...sw.matchAll(/'\.\/([^']*)'/g)].map(m => m[1]).filter(f => f && f.includes('.')));

  await run('Offline-Cache enthält jede Datei, die die App lädt', async () => {
    const needed = new Set(['index.html', 'manifest.json', 'icon.svg']);
    for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) if (!m[1].startsWith('http') && !m[1].startsWith('#')) needed.add(m[1]);
    for (const f of [...needed].filter(f => f.endsWith('.js'))) {
      const src = await get(f);
      for (const m of src.matchAll(/from '\.\/([^']+)'/g)) needed.add('js/' + m[1]);
    }
    const missing = [...needed].filter(f => !cached.has(f));
    ok(!missing.length, 'fehlt im Cache: ' + missing.join(', '));
  });

  await run('Jede Datei im Offline-Cache existiert wirklich', async () => {
    for (const f of cached) await get(f);
  });

  await run('Version im Service Worker passt zur App-Version', async () => {
    const appV = app.match(/const VERSION = '([^']+)'/)?.[1], swV = sw.match(/const VERSION = '([^']+)'/)?.[1];
    ok(appV && swV === 'tagwerk-' + appV, `App ${appV} ≠ Service Worker ${swV}`);
  });

  await run('Textfarben erreichen Kontrast 4,5:1 (hell und dunkel)', async () => {
    const css = await get('css/app.css');
    const vars = block => Object.fromEntries([...block.matchAll(/--([a-z-]+):(#[0-9a-f]{3,8})/gi)].map(m => [m[1], m[2]]));
    const light = vars(css.split('@media')[0]), dark = { ...light, ...vars(css.split('prefers-color-scheme:dark){:root{')[1].split('}}')[0]) };
    const rgb = h => { h = h.slice(1); if (h.length === 3) h = [...h].map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255); };
    const lum = h => { const [r, g, b] = rgb(h).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    const low = [];
    for (const [theme, v] of [['hell', light], ['dunkel', dark]]) {
      for (const fg of ['text', 'muted', 'faint', 'accent', 'warn']) for (const bg of ['bg', 'surface']) if (ratio(v[fg], v[bg]) < 4.5) low.push(`${theme}: ${fg} auf ${bg} ${ratio(v[fg], v[bg]).toFixed(2)}`);
      if (ratio(v['on-accent'], v.accent) < 4.5) low.push(`${theme}: Schrift auf Akzentfläche`);
    }
    ok(!low.length, low.join('; '));
  });

  await run('Manifest ist gültig und zeigt auf vorhandene Dateien', async () => {
    const m = JSON.parse(await get('manifest.json'));
    ok(m.name && m.start_url && m.display === 'standalone', 'Pflichtfelder');
    for (const i of m.icons) await get(i.src);
  });
}

/* ---- Ausgabe ---- */
await checkFiles();
results.push(...asyncResults);
const failed = results.filter(r => !r.ok);
document.getElementById('out').innerHTML =
  `<h1>${failed.length ? '✗' : '✓'} ${results.length - failed.length}/${results.length} Tests bestanden</h1>` +
  results.map(r => `<p class="${r.ok ? 'ok' : 'bad'}">${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : ' — ' + r.err}</p>`).join('');
window.testResults = { passed: results.length - failed.length, failed };
