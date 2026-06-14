# Implementierungsplan: Anlage EÜR

> Stand: 2026-06-07  
> Ziel: EÜR-Berechnung aus Journalbuchungen + PDF-Bericht (kein amtliches Formular)  
> Bezug Roadmap: v0.3 Phase 2

---

## Voraussetzungen – bereits vorhanden ✅

| Was | Wo |
|-----|----|
| `kategorien.euer_zeile` – alle Standardkategorien auf Anlage EÜR 2025 gemappt | seed.py + Migration 26 |
| `journal.netto_betrag`, `journal.ust_betrag` | Journaleintrag |
| `journal.vorsteuer_betrag` – tatsächlich abziehbarer Anteil (inkl. 70%-Kürzung) | Schema 40 |
| `journal.km_anzahl` – km-Pauschale Privat-PKW (→ EÜR Zeile 70: km × 0,30 €) | Schema 43 |
| `journal.datum` – Zuflussprinzip direkt verwendbar | |
| `journal.art` – Einnahme / Ausgabe | |
| Kategorie-Verknüpfung `journal.kategorie_id → kategorien.euer_zeile` | |

**Nicht in Scope (separates Feature):**  
Anlage AVEÜR (Abschreibungsplan für Anlagegüter – KFZ, EDV, Maschinen).  
Buchungen der Kontenart `Anlage` haben `euer_zeile = None` und werden im EÜR-Bericht
als gesonderter Hinweis ausgewiesen.

---

## Stufe 1 – Backend: EÜR-Berechnung

### 1.1 EÜR-Zeilen-Definitionen (in `api/euer.py`)

Tabelle aller relevanten EÜR-Zeilen mit Label und Typ:

```python
EUR_ZEILEN = {
    # A – Betriebseinnahmen
    12: ("Betriebseinnahmen (steuerpflichtig, Netto)", "einnahme"),
    13: ("Betriebseinnahmen (steuerfrei)", "einnahme"),
    14: ("Betriebseinnahmen (sonstige)", "einnahme"),
    15: ("Vereinnahmte Umsatzsteuer", "ust_einnahme"),   # → ust_betrag der Einnahmen
    16: ("USt-Erstattungen vom Finanzamt", "einnahme"),
    # B – Betriebsausgaben
    17: ("Umsatzsteuer-Vorauszahlungen", "ausgabe"),
    27: ("Wareneinkauf / Fremdmaterial", "ausgabe"),
    29: ("Fremdleistungen", "ausgabe"),
    30: ("Löhne, Gehälter, Sozialversicherung", "ausgabe"),
    36: ("Geringwertige Wirtschaftsgüter (GWG)", "ausgabe"),
    39: ("Miete / Pacht (Büro)", "ausgabe"),
    41: ("Nebenkosten Büro", "ausgabe"),
    43: ("Telefon, Internet", "ausgabe"),
    44: ("Reisekosten", "ausgabe"),
    46: ("Beratungs- / Steuerberatungskosten", "ausgabe"),
    47: ("Miet-/Leasingkosten (Geräte, Maschinen)", "ausgabe"),
    48: ("Abziehbare Vorsteuer", "vorsteuer"),            # → vorsteuer_betrag
    49: ("Versicherungen (betrieblich)", "ausgabe"),
    51: ("Bürokosten, Porto, Verpackung", "ausgabe"),
    52: ("Abfallbeseitigung, Reinigung", "ausgabe"),
    54: ("Werbekosten", "ausgabe"),
    56: ("Schuldzinsen", "ausgabe"),
    58: ("Sonstige Finanzierungskosten", "ausgabe"),
    60: ("Sonstige Betriebsausgaben", "ausgabe"),
    63: ("Bewirtungskosten (70 % abzugsfähig)", "ausgabe"),
    65: ("Häusliches Arbeitszimmer", "ausgabe"),
    68: ("KFZ-Leasing", "ausgabe"),
    69: ("KFZ-Steuer, KFZ-Versicherung", "ausgabe"),
    70: ("KFZ-Kosten, km-Pauschale, Fahrtkosten", "ausgabe"),
    106: ("Privatentnahmen (Hinweiszeile)", "privat"),
    107: ("Privateinlagen (Hinweiszeile)", "privat"),
}
```

### 1.2 Berechnungslogik

```
GET /api/euer/berechnen?jahr=YYYY
```

**Pro Journal-Eintrag im Jahr:**
1. `kategorie.euer_zeile` ermitteln
2. Je Typ:
   - `einnahme` → `netto_betrag` summieren
   - `ausgabe` → `netto_betrag` summieren
   - `ust_einnahme` (Zeile 15) → `ust_betrag` aller Einnahmen summieren
   - `vorsteuer` (Zeile 48) → `vorsteuer_betrag` aller Ausgaben summieren
   - `privat` → `brutto_betrag` (Hinweis, kein GuV-Einfluss)
3. km-Pauschale: `journal.km_anzahl * 0.30` → bereits in `brutto_betrag` für Zeile 70

