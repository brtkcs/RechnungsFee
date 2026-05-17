"""
Anlage EKS – Einkommenserklärung für Selbstständige (Jobcenter/Bürgergeld).
Berechnet EKS-Felder aus vorhandenen Journalbuchungen und exportiert als PDF.

Vorläufige EKS: Prognose = Vorjahres-Halbjahr (abschliessend) ÷ 6.
Abschließende EKS: Echte Journalsummen für den Zeitraum.
"""

import json
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from io import BytesIO

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from database.connection import get_db
from database.models import EksExport, Journaleintrag, Kategorie, Unternehmen
from utils.pdf_eks import generate_eks_pdf

router = APIRouter(prefix="/api/eks", tags=["EKS"])

# ---------------------------------------------------------------------------
# EKS-Felder: Alle Codes mit Labels und ob automatisch berechenbar
# ---------------------------------------------------------------------------

EKS_FELDER_META = [
    # Tabelle A – Einnahmen
    ("A",  "A1",   "Betriebseinnahmen aus selbstständiger Tätigkeit", True),
    ("A",  "A2",   "Privatentnahmen",                                  False),
    ("A",  "A3",   "Sonstige Einnahmen",                               False),
    ("A",  "A4",   "Private Geld- oder Sacheinlagen",                  False),
    ("A",  "A5_1", "Umsatzsteuer (Ist-Einnahmen, Kennziffer 81)",      False),
    ("A",  "A5_2", "Umsatzsteuer-Erstattung vom Finanzamt",            False),
    # Tabelle B – Ausgaben
    ("B",  "B1",   "Wareneinkauf / Material",                          True),
    ("B",  "B3",   "Personalkosten (Löhne & Gehälter)",                True),
    ("B",  "B4",   "Fremdleistungen",                                  True),
    ("B",  "B5",   "Raumkosten (Miete, Pacht, Nebenkosten)",           True),
    ("B",  "B6",   "Versicherungen & Beiträge",                        True),
    ("B",  "B7",   "KFZ-Kosten",                                       True),
    ("B",  "B8",   "Reisekosten",                                      True),
    ("B",  "B9",   "Büro- und Geschäftsbedarf",                        True),
    ("B",  "B10",  "Telefon & Internet",                               True),
    ("B",  "B11",  "Rechts- und Beratungskosten",                      False),
    ("B",  "B12",  "Fortbildung",                                      False),
    ("B",  "B14",  "Zinsaufwendungen",                                 False),
    ("B",  "B15",  "Kredittilgung",                                    False),
    ("B",  "B16",  "Gezahlte Umsatzsteuer (Kennziffer 83)",            False),
    ("B",  "B17",  "Vorsteuererstattung vom Finanzamt",                False),
    ("B",  "B18",  "Sonstige / Übrige Betriebsausgaben",               True),
    # Tabelle C – Absetzungen
    ("C",  "C1",   "Steuern (Einkommensteuer, Gewerbesteuer)",         False),
    ("C",  "C2",   "Pflichtbeiträge Krankenversicherung",              False),
    ("C",  "C3",   "Pflichtbeiträge Pflegeversicherung",               False),
    ("C",  "C4",   "Rentenversicherung (freiwillig)",                  False),
    ("C",  "C5",   "Riester-Beiträge",                                 False),
    ("C",  "C6",   "Sonstige Absetzungen",                             False),
]


class EksPdfRequest(BaseModel):
    zeitraum_von: date
    zeitraum_bis: date
    art: str = "abschliessend"   # vorlaeufig | abschliessend
    felder: dict[str, str]       # code → Betrag als String


# ---------------------------------------------------------------------------
# Hilfsfunktion: Halbjahr ermitteln
# ---------------------------------------------------------------------------

def _halbjahr_grenzen(monat_datum: date) -> tuple[date, date]:
    """Gibt (erster_tag, letzter_tag) des Halbjahres zurück, in dem das Datum liegt."""
    y = monat_datum.year
    if monat_datum.month <= 6:
        return date(y, 1, 1), date(y, 6, 30)
    else:
        return date(y, 7, 1), date(y, 12, 31)


# ---------------------------------------------------------------------------
# Endpunkte
# ---------------------------------------------------------------------------

