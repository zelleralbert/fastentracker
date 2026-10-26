// Kompakte Markdown-Zusammenfassung, die beim Sync als zusammenfassung.md ins Gist geschrieben wird (für Claude).
import { analyzeDrift } from './drift.js';
import { H, rangeTitle, plural, num, kgNum, fmtDate, fmtShort, fmtFull, fmtHM, hhmm, avg, avgClock, movingAvg, rangeStart, EXS, topSet, byDay } from './logic.js';

const sign = v => (v > 0 ? '+' : v < 0 ? '−' : '±') + num(Math.abs(v));

function block(s, now, days, withNotes) {
  const from = rangeStart(now, days), L = [];
  L.push(`## ${rangeTitle(days)} (${fmtFull(from)} – ${fmtFull(now)})`, '');

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

// Schlafverschiebung (Non-24) der letzten 28 Tage
function driftBlock(s, now) {
  const r = analyzeDrift(s.sleep || [], { now, days: 28 });
  const L = ['## Schlafverschiebung (Non-24, letzte 28 Tage)', ''];
  if (!r.ok) return [...L, `- ${r.reason}`, ''];
  const d = Math.round(r.driftMin);
  L.push(`- **Verschiebung:** ${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d)} min pro Tag (${r.kind === 'stabil' ? 'stabil, 24-h-Rhythmus' : 'Schlaf wandert ' + r.kind}), Zykluslänge ${num(r.periodH, 2)} h`);
  if (r.rotationDays) L.push(`- **Volle Runde um die Uhr:** etwa alle ${Math.round(r.rotationDays)} Tage`);
  L.push(`- **Grundlage:** ${plural(r.n, 'Nacht', 'Nächte')} über ${Math.round(r.spanDays)} Tage, Streuung ±${Math.round(r.spreadMin)} min, typische Schlafdauer ${fmtHM(r.medianDur)} h`);
  if (r.next.length) L.push(`- **Erwarteter Schlaf:** ${r.next.slice(0, 3).map(n => `${fmtDate(n.bed)} – ${hhmm(n.wake)}`).join('; ')}`);
  return [...L, ''];
}

export function buildSummary(s, now = Date.now()) {
  const L = ['# Tagwerk – Zusammenfassung', '', `Stand: ${fmtDate(now)}`, ''];
  if (s.sleepNow) L.push(`- **Schläft** seit ${fmtDate(s.sleepNow)}`);
  if (s.sleepNow) L.push('');
  L.push(...block(s, now, 7, true), ...block(s, now, 30, false), ...block(s, now, 365, false));
  L.push(...driftBlock(s, now));
  L.push('---', 'Rohdaten: fastentracker.json · Zeiten als Unix-ms · Training: `reps` = Wiederholungen, bei Neck Bridge Sekunden; `kg` = Zusatzgewicht; `n` = Notiz');
  return L.join('\n') + '\n';
}
