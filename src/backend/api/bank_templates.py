"""
API-Endpunkte für Bank-CSV-Import-Templates.
"""

import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from database.connection import get_db
from database.models import BankTemplate

router = APIRouter(prefix="/api/bank-templates", tags=["Bank-Import"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class BankTemplateResponse(BaseModel):
    id: str
    name: str
    bank: str
    format: str
    delimiter: str
    encoding: str
    decimal_separator: str
    date_format: str
    skip_rows: int
    column_mapping: dict
    ist_system: bool
    autor: Optional[str] = None

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_with_parsed(cls, obj: BankTemplate) -> "BankTemplateResponse":
        mapping = json.loads(obj.column_mapping) if obj.column_mapping else {}
        return cls(
            id=obj.id,
            name=obj.name,
            bank=obj.bank,
            format=obj.format,
            delimiter=obj.delimiter,
            encoding=obj.encoding,
            decimal_separator=obj.decimal_separator,
            date_format=obj.date_format,
            skip_rows=obj.skip_rows,
            column_mapping=mapping,
            ist_system=obj.ist_system,
            autor=obj.autor,
        )


class BankTemplateCreate(BaseModel):
    id: str
    name: str
    bank: str
    format: str = "Standard"
    delimiter: str = ";"
    encoding: str = "UTF-8"
    decimal_separator: str = ","
    date_format: str = "%d.%m.%Y"
    skip_rows: int = 0
    column_mapping: dict
    autor: Optional[str] = None


class BankTemplateUpdate(BaseModel):
    name: Optional[str] = None
    bank: Optional[str] = None
    format: Optional[str] = None
    delimiter: Optional[str] = None
    encoding: Optional[str] = None
    decimal_separator: Optional[str] = None
    date_format: Optional[str] = None
    skip_rows: Optional[int] = None
    column_mapping: Optional[dict] = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=list[BankTemplateResponse])
def list_templates(db: Session = Depends(get_db)):
    templates = db.query(BankTemplate).order_by(BankTemplate.ist_system.desc(), BankTemplate.bank).all()
    return [BankTemplateResponse.from_orm_with_parsed(t) for t in templates]


@router.post("", response_model=BankTemplateResponse, status_code=201)
def create_template(data: BankTemplateCreate, db: Session = Depends(get_db)):
    if db.query(BankTemplate).filter(BankTemplate.id == data.id).first():
        raise HTTPException(status_code=409, detail=f"Template-ID '{data.id}' bereits vorhanden.")
    tpl = BankTemplate(
        id=data.id,
        name=data.name,
        bank=data.bank,
        format=data.format,
        delimiter=data.delimiter,
        encoding=data.encoding,
        decimal_separator=data.decimal_separator,
        date_format=data.date_format,
        skip_rows=data.skip_rows,
        column_mapping=json.dumps(data.column_mapping, ensure_ascii=False),
        ist_system=False,
        autor=data.autor,
    )
    db.add(tpl)
    db.commit()
    db.refresh(tpl)
    return BankTemplateResponse.from_orm_with_parsed(tpl)


@router.put("/{template_id}", response_model=BankTemplateResponse)
def update_template(template_id: str, data: BankTemplateUpdate, db: Session = Depends(get_db)):
    tpl = db.query(BankTemplate).filter(BankTemplate.id == template_id).first()
    if not tpl:
        raise HTTPException(status_code=404, detail="Template nicht gefunden.")
    if tpl.ist_system:
        raise HTTPException(status_code=403, detail="System-Templates können nicht bearbeitet werden.")
    for key, value in data.model_dump(exclude_none=True).items():
        if key == "column_mapping":
            setattr(tpl, key, json.dumps(value, ensure_ascii=False))
        else:
            setattr(tpl, key, value)
    db.commit()
    db.refresh(tpl)
    return BankTemplateResponse.from_orm_with_parsed(tpl)


@router.delete("/{template_id}", status_code=204)
def delete_template(template_id: str, db: Session = Depends(get_db)):
    tpl = db.query(BankTemplate).filter(BankTemplate.id == template_id).first()
    if not tpl:
        raise HTTPException(status_code=404, detail="Template nicht gefunden.")
    if tpl.ist_system:
        raise HTTPException(status_code=403, detail="System-Templates können nicht gelöscht werden.")
    db.delete(tpl)
    db.commit()
