---
target: Ist dieser Alle-Tage-Button die beste Lösung oder gibt es etwas Besseres?
total_score: 29
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 0
timestamp: 2026-08-11T19-54-11Z
slug: components-bestpreissuche-train-search-form-tsx
---
Method: dual-agent (A: /root/weekday_design_review · B: /root/weekday_mechanical_review)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 3 | Tageszustände sind klar, der Sammelbutton widerspricht sich im Vollzustand. |
| 2 | Match System / Real World | 4 | Mo–So und „Alle Tage auswählen“ sind unmittelbar verständlich. |
| 3 | User Control and Freedom | 3 | Einzelne Tage und alle Tage lassen sich direkt setzen; der Vollzustand bietet keine eigene Aktion. |
| 4 | Consistency and Standards | 2 | Derselbe Sammelbutton wechselt von Aktion zu deaktivierter Statusanzeige. |
| 5 | Error Prevention | 3 | Native Toggles sind robust, aber zugänglicher Name und sichtbarer Vollzustand widersprechen sich. |
| 6 | Recognition Rather Than Recall | 4 | Alle Tage und ihr Auswahlzustand sind sichtbar. |
| 7 | Flexibility and Efficiency | 3 | Die Bulk-Aktion beschleunigt das Zurücksetzen auf alle Tage. |
| 8 | Aesthetic and Minimalist Design | 2 | Der dauerhafte achte Button dupliziert im Standardzustand bereits sichtbare Information. |
| 9 | Error Recovery | 3 | Teilauswahl lässt sich mit einer Aktion zurücksetzen; spezielle Fehlerhilfe ist hier kaum nötig. |
| 10 | Help and Documentation | 2 | Keine kontextuelle Erklärung, wobei das Grundmuster weitgehend selbsterklärend ist. |
| **Total** | | **29/40** | **Gut, mit klarer Optimierungschance** |

## Design Specificity Verdict

**LLM assessment:** Die direkte Tagesauswahl passt sehr gut zur flexiblen Bahnpreissuche und zum „digitalen Fahrplanblatt“. Der dauerhaft sichtbare Sammelbutton ist dagegen ein generischer Filterleisten-Baustein. Er vermischt eine Bulk-Aktion mit einer deaktivierten Statusanzeige und konkurriert dadurch unnötig mit den fachlich wichtigeren sieben Tageswerten.

**Deterministic scan:** Der Layout-Scan meldete keine Befunde. Die aktuelle Grid-Überlagerung hält die Buttonbreite in beiden Textzuständen stabil, und `flex-wrap` verhindert horizontalen Überlauf. Ein Vollscan gab nur einen rechnerisch unkritischen Farbhinweis aus. Die wesentlichen Probleme sind daher semantisch und kompositorisch, nicht ein vom Detektor erfassbarer Layoutfehler.

**Visual overlays:** Keine Browserprüfung und keine Overlay-Injektion, weil der Nutzer Browsertests ausdrücklich ausgeschlossen hat.

## Overall Impression

Die sieben Tageschips sind der richtige Kern. Die Sammelaktion sollte erhalten bleiben, aber als ruhige kontextuelle Aktion in die Überschriftszeile wandern und im vollständigen Zustand nicht als achter Statusbutton auftreten.

## What's Working

- Die bekannte Reihenfolge Mo–So ist sofort verständlich und passt zur Aufgabe.
- Auswahl wird redundant über Farbe, Häkchen und `aria-pressed` kommuniziert.
- Die Bulk-Aktion „Alle auswählen“ ist für häufige Korrekturen effizient.

## Priority Issues

### [P2] Aktions-/Status-Hybrid

**Why it matters:** Bei Teilauswahl ist der Button eine Aktion; bei vollständiger Auswahl wird er deaktiviert und zeigt „Alle Tage aktiv“. Das dupliziert den Zustand der sieben Chips und erzeugt eine semantisch uneindeutige achte Option. Sein zugänglicher Name bleibt gleichzeitig „Alle … auswählen“.

**Fix:** „Alle auswählen“ als sekundäre Textaktion rechts in der Überschriftszeile zeigen, nur wenn nicht alle Tage gewählt sind. Der vollständige Zustand wird allein durch die sieben ausgewählten Chips kommuniziert.

**Suggested command:** `$impeccable distill`

### [P2] Kleine Touch-Ziele

**Why it matters:** Sammelbutton und Tageschips liegen source-basiert unter 44 px Höhe und sind dadurch mobil weniger komfortabel.

**Fix:** Tageschips auf mindestens 44 px Höhe bringen und ihre kompakte Breite beibehalten.

**Suggested command:** `$impeccable adapt`

### [P2] Abgekürzte zugängliche Tagesnamen

**Why it matters:** Screenreader und Sprachsteuerung erhalten nur „Mo“, „Di“ usw.; ausgeschriebene Namen sind eindeutiger.

**Fix:** Sichtbare Kurzformen behalten, aber vollständige `aria-label`-Werte wie „Montag auswählen“ beziehungsweise „Montag ausgewählt“ ergänzen.

**Suggested command:** `$impeccable harden`

### [P3] Flexible Zeilenkomposition

**Why it matters:** Der aktuelle freie Flex-Umbruch kann den Trenner oder einzelne Tage ungünstig isolieren.

**Fix:** Die Tageschips mobil als stabiles 4+3-Raster und bei ausreichender Breite als Siebenerreihe setzen; die Sammelaktion gehört nicht in dieses Raster.

**Suggested command:** `$impeccable layout`

### [P3] Redundante Gruppensemantik und browserabhängiger Fokus

**Why it matters:** `fieldset`/`legend` plus zusätzliches `role="group"` können doppelte Ansagen erzeugen; ohne expliziten `focus-visible`-Stil hängt die Darstellung vom Browser ab.

**Fix:** Die zusätzliche Gruppensemantik entfernen und einen konsistenten Fokus-Ring ergänzen.

**Suggested command:** `$impeccable harden`

## Persona Red Flags

**Jordan (First-Timer):** Die sieben Tage versteht er sofort. „Alle Tage aktiv“ kann jedoch wie eine achte Auswahloption oder eine nicht verfügbare Funktion wirken.

**Sam (Accessibility):** Native Buttons und `aria-pressed` sind eine gute Basis. Im Vollzustand beschreibt der zugängliche Name des deaktivierten Sammelbuttons aber weiterhin eine Aktion; die Tagesnamen bleiben abgekürzt.

**Casey (Mobile):** Die Tagesfolge ist schnell erfassbar, doch der breite vorgelagerte Button stört das kompakte Raster und die Zielhöhen liegen unter 44 px.

## Minor Observations

- Der Trennstrich zwischen Sammelaktion und Tagen verliert seinen Zweck, sobald die Aktion in die Überschriftszeile wandert.
- Presets wie „Werktage“ und „Wochenende“ wären denkbar, sind ohne Nutzungsdaten aber unnötige zusätzliche Modi.
- Eine Master-Checkbox wäre semantisch nur dann sauber, wenn sie im Vollzustand auch alle Tage abwählen dürfte; das passt hier nicht zur gültigen Suchlogik.

## Questions to Consider

- Soll der Standardzustand überhaupt einen erklärenden Status benötigen, wenn sieben ausgewählte Tageschips ihn bereits vollständig zeigen?
- Ist die häufigste Bulk-Korrektur wirklich „alle“, oder würden Nutzungsdaten später auch „Mo–Fr“ und „Wochenende“ rechtfertigen?
- Kann die Auswahl auf kleinen Breiten als bewusstes Kalender-Raster statt als frei umbrechende Filterleiste auftreten?
