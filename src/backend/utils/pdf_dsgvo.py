"""
PDF-Export für DSGVO-Datenauskunft (Art. 15).
Erzeugt ein lesbares A4-Dokument mit allen gespeicherten Daten
zu einer Person (Kunde oder Lieferant).
"""

from datetime import date
from io import BytesIO
from pathlib import Path
from typing import Any

from fpdf import FPDF


# ---------------------------------------------------------------------------
# Font-Erkennung (analog zu pdf_tagesabschluss.py)
# ---------------------------------------------------------------------------

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
    raise FileNotFoundError(
        "DejaVu-Fonts nicht gefunden. Bitte 'fonts-dejavu-core' installieren."
    )


# ---------------------------------------------------------------------------
# Farben
# ---------------------------------------------------------------------------

GRAU_HELL = (245, 246, 248)
GRAU_RAND = (220, 220, 224)
BLAU = (37, 99, 235)
DUNKELGRAU = (71, 85, 105)


# ---------------------------------------------------------------------------
# Hilfsfunktionen
# ---------------------------------------------------------------------------

def _fmt_datum(iso: str | None) -> str:
    if not iso:
        return "–"
    try:
        y, m, d = str(iso).split("-")
        return f"{d}.{m}.{y}"
    except Exception:
        return str(iso)


def _fmt_euro(val: Any) -> str:
    try:
        n = float(str(val))
    except (ValueError, TypeError):
        n = 0.0
    formatted = f"{abs(n):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    prefix = "-" if n < -0.001 else ""
    return f"{prefix}{formatted} EUR"


def _val(v: Any) -> str:
    if v is None or v == "":
        return "–"
    return str(v)


# ---------------------------------------------------------------------------
# PDF-Klasse
# ---------------------------------------------------------------------------

