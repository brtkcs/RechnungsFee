; RechnungsFee – Benutzerdefinierter NSIS-Installer-Hook
; Wird nach der Hauptinstallation ausgefuehrt.
; Installiert Tesseract OCR optional ueber winget (Windows-Paketmanager).

!macro customInstall
  ; --- Tesseract OCR (optional, fuer gescannte Eingangsrechnungen) ---
  DetailPrint ""
  DetailPrint "Optionale Komponente: Tesseract OCR"
  DetailPrint "Wird benoetigt, um gescannte Eingangsrechnungen automatisch zu erkennen."
  DetailPrint ""

  ; Pruefen ob tesseract bereits im PATH vorhanden ist
  nsExec::ExecToStack 'cmd /c where tesseract 2>nul'
  Pop $0  ; Exit-Code
  Pop $1  ; Ausgabe

  ${If} $0 == 0
    DetailPrint "Tesseract OCR ist bereits installiert."
  ${Else}
    ; Pruefen ob winget verfuegbar ist
    nsExec::ExecToStack 'cmd /c where winget 2>nul'
    Pop $2
    Pop $3

    ${If} $2 == 0
      DetailPrint "Installiere Tesseract OCR ueber winget..."
      DetailPrint "(Dieser Schritt kann einige Sekunden dauern)"
      nsExec::ExecToLog 'cmd /c winget install -e --id UB-Mannheim.TesseractOCR --silent --accept-source-agreements --accept-package-agreements'
      Pop $4
      ${If} $4 == 0
        DetailPrint "Tesseract OCR wurde erfolgreich installiert."
        DetailPrint "OCR fuer gescannte Eingangsrechnungen ist jetzt verfuegbar."
      ${ElseIf} $4 == -1978335189
        ; WINGET_INSTALLED_STATUS_ALREADY_INSTALLED (0x8A15002B)
        DetailPrint "Tesseract OCR ist bereits installiert."
      ${Else}
        DetailPrint "Tesseract OCR konnte nicht automatisch installiert werden."
        DetailPrint "Fuer OCR-Unterstuetzung bitte manuell installieren:"
        DetailPrint "  winget install UB-Mannheim.TesseractOCR"
      ${EndIf}
    ${Else}
      DetailPrint "winget ist nicht verfuegbar (Windows 10 vor 1709?)."
      DetailPrint "Fuer OCR-Unterstuetzung bitte Tesseract manuell installieren:"
      DetailPrint "  https://github.com/UB-Mannheim/tesseract/wiki"
    ${EndIf}
  ${EndIf}

  DetailPrint ""
!macroend

!macro customUnInstall
  ; Tesseract wird bei der Deinstallation nicht entfernt –
  ; es koennte von anderen Anwendungen genutzt werden.
!macroend
