"""
PDF-Generator für Anlage EKS (Einkommenserklärung für Selbstständige).
Erstellt eine übersichtliche A4-Zusammenfassung mit Tabellen A, B und C.
"""

from datetime import date
from io import BytesIO
from pathlib import Path
from typing import Any


from fpdf import FPDF


# ---------------------------------------------------------------------------
# Font-Erkennung
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
# Farben & Layout-Konstanten
# ---------------------------------------------------------------------------

GRAU_HELL   = (245, 246, 248)
GRAU_RAND   = (220, 220, 224)
BLAU        = (37,  99,  235)
DUNKELGRAU  = (71,  85,  105)
GRUEN       = (22,  163,  74)
ORANGE      = (234, 88,   12)
LILA        = (109,  40, 217)

TABELLEN_FARBEN = {
    "A": GRUEN,
    "B": ORANGE,
    "C": LILA,
}

TABELLEN_TITEL = {
    "A": "Tabelle A – Einnahmen",
    "B": "Tabelle B – Ausgaben / Betriebskosten",
    "C": "Tabelle C – Absetzungen",
}


# ---------------------------------------------------------------------------
# Hilfsfunktionen
# ---------------------------------------------------------------------------

def _fmt_datum(iso: str | date | None) -> str:
    if not iso:
        return "–"
    try:
        s = str(iso)
        y, m, d = s.split("-")
        return f"{d}.{m}.{y}"
    except Exception:
        return str(iso)


def _fmt_euro(val: Any) -> str:
    try:
        n = float(str(val))
    except (ValueError, TypeError):
        n = 0.0
    formatted = f"{abs(n):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    prefix = "−" if n < -0.001 else ""
    return f"{prefix}{formatted} EUR"


def _ist_leer(val: Any) -> bool:
    try:
        return abs(float(str(val))) < 0.005
    except (ValueError, TypeError):
        return True


# ---------------------------------------------------------------------------
# PDF-Klasse
# ---------------------------------------------------------------------------

class EksPDF(FPDF):
    def __init__(self, zeitraum_von: date, zeitraum_bis: date, art: str):
        super().__init__()
        self._zeitraum = f"{_fmt_datum(zeitraum_von)} – {_fmt_datum(zeitraum_bis)}"
        self._art_label = "vorläufig" if art == "vorlaeufig" else "abschließend"
        font_dir = _find_dejavu_dir()
        self.add_font("DejaVu", "",  str(font_dir / "DejaVuSans.ttf"))
        self.add_font("DejaVu", "B", str(font_dir / "DejaVuSans-Bold.ttf"))
        self.set_auto_page_break(auto=True, margin=22)
        self.set_margins(18, 18, 18)

    def header(self):
        self.set_font("DejaVu", "B", 8)
        self.set_text_color(*DUNKELGRAU)
        self.cell(0, 5, f"Anlage EKS – Zeitraum: {self._zeitraum}", align="L")
        self.set_font("DejaVu", "", 8)
        self.cell(0, 5, f"Erklärung: {self._art_label}", align="R",
                  new_x="LMARGIN", new_y="NEXT")
        self.set_draw_color(*GRAU_RAND)
        self.set_line_width(0.3)
        self.line(18, self.get_y(), 192, self.get_y())
        self.ln(3)

    def footer(self):
        self.set_y(-14)
        self.set_font("DejaVu", "", 7.5)
        self.set_text_color(*DUNKELGRAU)
        self.cell(0, 5, f"Seite {self.page_no()}  |  Anlage EKS – {self._zeitraum}", align="C")

    def tabellen_header(self, tabelle: str):
        farbe = TABELLEN_FARBEN.get(tabelle, BLAU)
        titel = TABELLEN_TITEL.get(tabelle, f"Tabelle {tabelle}")
        self.ln(2)
        self.set_fill_color(*farbe)
        self.set_text_color(255, 255, 255)
        self.set_font("DejaVu", "B", 10)
        self.rect(18, self.get_y(), 174, 8, style="F")
        self.cell(174, 8, f"  {titel}", align="L", new_x="LMARGIN", new_y="NEXT")
        self.set_text_color(0, 0, 0)
        self.ln(1)

        # Spaltenüberschriften
        self.set_fill_color(*GRAU_HELL)
        self.set_draw_color(*GRAU_RAND)
        self.set_font("DejaVu", "B", 8.5)
        self.set_text_color(*DUNKELGRAU)
        self.cell(18,  6, "Code",        fill=True, border=1)
        self.cell(108, 6, "Bezeichnung", fill=True, border=1)
        self.cell(12,  6, "Auto",        fill=True, border=1, align="C")
        self.cell(36,  6, "Betrag",      fill=True, border=1, align="R",
                  new_x="LMARGIN", new_y="NEXT")
        self.set_text_color(30, 30, 30)

    def feld_zeile(self, code: str, label: str, auto: bool, wert: str):
        if self.get_y() > 268:
            self.add_page()

        betrag_str = _fmt_euro(wert)
        leer = _ist_leer(wert)

        self.set_font("DejaVu", "B" if not leer else "", 8.5)
        if leer:
            self.set_text_color(*DUNKELGRAU)
        else:
            self.set_text_color(30, 30, 30)

        self.cell(18,  6, code,                      border=1)
        self.set_font("DejaVu", "", 8.5)
        self.cell(108, 6, label,                     border=1)
        auto_sym = "✔" if auto else ""
        self.cell(12,  6, auto_sym,                  border=1, align="C")
        self.set_font("DejaVu", "B" if not leer else "", 8.5)
        if not leer:
            self.set_text_color(*BLAU)
        self.cell(36,  6, betrag_str,                border=1, align="R",
                  new_x="LMARGIN", new_y="NEXT")
        self.set_text_color(30, 30, 30)

    def summen_zeile(self, label: str, wert: float):
        self.set_font("DejaVu", "B", 9)
        self.set_fill_color(*GRAU_HELL)
        self.set_text_color(*DUNKELGRAU)
        self.cell(138, 7, label, fill=True, border=1)
        self.cell(36,  7, _fmt_euro(wert), fill=True, border=1, align="R",
                  new_x="LMARGIN", new_y="NEXT")
        self.set_text_color(30, 30, 30)
        self.ln(2)


