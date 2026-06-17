#!/usr/bin/env python3
"""
Testdaten-Seeder für RechnungsFee.
Erstellt realistische Testdaten via REST-API gegen http://localhost:8002.

Voraussetzung:
  - Backend läuft: cd src/backend && .venv/bin/uvicorn main:app --port 8002
  - Setup-Wizard wurde einmal abgeschlossen (Unternehmen angelegt)

Aufruf:
  cd src/backend && .venv/bin/python seed_testdaten.py

Erstellt:
  - 3 Kunden, 3 Lieferanten
  - 6 Ausgangsrechnungen (5 bezahlt, 1 offen) über 2025
  - 4 Eingangsrechnungen (alle bezahlt) über 2025
  - 3 Journal-Direktbuchungen (Fahrtkosten)
"""

import sys
import requests
from datetime import date

BASE = "http://localhost:8002/api"
sess = requests.Session()
sess.headers.update({"Content-Type": "application/json"})


def get(path: str):
    r = sess.get(f"{BASE}{path}")
    r.raise_for_status()
    return r.json()


def post(path: str, data: dict, label: str = "") -> dict:
    r = sess.post(f"{BASE}{path}", json=data)
    if not r.ok:
        print(f"  ✗ FEHLER [{path}]  {r.status_code} – {r.text[:400]}")
        sys.exit(1)
    if label:
        print(f"  ✓ {label}")
    return r.json()


def kat(kategorien: list, name_fragment: str) -> int:
    """Erste Kategorie-ID die den Fragment-String im Namen enthält."""
    treffer = [k for k in kategorien if name_fragment.lower() in k["name"].lower()]
    if not treffer:
        available = [k["name"] for k in kategorien]
        print(f"  ✗ Kategorie nicht gefunden: '{name_fragment}'")
        print(f"    Vorhandene Kategorien: {available}")
        sys.exit(1)
    return treffer[0]["id"]


def iso(y: int, m: int, d: int) -> str:
    return date(y, m, d).isoformat()


# ---------------------------------------------------------------------------