class DsgvoPDF(FPDF):
    def __init__(self, name: str, export_datum: str):
        super().__init__()
        self._name = name
        self._export_datum = export_datum
        font_dir = _find_dejavu_dir()
        self.add_font("DejaVu", "", str(font_dir / "DejaVuSans.ttf"))
        self.add_font("DejaVu", "B", str(font_dir / "DejaVuSans-Bold.ttf"))
        self.set_auto_page_break(auto=True, margin=20)
        self.set_margins(20, 20, 20)

    def header(self):
        self.set_font("DejaVu", "B", 9)
        self.set_text_color(*DUNKELGRAU)
        self.cell(0, 6, "Datenauskunft gemäß DSGVO Art. 15", align="L")
        self.set_font("DejaVu", "", 9)
        self.cell(0, 6, f"Exportiert am {self._export_datum}", align="R", new_x="LMARGIN", new_y="NEXT")
        self.set_draw_color(*GRAU_RAND)
        self.set_line_width(0.3)
        self.line(20, self.get_y(), 190, self.get_y())
        self.ln(4)

    def footer(self):
        self.set_y(-15)
        self.set_font("DejaVu", "", 8)
        self.set_text_color(*DUNKELGRAU)
        self.cell(0, 6, f"Seite {self.page_no()} – {self._name}", align="C")

    def section_title(self, title: str):
        self.set_font("DejaVu", "B", 11)
        self.set_text_color(*BLAU)
        self.set_fill_color(*GRAU_HELL)
        self.set_draw_color(*GRAU_RAND)
        self.rect(20, self.get_y(), 170, 8, style="FD")
        self.cell(170, 8, f"  {title}", align="L", new_x="LMARGIN", new_y="NEXT")
        self.set_text_color(0, 0, 0)
        self.ln(2)

    def key_value(self, key: str, value: str):
        self.set_font("DejaVu", "B", 9)
        self.set_text_color(*DUNKELGRAU)
        self.cell(55, 6, key, align="L")
        self.set_font("DejaVu", "", 9)
        self.set_text_color(30, 30, 30)
        self.multi_cell(115, 6, value, align="L", new_x="LMARGIN", new_y="NEXT")

    def rechnung_zeile(self, rechnung: dict):
        y = self.get_y()
        if y > 260:
            self.add_page()

        rnr = _val(rechnung.get("rechnungsnummer"))
        datum = _fmt_datum(rechnung.get("datum"))
        brutto = _fmt_euro(rechnung.get("brutto_gesamt", 0))
        status = _val(rechnung.get("zahlungsstatus"))
        storniert = rechnung.get("storniert", False)

        self.set_font("DejaVu", "B", 9)
        self.set_text_color(30, 30, 30)
        label = f"Rechnung {rnr}" + (" [STORNIERT]" if storniert else "")
        self.cell(0, 6, label, new_x="LMARGIN", new_y="NEXT")

        self.set_font("DejaVu", "", 8.5)
        self.set_text_color(*DUNKELGRAU)
        self.cell(40, 5, f"Datum: {datum}")
        self.cell(60, 5, f"Betrag: {brutto}")
        self.cell(0, 5, f"Status: {status}", new_x="LMARGIN", new_y="NEXT")

        positionen = rechnung.get("positionen", [])
        if positionen:
            self.set_font("DejaVu", "", 8)
            for p in positionen:
                beschr = _val(p.get("beschreibung"))
                menge = _val(p.get("menge"))
                einheit = _val(p.get("einheit"))
                brutto_p = _fmt_euro(p.get("brutto", 0))
                self.set_x(25)
                self.cell(0, 5, f"• {beschr}  ({menge} {einheit}, {brutto_p})",
                          new_x="LMARGIN", new_y="NEXT")

        self.set_draw_color(*GRAU_RAND)
        self.set_line_width(0.2)
        self.line(20, self.get_y() + 1, 190, self.get_y() + 1)
        self.ln(3)

    def buchung_zeile(self, eintrag: dict):
        y = self.get_y()
        if y > 265:
            self.add_page()

        datum = _fmt_datum(eintrag.get("datum"))
        belegnr = _val(eintrag.get("belegnr"))
        beschr = _val(eintrag.get("beschreibung"))
        art = _val(eintrag.get("art"))
        betrag = _fmt_euro(eintrag.get("brutto_betrag", 0))
        zahlungsart = _val(eintrag.get("zahlungsart"))

        self.set_font("DejaVu", "", 8.5)
        self.set_text_color(30, 30, 30)
        self.cell(22, 5, datum)
        self.cell(32, 5, belegnr)
        self.cell(70, 5, beschr[:45] + ("…" if len(beschr) > 45 else ""))
        self.cell(18, 5, art)
        self.cell(28, 5, betrag, align="R")
        self.cell(0, 5, zahlungsart, new_x="LMARGIN", new_y="NEXT")


# ---------------------------------------------------------------------------
# Öffentliche Funktion
# ---------------------------------------------------------------------------

