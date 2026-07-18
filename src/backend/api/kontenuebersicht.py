"""
Kontenübersicht – Summenliste aller gebuchten Kategorien mit Kontonummer (Issue #255)

Zeigt, im Unterschied zum Journal-Filter (Kontenblatt zu EINEM Konto), alle
Kategorien auf einen Blick mit der aktuell hinterlegten Kontonummer, Anzahl
Buchungen und Summe im gewählten Zeitraum.

Die Kontonummern-Spalte wird über unternehmen.kontenrahmen dynamisch gewählt
(aktuell SKR03/SKR04, konto_skr49 ist als Spalte reserviert für einen künftigen
weiteren Kontenplan – noch nicht produktiv befüllt).
"""

import csv
import io
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from database.connection import get_db
from database.models import Journaleintrag, Kategorie, Unternehmen

router = APIRouter(prefix="/api/kontenuebersicht", tags=["Kontenübersicht"])

Q = Decimal("0.01")

_KONTO_SPALTEN = {
    "SKR03": Kategorie.konto_skr03,
    "SKR04": Kategorie.konto_skr04,
    "SKR49": Kategorie.konto_skr49,
}


class KontenuebersichtZeile(BaseModel):
    kategorie_id: int
    kategorie_name: str
    kontonummer: str | None
    anzahl: int
    summe: str


class KontenuebersichtErgebnis(BaseModel):
    kontenrahmen: str
    von: date
    bis: date
    zeilen: list[KontenuebersichtZeile]


def _kontenuebersicht_zeilen(von: date, bis: date, db: Session) -> tuple[str, list[KontenuebersichtZeile]]:
    unt = db.query(Unternehmen).filter(Unternehmen.id == 1).first()
    skr = (unt.kontenrahmen if unt else None) or "SKR04"
    konto_spalte = _KONTO_SPALTEN.get(skr, Kategorie.konto_skr04)

    rows = (
        db.query(
            Kategorie.id,
            Kategorie.name,
            konto_spalte.label("kontonummer"),
            func.count(Journaleintrag.id).label("anzahl"),
            func.sum(Journaleintrag.brutto_betrag).label("summe"),
        )
        .join(Journaleintrag, Journaleintrag.kategorie_id == Kategorie.id)
        .filter(Journaleintrag.datum >= von, Journaleintrag.datum <= bis)
        .group_by(Kategorie.id, Kategorie.name, konto_spalte)
        .order_by(konto_spalte.is_(None), konto_spalte, Kategorie.name)
        .all()
    )

    zeilen = [
        KontenuebersichtZeile(
            kategorie_id=r.id,
            kategorie_name=r.name,
            kontonummer=r.kontonummer,
            anzahl=r.anzahl,
            summe=str(Decimal(str(r.summe)).quantize(Q, ROUND_HALF_UP)),
        )
        for r in rows
    ]
    return skr, zeilen


@router.get("/berechnen", response_model=KontenuebersichtErgebnis)
def berechne_kontenuebersicht(von: date = Query(...), bis: date = Query(...), db: Session = Depends(get_db)):
    skr, zeilen = _kontenuebersicht_zeilen(von, bis, db)
    return KontenuebersichtErgebnis(kontenrahmen=skr, von=von, bis=bis, zeilen=zeilen)


@router.get("/export")
def kontenuebersicht_export(
    von: date = Query(...),
    bis: date = Query(...),
    format: str = Query("pdf", description="pdf oder csv"),
    db: Session = Depends(get_db),
):
    skr, zeilen = _kontenuebersicht_zeilen(von, bis, db)
    jahr = von.year if von.year == bis.year else None
    datei_suffix = str(jahr) if jahr else f"{von}_{bis}"

    if format == "csv":
        out = io.StringIO()
        writer = csv.writer(out, delimiter=";")
        writer.writerow(["Kategorie", "Konto", "Buchungen", "Summe (EUR)"])
        for z in zeilen:
            writer.writerow([
                z.kategorie_name, z.kontonummer or "",
                z.anzahl, f"{Decimal(z.summe):.2f}".replace(".", ","),
            ])
        csv_bytes = ("﻿" + out.getvalue()).encode("utf-8")
        return Response(
            content=csv_bytes,
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="Kontenuebersicht_{datei_suffix}.csv"'},
        )

    unt = db.query(Unternehmen).filter(Unternehmen.id == 1).first()
    unt_dict = {
        "firmenname": unt.firmenname if unt else "",
        "vorname": unt.vorname if unt else "",
        "nachname": unt.nachname if unt else "",
        "strasse": unt.strasse if unt else "",
        "hausnummer": unt.hausnummer if unt else "",
        "plz": unt.plz if unt else "",
        "ort": unt.ort if unt else "",
        "steuernummer": unt.steuernummer if unt else "",
    }

    from utils.pdf_kontenuebersicht import erstelle_kontenuebersicht_pdf
    pdf_bytes = erstelle_kontenuebersicht_pdf(
        unt_dict, [z.model_dump() for z in zeilen], jahr or von.year, skr,
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="Kontenuebersicht_{datei_suffix}.pdf"'},
    )
