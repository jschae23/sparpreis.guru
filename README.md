# sparpreis.guru

sparpreis.guru hilft dabei, günstige Bahnreisen schneller zu finden. Die App verbindet eine flexible Bestpreissuche für feste Strecken mit einem Urlaubsfinder für offene Ziele und einer Übersicht aller direkt erreichbaren Bahnhöfe.

## Funktionen

### Bestpreissuche

#### Einfache Fahrt

- Preisvergleich aller verfügbaren Verbindungen über bis zu 30 ausgewählte Reisetage
- Auswahl passender Wochentage und Reisezeiten
- Filter für Alter, BahnCard, Klasse, Umstiege und schnelle Verbindungen
- Kalenderansicht mit dem günstigsten gefundenen Preis pro Tag
- Tagesdetails mit Verbindungen, Reisedauer, Umstiegen, Verkehrsmitteln, Buchungslink und Preisverlauf, sofern Daten vorhanden sind

#### Hin- und Rückfahrt – erweiterter Modus

Der erweiterte Modus kombiniert günstige Hin- und Rückfahrten, ohne dass vorab ein fester Rückreisetag gewählt werden muss.

- Bis zu 30 ausgewählte Reisetage je Fahrtrichtung mit getrennten Wochen- und Zeitfiltern
- Flexible Aufenthaltsdauer über minimale und maximale Anzahl an Nächten
- Preismatrix und sortierbare Liste aller gültigen Reisekombinationen
- Sortierung der Kombinationen nach Hinfahrt, Rückfahrt, Nächten oder Gesamtpreis; standardmäßig nach dem günstigsten Gesamtpreis
- Kennzeichnung von Bestpreis, Alternativen, kurzer Gesamtreisezeit und reinen Direktverbindungen
- Ausklappbare Fahrtverläufe und separate Buchungslinks für Hin- und Rückfahrt
- Direkte Auswahl über die Datumsnavigation mit Fokus auf das zugehörige Ergebnis

Die Suche streamt neue Ergebnisse bereits während der Verarbeitung in die Oberfläche. Ein Status zeigt Wartezeit und Fortschritt an; laufende Suchen können abgebrochen werden. Bei einer vorzeitig beendeten Suche kennzeichnet die App das Ergebnis als unvollständig.

### Klassikmodus

