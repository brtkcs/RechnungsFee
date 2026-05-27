# RechnungsFee – Claude-Projektinstruktionen

## Projekt
Open-Source-Buchhaltungssoftware für Freiberufler & Kleinunternehmer (§19 UStG).
**Stack:** FastAPI + SQLAlchemy 2.0 + SQLite (WAL) | React 19 + Vite + TypeScript + Tailwind v4 | Tauri 2

## Wichtige Konventionen
- UI-Texte immer **Du-Ansprache** (nicht Sie)
- Geldbeträge als `NUMERIC(12,2)` – keine floats
- Commits auf Deutsch, Co-Authored-By: Claude Sonnet 4.6
- **Nie `git push`** ohne explizite Nachfrage
- Skripte mit neuer Version: Änderungen nicht einzeln nachfragen

## Dev-Start (lokal)

Zwei Terminals:
```bash
# Terminal 1 – Backend
cd src/backend && .venv/bin/uvicorn main:app --port 8002

# Terminal 2 – Frontend
cd src/frontend && npm run dev
```
Dann Browser: http://localhost:5173

## Ports & Pfade
- Backend: Port **8002**
- Frontend Dev: Port **5173** (Vite) – `cd src/frontend && npm run dev`
- DB: `~/.local/share/RechnungsFee/rechnungsfee.db`
- Uploads: `~/.local/share/RechnungsFee/uploads/`
- Backups: `~/.local/share/RechnungsFee/backups/`

## DB-Schema-Versionierung (`src/backend/main.py`)

`SCHEMA_VERSION = 33` – zentrale Konstante (wird in `main.py` gepflegt).

### Ablauf beim App-Start
```
create_all → _run_migrations() → _migrate_kategorien() → _migrate_signaturen() → _setup_gobd_triggers() → seeds
```

### `_run_migrations()` – Muster
```python
def _run_migrations():
    version = PRAGMA user_version
    if version >= SCHEMA_VERSION:
        return                  # Fast-Path, kein PRAGMA-Overhead

    _backup_datenbank()         # WAL-sicheres Backup vor jeder Migration

    if version < 1:
        # Pro Tabelle 1× PRAGMA table_info, dann Spalten in Loop prüfen
        # Am Ende: PRAGMA user_version = 1 + commit
    if version < 2:
        # PRAGMA user_version = 2 + commit
    # ...
    if version < N:
        # PRAGMA user_version = N + commit
```

### Neue Migration hinzufügen
1. `if version < N:` Block in `_run_migrations()` ergänzen
2. `SCHEMA_VERSION = N` erhöhen
3. Pro Tabelle nur **1×** `PRAGMA table_info` – alle neuen Spalten in einem Loop

