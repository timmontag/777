# 777 — Great World Race 2026 Renn-Tagebuch

Statische, passwortgeschützte Single-Page-Site für 777.timmontag.com (GitHub Pages, Branch `main`, root).

Alle Tagebuchinhalte (Texte, Fotos) liegen ausschließlich verschlüsselt im Repo
(`assets/data/content.enc.json`, `assets/data/photos/*.enc`) und werden erst im
Browser per WebCrypto (PBKDF2 → AES-GCM) mit einem Passwort entschlüsselt.
Klartext-Quellen und Rohfotos werden **nie** committet (siehe `.gitignore`).

## Struktur

- `index.html`, `assets/css`, `assets/js` — die Site selbst
- `assets/data/crypto-meta.json` — Salt/Iterationen (unkritisch, öffentlich)
- `assets/data/content.enc.json` — verschlüsselter Inhalt
- `assets/data/photos/*.enc` — verschlüsselte Fotos
- `assets/js/world-geo.js` — generierte SVG-Pfade der Weltkarte (nicht von Hand bearbeiten)
- `tools/` — Node-Skripte für Fotoverarbeitung, Verschlüsselung & Kartenbau
- `tools/content.source.example.json` — Schema-Dokumentation (Fantasiewerte)
- `raw/`, `tools/work/` — Rohmaterial & Klartext-Arbeitsdateien, gitignored

## Content-Workflow

1. Rohfotos nach `raw/` legen.
2. `cd tools && npm run process-photos` — EXIF/GPS entfernen, auf max. 2048px verkleinern, als WebP speichern (`tools/work/photos-processed/`).
3. `tools/work/content.source.json` bearbeiten (Texte, Foto-Referenzen inkl. Alt-Text, Stats, Status/Ampel).
4. `GWR_PASSWORD="..." npm run encrypt` — erzeugt/aktualisiert `assets/data/content.enc.json` und `assets/data/photos/*.enc`.
5. Nur die Dateien unter `assets/data/` committen und pushen.

Um bestehende Inhalte weiterzubearbeiten: `GWR_PASSWORD="..." npm run decrypt`
entschlüsselt zurück nach `tools/work/` (gitignored).

## Weltkarte

`cd tools && npm run build-worldmap` erzeugt `assets/js/world-geo.js` aus
Natural-Earth-Daten (Public Domain, via `world-atlas`, Auflösung 110m) in
Natural-Earth-1-Projektion. Die Projektionsparameter werden mitexportiert,
damit `assets/js/map.js` die Etappenstädte zur Laufzeit exakt deckungsgleich
auf die Kontinent-Pfade legt. Nur nötig, wenn sich Kartengröße oder
Detailgrad ändern sollen.

Die Position einer Etappe auf der Karte kommt aus `lon`/`lat` im Content,
die Platzierung der Beschriftung aus `labelPos` (`top`, `bottom`, `left`, `right`).

## Aufbau eines Tages

Jeder Tag (`prerace` sowie jede Etappe in `stages`) hat drei Rubriken unter
`sections`:

| Rubrik | Inhalt |
| --- | --- |
| `sport` | Sport & Körpergefühl — `summary` als Kurzzusammenfassung, optionaler `status` (`green`/`yellow`/`red`) als Ampelpunkt, die Garmin-Kennzahlen aus `stats` und der ausklappbare Text |
| `reise` | Reise & Logistik — Kurzüberschrift plus ausklappbarer Text |
| `menschen` | Menschen & Begegnungen — Kurzüberschrift plus ausklappbarer Text |
| `fotos` | Fotostrecke des Tages — ohne `summary` erscheint automatisch die Anzahl der Fotos |

Jede Rubrik kennt `summary` (immer sichtbar), `paragraphs` (ausklappbar) und
`photos`. Rubriken ohne Inhalt erscheinen ausgegraut mit „folgt". `prerace` ist
der Auftakt-Abschnitt in Kapstadt vor der ersten Etappe.

Über der Karte steht der Fortschrittsbalken: sieben Segmente, eingefärbt nach
`status` der Etappe (`upcoming`/`active`/`done`), dazu gelaufene Etappen und
Kilometer (Etappen mit `status: "done"` × 42,195 km). Ein Klick auf ein Segment
springt zur jeweiligen Etappe.

## Sicherheit

- `robots.txt` (Disallow: /) + `<meta name="robots" content="noindex,...">`
- Keine Bankdaten auf der Seite — Spendenlink zeigt ausschließlich auf gemischtetuete.org/spenden
- Wer das Passwort einmal eingegeben hat, bleibt auf diesem Gerät sieben Tage
  angemeldet: im `localStorage` liegt dafür der abgeleitete Schlüssel (nie das
  Passwort), die Frist verlängert sich bei jedem Besuch. Nach Ablauf oder bei
  einem Passwortwechsel wird wieder gefragt; ein anderes Gerät muss das Passwort
  immer erst eingeben.