Der Klassikmodus unter `/klassik` ist eine Hommage der kompakten Kalenderansicht des ursprünglichen [bahn.guru-Projekts](https://github.com/juliuste/bahn.guru). Vielen Dank an die Mitwirkenden des Originals für die Inspiration für sparpreis.guru.

- Suche über ein bis vier Wochen
- Filter für Abfahrts- und Ankunftszeit, Alter, BahnCard, Klasse und Umstiege
- Laufend aktualisierter Preiskalender
- Tagesdetails mit den gefundenen Verbindungen
- Abbruch einer laufenden Suche direkt in der Oberfläche

### Urlaubsfinder

- Findet günstige Reiseziele ab einem frei wählbaren Startbahnhof
- Optionale Rückfahrt mit eigenen Zeitfiltern für beide Fahrtrichtungen
- Zielauswahl über verständliche Presets, Regionen und einzelne Städte
- Parallele, gestreamte Suche über mehrere Ziele
- Nach Gesamtpreis geordnete Ergebnisliste
- Karte mit Preis-Markern und Detailansicht für jedes Ziel
- Anzeige von Suchfortschritt und voraussichtlicher Wartezeit
- Per `ENABLE_URLAUBSFINDER=false` vollständig deaktivierbar

### Direktverbindungen

- Zeigt alle Ziele, die ab einem Startbahnhof ohne Umstieg erreichbar sind
- Karte mit Startbahnhof, Direktzielen und Verbindungslinien
- Filter für Fernverkehr, Nahverkehr oder alle Direktverbindungen
- Filter für maximale Fahrtdauer und Mindestanzahl direkter Fahrten pro Tag
- Ergebnisdetails mit Fahrten pro Tag, erster und letzter Fahrt, typischer Fahrtdauer sowie Linien beziehungsweise Zugnamen
- Zentrale Datenbasis aus den freien GTFS.de-Feeds für Fern- und Nahverkehr
- Automatischer lokaler Cache mit sichtbarem Aktualisierungsstatus, falls die Datenbasis fehlt oder veraltet ist

### Betrieb

- SQLite-Cache für Suchergebnisse, Bahnhofssuche und Preis-Historie
- Faire Round-Robin-Warteschlange für gleichzeitig laufende Suchen
- Adaptives Rate-Limiting mit Wiederholungsversuchen bei HTTP 429
- Automatischer Abbruch nicht mehr benötigter Requests
- Prometheus-Metriken unter `/api/metrics`
- Strukturierte Logs für API, Suche und Metriken

## Wichtige Seiten

| Pfad | Zweck |
| --- | --- |
| `/` | Bestpreissuche mit einfacher Fahrt oder flexibler Rückfahrt |
| `/klassik` | Reduzierte Bestpreissuche im bahn.guru-Stil |
| `/urlaubsfinder` | Günstige Ziele ab einem Startbahnhof entdecken |
| `/direktverbindungen` | Ohne Umstieg erreichbare Ziele erkunden |
| `/api/metrics` | Geschützter Prometheus-Endpunkt |

## Installation

Vorausgesetzt werden Node.js `>= 22.19.0` und pnpm `11.20.0`.

```bash
git clone https://github.com/XLixl4snSU/sparpreis.guru.git
cd sparpreis.guru
pnpm install
pnpm dev
```

Danach läuft die App unter [http://localhost:3000](http://localhost:3000).

### Daten für Direktverbindungen

Die Seite `/direktverbindungen` nutzt eine vorberechnete Datenbasis. Im Betrieb lädt die App diese automatisch aus dem zentralen, täglich aktualisierten Bestand und speichert sie lokal unter `data/direct-connections.db`. Der lokale Cache wird nach spätestens zwölf Stunden beim nächsten Direktverbindungen-Request aktualisiert.

Zum lokalen Neubauen oder Aktualisieren der Quelldatei im Repository wird zusätzlich Python 3 benötigt:

```bash
pnpm build:direct-connections
```

Das Script lädt die freien GTFS.de-Feeds für Fernverkehr und Nahverkehr und schreibt `public/direct-connections.db`. Der zugehörige GitHub-Actions-Workflow aktualisiert diese Quelldatei täglich. Die laufende App bezieht daraus automatisch einen frischen lokalen Cache.

### Docker

```bash
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_BASE_URL="http://localhost:3000" \
  -v path/to/local/data:/app/data \
  ghcr.io/xlixl4snsu/sparpreis-guru:latest
```

Das Volume für `/app/data` ist wichtig, wenn Cache, Preis-Historie und Metriken Neustarts überleben sollen. Ohne Volume startet die SQLite-Datenbank nach jedem Container-Neustart leer.

## Konfiguration

Die wichtigsten Umgebungsvariablen sind:

| Variable | Standard | Beschreibung |
| --- | --- | --- |
| `NEXT_PUBLIC_BASE_URL` | – | Öffentliche URL der Installation |
| `ENABLE_URLAUBSFINDER` | `true` | Mit `false` wird der Urlaubsfinder ausgeblendet und seine API deaktiviert |
| `SHOW_FOOTER` | `false` | `true`, `1` oder `yes` zeigt den Demo- und Kontakt-Footer |
| `CLEANUP_PAST_CONNECTIONS` | `true` | Entfernt regelmäßig abgelaufene Verbindungen aus dem Cache |
| `LOG_LEVEL` | – | Mit `debug` werden zusätzliche strukturierte Debug-Logs ausgegeben |

Beispiel:

```bash
NEXT_PUBLIC_BASE_URL=https://sparpreis.guru
ENABLE_URLAUBSFINDER=true
SHOW_FOOTER=false
```

## Monitoring

Der Metrics-Endpunkt ist deaktiviert, solange kein API-Key gesetzt ist.

```bash
METRICS_API_KEY=geheim123
ALLOWED_METRICS_IPS=127.0.0.1,10.0.0.0/8
```

Prometheus-Beispiel:

```yaml
scrape_configs:
  - job_name: sparpreis-guru
    metrics_path: /api/metrics
    authorization:
      type: Bearer
      credentials: geheim123
    static_configs:
      - targets:
          - sparpreis-guru:3000
```

## Techstack

- Next.js 16 App Router, React 19 und TypeScript
- Tailwind CSS und shadcn/ui
- Server-Sent Events für gestreamte Suchergebnisse und Fortschrittsmeldungen
- Leaflet und React Leaflet für Karten
- better-sqlite3 für Cache und Preis-Historie
- Recharts für Preisverläufe

## Credits

Basiert auf [bahn.vibe](https://github.com/jschae23/bahn.vibe), ursprünglich inspiriert von einer PHP-Version von hackgrid. Der Klassikmodus greift die Darstellung von [bahn.guru](https://github.com/juliuste/bahn.guru) auf.