@router.get("/berechnen")
def eks_berechnen(
    von: date = Query(...),
    bis: date = Query(...),
    art: str = Query("abschliessend"),
    db: Session = Depends(get_db),
):
    """Berechnet EKS-Felder für den Zeitraum.

    art=abschliessend: Echte Journalsummen.
    art=vorlaeufig: Prognose = abschließende EKS des Vorjahres-Halbjahres ÷ 6.
    """
    quelle: dict | None = None

    if art == "vorlaeufig":
        # Halbjahr des Vorjahres bestimmen (bezogen auf von-Datum)
        hj_von, hj_bis = _halbjahr_grenzen(von)
        vj_von = date(hj_von.year - 1, hj_von.month, hj_von.day)
        vj_bis = date(hj_bis.year - 1, hj_bis.month, hj_bis.day)

        eks_vj = (
            db.query(EksExport)
            .filter(
                EksExport.art == "abschliessend",
                EksExport.zeitraum_von == vj_von,
                EksExport.zeitraum_bis == vj_bis,
            )
            .order_by(EksExport.exportiert_am.desc())
            .first()
        )

        if eks_vj is None:
            felder_werte: dict[str, str] = {}
            quelle = None
        else:
            rohdaten: dict = json.loads(eks_vj.daten_json or "{}")
            felder_werte = {
                code: str(
                    (Decimal(str(rohdaten.get(code, "0"))) / 6)
                    .quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                )
                for _, code, _, _ in EKS_FELDER_META
            }
            quelle = {
                "zeitraum_von": str(eks_vj.zeitraum_von),
                "zeitraum_bis": str(eks_vj.zeitraum_bis),
                "exportiert_am": str(eks_vj.exportiert_am),
            }

    else:
        # Abschließend: echte Journalsummen
        rows = (
            db.query(
                Kategorie.eks_kategorie,
                func.sum(Journaleintrag.brutto_betrag).label("summe"),
            )
            .join(Journaleintrag.kategorie)
            .filter(
                Journaleintrag.datum >= von,
                Journaleintrag.datum <= bis,
                Kategorie.eks_kategorie.isnot(None),
            )
            .group_by(Kategorie.eks_kategorie)
            .all()
        )
        felder_werte = {row.eks_kategorie: str(row.summe or Decimal("0")) for row in rows}

    meta = [
        {
            "tabelle": t,
            "code": code,
            "label": label,
            "auto": auto,
            "wert": felder_werte.get(code, "0.00"),
        }
        for t, code, label, auto in EKS_FELDER_META
    ]
    return {
        "zeitraum_von": str(von),
        "zeitraum_bis": str(bis),
        "art": art,
        "felder": meta,
        "quelle": quelle,
    }


@router.post("/pdf")
def eks_pdf(req: EksPdfRequest, db: Session = Depends(get_db)):
    """Generiert EKS-Zusammenfassung als PDF und speichert den Export."""
    unt = db.query(Unternehmen).first()
    unt_dict: dict = {}
    if unt:
        unt_dict = {
            "firmenname": unt.firmenname or "",
            "vorname": unt.vorname or "",
            "nachname": unt.nachname or "",
            "strasse": (unt.strasse or "") + " " + (unt.hausnummer or ""),
            "plz": unt.plz or "",
            "ort": unt.ort or "",
            "steuernummer": unt.steuernummer or "",
        }

    felder_mit_meta = [
        {
            "tabelle": t,
            "code": code,
            "label": label,
            "auto": auto,
            "wert": req.felder.get(code, "0.00"),
        }
        for t, code, label, auto in EKS_FELDER_META
    ]

    pdf_bytes = generate_eks_pdf(
        zeitraum_von=req.zeitraum_von,
        zeitraum_bis=req.zeitraum_bis,
        art=req.art,
        felder=felder_mit_meta,
        unternehmen=unt_dict,
    )

    # Export in DB speichern (abschliessende EKS als Basis für spätere Prognosen)
    eks_export = EksExport(
        zeitraum_von=req.zeitraum_von,
        zeitraum_bis=req.zeitraum_bis,
        art=req.art,
        daten_json=json.dumps({code: req.felder.get(code, "0.00") for _, code, _, _ in EKS_FELDER_META}),
    )
    db.add(eks_export)
    db.commit()

    dateiname = f"EKS_{req.zeitraum_von}_{req.zeitraum_bis}.pdf"
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{dateiname}"'},
    )
