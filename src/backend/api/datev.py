"""
DATEV EXTF Buchungsstapel Export.
Format: Version 700 / Buchungsstapel v9
Modus: EÜR/Zuflussprinzip (eine Zeile pro Journaleintrag)

Sonderfälle:
  ust_sonderfall=ig_erwerb     → BU 89 (19 %) oder 93 (7 %)
  ust_sonderfall=13b_abs1/abs2 → BU 94
  marge_25a_brutto != NULL     → BU 57, Umsatz = Marge (§25a)
  zahlungsart='Keine'          → übersprungen (kein Gegenkonto)
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database.connection import get_db
from database.models import Journaleintrag, Unternehmen

router = APIRouter(prefix="/api/datev", tags=["DATEV"])

# Buchungsstapel v9 – alle 49 Spaltennamen (Zeile 2 des EXTF)
_COLS = [
    "Umsatz (ohne Soll/Haben-Kz)",
    "Soll/Haben-Kennzeichen",
    "WKZ Umsatz",
    "Kurs",
    "Basisumsatz",
    "WKZ Basisumsatz",
    "Konto",
    "Gegenkonto (ohne BU-Schlüssel)",
    "BU-Schlüssel",
    "Belegdatum",
    "Belegfeld 1",
    "Belegfeld 2",
    "Skonto",
    "Buchungstext",
    "Postensperre",
    "Diverse Adressnummer",
    "Geschäftspartnerbank",
    "Sachverhalt",
    "Zinssperre",
    "Beleglink",
    "Beleginfo - Art 1",
    "Beleginfo - Inhalt 1",
    "Beleginfo - Art 2",
    "Beleginfo - Inhalt 2",
    "Beleginfo - Art 3",
    "Beleginfo - Inhalt 3",
    "Beleginfo - Art 4",
    "Beleginfo - Inhalt 4",
    "Beleginfo - Art 5",
    "Beleginfo - Inhalt 5",
    "Beleginfo - Art 6",
    "Beleginfo - Inhalt 6",
    "Beleginfo - Art 7",
    "Beleginfo - Inhalt 7",
    "Beleginfo - Art 8",
    "Beleginfo - Inhalt 8",
    "KOST1 - Kostenstelle",
    "KOST2 - Kostenstelle",
    "Kost-Menge",
    "EU-Mitgliedsstaat u. UStIdNr.",
    "EU-Steuersatz",
    "Abw. Versteuerungsart",
    "L+L-Identifikation",
    "Buchungslink",
    "Bestellnummer",
    "Belegdatum 2",
    "Relevant§13b UStG",
    "Kreditoren-/Debitorennummer",
    "Technische Identifikation",
]

# Standard-Gegenkonten wenn datev_konto_* nicht konfiguriert
_DEFAULTS: dict[str, dict[str, str]] = {
    "SKR03": {"Bar": "1000", "Bank": "1200", "Karte": "1200", "PayPal": "1360"},
    "SKR04": {"Bar": "1000", "Bank": "1800", "Karte": "1800", "PayPal": "1460"},
    "SKR49": {"Bar": "1000", "Bank": "1800", "Karte": "1800", "PayPal": "1460"},
}


def _fmt(betrag: Decimal) -> str:
    """Betrag im deutschen Format: '1234,56' (Komma, kein Tausender)."""
    return str(abs(betrag).quantize(Decimal("0.01"))).replace(".", ",")


def _bu(j: Journaleintrag) -> str:
    sf = j.ust_sonderfall
    if sf == "ig_erwerb":
        return "89" if int(j.ust_satz or 0) >= 19 else "93"
    if sf in ("13b_abs1", "13b_abs2"):
        return "94"
    if j.marge_25a_brutto is not None:
        return "57"
    satz = int(j.ust_satz or 0)
    if j.art == "Einnahme":
        if satz == 19:
            return "9"
        if satz == 7:
            return "2"
    else:
        if j.vorsteuerabzug and satz == 19:
            return "9"
        if j.vorsteuerabzug and satz == 7:
            return "2"
    return ""


def _gegenkonto(j: Journaleintrag, unt: Unternehmen) -> Optional[str]:
    konfig = {
        "Bar":    unt.datev_konto_bar,
        "Bank":   unt.datev_konto_bank,
        "Karte":  unt.datev_konto_karte,
        "PayPal": unt.datev_konto_paypal,
    }
    za = j.zahlungsart
    if za == "Keine":
        return None
    d = _DEFAULTS.get(unt.kontenrahmen, _DEFAULTS["SKR04"])
    return konfig.get(za) or d.get(za)


def _sachkonto(j: Journaleintrag, skr: str) -> Optional[str]:
    if skr == "SKR03":
        return j.konto_skr03
    return j.konto_skr04


def _zeile1(unt: Unternehmen, von: date, bis: date) -> str:
    """EXTF-Kopfzeile (Zeile 1)."""
    jetzt = datetime.now().strftime("%Y%m%d%H%M%S")
    wj_start = date(von.year, unt.geschaeftsjahr_beginn, 1)
    teile = [
        '"EXTF"', "700", "21", '"Buchungsstapel"', "9",
        jetzt, "", '"RE"', "",
        unt.datev_beraternummer or "1001",
        unt.datev_mandantennummer or "1",
        wj_start.strftime("%Y%m%d"),
        "4",
        von.strftime("%Y%m%d"),
        bis.strftime("%Y%m%d"),
        '""', '""', "1", "0", "0",
    ]
    return ";".join(teile)


@router.get("/buchungsstapel")
def datev_buchungsstapel(
    von: date = Query(..., description="Startdatum YYYY-MM-DD"),
    bis: date = Query(..., description="Enddatum YYYY-MM-DD"),
    db: Session = Depends(get_db),
):
    """DATEV EXTF Buchungsstapel für den angegebenen Zeitraum als CSV."""
    unt = db.query(Unternehmen).first()
    if not unt:
        raise HTTPException(status_code=404, detail="Keine Unternehmensdaten")

    eintraege = (
        db.query(Journaleintrag)
        .filter(Journaleintrag.datum >= von, Journaleintrag.datum <= bis)
        .order_by(Journaleintrag.datum, Journaleintrag.id)
        .all()
    )

    skr = unt.kontenrahmen
    zeilen: list[str] = [_zeile1(unt, von, bis), ";".join(_COLS)]
    uebersprungen = 0

    for j in eintraege:
        konto = _sachkonto(j, skr)
        gegenkonto = _gegenkonto(j, unt)

        if not konto or not gegenkonto:
            uebersprungen += 1
            continue

        betrag = j.marge_25a_brutto if j.marge_25a_brutto is not None else j.netto_betrag
        sh = "H" if j.art == "Einnahme" else "S"
        belegfeld1 = (j.externe_belegnr or j.belegnr)[:12]
        buchungstext = j.beschreibung[:60]

        row = [
            _fmt(betrag),       # 1: Umsatz
            sh,                  # 2: S/H
            "EUR",               # 3: WKZ
            "", "", "",          # 4-6: leer
            konto,               # 7: Konto
            gegenkonto,          # 8: Gegenkonto
            _bu(j),              # 9: BU-Schlüssel
            j.datum.strftime("%d%m"),  # 10: Belegdatum DDMM
            belegfeld1,          # 11: Belegfeld 1
            "",                  # 12: Belegfeld 2
            "",                  # 13: Skonto
            buchungstext,        # 14: Buchungstext
        ] + [""] * 35           # 15-49: leer

        zeilen.append(";".join(row))

    inhalt = "\r\n".join(zeilen)
    bom = b"\xef\xbb\xbf"
    data = bom + inhalt.encode("utf-8")

    dateiname = f"DATEV_Buchungsstapel_{von.strftime('%Y%m%d')}_{bis.strftime('%Y%m%d')}.csv"
    headers = {
        "Content-Disposition": f'attachment; filename="{dateiname}"',
        "X-Datev-Eintraege": str(len(eintraege) - uebersprungen),
        "X-Datev-Uebersprungen": str(uebersprungen),
    }
    return StreamingResponse(iter([data]), media_type="text/csv; charset=utf-8", headers=headers)
