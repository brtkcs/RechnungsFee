"""
Export-API: GoBD-ZIP und Buchhalter-CSV.
"""

from datetime import date
from decimal import Decimal
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import extract
from sqlalchemy.orm import Session

from database.connection import get_db
from database.models import Journaleintrag, Kategorie, Tagesabschluss
from utils.gobd_export import generate_gobd_zip

router = APIRouter(prefix="/api/export", tags=["Export"])


@router.get("/gobd")
def gobd_export(
    jahr: int = Query(..., description="Wirtschaftsjahr, z.B. 2026"),
    db: Session = Depends(get_db),
):
    """
    Erstellt einen vollständigen GoBD-Export für das angegebene Jahr als ZIP-Datei.
    Enthält: Kassenbuch-Journal, Tagesabschlüsse, Stammdaten, Integritätsprüfung,
    GDPdU-Index und PDF-Prüfbericht.
    """
    # Prüfen ob Daten für das Jahr vorhanden sind
    anzahl_buchungen = (
        db.query(Journaleintrag)
        .filter(
            Journaleintrag.immutable == True,
            extract("year", Journaleintrag.datum) == jahr,
        )
        .count()
    )
    anzahl_abschluesse = (
        db.query(Tagesabschluss)
        .filter(
            Tagesabschluss.immutable == True,
            extract("year", Tagesabschluss.datum) == jahr,
        )
        .count()
    )

    if anzahl_buchungen == 0 and anzahl_abschluesse == 0:
        raise HTTPException(
            status_code=404,
            detail=f"Keine Daten für das Jahr {jahr} gefunden.",
        )

    zip_bytes = generate_gobd_zip(db, jahr)
    dateiname = f"GoBD_Export_{jahr}.zip"

    return StreamingResponse(
        BytesIO(zip_bytes),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{dateiname}"'},
    )


def _de(betrag: Decimal) -> str:
    return str(betrag.quantize(Decimal("0.01"))).replace(".", ",")


@router.get("/buchhalter-csv")
def buchhalter_csv(
    von: date = Query(...),
    bis: date = Query(...),
    db: Session = Depends(get_db),
):
    """Einfaches Journal-CSV für Excel / LibreOffice (kein DATEV-Format)."""
    eintraege = (
        db.query(Journaleintrag)
        .filter(Journaleintrag.datum >= von, Journaleintrag.datum <= bis)
        .order_by(Journaleintrag.datum, Journaleintrag.id)
        .all()
    )

    kat_namen: dict[int, str] = {
        k.id: k.name
        for k in db.query(Kategorie).all()
    }

    COLS = [
        "Datum", "Belegnr", "Externe Belegnr", "Beschreibung",
        "Kategorie", "Zahlungsart", "Art",
        "Netto", "USt-Satz %", "USt-Betrag", "Brutto",
    ]
    zeilen = [";".join(COLS)]

    for j in eintraege:
        zeilen.append(";".join([
            j.datum.strftime("%d.%m.%Y"),
            j.belegnr,
            j.externe_belegnr or "",
            j.beschreibung.replace(";", ","),
            kat_namen.get(j.kategorie_id, "") if j.kategorie_id else "",
            j.zahlungsart,
            j.art,
            _de(j.netto_betrag),
            _de(j.ust_satz),
            _de(j.ust_betrag),
            _de(j.brutto_betrag),
        ]))

    inhalt = "\r\n".join(zeilen)
    data = b"\xef\xbb\xbf" + inhalt.encode("utf-8")
    dateiname = f"Buchhalter_CSV_{von.strftime('%Y%m%d')}_{bis.strftime('%Y%m%d')}.csv"
    return StreamingResponse(
        iter([data]),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{dateiname}"',
            "X-Buchhalter-Eintraege": str(len(eintraege)),
        },
    )
