# Tagwerk

Minimalistische PWA für Fasten, Schlaf, Training und Gewicht. Läuft ohne Build-Schritt und ohne Abhängigkeiten.

## Aufbau

| Datei | Zweck |
|---|---|
| `js/merge.js` | Zusammenführen zweier Datenstände (Geräte-Sync, Import) |
| `js/logic.js` | Formatierung, Statistik, Übungen, Progressionsvorschläge |
| `js/drift.js` | Schlafverschiebung (Non-24): Zykluslänge, Drift pro Tag, Vorhersage |
| `js/summary.js` | Markdown-Zusammenfassung für Claude (`zusammenfassung.md` im Gist) |
| `js/store.js` | Datenstand im Browser, Speichern, Lösch-Markierungen |
| `js/sync.js` | Sync über geheimes GitHub-Gist, Export/Import |
| `js/fast.js`, `sleep.js`, `train.js`, `weight.js` | die vier Bereiche |
| `js/ui.js` | DOM-Helfer und Diagramme |
| `sw.js` | Offline-Cache – bei jeder Veröffentlichung `VERSION` erhöhen |

## Tests

`test/index.html` über einen lokalen Server im Browser öffnen:

```
python3 -m http.server 8765
```

Dann `http://localhost:8765/test/` aufrufen.

## Datenformat (`fastentracker.json`)

Zeiten in Unix-Millisekunden. `history` = abgeschlossene Fastenzeiten, `sleep` = Nächte (`bed`, `wake`), `weight` (`t`, `kg`), `train` (`t`, `ex`, `reps`, `kg`, optional `n` = Notiz; bei `neck` sind `reps` Sekunden). `deleted` enthält Lösch-Markierungen für den Sync.
