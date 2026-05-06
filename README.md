# sparpreis.guru

sparpreis.guru hilft dabei, günstige Bahnverbindungen schneller zu finden. Entweder suchst du den besten Reisetag für eine feste Strecke oder du lässt dir im Urlaubsfinder günstige Ziele ab deinem Startbahnhof anzeigen.

## Features

**Bestpreissuche**

- Preisvergleich für eine Strecke über bis zu 30 ausgewählte Reisetage
- Filter für Wochentage, Abfahrt/Ankunft, Alter, BahnCard, Klasse und Umstiege
- Kalenderansicht mit dem günstigsten gefundenen Preis pro Tag
- Tagesdetails mit Verbindung, Reisedauer, Umstiegen, Buchungslink und Preisverlauf, sofern Daten vorhanden sind
- Streaming-Suche mit laufenden Updates

**Urlaubsfinder**

- sucht mehrere mögliche Ziele ab einem Startbahnhof
- optional mit Rückfahrt und separaten Zeitfiltern für Hin- und Rückfahrt
- Zielauswahl über Presets, Regionen und einzelne Städte
- Ergebnisliste nach Gesamtpreis, Karte mit Preis-Markern und Detailansicht
- per `ENABLE_URLAUBSFINDER=false` deaktivierbar

**Direktverbindungen**

- zeigt alle Ziele, die ab einem Startbahnhof ohne Umstieg erreichbar sind
- Karte mit Startbahnhof, Direktzielen und Verbindungslinien
- Filter für Fernverkehr, Nahverkehr oder alle Direktverbindungen
- Filter für maximale Fahrtdauer und Mindestanzahl direkter Fahrten pro Tag
- Ergebnisdetails mit Fahrten pro Tag, erster/letzter Fahrt, typischer Fahrtdauer und Linien/Zugnamen
- zentrale Datenbasis aus GTFS.de, die von der App automatisch lokal zwischengespeichert und regelmäßig aktualisiert wird

**Betrieb**

- SQLite-Cache für Suchergebnisse, Bahnhofssuche und Preis-Historie
- Rate-Limiting und Abbruch laufender Suchen
- Prometheus-Metriken unter `/api/metrics`
- strukturierte Logs für API, Suche und Metriken

## Installation

**Mit Node.js:**

```bash
git clone https://github.com/XLixl4snSU/sparpreis.guru.git
cd sparpreis.guru
pnpm install
pnpm dev
```

Danach läuft die App auf http://localhost:3000.

Die Seite `/direktverbindungen` nutzt eine vorberechnete Datenbasis. Im Betrieb lädt die App diese automatisch aus dem zentralen, täglich aktualisierten Bestand und speichert sie lokal unter `data/direct-connections.db`. Der lokale Cache wird nach spätestens 12 Stunden beim nächsten Direktverbindungen-Request aktualisiert. Ein neues Docker-Image ist dafür nicht nötig.

Zum lokalen Neubauen oder Aktualisieren der Quelldatei im Repository:

```bash
pnpm build:direct-connections
```

Das Script lädt die freien GTFS.de-Feeds für Fernverkehr und Nahverkehr und schreibt `public/direct-connections.db`. Ein GitHub Actions Workflow aktualisiert diese Quelldatei einmal täglich um 08:00 Uhr CET. Die laufende App holt sich daraus automatisch einen frischen lokalen Cache.

**Mit Docker:**

```bash
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_BASE_URL="http://localhost:3000" \
  -v path/to/local/data:/app/data \
  ghcr.io/xlixl4snsu/sparpreis-guru:latest
```

Das Volume für `/app/data` ist wichtig, wenn Cache, Preis-Historie und Metriken Neustarts überleben sollen. Ohne Volume startet die SQLite-Datenbank nach jedem Container-Neustart leer.

## Konfiguration

```bash
NEXT_PUBLIC_BASE_URL=https://sparpreis.guru
ENABLE_URLAUBSFINDER=true
SHOW_FOOTER=false
```

- `NEXT_PUBLIC_BASE_URL`: öffentliche URL der Installation
- `ENABLE_URLAUBSFINDER`: auf `false` setzen, um den Urlaubsfinder auszublenden
- `SHOW_FOOTER`: `true`, `1` oder `yes` zeigt den Demo-/Kontakt-Footer

## Monitoring

Der Metrics-Endpunkt ist deaktiviert, solange kein API-Key gesetzt ist.

```bash
METRICS_API_KEY=geheim123
ALLOWED_METRICS_IPS=127.0.0.1,10.0.0.0/8
```

Prometheus-Beispiel:

```yaml
scrape_configs:
  - job_name: sparpreis
    metrics_path: /api/metrics
    static_configs:
      - targets: ["localhost:3000"]
    authorization:
      credentials: geheim123
```

## Techstack

- Next.js 16 App Router
- React 19 und TypeScript
- Tailwind CSS und shadcn/ui
- Server-Sent Events für Streaming-Suchen
- Leaflet für Urlaubsfinder- und Direktverbindungen-Karte
- better-sqlite3 für Cache und Historie

## Credits

Basiert auf [bahn.vibe](https://github.com/jschae23/bahn.vibe), ursprünglich inspiriert von einer PHP-Version von hackgrid.

## Lizenz

GPLv3
