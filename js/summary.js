// Kompakte Markdown-Zusammenfassung, die beim Sync als zusammenfassung.md ins Gist geschrieben wird (für Claude).
import { H, rangeTitle, plural, num, kgNum, fmtDate, fmtShort, fmtFull, fmtHM, avg, avgClock, movingAvg, rangeStart, EXS, topSet, byDay } from './logic.js';

const sign = v => (v > 0 ? '+' : v < 0 ? '−' : '±') + num(Math.abs(v));

function block(s, now, days, withNotes) {
  const from = rangeStart(now, days), L = [];
  L.push(`## ${rangeTitle(days)} (${fmtFull(from)} – ${fmtFull(now)})`, '');

  const f = (s.history || []).filter(x => x.end >= from);
  if (f.length) {
    const d = f.map(x => (x.end - x.start) / H);
    L.push(`- **Fasten:** ${f.length} abgeschlossen, ${f.filter(x => x.reached).length} mit Ziel erreicht, Ø ${num(avg(d))} h, längstes ${num(Math.max(...d))} h`);
  } else L.push('- **Fasten:** keine abgeschlossenen Einträge');

  const n = (s.sleep || []).filter(x => x.wake >= from);
  if (n.length) {
    const d = n.map(x => x.wake - x.bed);
    L.push(`- **Schlaf:** ${plural(n.length, 'Nacht', 'Nächte')}, Ø ${fmtHM(avg(d))} h, Ø ins Bett ${avgClock(n.map(x => x.bed))}, Ø aufgestanden ${avgClock(n.map(x => x.wake))}, kürzeste ${fmtHM(Math.min(...d))} h, längste ${fmtHM(Math.max(...d))} h`);
  } else L.push('- **Schlaf:** keine Einträge');

  const all = (s.weight || []).map(x => ({ t: x.t, v: x.kg }));
  const trend = movingAvg(all);
  const inR = all.filter(p => p.t >= from);
  if (inR.length) {
    const tIn = trend.filter(p => p.t >= from), before = trend.filter(p => p.t < from).pop();
    const base = before || tIn[0], last = tIn[tIn.length - 1];
    L.push(`- **Gewicht:** ${plural(inR.length, 'Messung', 'Messungen')}, zuletzt ${num(inR[inR.length - 1].v)} kg, 7-Tage-Trend ${num(last.v)} kg (${sign(last.v - base.v)} kg im Zeitraum)`);
  } else L.push('- **Gewicht:** keine Messungen');

  const tr = (s.train || []).filter(x => x.t >= from);
  if (tr.length) {
    L.push('', '| Übung | Tage | Sätze | Bestes Set | Summe |', '|---|---|---|---|---|');
    for (const ex of EXS) {
      const sets = tr.filter(x => x.ex === ex.id);
      if (!sets.length) continue;
      const b = topSet(sets);
      L.push(`| ${ex.name} | ${byDay(sets).length} | ${sets.length} | ${b.reps} ${ex.unit}${b.kg > 0 ? ` · ${kgNum(b.kg)} kg` : ''} | ${sets.reduce((a, x) => a + x.reps, 0)} ${ex.unit} |`);
    }
  } else L.push('- **Training:** keine Sätze');

  if (withNotes) {
    const notes = tr.filter(x => x.n);
    if (notes.length) {
      L.push('', '**Notizen:**');
      for (const x of notes) L.push(`- ${fmtShort(x.t)} ${EXS.find(e => e.id === x.ex)?.name || x.ex}: ${x.n}`);
    }
  }
  L.push('');
  return L;
}

export function buildSummary(s, now = Date.now()) {
  const L = ['# Tagwerk – Zusammenfassung', '', `Stand: ${fmtDate(now)}`, ''];
  if (s.current) L.push(`- **Fasten läuft** seit ${fmtDate(s.current.start)}: ${num((now - s.current.start) / H)} h von ${s.current.goalH} h`);
  if (s.sleepNow) L.push(`- **Schläft** seit ${fmtDate(s.sleepNow)}`);
  if (s.current || s.sleepNow) L.push('');
  L.push(...block(s, now, 7, true), ...block(s, now, 30, false), ...block(s, now, 365, false));
  L.push('---', 'Rohdaten: fastentracker.json · Zeiten als Unix-ms · Training: `reps` = Wiederholungen, bei Neck Bridge Sekunden; `kg` = Zusatzgewicht; `n` = Notiz');
  return L.join('\n') + '\n';
}
