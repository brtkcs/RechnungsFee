"""
CSV-Parser für Bank-Kontoauszüge.

Verwendet stdlib csv + charset-normalizer (kein pandas).
Gibt list[dict] zurück – kein SQLAlchemy-Bezug.
"""

import csv
import io
import json
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Optional

from charset_normalizer import from_bytes


# ---------------------------------------------------------------------------
# Encoding & Delimiter
# ---------------------------------------------------------------------------

def detect_encoding(raw: bytes) -> str:
    result = from_bytes(raw).best()
    if result is None:
        return "UTF-8"
    return result.encoding or "UTF-8"


def detect_delimiter(text: str) -> str:
    """Zählt Vorkommen typischer Delimiter in der ersten Zeile."""
    first_line = text.split("\n")[0]
    counts = {";": first_line.count(";"), ",": first_line.count(","), "\t": first_line.count("\t")}
    return max(counts, key=lambda k: counts[k])


# ---------------------------------------------------------------------------
# Template-Matching
# ---------------------------------------------------------------------------

def match_score(header: list[str], erkennungs_spalten: list[str]) -> float:
    """Gibt Anteil der Erkennungsspalten zurück die im Header vorkommen (0.0–1.0)."""
    if not erkennungs_spalten:
        return 0.0
    header_clean = [h.strip().strip('"') for h in header]
    treffer = sum(1 for s in erkennungs_spalten if s in header_clean)
    return treffer / len(erkennungs_spalten)


def find_best_template(header: list[str], templates: list) -> Optional[object]:
    """Gibt das Template mit dem höchsten Match-Score zurück (mind. 0.8)."""
    best = None
    best_score = 0.0
    for tpl in templates:
        mapping = json.loads(tpl.column_mapping) if isinstance(tpl.column_mapping, str) else tpl.column_mapping
        erkennungs = mapping.get("__erkennungs__", [])
        score = match_score(header, erkennungs)
        if score > best_score:
            best_score = score
            best = tpl
    if best_score >= 0.8:
        return best
    return None


# ---------------------------------------------------------------------------
# Datums- & Betrags-Konvertierung
# ---------------------------------------------------------------------------

def parse_datum(wert: str, fmt: str) -> Optional[date]:
    wert = wert.strip()
    if not wert:
        return None
    try:
        return datetime.strptime(wert, fmt).date()
    except ValueError:
        for fallback in ("%d.%m.%Y", "%d.%m.%y", "%Y-%m-%d", "%d/%m/%Y"):
            try:
                return datetime.strptime(wert, fallback).date()
            except ValueError:
                continue
    return None


def parse_betrag(wert: str, decimal_sep: str = ",") -> Optional[Decimal]:
    wert = wert.strip().replace(" ", "").replace("\xa0", "")
    if not wert:
        return None
    if decimal_sep == ",":
        wert = wert.replace(".", "").replace(",", ".")
    else:
        wert = wert.replace(",", "")
    try:
        return Decimal(wert)
    except InvalidOperation:
        return None


# ---------------------------------------------------------------------------
# Haupt-Parser
# ---------------------------------------------------------------------------

def parse_csv(
    raw: bytes,
    column_mapping: dict,
    delimiter: Optional[str] = None,
    encoding: Optional[str] = None,
    decimal_separator: str = ",",
    date_format: str = "%d.%m.%Y",
    skip_rows: int = 0,
) -> list[dict]:
    """
    Parst eine Bank-CSV-Datei anhand des column_mapping und gibt eine Liste
    von normalisierten Transaktions-Dicts zurück.

    Jedes Dict enthält die Schlüssel:
        datum, valuta, buchungstext, verwendungszweck,
        partner_name, partner_iban, partner_bic,
        betrag, waehrung, saldo, referenz
    """
    enc = encoding or detect_encoding(raw)
    text = raw.decode(enc, errors="replace")
    delim = delimiter or detect_delimiter(text)

    # Mapping ohne internen Sonderkey
    mapping = {k: v for k, v in column_mapping.items() if not k.startswith("__")}

    lines = text.splitlines()
    lines = lines[skip_rows:]  # Kopfzeilen überspringen (z.B. ING hat 13 Metazeilen)
    reader = csv.DictReader(lines, delimiter=delim, quotechar='"')

    ergebnis = []
    for row in reader:
        tx: dict = {
            "datum": None,
            "valuta": None,
            "buchungstext": None,
            "verwendungszweck": None,
            "partner_name": None,
            "partner_iban": None,
            "partner_bic": None,
            "betrag": None,
            "waehrung": "EUR",
            "saldo": None,
            "referenz": None,
            "roh": dict(row),  # Originaldaten für Debugging
        }

        for csv_spalte, ziel_feld in mapping.items():
            wert = row.get(csv_spalte, "").strip()
            if not wert:
                continue

            if ziel_feld == "datum":
                tx["datum"] = parse_datum(wert, date_format)
            elif ziel_feld == "valuta":
                tx["valuta"] = parse_datum(wert, date_format)
            elif ziel_feld == "betrag":
                tx["betrag"] = parse_betrag(wert, decimal_separator)
            elif ziel_feld == "saldo":
                tx["saldo"] = parse_betrag(wert, decimal_separator)
            elif ziel_feld == "waehrung":
                tx["waehrung"] = wert[:3].upper()
            elif ziel_feld == "partner_name" and not tx["partner_name"]:
                tx["partner_name"] = wert[:200]
            elif ziel_feld == "partner_name_alt" and not tx["partner_name"]:
                # Fallback-Feld (z.B. DKB: Zahlungspflichtiger vs. Zahlungsempfänger)
                tx["partner_name"] = wert[:200]
            elif ziel_feld in tx:
                tx[ziel_feld] = wert

        # Zeile nur übernehmen wenn Datum und Betrag vorhanden
        if tx["datum"] is not None and tx["betrag"] is not None:
            ergebnis.append(tx)

    return ergebnis


def parse_csv_mit_template(raw: bytes, template) -> tuple[list[dict], str]:
    """
    Parst raw-Bytes mit einem BankTemplate-Objekt.
    Gibt (transaktionen, erkannte_encoding) zurück.
    """
    mapping = json.loads(template.column_mapping) if isinstance(template.column_mapping, str) else template.column_mapping
    enc = detect_encoding(raw)

    transaktionen = parse_csv(
        raw=raw,
        column_mapping=mapping,
        delimiter=template.delimiter,
        encoding=template.encoding or enc,
        decimal_separator=template.decimal_separator,
        date_format=template.date_format,
        skip_rows=template.skip_rows,
    )
    return transaktionen, enc
