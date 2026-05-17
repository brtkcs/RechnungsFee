import { useState } from 'react'
import { eksBerechnen, eksPdfExport, type EksFeld, type EksQuelle } from '../../api/client'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function heuteJahrMonat() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monatZuRange(monat: string): { von: string; bis: string } {
  const [y, m] = monat.split('-').map(Number)
  const von = `${y}-${String(m).padStart(2, '0')}-01`
  const letzterTag = new Date(y, m, 0).getDate()
  const bis = `${y}-${String(m).padStart(2, '0')}-${String(letzterTag).padStart(2, '0')}`
  return { von, bis }
}

function fmtDatum(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

function fmtEuro(v: string | number): string {
  const n = parseFloat(String(v))
  if (isNaN(n)) return '0,00 €'
  return (
    Math.abs(n)
      .toFixed(2)
      .replace('.', ',')
      .replace(/\B(?=(\d{3})+(?!\d))/g, '.') +
    ' €' +
    (n < 0 ? ' (negativ)' : '')
  )
}

function sumFeld(felder: Record<string, string>, codes: string[]): number {
  return codes.reduce((s, c) => s + (parseFloat(felder[c] ?? '0') || 0), 0)
}

const TABELLEN_FARBEN: Record<string, string> = {
  A: 'bg-emerald-600',
  B: 'bg-orange-500',
  C: 'bg-violet-600',
}

const TABELLEN_TITEL: Record<string, string> = {
  A: 'Tabelle A – Einnahmen',
  B: 'Tabelle B – Ausgaben / Betriebskosten',
  C: 'Tabelle C – Absetzungen',
}

// ---------------------------------------------------------------------------
// EksPage
// ---------------------------------------------------------------------------

export function EksPage() {
  const [modus, setModus] = useState<'monat' | 'zeitraum'>('monat')
  const [monat, setMonat] = useState(heuteJahrMonat())
  const [von, setVon] = useState(() => monatZuRange(heuteJahrMonat()).von)
  const [bis, setBis] = useState(() => monatZuRange(heuteJahrMonat()).bis)
  const [art, setArt] = useState<'vorlaeufig' | 'abschliessend'>('abschliessend')

  const [felder, setFelder] = useState<EksFeld[]>([])
  const [werte, setWerte] = useState<Record<string, string>>({})
  const [quelle, setQuelle] = useState<EksQuelle | null | undefined>(undefined)
  const [laedt, setLaedt] = useState(false)
  const [exportiert, setExportiert] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [berechnet, setBerechnet] = useState(false)

  const zeitraumVon = modus === 'monat' ? monatZuRange(monat).von : von
  const zeitraumBis = modus === 'monat' ? monatZuRange(monat).bis : bis

  async function handleBerechnen() {
    setLaedt(true)
    setFehler(null)
    setExportiert(false)
    try {
      const res = await eksBerechnen(zeitraumVon, zeitraumBis, art)
      setFelder(res.felder)
      setQuelle(res.quelle)
      const neueWerte: Record<string, string> = {}
      for (const f of res.felder) neueWerte[f.code] = f.wert
      setWerte(neueWerte)
      setBerechnet(true)
    } catch (e: any) {
      setFehler(e?.message ?? 'Fehler beim Laden der Daten')
    } finally {
      setLaedt(false)
    }
  }

  async function handlePdf() {
    setLaedt(true)
    setFehler(null)
    try {
      await eksPdfExport({
        zeitraum_von: zeitraumVon,
        zeitraum_bis: zeitraumBis,
        art,
        felder: werte,
      })
      setExportiert(true)
    } catch (e: any) {
      setFehler(e?.message ?? 'PDF-Export fehlgeschlagen')
    } finally {
      setLaedt(false)
    }
  }

  // Gruppe nach Tabelle
  const nachTabelle: Record<string, EksFeld[]> = {}
  for (const f of felder) {
    ;(nachTabelle[f.tabelle] ??= []).push(f)
  }

  // Summen
  const codesA = felder.filter((f) => f.tabelle === 'A').map((f) => f.code)
  const codesB = felder.filter((f) => f.tabelle === 'B').map((f) => f.code)
  const codesC = felder.filter((f) => f.tabelle === 'C').map((f) => f.code)
  const sumA = sumFeld(werte, codesA)
  const sumB = sumFeld(werte, codesB)
  const sumC = sumFeld(werte, codesC)
  const einkommen = sumA - sumB - sumC

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Kopfzeile */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Anlage EKS</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
          Einkommenserklärung für Selbstständige (Jobcenter / Bürgergeld)
        </p>
      </div>

      {/* Einstellungs-Card */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-6 space-y-4">
        <h2 className="font-semibold text-slate-800 dark:text-slate-100">Zeitraum & Einstellungen</h2>

        {/* Modus */}
        <div className="flex gap-2">
          {(['monat', 'zeitraum'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setModus(m)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                modus === m
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
              }`}
            >
              {m === 'monat' ? 'Monatsauswahl' : 'Freier Zeitraum'}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-4 items-end">
          {modus === 'monat' ? (
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Monat</label>
              <input
                type="month"
                value={monat}
                onChange={(e) => setMonat(e.target.value)}
                className="border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Von</label>
                <input
                  type="date"
                  value={von}
                  onChange={(e) => setVon(e.target.value)}
                  className="border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Bis</label>
                <input
                  type="date"
                  value={bis}
                  onChange={(e) => setBis(e.target.value)}
                  className="border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </>
          )}

          {/* Art */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Erklärungsart</label>
            <select
              value={art}
              onChange={(e) => setArt(e.target.value as 'vorlaeufig' | 'abschliessend')}
              className="border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="abschliessend">Abschließend</option>
              <option value="vorlaeufig">Vorläufig</option>
            </select>
          </div>

          <button
            onClick={handleBerechnen}
            disabled={laedt}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
          >
            {laedt ? <span className="animate-spin">⏳</span> : <span>🔄</span>}
            Berechnen
          </button>
        </div>

        {fehler && (
          <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 text-sm text-red-800 dark:text-red-300">
            <span className="shrink-0">✗</span>
            {fehler}
          </div>
        )}
      </div>

      {/* Quelle-Banner (nur nach Berechnen) */}
      {berechnet && art === 'vorlaeufig' && (
        quelle ? (
          <div className="flex items-start gap-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-3">
            <span className="text-blue-500 dark:text-blue-400 shrink-0 mt-0.5">ℹ</span>
            <div className="text-sm text-blue-800 dark:text-blue-200">
              <p className="font-medium">Prognose aus Vorjahres-EKS</p>
              <p className="mt-0.5 text-xs">
                Basis: abschließende EKS {fmtDatum(quelle.zeitraum_von)} – {fmtDatum(quelle.zeitraum_bis)} ÷ 6
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3">
            <span className="text-amber-500 dark:text-amber-400 shrink-0 mt-0.5">⚠</span>
            <div className="text-sm text-amber-800 dark:text-amber-300">
              <p className="font-medium">Keine Vorjahresdaten vorhanden</p>
              <p className="mt-0.5 text-xs">
                Für das entsprechende Halbjahr des Vorjahres wurde keine abschließende EKS gefunden.
                Alle Beträge sind 0,00 €. Bitte manuell ausfüllen.
              </p>
            </div>
          </div>
        )
      )}

      {/* Felder */}
      {berechnet && felder.length > 0 && (
        <>
          {(['A', 'B', 'C'] as const).map((tabelle) => {
            const felderT = nachTabelle[tabelle] ?? []
            if (!felderT.length) return null
            const headerFarbe = TABELLEN_FARBEN[tabelle]
            const titel = TABELLEN_TITEL[tabelle]
            return (
              <div
                key={tabelle}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden"
              >
                <div className={`${headerFarbe} px-5 py-3`}>
                  <h2 className="text-white font-bold text-base">{titel}</h2>
                </div>

                {/* Spaltenheader */}
                <div className="hidden sm:grid grid-cols-[70px_1fr_60px_140px] gap-2 px-5 py-2 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <span>Code</span>
                  <span>Bezeichnung</span>
                  <span className="text-center">Auto</span>
                  <span className="text-right">Betrag (EUR)</span>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-700">
                  {felderT.map((f) => {
                    const wert = werte[f.code] ?? '0'
                    const hatWert = Math.abs(parseFloat(wert) || 0) >= 0.005
                    return (
                      <div
                        key={f.code}
                        className="grid grid-cols-1 sm:grid-cols-[70px_1fr_60px_140px] gap-x-2 gap-y-1 px-5 py-2.5 items-center hover:bg-slate-50 dark:hover:bg-slate-750"
                      >
                        <span className="font-mono text-xs font-bold text-slate-500 dark:text-slate-400">
                          {f.code}
                        </span>
                        <span className="text-sm text-slate-700 dark:text-slate-200">
                          {f.label}
                        </span>
                        <span className="text-center">
                          {f.auto ? (
                            <span className="inline-block text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded px-1.5 py-0.5">
                              Auto
                            </span>
                          ) : (
                            <span className="inline-block text-xs bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 rounded px-1.5 py-0.5">
                              Manuell
                            </span>
                          )}
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          value={wert === '0' || wert === '0.00' ? '' : wert}
                          placeholder="0,00"
                          onChange={(e) =>
                            setWerte((prev) => ({ ...prev, [f.code]: e.target.value || '0' }))
                          }
                          className={`text-right border rounded-lg px-2 py-1 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow
                            ${
                              hatWert
                                ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-800 dark:text-blue-200 font-medium'
                                : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                            }`}
                        />
                      </div>
                    )
                  })}
                </div>

                {/* Summenzeile */}
                <div className="px-5 py-3 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Summe {tabelle === 'A' ? 'Einnahmen' : tabelle === 'B' ? 'Ausgaben' : 'Absetzungen'}
                  </span>
                  <span className="font-bold text-base text-slate-800 dark:text-slate-100">
                    {fmtEuro(tabelle === 'A' ? sumA : tabelle === 'B' ? sumB : sumC)}
                  </span>
                </div>
              </div>
            )
          })}

          {/* Ergebnis */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
            <div className="bg-blue-600 px-5 py-3">
              <h2 className="text-white font-bold text-base">Ergebnis</h2>
            </div>
            <div className="p-5 space-y-2">
              <div className="flex justify-between text-sm text-slate-600 dark:text-slate-300">
                <span>Einnahmen (A)</span>
                <span>{fmtEuro(sumA)}</span>
              </div>
              <div className="flex justify-between text-sm text-slate-600 dark:text-slate-300">
                <span>− Ausgaben (B)</span>
                <span>{fmtEuro(sumB)}</span>
              </div>
              <div className="flex justify-between text-sm text-slate-600 dark:text-slate-300">
                <span>− Absetzungen (C)</span>
                <span>{fmtEuro(sumC)}</span>
              </div>
              <div className="border-t border-slate-200 dark:border-slate-600 pt-2 flex justify-between items-center">
                <span className="font-bold text-slate-800 dark:text-slate-100">
                  Zu berücksichtigendes Einkommen
                </span>
                <span
                  className={`font-bold text-xl ${
                    einkommen < 0
                      ? 'text-red-600 dark:text-red-400'
                      : einkommen > 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {fmtEuro(einkommen)}
                </span>
              </div>
            </div>
          </div>

          {/* Export-Aktionen */}
          <div className="flex flex-wrap gap-3 items-center">
            <button
              onClick={handlePdf}
              disabled={laedt}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
            >
              {laedt ? <span className="animate-spin">⏳</span> : <span>📄</span>}
              PDF erstellen
            </button>

            {exportiert && (
              <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
                <span>✓</span>
                PDF wurde geöffnet
              </div>
            )}
          </div>

          {/* Hinweis */}
          <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3 flex gap-2">
            <span className="text-amber-500 dark:text-amber-400 shrink-0">⚠</span>
            <p className="text-xs text-amber-800 dark:text-amber-300">
              <strong>Hinweis:</strong> Felder mit „Auto" werden direkt aus deinen Journalbuchungen berechnet.
              Manuelle Felder (z.&nbsp;B. Privatentnahmen, Versicherungsbeiträge) musst du selbst eintragen.
              Dieses PDF ersetzt nicht das offizielle EKS-Formular des Jobcenters.
            </p>
          </div>
        </>
      )}

      {/* Leer-Zustand */}
      {!berechnet && (
        <div className="text-center py-16 text-slate-400 dark:text-slate-500">
          <div className="text-5xl mb-4">📋</div>
          <p className="text-sm">Zeitraum auswählen und auf „Berechnen" klicken.</p>
        </div>
      )}
    </div>
  )
}