def main():
    # Backend-Check
    try:
        unt = get("/unternehmen")
    except Exception as exc:
        print(f"Backend nicht erreichbar: {exc}")
        print("Backend starten: cd src/backend && .venv/bin/uvicorn main:app --port 8002")
        sys.exit(1)
    if not unt:
        print("Kein Unternehmen gefunden – Setup-Wizard zuerst durchlaufen.")
        sys.exit(1)
    print(f"Backend OK  –  Unternehmen: {unt.get('firmenname') or unt.get('vorname', '?')}\n")

    kategorien = get("/kategorien")

    kat_einnahmen = kat(kategorien, "Betriebseinnahmen")  # noqa (Ausgangsrechnung braucht es nicht explizit)
    kat_edv       = kat(kategorien, "EDV / Software")
    kat_telekomm  = kat(kategorien, "Telefon & Internet")
    kat_buero     = kat(kategorien, "Büromaterial")
    kat_reise     = kat(kategorien, "Fahrtkosten Privat-PKW")
    print(f"Kategorien geladen (EDV={kat_edv}, Telekomm={kat_telekomm}, Büro={kat_buero}, Reise={kat_reise})\n")

    # -------------------------------------------------------------------------
    # Kunden
    # -------------------------------------------------------------------------
    print("── Kunden ──────────────────────────────────────")
    k1 = post("/kunden", {
        "firmenname": "Digital Solutions GmbH",
        "strasse": "Hauptstraße", "hausnummer": "42",
        "plz": "80331", "ort": "München", "land": "DE",
        "email": "kontakt@digital-solutions.de",
        "ust_idnr": "DE123456789",
        "zugferd_aktiv": True,
    }, "Digital Solutions GmbH")

    k2 = post("/kunden", {
        "vorname": "Thomas", "nachname": "Klein",
        "strasse": "Gartenweg", "hausnummer": "7",
        "plz": "22085", "ort": "Hamburg", "land": "DE",
        "email": "thomas.klein@example.com",
    }, "Thomas Klein")

    k3 = post("/kunden", {
        "firmenname": "Innovations AG",
        "strasse": "Technikpark", "hausnummer": "1",
        "plz": "10115", "ort": "Berlin", "land": "DE",
        "email": "einkauf@innovations-ag.de",
        "ust_idnr": "DE987654321",
        "zugferd_aktiv": True,
    }, "Innovations AG")

    # -------------------------------------------------------------------------
    # Lieferanten
    # -------------------------------------------------------------------------
    print("\n── Lieferanten ─────────────────────────────────")
    l1 = post("/lieferanten", {
        "firmenname": "Adobe Systems GmbH",
        "ort": "München", "land": "DE",
        "email": "rechnung@adobe.com",
    }, "Adobe Systems GmbH")

    l2 = post("/lieferanten", {
        "firmenname": "Telekom Deutschland GmbH",
        "ort": "Bonn", "land": "DE",
    }, "Telekom Deutschland GmbH")

    l3 = post("/lieferanten", {
        "firmenname": "Bürobedarf Schmidt",
        "strasse": "Marktplatz", "hausnummer": "3",
        "plz": "60311", "ort": "Frankfurt", "land": "DE",
    }, "Bürobedarf Schmidt")

    # -------------------------------------------------------------------------
    # Ausgangsrechnungen
    # -------------------------------------------------------------------------
    print("\n── Ausgangsrechnungen ──────────────────────────")

    def ausgangsrechnung(kunde_id, datum, lv, lb, positionen, zahlung_datum=None, zahlungsart="Bank"):
        r = post("/rechnungen", {
            "typ": "ausgang",
            "datum": datum,
            "leistung_von": lv,
            "leistung_bis": lb,
            "kunde_id": kunde_id,
            "positionen": positionen,
            "ist_entwurf": False,
        })
        rid  = r["id"]
        rnr  = r.get("rechnungsnummer", f"#{rid}")
        if zahlung_datum:
            post(f"/rechnungen/{rid}/zahlung-bar", {
                "datum": zahlung_datum,
                "zahlungsart": zahlungsart,
            })
            print(f"  ✓ {rnr}  bezahlt {zahlung_datum}")
        else:
            print(f"  ✓ {rnr}  (offen)")
        return r

    # Jan 2025 – Digital Solutions – 20 h Webentwicklung
    ausgangsrechnung(
        k1["id"], iso(2025,1,31), iso(2025,1,2), iso(2025,1,31),
        [{"beschreibung": "Webentwicklung – Januar 2025",
          "menge": 20, "einheit": "Std", "netto": 95.00, "ust_satz": 19}],
        zahlung_datum=iso(2025,2,12),
    )

    # Feb 2025 – Thomas Klein – 5 h Beratung
    ausgangsrechnung(
        k2["id"], iso(2025,2,14), iso(2025,2,1), iso(2025,2,14),
        [{"beschreibung": "Strategieberatung",
          "menge": 5, "einheit": "Std", "netto": 120.00, "ust_satz": 19}],
        zahlung_datum=iso(2025,2,28),
    )

    # Mär 2025 – Innovations AG – 15 h Web + 3 h Beratung
    ausgangsrechnung(
        k3["id"], iso(2025,3,31), iso(2025,3,1), iso(2025,3,31),
        [
            {"beschreibung": "Webentwicklung – Sprint 1–3",
             "menge": 15, "einheit": "Std", "netto": 95.00, "ust_satz": 19},
            {"beschreibung": "Projektberatung",
             "menge": 3, "einheit": "Std", "netto": 120.00, "ust_satz": 19},
        ],
        zahlung_datum=iso(2025,4,14),
    )

    # Apr 2025 – Digital Solutions – 8 h Konzeption
    ausgangsrechnung(
        k1["id"], iso(2025,4,30), iso(2025,4,1), iso(2025,4,30),
        [{"beschreibung": "UX-Konzeption & Wireframes",
          "menge": 8, "einheit": "Std", "netto": 80.00, "ust_satz": 19}],
        zahlung_datum=iso(2025,5,9),
    )

    # Mai 2025 – Innovations AG – 12 h Webentwicklung
    ausgangsrechnung(
        k3["id"], iso(2025,5,30), iso(2025,5,1), iso(2025,5,30),
        [{"beschreibung": "Webentwicklung – Sprint 4–6",
          "menge": 12, "einheit": "Std", "netto": 95.00, "ust_satz": 19}],
        zahlung_datum=iso(2025,6,13),
    )

    # Jun 2025 – Thomas Klein – 4 h Workshop – OFFEN
    ausgangsrechnung(
        k2["id"], iso(2025,6,20), iso(2025,6,10), iso(2025,6,20),
        [{"beschreibung": "Jahresplanung 2026 – Workshop",
          "menge": 4, "einheit": "Std", "netto": 120.00, "ust_satz": 19}],
    )

    # -------------------------------------------------------------------------
    # Eingangsrechnungen
    # -------------------------------------------------------------------------
    print("\n── Eingangsrechnungen ──────────────────────────")

    def eingangsrechnung(lieferant_id, datum, beschreibung, brutto, ust_satz, kategorie_id, zahlung_datum, zahlungsart="Bank"):
        netto = round(brutto / (1 + ust_satz / 100), 2)
        r = post("/rechnungen", {
            "typ": "eingang",
            "datum": datum,
            "lieferant_id": lieferant_id,
            "ist_entwurf": False,
            "positionen": [{
                "beschreibung": beschreibung,
                "menge": 1,
                "einheit": "Stück",
                "netto": netto,
                "ust_satz": ust_satz,
            }],
        })
        rid = r["id"]
        post(f"/rechnungen/{rid}/zahlung-bar", {
            "datum": zahlung_datum,
            "zahlungsart": zahlungsart,
            "kategorie_id": kategorie_id,
        })
        rnr = r.get("rechnungsnummer", f"#{rid}")
        print(f"  ✓ {rnr}  {beschreibung[:40]}  bezahlt {zahlung_datum}")
        return r

    # Adobe Creative Cloud Jahreslizenz (71,40 € brutto inkl. 19%)
    eingangsrechnung(
        l1["id"], iso(2025,2,1),
        "Creative Cloud All Apps – Jahreslizenz 2025",
        71.40, 19, kat_edv, iso(2025,2,1),
    )

    # Telekom Q1 (59,50 € brutto inkl. 19%)
    eingangsrechnung(
        l2["id"], iso(2025,3,31),
        "Telefon & Internet Q1 2025",
        59.50, 19, kat_telekomm, iso(2025,4,5),
    )

    # Bürobedarf (47,60 € brutto inkl. 19%)
    eingangsrechnung(
        l3["id"], iso(2025,4,10),
        "Druckerpapier, Toner, Büromaterial",
        47.60, 19, kat_buero, iso(2025,4,12),
    )

    # Telekom Q2 (59,50 € brutto inkl. 19%)
    eingangsrechnung(
        l2["id"], iso(2025,6,30),
        "Telefon & Internet Q2 2025",
        59.50, 19, kat_telekomm, iso(2025,7,4),
    )

    # -------------------------------------------------------------------------
    # Journal-Direktbuchungen (Fahrtkosten, Bar)
    # -------------------------------------------------------------------------
    print("\n── Journal-Direktbuchungen ─────────────────────")

    def journal(datum, beschreibung, brutto, ust_satz, art, kategorie_id, zahlungsart="Bar", vorsteuerabzug=False):
        post("/journal", {
            "datum": datum,
            "beschreibung": beschreibung,
            "brutto_betrag": str(brutto),
            "ust_satz": str(ust_satz),
            "art": art,
            "kategorie_id": kategorie_id,
            "zahlungsart": zahlungsart,
            "vorsteuerabzug": vorsteuerabzug,
        }, f"{art}: {beschreibung[:50]}")

    # 80 km × 0,30 € = 24,00 €
    journal(iso(2025,1,15), "Fahrtkosten Kundenbesuch München 80 km",
            24.00, 0, "Ausgabe", kat_reise)

    # 220 km × 0,30 € = 66,00 €
    journal(iso(2025,3,10), "Fahrtkosten Kundenbesuch Berlin 220 km",
            66.00, 0, "Ausgabe", kat_reise)

    # 150 km × 0,30 € = 45,00 €
    journal(iso(2025,5,22), "Fahrtkosten Messe Hamburg 150 km",
            45.00, 0, "Ausgabe", kat_reise)

    # -------------------------------------------------------------------------
    print("\n✅  Seeding abgeschlossen.")
    print("    Daten sind sofort in der App sichtbar (kein Neustart nötig).")


if __name__ == "__main__":
    main()
