# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primäre Nutzer sind preisbewusste Bahnreisende, die bei Reisetag, Reiseziel oder beidem flexibel sind. Sie möchten passende Bahnverbindungen selbst vergleichen, bevor sie eine Buchungsentscheidung treffen.

## Product Purpose

sparpreis.guru macht günstige Bahnreisen über flexible Reisetage und Reiseziele vergleichbar. Erfolg bedeutet, dass Nutzer aus vielen möglichen Tagen, Hin- und Rückfahrtkombinationen oder Zielen schnell eine passende Verbindung erkennen und anschließend beim jeweiligen Anbieter weitergehen können.

## Positioning

Das Produkt verbindet drei Arten der Reiseorientierung in einer Suchhilfe: Preisvergleiche über mehrere Reisetage für feste Strecken, Preisvergleiche über mehrere Ziele bei offenem Reiseziel sowie eine Karte der ohne Umstieg erreichbaren Bahnhöfe. Für Hin- und Rückfahrten werden zulässige Reisetagkombinationen gemeinsam ausgewertet und als Liste und Preismatrix vergleichbar gemacht.

## Operating Context

Die Anwendung wird als responsive Web-App während der Reiseplanung verwendet. Nutzer geben Bahnhöfe, Reisezeiträume und persönliche Tarifparameter ein, grenzen Ergebnisse mit Zeit-, Umstiegs- und Verbindungstypfiltern ein und verfolgen die laufende Suche. Ergebnisse enthalten Preise, Fahrzeiten, Umstiege, Fahrtverläufe und externe Buchungslinks. Suchen können abgebrochen werden; unvollständige Ergebnisse werden entsprechend gekennzeichnet.

Die Direktverbindungssuche dient der Orientierung und zeigt keine Ticketpreise. Sie verwendet vorbereitete GTFS.de-Daten statt Live-Preisabfragen.

## Capabilities and Constraints

- Die Bestpreissuche vergleicht Verbindungen an bis zu 30 ausgewählten Reisetagen und unterstützt einfache Fahrten sowie flexible Hin- und Rückfahrten.
- Der Urlaubsfinder vergleicht ausgewählte Ziele ab einem Startbahnhof, optional mit Rückfahrt, und zeigt Ergebnisse als Liste und Karte.
- Die Direktverbindungssuche zeigt ohne Umstieg erreichbare Ziele und filtert nach Verkehrsmittel, Fahrtdauer und Anzahl täglicher Verbindungen.
- Preisabfragen werden in der Regel live durchgeführt, können aber aus einem zeitlich begrenzten Cache stammen. Preise bleiben bis zur Buchung beim Anbieter unverbindlich.
- sparpreis.guru ist eine Such- und Vergleichshilfe und kein Ticketverkaufssystem.
- Es werden keine personenbezogenen Profile angelegt. Suchdaten dürfen technisch verarbeitet und zeitweise zwischengespeichert werden; aggregierte Bahnhofsauswahlen dürfen die Sortierung von Vorschlägen verbessern.
- Die aktuelle Produktsprache ist Deutsch. Englisch ist als mögliche spätere zusätzliche Sprache offen, aber noch nicht Teil des aktuellen Produkts.

## Brand Commitments

- Der Produktname lautet `sparpreis.guru`; die kanonische Projektquelle ist `https://github.com/sparpreis-guru/sparpreis.guru`.
- Das öffentliche Deployment wird als nicht-kommerzielles Open-Source-Projekt und technische Demonstration geführt.
- Die Sprache ist direkt, sachlich und verständlich. Preise, Aktualität, Abbrüche und unvollständige Ergebnisse werden ohne verbindliche oder verkäuferische Aussagen beschrieben.
- Bestehende Wortmarke, Favicons und App-Icons bleiben Produktassets; visuelle Festlegungen werden nicht in diesem Produktkontext definiert.

## Evidence on Hand

- Die implementierten Produktoberflächen und Abläufe liegen unter `app/`, `components/bestpreissuche/`, `components/urlaubsfinder/`, `components/direktverbindungen/` und `components/search/`.
- Produktbeschreibung und technische Betriebsinformationen stehen in `README.md`; FAQ- und Datenschutzhinweise stehen in `components/layout/faq-popup.tsx` und `components/layout/footer.tsx`.
- Die Wortmarke liegt als Komponente in `components/layout/brand-logo.tsx`; Favicons und App-Icons liegen unter `app/` und `public/`.
- Das Repository steht unter der MIT License in `LICENSE`.
- Es liegen keine bestätigten Testimonials, Kundenlogos, Auszeichnungen oder unabhängigen Leistungsnachweise vor; zukünftige Arbeiten dürfen solche Belege nicht erfinden.

## Product Principles

1. Flexible Reiseoptionen so zusammenführen, dass Nutzer Tage, Kombinationen und Ziele tatsächlich vergleichen können.
2. Preis, Reisequalität und Verfügbarkeit verständlich darstellen, ohne unverbindliche Suchergebnisse als Verkaufsversprechen auszugeben.
3. Laufende, abgebrochene und unvollständige Suchen ehrlich und nachvollziehbar kommunizieren.
4. Nutzer bei der Reiseplanung unterstützen und für die eigentliche Buchung eindeutig zum Anbieter weiterleiten.
5. Ohne personenbezogene Profile auskommen und nur die für Suche, Cache und Produktverbesserung beschriebenen Daten verarbeiten.
