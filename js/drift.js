// Schlafverschiebung (Non-24): schätzt aus den eingetragenen Nächten die Zykluslänge, die tägliche Verschiebung
// und sagt die nächsten Schlaffenster voraus. Rein funktional, ohne Browser-APIs; Zeiten in Unix-Millisekunden.
//
// Idee: Der Hauptschlaf Nr. k liegt bei  Mitte(k) ≈ a + τ·k  (τ = Zykluslänge). Für 24-h-Menschen ist τ = 24 h,
// bei Non-24 meist 24,2–25 h. Weil nur absolute Zeitpunkte verwendet werden, stören weder Sommerzeit noch
// Mitternachtsübergänge, und fehlende Tage werden über die gerundete Zykluszahl überbrückt.

const H = 3600000;

const median = a => {
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Haupt-Schlafepisoden: eng beieinanderliegende Einträge (z. B. geteilter Schlaf) werden zusammengefasst,
// sehr kurze (Nickerchen) ausgelassen.
export function mainSleeps(sleep, { minHours = 3, mergeGapHours = 3 } = {}) {
  const list = [...sleep].filter(x => x.wake > x.bed).sort((a, b) => a.bed - b.bed);
  const merged = [];
  for (const x of list) {
    const last = merged[merged.length - 1];
    if (last && x.bed - last.wake < mergeGapHours * H) last.wake = Math.max(last.wake, x.wake);
    else merged.push({ bed: x.bed, wake: x.wake });
  }
  const long = merged.filter(x => x.wake - x.bed >= minHours * H).map(x => ({ ...x, mid: (x.bed + x.wake) / 2 }));
  // Pro Zyklus zählt nur ein Hauptschlaf: liegt eine zweite lange Episode weniger als 16 h daneben
  // (z. B. ein langes Nachmittagsschläfchen), gewinnt die längere.
  const main = [];
  for (const e of long) {
    const prev = main[main.length - 1];
    if (prev && e.mid - prev.mid < 16 * H) { if (e.wake - e.bed > prev.wake - prev.bed) main[main.length - 1] = e; }
    else main.push(e);
  }
  return main;
}

// Zykluszahl je Episode: Abstand zur vorigen Episode in Vielfachen der Zykluslänge (mindestens 1)
function cycleIndex(eps, tauMs) {
  let k = 0;
  return eps.map((e, i) => (i === 0 ? 0 : (k += Math.max(1, Math.round((e.mid - eps[i - 1].mid) / tauMs)))));
}

// Theil–Sen: Median aller Paarsteigungen – unempfindlich gegen einzelne Ausreißer
function theilSen(ks, ts) {
  const slopes = [];
  for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) if (ks[j] !== ks[i]) slopes.push((ts[j] - ts[i]) / (ks[j] - ks[i]));
  if (!slopes.length) return null;
  const tau = median(slopes);
  return { tau, a: median(ts.map((t, i) => t - tau * ks[i])) };
}

/**
 * @param sleep  Liste {bed, wake}
 * @param opts   days: Betrachtungszeitraum (Standard 28), now, minNights (Standard 5)
 * @returns {ok, reason?, n, spanDays, periodH, driftMin, spreadMin, rotationDays, kind, medianDur, next[]}
 */
export function analyzeDrift(sleep, { now = Date.now(), days = 28, minNights = 5 } = {}) {
  const from = now - days * 24 * H;
  const all = mainSleeps(sleep).filter(e => e.wake >= from && e.wake <= now + H);
  const eps = all.slice(-120);
  if (eps.length < minNights) return { ok: false, reason: `Mindestens ${minNights} Nächte nötig (bisher ${eps.length})`, n: eps.length };

  // Startwert: Median der plausiblen Abstände zwischen aufeinanderfolgenden Mitten
  const diffs = eps.slice(1).map((e, i) => e.mid - eps[i].mid).filter(d => d >= 18 * H && d <= 34 * H);
  const fitSeries = (list, tau) => {                 // Zykluszahlen und Zykluslänge schrittweise verfeinern
    let fit = null, ks = [];
    for (let pass = 0; pass < 3; pass++) {
      ks = cycleIndex(list, tau);
      fit = theilSen(ks, list.map(e => e.mid));
      if (!fit) break;
      tau = fit.tau;
    }
    return { fit, ks };
  };
  const spreadOf = (list, fit, ks) => {
    const r = list.map((e, i) => e.mid - (fit.a + fit.tau * ks[i])), m = median(r);
    return { r, m, spread: 1.4826 * median(r.map(x => Math.abs(x - m))) };
  };
  let eps2 = eps, { fit, ks } = fitSeries(eps2, diffs.length ? median(diffs) : 24.5 * H);
  if (fit) {
    // Ausreißer (z. B. falsch zugeordnete oder ungewöhnliche Nächte) entfernen und neu anpassen – höchstens 20 %
    const { r, m, spread } = spreadOf(eps2, fit, ks), limit = Math.max(3.5 * spread, 3 * H);
    const keep = eps2.filter((_, i) => Math.abs(r[i] - m) <= limit);
    if (keep.length < eps2.length && keep.length >= Math.max(minNights, eps2.length * 0.8)) {
      eps2 = keep; ({ fit, ks } = fitSeries(eps2, fit.tau));
    }
  }
  const spanDays = (eps2[eps2.length - 1].mid - eps2[0].mid) / (24 * H);
  if (!fit || ks[ks.length - 1] < minNights - 1 || spanDays < 4) return { ok: false, reason: 'Zeitraum zu kurz für eine Schätzung', n: eps2.length };

  const spread = spreadOf(eps2, fit, ks).spread;
  const periodH = fit.tau / H, driftH = periodH - 24;
  const medianDur = median(eps2.slice(-7).map(e => e.wake - e.bed));

  // Vorhersage: die nächsten Hauptschlaf-Zyklen auf der angepassten Geraden
  const kLast = ks[ks.length - 1], next = [];
  for (let step = 1; next.length < 7 && step < 40; step++) {
    const mid = fit.a + fit.tau * (kLast + step);
    if (mid + medianDur / 2 <= now) continue;       // liegt schon in der Vergangenheit
    next.push({ bed: mid - medianDur / 2, wake: mid + medianDur / 2, mid });
  }
  const kind = Math.abs(driftH * 60) < 10 ? 'stabil' : driftH > 0 ? 'später' : 'früher';

  return {
    ok: true, n: eps2.length, spanDays, periodH, driftMin: driftH * 60, spreadMin: spread / 60000,
    rotationDays: Math.abs(driftH) >= 0.05 ? 24 / Math.abs(driftH) : null,
    kind, medianDur, next,
  };
}
