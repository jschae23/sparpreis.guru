# Datenbank und Wartung

Die Anwendung speichert Suchdaten standardmäßig in `data/connection-cache.db`. Mit `DATABASE_PATH` kann ein anderer Pfad festgelegt werden. Die separat heruntergeladene `data/direct-connections.db` gehört nicht zu den folgenden Wartungsbefehlen.

## Datenbereiche

| Bereich | Tabellen | Inhalt | Aufbewahrung |
| --- | --- | --- | --- |
| Verbindungscache | `connection_cache` | Komprimierte Antworten bereits ausgeführter Verbindungssuchen | 90 Tage; nach 60 Minuten gelten Treffer als nicht mehr frisch |
| Stationssuche | `station_search_cache` | Ergebnisse der Bahnhofssuche je Suchbegriff | 7 Tage |
| Stationsnutzung | `station_search_usage` | Klickzahlen zur Sortierung bevorzugter Bahnhofstreffer | 180 Tage |
| Preishistorie | `price_history_context`, `price_history_journey`, `price_history_observation` | Beobachtete Preise je Suchkontext und Verbindung | Beobachtungen 90 Tage; vergangene Reisetage werden zusätzlich automatisch entfernt |

Die Stationssuche berücksichtigt die Aufbewahrungszeit bereits beim Lesen. Beim Aktualisieren eines Suchbegriffs wird dessen bisherige Ergebnismenge vollständig ersetzt. Die Klicksortierung liegt getrennt davon und bleibt dabei erhalten.

## Schema und Migrationen

Das Schema ist über `PRAGMA user_version` versioniert. Nummerierte Migrationen liegen unter `lib/database/migrations`; `lib/database/database-schema.json` enthält die aktuell unterstützte Version. `schema_migrations` protokolliert die angewendeten Migrationen.

Inkompatible Änderungen am Datenbankformat benötigen immer eine neue, fortlaufende Datenbankversion und eine Migration. Vorhandene Migrationen werden nachträglich nicht verändert. Beim Anwendungsstart werden ausstehende Migrationen automatisch ausgeführt; Migrationen mit entsprechendem Risiko erzeugen vorher ein konsistentes Backup.

`predev`, `prestart` und der Docker-Entrypoint verwenden dafür `database:prepare`. Dieser Vorbereitungsschritt führt zuerst die verpflichtende Migration aus und bereinigt danach abgelaufene Daten, bevor der Server Anfragen annimmt. Ein Migrationsfehler verhindert den Start. Ein Fehler bei der anschließenden Bereinigung wird protokolliert, blockiert den Serverstart aber nicht: Pruning ist eine Wartungsoperation, und eine fehlgeschlagene Transaktion lässt die vorhandenen Daten unverändert.

```powershell
corepack pnpm database:prepare
```

Das Startup-Pruning ist nicht vom ersten Aufruf einer Suchroute abhängig. Bei lang laufenden Servern werden die Aufbewahrungsregeln zusätzlich alle sechs Stunden angewendet; vergangene Reisetage werden weiterhin täglich bereinigt.

```powershell
corepack pnpm database:migrate
```

Ein abweichender Pfad gilt für alle Befehle:

```powershell
$env:DATABASE_PATH = 'D:\sparpreis-guru\connection-cache.db'
corepack pnpm database:stats
```

## Statistiken und Integritätsprüfung

`database:stats` arbeitet nur lesend. Der Befehl zeigt unter anderem Schema-Version, Datei- und WAL-Größe, freie SQLite-Seiten, Zeilenzahlen, Zeiträume sowie die durch die Aufbewahrungsregeln abgelaufenen Einträge.

```powershell
corepack pnpm database:stats
```

`database:check` führt eine vollständige SQLite-Integritätsprüfung und eine Fremdschlüsselprüfung aus.

```powershell
corepack pnpm database:check
```

## Abgelaufene Daten bereinigen

`database:prune` entfernt Daten, deren jeweilige Aufbewahrungszeit abgelaufen ist. Dazu gehören auch Verbindungscaches und Preishistorien für Reisetage vor dem aktuellen Datum in `Europe/Berlin`. Verwaiste Preishistorien-Verbindungen und -Kontexte werden anschließend ebenfalls entfernt. Mit `CLEANUP_PAST_CONNECTIONS=false` bleibt die Bereinigung vergangener Reisetage deaktiviert; die zeitbasierten Aufbewahrungsfristen gelten weiterhin.

