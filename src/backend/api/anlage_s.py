"""Anlage S – Einkünfte aus selbstständiger Arbeit (§18 EStG).

Anzeigehilfe: Zeigt die relevanten Werte für ELSTER auf Basis der EÜR
und der Unternehmensstammdaten. Keine Steuerberatung, keine Übermittlung.
"""
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.euer import _berechne_euer
from database.connection import get_db
from database.models import Anlagegut, Unternehmen

router = APIRouter(prefix="/api/anlage-s", tags=["Anlage S"])


class AnlageSKfzHinweis(BaseModel):
    bezeichnung: str
    kennzeichen: str
    privat_anteil_prozent: Decimal


class AnlageSErgebnis(BaseModel):
    jahr: int
    vorname: str
    nachname: str
    steuernummer: str
    finanzamt: str
    berufsbezeichnung: str
    gewinn_verlust: Decimal   # positiv = Gewinn, negativ = Verlust
    kfz_hinweise: list[AnlageSKfzHinweis]


@router.get("/berechnen", response_model=AnlageSErgebnis)
def anlage_s_berechnen(
    jahr: int = Query(..., ge=2020, le=2100),
    db: Session = Depends(get_db),
):
    unt = db.query(Unternehmen).first()
    if not unt:
        raise HTTPException(404, "Unternehmensdaten nicht gefunden.")

    euer = _berechne_euer(jahr, db)

    kfz_list = (
        db.query(Anlagegut)
        .filter(
            Anlagegut.typ == "kfz",
            Anlagegut.aktiv == True,  # noqa: E712
            Anlagegut.privat_anteil_prozent > 0,
            Anlagegut.verkauft_am == None,  # noqa: E711
        )
        .all()
    )

    return AnlageSErgebnis(
        jahr=jahr,
        vorname=unt.vorname or "",
        nachname=unt.nachname or "",
        steuernummer=unt.steuernummer or "",
        finanzamt=unt.finanzamt or "",
        berufsbezeichnung=unt.berufsbezeichnung or "",
        gewinn_verlust=euer["gewinn_verlust"],
        kfz_hinweise=[
            AnlageSKfzHinweis(
                bezeichnung=k.bezeichnung or "",
                kennzeichen=k.kennzeichen or "",
                privat_anteil_prozent=k.privat_anteil_prozent,
            )
            for k in kfz_list
        ],
    )
