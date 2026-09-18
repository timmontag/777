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
- `tools/` — Node-Skripte für Fotoverarbeitung & Verschlüsselung
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

## Sicherheit

- `robots.txt` (Disallow: /) + `<meta name="robots" content="noindex,...">`
- Keine Bankdaten auf der Seite — Spendenlink zeigt ausschließlich auf gemischtetuete.org/spenden
- Der abgeleitete Schlüssel wird nur in `sessionStorage` des Tabs zwischengespeichert, nie das Passwort selbst
