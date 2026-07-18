"""Verwaltung von Schnellbuchungen – Journal-Presets für wiederkehrende manuelle Buchungen (Issue #256)."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database.connection import get_db
from database.models import Kategorie, Schnellbuchung

router = APIRouter(prefix="/api/schnellbuchungen", tags=["Schnellbuchungen"])

GUELTIGE_ART = {"Einnahme", "Ausgabe"}
GUELTIGE_ZAHLUNGSART = {"Bar", "Karte", "Bank", "PayPal"}


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class SchnellbuchungCreate(BaseModel):
    name: str
    art: str
    kategorie_id: int
    zahlungsart: str
    beschreibung: str


class SchnellbuchungUpdate(BaseModel):
    name: str
    art: str
    kategorie_id: int
    zahlungsart: str
    beschreibung: str


class SchnellbuchungResponse(BaseModel):
    id: int
    name: str
    art: str
    kategorie_id: int
    kategorie_name: str
    zahlungsart: str
    beschreibung: str
    reihenfolge: int
    model_config = {"from_attributes": True}


def _validieren(art: str, kategorie_id: int, zahlungsart: str, db: Session) -> Kategorie:
    if art not in GUELTIGE_ART:
        raise HTTPException(status_code=422, detail="art muss Einnahme oder Ausgabe sein")
    if zahlungsart not in GUELTIGE_ZAHLUNGSART:
        raise HTTPException(status_code=422, detail="zahlungsart muss Bar, Karte, Bank oder PayPal sein")
    kat = db.query(Kategorie).filter(Kategorie.id == kategorie_id).first()
    if not kat:
        raise HTTPException(status_code=404, detail="Kategorie nicht gefunden.")
    return kat


def _to_response(s: Schnellbuchung) -> SchnellbuchungResponse:
    return SchnellbuchungResponse(
        id=s.id, name=s.name, art=s.art, kategorie_id=s.kategorie_id,
        kategorie_name=s.kategorie.name if s.kategorie else "", zahlungsart=s.zahlungsart,
        beschreibung=s.beschreibung, reihenfolge=s.reihenfolge,
    )


# ---------------------------------------------------------------------------
# Endpunkte
# ---------------------------------------------------------------------------

@router.get("", response_model=list[SchnellbuchungResponse])
def list_schnellbuchungen(db: Session = Depends(get_db)):
    rows = db.query(Schnellbuchung).order_by(Schnellbuchung.reihenfolge, Schnellbuchung.name).all()
    return [_to_response(s) for s in rows]


@router.post("", response_model=SchnellbuchungResponse, status_code=201)
def create_schnellbuchung(data: SchnellbuchungCreate, db: Session = Depends(get_db)):
    _validieren(data.art, data.kategorie_id, data.zahlungsart, db)
    max_reihenfolge = db.query(Schnellbuchung).count()
    s = Schnellbuchung(
        name=data.name.strip(), art=data.art, kategorie_id=data.kategorie_id,
        zahlungsart=data.zahlungsart, beschreibung=data.beschreibung.strip(),
        reihenfolge=max_reihenfolge,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return _to_response(s)


@router.put("/{schnellbuchung_id}", response_model=SchnellbuchungResponse)
def update_schnellbuchung(schnellbuchung_id: int, data: SchnellbuchungUpdate, db: Session = Depends(get_db)):
    s = db.query(Schnellbuchung).filter(Schnellbuchung.id == schnellbuchung_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Schnellbuchung nicht gefunden.")
    _validieren(data.art, data.kategorie_id, data.zahlungsart, db)
    s.name = data.name.strip()
    s.art = data.art
    s.kategorie_id = data.kategorie_id
    s.zahlungsart = data.zahlungsart
    s.beschreibung = data.beschreibung.strip()
    db.commit()
    db.refresh(s)
    return _to_response(s)


@router.delete("/{schnellbuchung_id}", status_code=204)
def delete_schnellbuchung(schnellbuchung_id: int, db: Session = Depends(get_db)):
    s = db.query(Schnellbuchung).filter(Schnellbuchung.id == schnellbuchung_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Schnellbuchung nicht gefunden.")
    db.delete(s)
    db.commit()
