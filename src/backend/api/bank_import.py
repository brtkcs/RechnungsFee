"""
API-Endpunkte für Bank-CSV-Import.
"""

import hashlib
from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from database.connection import get_db
from database.models import BankImport, BankTemplate, BankTransaktion, Konto
from utils.bank_csv_parser import (
    detect_delimiter,
    detect_encoding,
    find_best_template,
    parse_csv_mit_template,
)

router = APIRouter(prefix="/api/bank-import", tags=["Bank-Import"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class TransaktionVorschau(BaseModel):
    datum: date
    valuta: Optional[date] = None
    buchungstext: Optional[str] = None
    verwendungszweck: Optional[str] = None
    partner_name: Optional[str] = None
    partner_iban: Optional[str] = None
    betrag: Decimal
    waehrung: str = "EUR"
    saldo: Optional[Decimal] = None
    referenz: Optional[str] = None
    dedupe_hash: str
    ist_duplikat: bool = False


class VorschauResponse(BaseModel):
    erkanntes_template: Optional[str] = None
    template_name: Optional[str] = None
    encoding: str
    transaktionen: list[TransaktionVorschau]


class ImportiereRequest(BaseModel):
    konto_id: int
    template_id: str
    dateiname: str
    transaktionen: list[TransaktionVorschau]


class ImportiereResponse(BaseModel):
    import_id: int
    erfolg: int
    duplikate: int
    fehler: int


class BankImportResponse(BaseModel):
    id: int
    konto_id: int
    template_id: str
    dateiname: str
    anzahl_zeilen: int
    erfolg: int
    fehler: int
    duplikate: int
    importiert_am: str

    model_config = {"from_attributes": True}


class BankTransaktionResponse(BaseModel):
    id: int
    import_id: int
    konto_id: int
    datum: date
    valuta: Optional[date] = None
    buchungstext: Optional[str] = None
    verwendungszweck: Optional[str] = None
    partner_name: Optional[str] = None
    partner_iban: Optional[str] = None
    betrag: Decimal
    waehrung: str
    saldo: Optional[Decimal] = None
    ist_geschaeftlich: bool
    ist_privatentnahme: bool
    ist_einlage: bool
    auto_vorschlag: Optional[str] = None
    user_ueberschrieben: bool
    kategorie_id: Optional[int] = None
    dedupe_hash: Optional[str] = None

    model_config = {"from_attributes": True}


class TransaktionKlassifizierung(BaseModel):
    ist_geschaeftlich: bool = True
    ist_privatentnahme: bool = False
    ist_einlage: bool = False
    kategorie_id: Optional[int] = None


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _dedupe_hash(tx: dict) -> str:
    raw = f"{tx.get('datum')}|{tx.get('betrag')}|{tx.get('partner_iban') or ''}|{tx.get('verwendungszweck') or ''}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _vorhandene_hashes(db: Session, konto_id: int) -> set[str]:
    rows = db.execute(
        text("SELECT dedupe_hash FROM bank_transaktionen WHERE konto_id = :kid AND dedupe_hash IS NOT NULL"),
        {"kid": konto_id},
    ).fetchall()
    return {r[0] for r in rows}


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/vorschau", response_model=VorschauResponse)
async def vorschau_import(
    datei: UploadFile = File(...),
    konto_id: int = Form(...),
    template_id: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    """Parst CSV, gibt Vorschau zurück. Nichts wird gespeichert."""
    if not db.query(Konto).filter(Konto.id == konto_id).first():
        raise HTTPException(status_code=404, detail="Konto nicht gefunden.")

    raw = await datei.read()
    templates = db.query(BankTemplate).all()

    if template_id:
        template = db.query(BankTemplate).filter(BankTemplate.id == template_id).first()
        if not template:
            raise HTTPException(status_code=404, detail="Template nicht gefunden.")
    else:
        enc = detect_encoding(raw)
        text_content = raw.decode(enc, errors="replace")
        delim = detect_delimiter(text_content)
        import csv as csv_mod
        lines = text_content.splitlines()
        reader = csv_mod.reader(lines[:1], delimiter=delim, quotechar='"')
        header = next(reader, [])
        template = find_best_template(header, templates)

    if not template:
        raise HTTPException(
            status_code=422,
            detail="Kein passendes Template gefunden. Bitte Template manuell auswählen.",
        )

    transaktionen, enc = parse_csv_mit_template(raw, template)
    hashes = _vorhandene_hashes(db, konto_id)

    result = []
    for tx in transaktionen:
        h = _dedupe_hash(tx)
        result.append(TransaktionVorschau(
            datum=tx["datum"],
            valuta=tx.get("valuta"),
            buchungstext=tx.get("buchungstext"),
            verwendungszweck=tx.get("verwendungszweck"),
            partner_name=tx.get("partner_name"),
            partner_iban=tx.get("partner_iban"),
            betrag=tx["betrag"],
            waehrung=tx.get("waehrung", "EUR"),
            saldo=tx.get("saldo"),
            referenz=tx.get("referenz"),
            dedupe_hash=h,
            ist_duplikat=h in hashes,
        ))

    return VorschauResponse(
        erkanntes_template=template.id,
        template_name=template.name,
        encoding=enc,
        transaktionen=result,
    )


@router.post("/importieren", response_model=ImportiereResponse, status_code=201)
def importieren(data: ImportiereRequest, db: Session = Depends(get_db)):
    """Speichert vom User bestätigte Transaktionen."""
    if not db.query(Konto).filter(Konto.id == data.konto_id).first():
        raise HTTPException(status_code=404, detail="Konto nicht gefunden.")
    if not db.query(BankTemplate).filter(BankTemplate.id == data.template_id).first():
        raise HTTPException(status_code=404, detail="Template nicht gefunden.")

    hashes = _vorhandene_hashes(db, data.konto_id)

    bank_import = BankImport(
        konto_id=data.konto_id,
        template_id=data.template_id,
        dateiname=data.dateiname,
        anzahl_zeilen=len(data.transaktionen),
    )
    db.add(bank_import)
    db.flush()

    erfolg = duplikate = fehler = 0

    for tx in data.transaktionen:
        if tx.dedupe_hash in hashes:
            duplikate += 1
            continue
        try:
            bt = BankTransaktion(
                konto_id=data.konto_id,
                import_id=bank_import.id,
                datum=tx.datum,
                valuta=tx.valuta,
                buchungstext=tx.buchungstext,
                verwendungszweck=tx.verwendungszweck,
                partner_name=tx.partner_name,
                partner_iban=tx.partner_iban,
                betrag=tx.betrag,
                waehrung=tx.waehrung,
                saldo=tx.saldo,
                dedupe_hash=tx.dedupe_hash,
            )
            db.add(bt)
            db.flush()
            hashes.add(tx.dedupe_hash)
            erfolg += 1
        except Exception:
            db.rollback()
            fehler += 1

    bank_import.erfolg = erfolg
    bank_import.duplikate = duplikate
    bank_import.fehler = fehler
    db.commit()

    return ImportiereResponse(
        import_id=bank_import.id,
        erfolg=erfolg,
        duplikate=duplikate,
        fehler=fehler,
    )


@router.get("/{konto_id}", response_model=list[BankTransaktionResponse])
def get_transaktionen(
    konto_id: int,
    limit: int = 200,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    """Gibt alle Transaktionen eines Kontos zurück (neueste zuerst)."""
    if not db.query(Konto).filter(Konto.id == konto_id).first():
        raise HTTPException(status_code=404, detail="Konto nicht gefunden.")
    return (
        db.query(BankTransaktion)
        .filter(BankTransaktion.konto_id == konto_id)
        .order_by(BankTransaktion.datum.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.patch("/transaktion/{tx_id}", response_model=BankTransaktionResponse)
def klassifiziere_transaktion(
    tx_id: int,
    data: TransaktionKlassifizierung,
    db: Session = Depends(get_db),
):
    """Klassifizierung einer Transaktion aktualisieren (Mischkonto)."""
    tx = db.query(BankTransaktion).filter(BankTransaktion.id == tx_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaktion nicht gefunden.")
    tx.ist_geschaeftlich = data.ist_geschaeftlich
    tx.ist_privatentnahme = data.ist_privatentnahme
    tx.ist_einlage = data.ist_einlage
    tx.kategorie_id = data.kategorie_id
    tx.user_ueberschrieben = True
    db.commit()
    db.refresh(tx)
    return tx


@router.delete("/import/{import_id}", status_code=204)
def loesche_import(import_id: int, db: Session = Depends(get_db)):
    """Löscht einen Import-Batch und alle zugehörigen Transaktionen."""
    bank_import = db.query(BankImport).filter(BankImport.id == import_id).first()
    if not bank_import:
        raise HTTPException(status_code=404, detail="Import nicht gefunden.")
    db.query(BankTransaktion).filter(BankTransaktion.import_id == import_id).delete()
    db.delete(bank_import)
    db.commit()