def generate_dsgvo_pdf(
    stammdaten: dict,
    rechnungen: list[dict],
    journal: list[dict] | None,
    person_typ: str,  # "Kunde" oder "Lieferant"
) -> bytes:
    """Erzeugt die DSGVO-Datenauskunft als PDF und gibt die Bytes zurück."""
    name_teile = [
        stammdaten.get("firmenname") or "",
        stammdaten.get("vorname") or "",
        stammdaten.get("nachname") or "",
    ]
    name = " ".join(t for t in name_teile if t) or f"{person_typ} #{stammdaten.get('id', '?')}"
    export_datum = _fmt_datum(str(date.today()))

    pdf = DsgvoPDF(name=name, export_datum=export_datum)
    pdf.add_page()

    # Titel
    pdf.set_font("DejaVu", "B", 16)
    pdf.set_text_color(30, 30, 30)
    pdf.cell(0, 10, "Datenauskunft", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("DejaVu", "", 10)
    pdf.set_text_color(*DUNKELGRAU)
    pdf.cell(0, 6, f"gemäß DSGVO Art. 15 (Auskunftsrecht) und Art. 20 (Datenportabilität)",
             new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 6, f"Betrifft: {name}  |  Exportiert am: {export_datum}",
             new_x="LMARGIN", new_y="NEXT")
    pdf.ln(6)

    # Stammdaten
    pdf.section_title(f"Stammdaten ({person_typ})")
    nummer_key = "Kundennummer" if person_typ == "Kunde" else "Lieferantennummer"
    nummer_val = stammdaten.get("kundennummer") or stammdaten.get("lieferantennummer")
    pdf.key_value(nummer_key, _val(nummer_val))
    pdf.key_value("Firmenname", _val(stammdaten.get("firmenname")))
    pdf.key_value("Vorname", _val(stammdaten.get("vorname")))
    pdf.key_value("Nachname", _val(stammdaten.get("nachname")))
    adresse = " ".join(t for t in [
        stammdaten.get("strasse") or "",
        stammdaten.get("hausnummer") or "",
    ] if t)
    ort = " ".join(t for t in [
        stammdaten.get("plz") or "",
        stammdaten.get("ort") or "",
        stammdaten.get("land") or "",
    ] if t)
    pdf.key_value("Adresse", _val(adresse) if adresse else "–")
    pdf.key_value("Ort", _val(ort) if ort else "–")
    pdf.key_value("E-Mail", _val(stammdaten.get("email")))
    pdf.key_value("Telefon", _val(stammdaten.get("telefon")))
    pdf.key_value("USt-IdNr.", _val(stammdaten.get("ust_idnr")))
    if stammdaten.get("notizen"):
        pdf.key_value("Notizen", _val(stammdaten.get("notizen")))
    pdf.ln(4)

    # Rechnungen
    pdf.section_title(f"Rechnungen ({len(rechnungen)})")
    if rechnungen:
        for r in rechnungen:
            pdf.rechnung_zeile(r)
    else:
        pdf.set_font("DejaVu", "", 9)
        pdf.set_text_color(*DUNKELGRAU)
        pdf.cell(0, 6, "Keine Rechnungen vorhanden.", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    # Journalbuchungen (nur bei Kunden)
    if journal is not None:
        pdf.section_title(f"Journalbuchungen ({len(journal)})")
        if journal:
            # Spaltenüberschriften
            pdf.set_font("DejaVu", "B", 8.5)
            pdf.set_text_color(*DUNKELGRAU)
            pdf.set_fill_color(*GRAU_HELL)
            pdf.cell(22, 6, "Datum", fill=True)
            pdf.cell(32, 6, "Belegnr.", fill=True)
            pdf.cell(70, 6, "Beschreibung", fill=True)
            pdf.cell(18, 6, "Art", fill=True)
            pdf.cell(28, 6, "Betrag", align="R", fill=True)
            pdf.cell(0, 6, "Zahlungsart", fill=True, new_x="LMARGIN", new_y="NEXT")
            pdf.set_text_color(30, 30, 30)
            for e in journal:
                pdf.buchung_zeile(e)
        else:
            pdf.set_font("DejaVu", "", 9)
            pdf.set_text_color(*DUNKELGRAU)
            pdf.cell(0, 6, "Keine Journalbuchungen vorhanden.", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(4)

    # Rechtshinweis
    pdf.set_font("DejaVu", "", 8)
    pdf.set_text_color(*DUNKELGRAU)
    pdf.multi_cell(
        0, 5,
        "Dieses Dokument wurde maschinell erstellt und gibt alle zu Ihrer Person "
        "gespeicherten Daten gemäß DSGVO Art. 15 wieder. "
        "Für Fragen oder zur Geltendmachung weiterer Rechte (Berichtigung, Löschung) "
        "wenden Sie sich an den Verantwortlichen.",
        align="L",
    )

    buf = BytesIO()
    pdf.output(buf)
    return buf.getvalue()
