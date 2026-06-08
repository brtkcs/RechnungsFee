"""
PDF-Export für das Bar-Kassenbuch (für Steuerberater / Finanzamt).
Erzeugt ein A4-Dokument mit laufendem Kassenstand je Bar-Buchung.
"""

from datetime import date
from decimal import Decimal
from io import BytesIO
from pathlib import Path
from typing import Any

import base64

from fpdf import FPDF


def _find_dejavu_dir() -> Path:
    import sys
    if getattr(sys, "frozen", False):
        p = Path(sys._MEIPASS) / "fonts"  # type: ignore[attr-defined]
        if (p / "DejaVuSans.ttf").exists():
            return p
    local = Path(__file__).parent.parent / "fonts"
    if (local / "DejaVuSans.ttf").exists():
        return local
    candidates = [
        Path("/usr/share/fonts/truetype/dejavu"),
        Path("/usr/share/fonts/dejavu"),
        Path("/usr/share/fonts/dejavu-sans-fonts"),
        Path("/usr/local/share/fonts/dejavu"),
        Path.home() / ".fonts/dejavu",
    ]
    for p in candidates:
        if (p / "DejaVuSans.ttf").exists():
            return p
    raise FileNotFoundError("DejaVu-Fonts nicht gefunden.")


def _fmt_euro(val) -> str:
    try:
        return f"{Decimal(str(val)):,.2f} €".replace(",", "X").replace(".", ",").replace("X", ".")
    except Exception:
        return "0,00 €"


def _fmt_datum(iso: str) -> str:
    try:
        y, m, d = iso.split("-")
        return f"{d}.{m}.{y}"
    except Exception:
        return iso


class KassenbuchPDF(FPDF):
    def __init__(self, unternehmen: dict, datum_von: str, datum_bis: str):
        super().__init__(orientation="L", unit="mm", format="A4")
        self.unt = unternehmen
        self.datum_von = datum_von
        self.datum_bis = datum_bis
        font_dir = _find_dejavu_dir()
        self.add_font("DejaVu", "", str(font_dir / "DejaVuSans.ttf"))
        self.add_font("DejaVu", "B", str(font_dir / "DejaVuSans-Bold.ttf"))
        self.set_auto_page_break(auto=True, margin=15)
        self.add_page()

    def header(self):
        self.set_font("DejaVu", "B", 11)
        self.cell(0, 7, self.unt.get("firmenname", ""), ln=True)
        self.set_font("DejaVu", "", 9)
        self.cell(0, 5, f"Kassenbuch (Bar) – {_fmt_datum(self.datum_von)} bis {_fmt_datum(self.datum_bis)}", ln=True)
        self.ln(2)
        self.set_draw_color(180, 180, 180)
        self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
        self.ln(3)

    def footer(self):
        self.set_y(-12)
        self.set_font("DejaVu", "", 8)
        self.set_text_color(150, 150, 150)
        self.cell(0, 5, f"Seite {self.page_no()}", align="C")
        self.set_text_color(0, 0, 0)


# Spaltenbreiten (Querformat A4 = 297mm nutzbar ~267mm)
COL = {
    "datum":       28,
    "belegnr":     30,
    "beschreibung": 90,
    "kategorie":   40,
    "einnahme":    28,
    "ausgabe":     28,
    "kassenstand": 28,
}
ROW_H = 6


def _row(pdf: FPDF, cols: dict[str, str], bold: bool = False, fill: bool = False,
         fill_color: tuple = (240, 240, 240)):
    style = "B" if bold else ""
    pdf.set_font("DejaVu", style, 8)
    if fill:
        pdf.set_fill_color(*fill_color)
    pdf.cell(COL["datum"],       ROW_H, cols.get("datum", ""),        border=0, fill=fill)
    pdf.cell(COL["belegnr"],     ROW_H, cols.get("belegnr", ""),      border=0, fill=fill)
    pdf.cell(COL["beschreibung"],ROW_H, cols.get("beschreibung", ""), border=0, fill=fill)
    pdf.cell(COL["kategorie"],   ROW_H, cols.get("kategorie", ""),    border=0, fill=fill)
    pdf.cell(COL["einnahme"],    ROW_H, cols.get("einnahme", ""),     border=0, align="R", fill=fill)
    pdf.cell(COL["ausgabe"],     ROW_H, cols.get("ausgabe", ""),      border=0, align="R", fill=fill)
    pdf.cell(COL["kassenstand"], ROW_H, cols.get("kassenstand", ""),  border=0, align="R", fill=fill, ln=True)