Ohne `--yes` zeigt der Befehl nur eine Vorschau und beendet sich mit Exit-Code `2`:

```powershell
corepack pnpm database:prune
```

Ein ausdrücklich angeforderter Dry-Run verändert ebenfalls nichts, gilt aber mit Exit-Code `0` als erfolgreich:

```powershell
corepack pnpm database:prune --dry-run
```

Erst `--yes` führt die Bereinigung aus:

```powershell
corepack pnpm database:prune --yes
```

## Datenbereiche gezielt leeren

`database:clear` verlangt genau einen Scope. Es gibt absichtlich keinen pauschalen `all`-Scope.

| Scope | Gelöschte Daten | Bewusst nicht betroffen |
| --- | --- | --- |
| `station-search` | Gecachte Ergebnisse der Bahnhofssuche | Erlernte Klicksortierung |
| `station-usage` | Klickzahlen und bevorzugte Bahnhofstreffer | Gecachte Bahnhofsergebnisse |
| `connections` | Komprimierte Verbindungssuchen | Preishistorie und Stationsdaten |
| `price-history` | Kontexte, Verbindungen und Beobachtungen der Preishistorie | Verbindungscache und Stationsdaten |

Vorschau:

```powershell
corepack pnpm database:clear --scope=station-search
```

Expliziter Dry-Run:

```powershell
corepack pnpm database:clear --scope=station-search --dry-run
```

Ausführen:

```powershell
corepack pnpm database:clear --scope=station-search --yes
```

Für `connections` entstehen nach dem Leeren wieder echte Anfragen an die Bahn-Schnittstelle. `price-history` löscht fachliche Verlaufsdaten und sollte nur bewusst verwendet werden. `direct-connections.db`, `schema_migrations` und unbekannte Tabellen werden durch keinen Scope verändert.

## Sicherheitsverhalten

- `--yes` und `--dry-run` können nicht gemeinsam verwendet werden.
- Vor jeder Änderung werden Datenbankpfad, Kommando, Scope und betroffene Zeilen ausgegeben.
- Änderungen laufen in einer SQLite-Transaktion mit aktivierten Fremdschlüsseln.
- Nach einer Änderung werden die tatsächlich entfernten Zeilen und das Ergebnis der Fremdschlüsselprüfung ausgegeben.
- Bei einem unerwarteten Schema bricht die Wartung ab und verlangt zuerst eine Migration.
- Bei Fehlern endet der Befehl mit Exit-Code `1`.
- Der automatische Vorbereitungsschritt ruft das Pruning intern ausdrücklich mit `--yes` auf. Nur dieser Startpfad behandelt einen Pruning-Fehler als Warnung und setzt den Serverstart fort.

Die Schreibbefehle funktionieren mit SQLite-WAL, sollten für eindeutig reproduzierbare Ergebnisse aber möglichst bei angehaltener Anwendung oder in einem Wartungsfenster laufen. Eine aktive Anwendung kann geleerte Caches unmittelbar wieder befüllen.

`DELETE` gibt SQLite-Seiten zur Wiederverwendung frei, verkleinert die Datenbankdatei aber nicht zwingend sofort. Ein manuelles `VACUUM` gehört nicht zu diesen Befehlen und sollte nur offline, nach einem konsistenten Backup und einer Integritätsprüfung ausgeführt werden.

## Docker

Im Produktions-Image steht das Wartungsskript direkt zur Verfügung. Da der schlanke Runtime-Container keinen pnpm-Wrapper benötigt, werden Befehle dort mit Node ausgeführt:

```bash
docker exec <container> node /app/scripts/database-maintenance.cjs stats
docker exec <container> node /app/scripts/database-maintenance.cjs clear --scope=station-search --dry-run
docker exec <container> node /app/scripts/database-maintenance.cjs clear --scope=station-search --yes
```

Der konfigurierte `/app/data`-Mount und `DATABASE_PATH` gelten auch für diese Aufrufe.
