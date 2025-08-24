# 🚂 sparpreis.guru

Finde die günstigsten Bahntickets mit flexibler Datumsauswahl, Zeitfiltern, Echtzeit-Streaming und direkter Buchung bei der Deutschen Bahn.

## Was kann die App?

- Smarte Suche
  - Reisezeitraum und einzelne Wochentage (Mo–So) frei wählbar
  - Abfahrts- und Ankunftszeit, inkl. Nachtzug-Handling
  - Filter: Klasse (1./2.), BahnCard 25/50, schnelle Verbindungen, Direktverbindungen, max. Umstiege, Deutschland-Ticket
- Live-Ergebnisse
  - Ergebnisse streamen in Echtzeit
  - Fortschrittsanzeige inkl. Restzeit
  - Suche jederzeit abbrechbar
- Buchung & Darstellung
  - Direkter DB-Buchungslink mit allen Parametern
  - Interaktiver Monatskalender mit Min/Max/Ø-Preisen
  - Tagesdetails mit allen Verbindungen
- Performance & Robustheit
  - Caching und Rate Limiting um die API der Bahn zu schonen und Limits bereits vorher einzuhalten
  - Multi-Session-fähig

## Schnellstart

### Lokal (Node.js)

Voraussetzungen: Node.js 18+, pnpm (oder yarn)

1. Repository klonen
   git clone https://github.com/XLixl4snSU/sparpreis.guru.git
   cd sparpreis.guru

2. Abhängigkeiten installieren
   pnpm install

3. Dev-Server starten
   pnpm run dev

4. Browser öffnen
   http://localhost:3000

Hinweis: Für lokale Nutzung sind i. d. R. keine ENV-Variablen nötig.

### Docker (ohne pnpm)

Ohne lokale Node/pnpm-Installation starten:

- Neuester Build:
  docker run --rm -p 3000:3000 \
    -e NEXT_PUBLIC_BASE_URL="http://localhost:3000" \
    ghcr.io/xlixl4snsu/sparpreis-guru:latest

Öffne danach http://localhost:3000.

Tipps:
- NEXT_PUBLIC_BASE_URL in Produktion auf deine Domain setzen
- Hinter einem Reverse Proxy ggf. Header/Forwarding korrekt konfigurieren

## Konfiguration (ENV)

Minimal:
- NEXT_PUBLIC_BASE_URL: Öffentliche Basis-URL der App (in Produktion empfohlen)

### Monitoring (Prometheus/Grafana)

Die App stellt ein Prometheus-kompatibles Endpoint bereit (Standard: /api/metrics). Für Betrieb mit Prometheus/Grafana können optionale ENV-Variablen gesetzt werden:

- METRICS_API_KEY=dein_geheimer_key
  (API-Key für Zugriff auf /api/metrics)
- ALLOWED_METRICS_IPS=127.0.0.1,192.168.0.0/16
  (Optional: Kommagetrennte Liste erlaubter IPs/CIDRs für /api/metrics)

Hinweis: Siehe app/api/metrics/* in diesem Repo für Details zu unterstützten Variablen und Zugriffsschutz.

Beispiel Prometheus-Scrape-Config:
- job_name: "sparpreis-guru"
  scrape_interval: 15s
  metrics_path: /api/metrics
  static_configs:
    - targets: ["app:3000"]
  authorization:
    credentials: <METRICS_API_KEY>

Grafana: Prometheus als Datenquelle hinzufügen und Dashboards mit passendem Präfix erstellen.

## Projektstruktur (Kurzüberblick)

- app/
  - api/search-prices/*: Preis-Suche (Streaming, Caching, Rate Limiting, Abbruch)
  - api/search-progress: Fortschritt der laufenden Suche
  - api/metrics: Prometheus-Metriken
  - page.tsx: Startseite
- components/
  - train-search-form.tsx, train-results.tsx, price-calendar.tsx, day-details-modal.tsx
  - ui/*: shadcn/ui Komponenten

## Technik

- Next.js App Router, TypeScript, Tailwind CSS + shadcn/ui
- Streaming-APIs, intelligentes Caching, globales Rate Limiting

## Deployment

- Jede Plattform mit Next.js-Support (bspw. vercel)
- Setze in Produktion mindestens NEXT_PUBLIC_BASE_URL

## Lizenz

GPLv3 – siehe LICENSE.

## Hinweis zum Ursprung

Dieses Projekt ist ein Fork von https://github.com/jschae23/bahn.vibe.

## Dank

- Deutsche Bahn (Daten)
- shadcn/ui
- Next.js Team
- Ursprung: auf Basis einer PHP-Version von hackgrid

Vibed with GitHub Copilot.