def erstelle_kassenbuch_pdf(
    unternehmen: dict,
    eintraege: list[dict],
    anfangsbestand: Decimal,
    datum_von: str,
    datum_bis: str,
) -> bytes:
    pdf = KassenbuchPDF(unternehmen, datum_von, datum_bis)

    # Kopfzeile
    _row(pdf, {
        "datum": "Datum", "belegnr": "Beleg-Nr.",
        "beschreibung": "Beschreibung", "kategorie": "Kategorie",
        "einnahme": "Einnahme", "ausgabe": "Ausgabe", "kassenstand": "Kassenstand",
    }, bold=True, fill=True, fill_color=(220, 220, 220))

    # Anfangsbestand
    pdf.set_draw_color(200, 200, 200)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
    _row(pdf, {
        "datum": _fmt_datum(datum_von),
        "beschreibung": "Anfangsbestand",
        "kassenstand": _fmt_euro(anfangsbestand),
    }, bold=True, fill=True, fill_color=(235, 245, 255))
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())

    kassenstand = anfangsbestand
    for i, e in enumerate(eintraege):
        betrag = Decimal(str(e.get("brutto_betrag", 0)))
        art = e.get("art", "")
        if art == "Einnahme":
            kassenstand += betrag
            einnahme_str = _fmt_euro(betrag)
            ausgabe_str = ""
        else:
            kassenstand -= betrag
            einnahme_str = ""
            ausgabe_str = _fmt_euro(betrag)

        fill = i % 2 == 0
        _row(pdf, {
            "datum":        _fmt_datum(e.get("datum", "")),
            "belegnr":      e.get("belegnr", ""),
            "beschreibung": (e.get("beschreibung", "") or "")[:45],
            "kategorie":    (e.get("kategorie_name", "") or "")[:22],
            "einnahme":     einnahme_str,
            "ausgabe":      ausgabe_str,
            "kassenstand":  _fmt_euro(kassenstand),
        }, fill=fill, fill_color=(248, 248, 248))

    # Abschlusszeile
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
    _row(pdf, {
        "beschreibung": "Endbestand",
        "kassenstand":  _fmt_euro(kassenstand),
    }, bold=True, fill=True, fill_color=(235, 245, 255))

    # Unterschrifts- / Signaturfeld
    from datetime import date as _date
    pdf.ln(10)
    pdf.set_font("DejaVu", "", 9)
    ort = unternehmen.get("ort", "")
    export_datum = _fmt_datum(str(_date.today()))
    datum_ort = f"{ort}, {export_datum}" if ort else export_datum
    unterschrift_name = unternehmen.get("unterschrift_name", "")
    unterschrift_b64 = unternehmen.get("unterschrift_bild") or ""

    # Zeile: Betriebssitz + Datum
    pdf.cell(0, 5, f"Betriebssitz, Datum: {datum_ort}", ln=True)
    pdf.ln(2)

    # Unterschrift: Bild wenn vorhanden, sonst Linie
    if unterschrift_b64:
        try:
            raw = unterschrift_b64.split(",", 1)[-1]
            img_bytes = base64.b64decode(raw)
            pdf.image(BytesIO(img_bytes), x=pdf.l_margin, y=pdf.get_y(), w=60, h=15)
            pdf.ln(16)
        except Exception:
            unterschrift_b64 = ""  # Fallback auf Linie
    if not unterschrift_b64:
        pdf.ln(10)
    pdf.set_draw_color(80, 80, 100)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.l_margin + 90, pdf.get_y())
    pdf.ln(1)
    pdf.set_font("DejaVu", "", 7)
    pdf.set_text_color(120, 120, 130)
    pdf.cell(0, 4, f"Unterschrift  –  {unterschrift_name}", ln=True)
    pdf.set_text_color(0, 0, 0)


    return bytes(pdf.output())
