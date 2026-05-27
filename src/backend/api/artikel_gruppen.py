"""Verwaltung von Warengruppen / Servicegruppen / Fremdleistungsgruppen."""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database.connection import get_db
from database.models import ArtikelGruppe, Artikel

router = APIRouter(prefix="/api/artikel-gruppen", tags=["ArtikelGruppen"])

GUELTIGE_TYPEN = {"artikel", "dienstleistung", "fremdleistung"}


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ArtikelGruppeCreate(BaseModel):
    typ: str
    name: str


class ArtikelGruppeUpdate(BaseModel):
    name: str


class ArtikelGruppeResponse(BaseModel):
    id: int
    typ: str
    name: str
    aktiv: bool
    artikel_anzahl: int = 0
    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Endpunkte
# ---------------------------------------------------------------------------

@router.get("", response_model=list[ArtikelGruppeResponse])
def list_gruppen(
    typ: Optional[str] = Query(None),
    nur_aktive: bool = Query(False),
    db: Session = Depends(get_db),
):
    q = db.query(ArtikelGruppe)
    if typ:
        q = q.filter(ArtikelGruppe.typ == typ)
    if nur_aktive:
        q = q.filter(ArtikelGruppe.aktiv == True)
    gruppen = q.order_by(ArtikelGruppe.typ, ArtikelGruppe.name).all()
    result = []
    for g in gruppen:
        anzahl = db.query(Artikel).filter(Artikel.gruppe_id == g.id, Artikel.aktiv == True).count()
        result.append(ArtikelGruppeResponse(
            id=g.id, typ=g.typ, name=g.name, aktiv=g.aktiv, artikel_anzahl=anzahl
        ))
    return result


@router.post("", response_model=ArtikelGruppeResponse, status_code=201)
def create_gruppe(data: ArtikelGruppeCreate, db: Session = Depends(get_db)):
    if data.typ not in GUELTIGE_TYPEN:
        raise HTTPException(status_code=422, detail=f"Ungültiger Typ: {data.typ}")
    vorhanden = db.query(ArtikelGruppe).filter(
        ArtikelGruppe.typ == data.typ,
        ArtikelGruppe.name == data.name.strip(),
    ).first()
    if vorhanden:
        raise HTTPException(status_code=409, detail="Eine Gruppe mit diesem Namen existiert bereits.")
    gruppe = ArtikelGruppe(typ=data.typ, name=data.name.strip())
    db.add(gruppe)
    db.commit()
    db.refresh(gruppe)
    return ArtikelGruppeResponse(id=gruppe.id, typ=gruppe.typ, name=gruppe.name, aktiv=gruppe.aktiv, artikel_anzahl=0)


@router.put("/{gruppe_id}", response_model=ArtikelGruppeResponse)
def update_gruppe(gruppe_id: int, data: ArtikelGruppeUpdate, db: Session = Depends(get_db)):
    gruppe = db.query(ArtikelGruppe).filter(ArtikelGruppe.id == gruppe_id).first()
    if not gruppe:
        raise HTTPException(status_code=404, detail="Gruppe nicht gefunden.")
    konflikt = db.query(ArtikelGruppe).filter(
        ArtikelGruppe.typ == gruppe.typ,
        ArtikelGruppe.name == data.name.strip(),
        ArtikelGruppe.id != gruppe_id,
    ).first()
    if konflikt:
        raise HTTPException(status_code=409, detail="Eine Gruppe mit diesem Namen existiert bereits.")
    gruppe.name = data.name.strip()
    db.commit()
    db.refresh(gruppe)
    anzahl = db.query(Artikel).filter(Artikel.gruppe_id == gruppe.id, Artikel.aktiv == True).count()
    return ArtikelGruppeResponse(id=gruppe.id, typ=gruppe.typ, name=gruppe.name, aktiv=gruppe.aktiv, artikel_anzahl=anzahl)


@router.patch("/{gruppe_id}/aktiv", response_model=ArtikelGruppeResponse)
def toggle_aktiv(gruppe_id: int, db: Session = Depends(get_db)):
    gruppe = db.query(ArtikelGruppe).filter(ArtikelGruppe.id == gruppe_id).first()
    if not gruppe:
        raise HTTPException(status_code=404, detail="Gruppe nicht gefunden.")
    gruppe.aktiv = not gruppe.aktiv
    db.commit()
    db.refresh(gruppe)
    anzahl = db.query(Artikel).filter(Artikel.gruppe_id == gruppe.id, Artikel.aktiv == True).count()
    return ArtikelGruppeResponse(id=gruppe.id, typ=gruppe.typ, name=gruppe.name, aktiv=gruppe.aktiv, artikel_anzahl=anzahl)


@router.delete("/{gruppe_id}", status_code=204)
def delete_gruppe(gruppe_id: int, db: Session = Depends(get_db)):
    gruppe = db.query(ArtikelGruppe).filter(ArtikelGruppe.id == gruppe_id).first()
    if not gruppe:
        raise HTTPException(status_code=404, detail="Gruppe nicht gefunden.")
    in_verwendung = db.query(Artikel).filter(Artikel.gruppe_id == gruppe_id).count()
    if in_verwendung:
        raise HTTPException(
            status_code=409,
            detail=f"Gruppe wird von {in_verwendung} Artikel(n) verwendet und kann nicht gelöscht werden.",
        )
    db.delete(gruppe)
    db.commit()