### Versionsverlauf (Kurzfassung – Details in main.py)
| Version | Inhalt |
|---------|--------|
| 0→1 | kassenbuch (kunde_id, rechnung_id, externe_belegnr, signatur), rechnungen (bezahlt_betrag, zahlungsstatus, leistungsdatum, ist_entwurf, storniert, ausgegeben), tagesabschluesse (zaehlung_json, signatur), unternehmen (handelsregister_nr/gericht, logo_pfad, mail_*), kategorien.ust_satz_standard, ist_entwurf-Korrektur |
| 1→2 | Formalisierung – bestehende DBs auf Versioning-System heben |
| 2→3 | unternehmen (berufsbezeichnung VARCHAR(100), kammer_mitgliedschaft VARCHAR(200)) |
| 4 | artikel-Tabelle + Seed ART-#### Nummernkreis |
| 5 | UPDATE artikel SET typ='artikel' WHERE typ='eigenleistung' |
| 6 | unternehmen.zahlungshinweis_aktiv |
| 7 | ust_saetze-Tabelle (0%, 7%, 19%) |
| 8 | unternehmen.pdf_vorlage |
| 9 | rechnungen.externe_belegnr |
| 10 | rechnungspositionen.kategorie_id |
| 11 | unternehmen.unterschrift_bild |
| 12 | unternehmen.unterschrift_auf_rechnung |
| 13 | unternehmen.standard_zahlungsziel |
| 14 | unternehmen.qr_zahlung_aktiv |
| 15 | kunden.zugferd_aktiv |
| 16 | kunden.z_hd, lieferanten.z_hd |
| 17 | kassenbuch → journal (Tabellenumbenennung + Trigger-Rename auf protect_journal_*) |
| 18 | nummernkreise: typ='kassenbuch' → 'journal', bezeichnung='Journal' |
| 19 | Unique-Indizes uix_kunden_kundennummer + uix_lieferanten_lieferantennummer (WHERE NOT NULL) |
| 20 | unternehmen (geburtsdatum DATE, bg_nummer VARCHAR(50), jobcenter_name VARCHAR(200)) – Pflichtfelder für Anlage EKS bei Transferleistungen |
| 21 | eks_einstellungen-Tabelle (Singleton id=1): persistente Formularfelder Abschnitt D / F 23–41 / Seite 9 52–58 |
| 22 | konten-Tabelle neu aufgebaut: bank → anbieter, neue Felder kontoart + kennung, IBAN nullable, Partial Unique Index |
| 23 | belege-Tabelle (id, dateiname, original_name, mime_type, dateigroesse, sha256, hochgeladen_am); beleg_id FK in rechnungen + journal |
| 24 | kategorien.aktiv BOOLEAN DEFAULT 1 – Kategorien ein-/ausblenden in Buchungsformularen |
| 25 | Kontonummern SKR03/SKR04 auf DATEV-Kontenrahmen 2026 korrigiert (39 Korrekturen) |
| 26 | EÜR-Zeilennummern auf Anlage EÜR 2025 korrigiert (44 Korrekturen) |
| 27 | kategorien: konto_skr03/04_default + user_modified_skr03/04; journal: konto_skr03/04-Snapshot |
| 28 | journal: konto_ust_skr03/04-Snapshot (USt-Gegenkonto 1776/1771/1575/1570 etc.) |
| 29 | konten: stray `bank`-Spalte bereinigt (Migration 22 ließ sie in manchen DBs zurück, Issue #102) |
| 30 | rechnungen: `leistungsdatum` → `leistung_von` (RENAME COLUMN) + `leistung_bis DATE` neu (Issue #107 Leistungszeitraum) |
| 31 | Skonto: unternehmen (standard_skonto_prozent/tage), kunden (skonto_prozent/tage), rechnungen (skonto_prozent/tage) (Issue #73) |
| 32 | artikel: `kategorie` TEXT → `gruppe` TEXT (RENAME COLUMN) – klarere Bezeichnung als Warengruppe/Servicegruppe |
| 33 | artikel_gruppen-Tabelle (id, typ, name, aktiv); artikel.gruppe TEXT → artikel.gruppe_id FK; bestehende Text-Werte automatisch migriert |

### `_backup_datenbank()`
- `sqlite3.connect().backup()` – WAL-sicher, konsistentes Snapshot
- Ziel: `~/.local/share/RechnungsFee/backups/rechnungsfee_YYYYMMDD_HHMMSS.db`
- Rotation: max. 5 Backups, älteste werden automatisch gelöscht

## App-Versionierung & Release-Prozess

Version kommt aus Git-Tag – **nie manuell** in `package.json` ändern.

### Checkliste vor jedem Release (PFLICHT)

Bevor Tag gesetzt und gepusht wird:

1. **`src/frontend/src/data/changelog.ts`** – neuen Versionsblock ganz oben eintragen  
   (alle `neu` / `verbesserung` / `fix` seit dem letzten Tag)
2. **`docs/ROADMAP.md`** – erledigte Items abhaken, neue Stufen ergänzen
3. **`CLAUDE.md`** – `SCHEMA_VERSION` und Versionstabelle aktuell?
4. Commit dieser Dateien → dann Tag setzen

### Setup-Wizard testen (PFLICHT bei Änderungen an diesen Bereichen)

Wurde in diesem Release etwas an **`konten`**, **`unternehmen`** oder **`kassenbestand`** geändert  
(Schema, API-Endpoint, Pydantic-Schema, Frontend-Formular)?  
→ Setup-Wizard einmal komplett mit **leerer Datenbank** durchlaufen und prüfen, ob Schritt 4 („Einrichtung abschließen") fehlerfrei durchläuft.

Hintergrund: Der Wizard ist der einzige Weg, wie diese drei Tabellen beim Erststart befüllt werden.  
Fehler dort fallen in Tests nicht auf und treffen nur Neu-Installationen (Issue #102).

### Neues Release erstellen
```bash
git tag v0.x.y
git push origin main   # erst Commits pushen!
git push --tags        # dann Tag → löst GitHub Actions aus
```

**Wichtig:** Tag erst pushen nachdem alle Commits auf `origin/main` sind –
sonst findet GitHub Actions die Workflow-Datei nicht.

### GitHub Actions (`.github/workflows/build.yml`)
- Trigger: `push tags v*`
- Matrix: Ubuntu (AppImage) + Windows (MSI/NSIS) + macOS arm64 + macOS x86_64 (DMG, unsigned)
- Sidecar: PyInstaller (Linux/macOS: `build-sidecar.sh`, Windows: `build-sidecar.ps1`)
- Signierung: `TAURI_SIGNING_PRIVATE_KEY` + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` als GitHub Secrets
- macOS: kein Apple-Zertifikat → Gatekeeper-Bypass per Rechtsklick→Öffnen oder `xattr -cr`
- Ergebnis: Draft-Release mit `.AppImage`, `.msi`, `.dmg` (arm64+x64), `latest.json`
- Release manuell auf GitHub veröffentlichen → erst dann ist Updater aktiv

### Release-Notes Download-Tabelle – echte Dateinamen (Tauri-Namensschema)
```markdown
| 🪟 **Windows** (x64) | [⬇ RechnungsFee_X.X.X_x64-setup.exe](.../RechnungsFee_X.X.X_x64-setup.exe) |
| 🐧 **Linux** (x86_64, versioniert) | [⬇ RechnungsFee_X.X.X_amd64.AppImage](.../RechnungsFee_X.X.X_amd64.AppImage) |
| 🐧 **Linux** (x86_64, via install.sh) | [⬇ RechnungsFee_amd64.AppImage](.../RechnungsFee_amd64.AppImage) |
| 🐧 **Linux** Installer | [⬇ install-linux.sh](.../install-linux.sh) |
| 🍎 **macOS** (Apple Silicon, versioniert) | [⬇ RechnungsFee_X.X.X_aarch64.dmg](.../RechnungsFee_X.X.X_aarch64.dmg) |
| 🍎 **macOS** (Apple Silicon) | [⬇ RechnungsFee_aarch64.dmg](.../RechnungsFee_aarch64.dmg) |
```
Tauri verwendet Unterstriche und `amd64`/`aarch64` (nicht Bindestriche/`x86_64`). Installer heißt `install-linux.sh`.
macOS: kein Apple-Zertifikat → Hinweis `xattr -cr` in Release-Notes ergänzen.

### Tauri Updater (`tauri-plugin-updater`)
- Signing-Key lokal: `~/.tauri/rechnungsfee.key` (privat, nie committen!)
- Public Key in `src-tauri/tauri.conf.json` unter `plugins.updater.pubkey`
- Endpoint: GitHub Releases `latest.json`
- Frontend: `useUpdateCheck`-Hook + grünes Banner in `InfoPage`
- Key neu generieren: `npx tauri signer generate -w ~/.tauri/rechnungsfee.key`

## GoBD-Schutz
- `_migrate_kategorien()` und `_migrate_signaturen()` laufen bei **jedem** Start (idempotent)
- `_setup_gobd_triggers()` schützt `immutable=1`-Einträge auf DB-Ebene
- Trigger werden vor `_migrate_signaturen()` temporär entfernt und danach neu gesetzt