# ---------------------------------------------------------------------------
# Öffentliche Funktion
# ---------------------------------------------------------------------------

def generate_eks_pdf(
    zeitraum_von: date,
    zeitraum_bis: date,
    art: str,
    felder: list[dict],
    unternehmen: dict,
) -> bytes:
    """Erzeugt die EKS-Zusammenfassung als PDF und gibt die Bytes zurück.

    felder: Liste von Dicts mit tabelle, code, label, auto, wert
    unternehmen: Dict mit firmenname, vorname, nachname, strasse, plz, ort, steuernummer
    """
    pdf = EksPDF(zeitraum_von=zeitraum_von, zeitraum_bis=zeitraum_bis, art=art)
    pdf.add_page()

    art_label = "vorläufig" if art == "vorlaeufig" else "abschließend"

    # --- Titel ---
    pdf.set_font("DejaVu", "B", 16)
    pdf.set_text_color(30, 30, 30)
    pdf.cell(0, 10, "Anlage EKS", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("DejaVu", "", 10)
    pdf.set_text_color(*DUNKELGRAU)
    pdf.cell(0, 6, "Einkommenserklärung für Selbstständige (Jobcenter / Bürgergeld)",
             new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    # --- Personendaten ---
    name = " ".join(t for t in [
        unternehmen.get("firmenname") or "",
        unternehmen.get("vorname") or "",
        unternehmen.get("nachname") or "",
    ] if t)
    adresse = f"{unternehmen.get('strasse', '')}  |  {unternehmen.get('plz', '')} {unternehmen.get('ort', '')}".strip(" |")
    steuernr = unternehmen.get("steuernummer") or "–"

    pdf.set_font("DejaVu", "B", 9)
    pdf.set_text_color(30, 30, 30)
    if name:
        pdf.cell(35, 6, "Name / Firma:")
        pdf.set_font("DejaVu", "", 9)
        pdf.cell(0, 6, name, new_x="LMARGIN", new_y="NEXT")
    if adresse.strip("| "):
        pdf.set_font("DejaVu", "B", 9)
        pdf.cell(35, 6, "Adresse:")
        pdf.set_font("DejaVu", "", 9)
        pdf.cell(0, 6, adresse, new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("DejaVu", "B", 9)
    pdf.cell(35, 6, "Steuernummer:")
    pdf.set_font("DejaVu", "", 9)
    pdf.cell(0, 6, steuernr, new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("DejaVu", "B", 9)
    pdf.cell(35, 6, "Zeitraum:")
    pdf.set_font("DejaVu", "", 9)
    pdf.cell(0, 6,
             f"{_fmt_datum(zeitraum_von)} – {_fmt_datum(zeitraum_bis)}  ({art_label})",
             new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    # --- Tabellen A, B, C ---
    felder_nach_tabelle: dict[str, list[dict]] = {}
    for f in felder:
        t = f["tabelle"]
        felder_nach_tabelle.setdefault(t, []).append(f)

    summe_einnahmen = 0.0
    summe_ausgaben  = 0.0
    summe_absetzungen = 0.0

    for tabelle in ("A", "B", "C"):
        felder_t = felder_nach_tabelle.get(tabelle, [])
        if not felder_t:
            continue

        pdf.tabellen_header(tabelle)
        tabellen_summe = 0.0
        for f in felder_t:
            pdf.feld_zeile(f["code"], f["label"], f["auto"], f["wert"])
            try:
                tabellen_summe += float(str(f["wert"]))
            except (ValueError, TypeError):
                pass

        if tabelle == "A":
            pdf.summen_zeile("Summe Einnahmen (Tabelle A)", tabellen_summe)
            summe_einnahmen = tabellen_summe
        elif tabelle == "B":
            pdf.summen_zeile("Summe Ausgaben (Tabelle B)", tabellen_summe)
            summe_ausgaben = tabellen_summe
        elif tabelle == "C":
            pdf.summen_zeile("Summe Absetzungen (Tabelle C)", tabellen_summe)
            summe_absetzungen = tabellen_summe

    # --- Ergebniszeile ---
    pdf.ln(3)
    einkommen = summe_einnahmen - summe_ausgaben - summe_absetzungen

    pdf.set_fill_color(*BLAU)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("DejaVu", "B", 10)
    pdf.cell(138, 9, "  Zu berücksichtigendes Einkommen (A − B − C)", fill=True, border=1)
    pdf.cell(36,  9, _fmt_euro(einkommen), fill=True, border=1, align="R",
             new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(30, 30, 30)
    pdf.ln(6)

    # --- Hinweistext ---
    pdf.set_font("DejaVu", "", 7.5)
    pdf.set_text_color(*DUNKELGRAU)
    pdf.multi_cell(
        0, 4.5,
        "Hinweis: Dieses Dokument ist eine Hilfszusammenstellung aus den Buchungsdaten "
        "von RechnungsFee. Es ersetzt nicht die offizielle Anlage EKS des Jobcenters. "
        "Felder mit ✔ wurden automatisch aus den Journalbuchungen berechnet. "
        "Alle übrigen Felder müssen ggf. manuell ergänzt werden.",
        align="L",
    )

    buf = BytesIO()
    pdf.output(buf)
    return buf.getvalue()