**Sonderfall Zeile 15 (vereinnahmte USt):**  
Summe `ust_betrag` aller Einnahmen-Einträge mit `ust_betrag > 0`.  
Für Kleinunternehmer: immer 0.

**Ergebnis:**
```python
{
  "jahr": 2026,
  "zeilen": [
    {"zeile": 12, "bezeichnung": "Betriebseinnahmen ...", "betrag": 15420.00},
    {"zeile": 15, "bezeichnung": "Vereinnahmte USt", "betrag": 2929.80},
    ...
  ],
  "summe_einnahmen": 18349.80,  # Zeile 22 (inkl. USt)
  "summe_ausgaben": 8421.50,    # Zeile 74
  "gewinn_verlust": 9928.30,    # Zeile 75 = Einnahmen − Ausgaben
  "anlage_zugaenge": 3400.00,   # Summe Anlage-Buchungen (→ Hinweis AVEÜR)
  "ist_kleinunternehmer": False,
}
```

### 1.3 Endpunkte

```
GET /api/euer/berechnen?jahr=YYYY      → EÜR-Daten
GET /api/euer/pdf?jahr=YYYY            → PDF-Bericht (StreamingResponse)
```

---

## Stufe 2 – Frontend: EÜR-Seite

**Route:** `/euer`  
**Navigation:** Exporte-Kachel (wie UStVA/ZM) – nur sichtbar wenn Buchungen vorhanden

### Aufbau der Seite

```
EÜR – Einnahmen-Überschuss-Rechnung 2026
[ Jahr auswählen ▼ ]

A – Betriebseinnahmen
  Z.12  Betriebseinnahmen           15.420,00 €
  Z.15  Vereinnahmte USt             2.929,80 €
  Z.16  USt-Erstattungen FA              0,00 €
                              ─────────────────
  Summe Betriebseinnahmen           18.349,80 €

B – Betriebsausgaben
  Z.27  Wareneinkauf                 3.200,00 €
  Z.48  Abziehbare Vorsteuer           608,00 €
  Z.51  Bürokosten                     420,50 €
  ...
                              ─────────────────
  Summe Betriebsausgaben             8.421,50 €

══════════════════════════════════════════════
  Gewinn / Verlust (Z.75)            9.928,30 €

⚠ Anlagezugänge (3.400,00 €) sind nicht enthalten –
  bitte Anlage AVEÜR (Abschreibungsplan) separat ausfüllen.

[ PDF erstellen ]
```

**Nur Zeilen mit Betrag ≠ 0 anzeigen** (wie UStVA).

---

## Stufe 3 – PDF-Bericht

Strukturierter PDF-Bericht (kein amtliches Formular, wie UStVA-Anzeigehilfe):
- Kopf: Name, Steuernummer, Wirtschaftsjahr
- Abschnitt A (Einnahmen) mit Zeilennummern
- Abschnitt B (Ausgaben) mit Zeilennummern
- Summen und Gewinn/Verlust
- Hinweis auf Anlage AVEÜR wenn Anlagezugänge vorhanden
- Hinweiszeile: „Dieses Dokument ist eine Anzeigehilfe – bitte in ELSTER/Steuerberater übertragen"

---

## Stufe 4 (spätere Version) – Anlage AVEÜR

Für Anlagegüter (EDV, KFZ, Maschinen) wird eine separate Abschreibungstabelle benötigt:

| Feld | Inhalt |
|------|--------|
| Anschaffungsdatum | aus `journal.datum` |
| Anschaffungskosten | `journal.brutto_betrag` |
| Nutzungsdauer | aus AfA-Tabellen (BMF) – manuell oder vorbelegt |
| Jahres-AfA | Anschaffungskosten / Nutzungsdauer |
| Restwert | fortgeschriebener Buchwert |

Erfordert neue Tabelle `anlagevermoegen` und eigene Verwaltungsseite.

---

## Offene Fragen / Klärungsbedarf

- **Kleinunternehmer**: Zeile 15 = 0, aber Einnahmen trotzdem in Zeile 12/13?  
  → Ja, Zeile 12 enthält den Brutto-Betrag (= Netto bei §19)
- **Privatentnahmen / -einlagen** (Zeile 106/107): nur Hinweiszeilen, kein GuV-Einfluss
- **USt-Vorauszahlungen** (Zeile 17): werden nur dann ausgewiesen wenn tatsächlich
  eine Buchung mit Kategorie „Umsatzsteuer-Zahlung FA" im Journal liegt
- **Ist-Versteuerung**: EÜR verwendet immer Zahlungsdatum → bereits durch Journal-Datum gegeben

---

## Reihenfolge Umsetzung

1. `api/euer.py` – Berechnung + PDF-Endpunkt
2. `main.py` – Router registrieren
3. `client.ts` – API-Typen + Funktionen
4. `EUERPage.tsx` – Seite mit Jahresauswahl + Tabelle
5. `App.tsx` – Route `/euer`
6. `ExportPage.tsx` – Kachel (automatische Berechnung bei Jahreswechsel)
7. Anlage AVEÜR – separate Issue / spätere Version
