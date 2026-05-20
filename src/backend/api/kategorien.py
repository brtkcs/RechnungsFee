"""
API-Endpunkte für Buchungskategorien.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database.connection import get_db
from database.models import Kategorie
from .schemas import KategorieResponse

router = APIRouter(prefix="/api/kategorien", tags=["Stammdaten"])


@router.get("", response_model=list[KategorieResponse])
def list_kategorien(
    kontenart: str | None = None,
    nur_aktive: bool = False,
    db: Session = Depends(get_db),
):
    q = db.query(Kategorie)
    if kontenart:
        q = q.filter(Kategorie.kontenart == kontenart)
    if nur_aktive:
        q = q.filter(Kategorie.aktiv == True)
    return q.order_by(Kategorie.kontenart, Kategorie.name).all()


@router.get("/{kategorie_id}", response_model=KategorieResponse)
def get_kategorie(kategorie_id: int, db: Session = Depends(get_db)):
    kat = db.query(Kategorie).filter(Kategorie.id == kategorie_id).first()
    if not kat:
        raise HTTPException(status_code=404, detail="Kategorie nicht gefunden.")
    return kat


@router.patch("/{kategorie_id}/aktiv", response_model=KategorieResponse)
def toggle_aktiv(kategorie_id: int, db: Session = Depends(get_db)):
    kat = db.query(Kategorie).filter(Kategorie.id == kategorie_id).first()
    if not kat:
        raise HTTPException(status_code=404, detail="Kategorie nicht gefunden.")
    kat.aktiv = not kat.aktiv
    db.commit()
    db.refresh(kat)
    return kat
