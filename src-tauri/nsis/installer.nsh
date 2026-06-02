; RechnungsFee – Benutzerdefinierter NSIS-Installer-Hook
; Wird nach der Hauptinstallation ausgefuehrt.
; Bietet die Installation von Tesseract OCR per MessageBox an.

!macro customInstall

  ; Pruefen ob tesseract bereits im PATH vorhanden ist
  nsExec::ExecToStack 'cmd /c where tesseract 2>nul'
  Pop $0
  Pop $1

  ${If} $0 != 0
    ; Tesseract fehlt – Nutzer fragen
    MessageBox MB_YESNO|MB_ICONQUESTION \
      "Tesseract OCR installieren?$\n$\nFür gescannte Eingangsrechnungen und Kassenbons \
(Fotos, Scans) benötigt RechnungsFee Tesseract OCR.$\n$\nJetzt automatisch installieren \
(ca. 50 MB, benötigt Internetverbindung)?" \
      IDNO ocr_skip

    ; Pruefen ob winget verfuegbar ist
    nsExec::ExecToStack 'cmd /c where winget 2>nul'
    Pop $2
    Pop $3

    ${If} $2 == 0
      DetailPrint "Installiere Tesseract OCR ueber winget..."
      nsExec::ExecToLog \
        'cmd /c winget install -e --id UB-Mannheim.TesseractOCR --silent \
--accept-source-agreements --accept-package-agreements'
      Pop $4
      ${If} $4 == 0
        DetailPrint "Tesseract OCR erfolgreich installiert."
      ${ElseIf} $4 == -1978335189
        DetailPrint "Tesseract OCR ist bereits installiert."
      ${Else}
        MessageBox MB_OK|MB_ICONEXCLAMATION \
          "Tesseract OCR konnte nicht automatisch installiert werden.$\n$\n\
Bitte manuell nachinstallieren:$\n  winget install UB-Mannheim.TesseractOCR$\n$\n\
Oder Download: https://github.com/UB-Mannheim/tesseract/wiki"
      ${EndIf}
    ${Else}
      MessageBox MB_OK|MB_ICONEXCLAMATION \
        "Windows-Paketmanager (winget) nicht gefunden.$\n$\n\
Bitte Tesseract OCR manuell installieren:$\nhttps://github.com/UB-Mannheim/tesseract/wiki"
    ${EndIf}

    ocr_skip:
  ${EndIf}

!macroend

!macro customUnInstall
  ; Tesseract wird bei der Deinstallation nicht entfernt –
  ; es koennte von anderen Anwendungen genutzt werden.
!macroend
