import { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getKonten,
  getBankTemplates,
  getBankTransaktionen,
  vorschauBankImport,
  importiereBankTransaktionen,
  loescheBankImport,
  type Konto,
  type BankTemplate,
  type BankTransaktionVorschau,
  type BankVorschauResponse,
  type BankTransaktion,
} from '../../api/client'

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

function euroFmt(v: string | number): string {
  const n = typeof v === 'string' ? parseFloat(v) : v
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
}

function datumFmt(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ---------------------------------------------------------------------------
// Import-Dialog (Stepper)
// ---------------------------------------------------------------------------

type Schritt = 1 | 2 | 3 | 4 | 5

interface ImportDialogProps {
  konten: Konto[]
  templates: BankTemplate[]
  onClose: () => void
  onErfolg: () => void
}

function ImportDialog({ konten, templates, onClose, onErfolg }: ImportDialogProps) {
  const [schritt, setSchritt] = useState<Schritt>(1)
  const [kontoId, setKontoId] = useState<number>(konten[0]?.id ?? 0)
  const [datei, setDatei] = useState<File | null>(null)
  const [templateId, setTemplateId] = useState<string>('')
  const [vorschau, setVorschau] = useState<BankVorschauResponse | null>(null)
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set()) // dedupe_hashes die importiert werden
  const [fehler, setFehler] = useState<string | null>(null)
  const [laedt, setLaedt] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const geschaeftskonten = konten.filter(k => k.kontotyp !== 'privat')

  async function weiterZuVorschau() {
    if (!datei || !kontoId) return
    setFehler(null)
    setLaedt(true)
    try {
      const result = await vorschauBankImport(datei, kontoId, templateId || undefined)
      setVorschau(result)
      if (result.erkanntes_template) setTemplateId(result.erkanntes_template)
      // Alle nicht-Duplikate vorselektieren
      setAuswahl(new Set(result.transaktionen.filter(t => !t.ist_duplikat).map(t => t.dedupe_hash)))
      setSchritt(3)
    } catch (e: unknown) {
      setFehler((e as Error).message)
    } finally {
      setLaedt(false)
    }
  }

  const txAuswahl = vorschau?.transaktionen.filter(t => auswahl.has(t.dedupe_hash)) ?? []
  const txDuplikate = vorschau?.transaktionen.filter(t => t.ist_duplikat).length ?? 0
  const txIgnoriert = (vorschau?.transaktionen.length ?? 0) - auswahl.size - txDuplikate

  const importMut = useMutation({
    mutationFn: () =>
      importiereBankTransaktionen({
        konto_id: kontoId,
        template_id: templateId,
        dateiname: datei?.name ?? 'import.csv',
        transaktionen: txAuswahl,
      }),
    onSuccess: () => {
      setSchritt(5)
    },
    onError: (e: Error) => setFehler(e.message),
  })

  const konto = geschaeftskonten.find(k => k.id === kontoId)
  const istMischkonto = konto?.kontotyp === 'mischkonto'

  const toggleAuswahl = (hash: string) => {
    setAuswahl(prev => {
      const next = new Set(prev)
      if (next.has(hash)) next.delete(hash)
      else next.add(hash)
      return next
    })
  }

  const schrittLabel = ['', 'Datei', 'Template', 'Vorschau', 'Zusammenfassung', 'Fertig']

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">CSV-Import</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl leading-none">×</button>
        </div>

        {/* Schrittanzeige */}
        <div className="flex gap-1 px-6 pt-4">
          {([1, 2, 3, 4] as Schritt[]).map(s => (
            <div key={s} className="flex-1 flex flex-col items-center gap-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                schritt > s ? 'bg-green-500 border-green-500 text-white' :
                schritt === s ? 'border-blue-500 text-blue-600 dark:text-blue-400' :
                'border-slate-200 dark:border-slate-600 text-slate-400'
              }`}>{schritt > s ? '✓' : s}</div>
              <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">{schrittLabel[s]}</span>
            </div>
          ))}
        </div>

        {/* Inhalt */}
        <div className="flex-1 overflow-y-auto px-6 py-4">

          {fehler && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
              {fehler}
            </div>
          )}

          {/* Schritt 1: Konto + Datei */}
          {schritt === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Konto</label>
                <select
                  value={kontoId}
                  onChange={e => setKontoId(Number(e.target.value))}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
                >
                  {geschaeftskonten.map(k => (
                    <option key={k.id} value={k.id}>
                      {k.name} ({k.anbieter}){k.kontotyp === 'mischkonto' ? ' – Mischkonto' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">CSV-Datei</label>
                <div
                  onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 transition-colors"
                >
                  {datei ? (
                    <span className="text-sm text-slate-700 dark:text-slate-200">📄 {datei.name}</span>
                  ) : (
                    <span className="text-sm text-slate-500 dark:text-slate-400">CSV-Datei hier ablegen oder klicken zum Auswählen</span>
                  )}
                  <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden"
                    onChange={e => setDatei(e.target.files?.[0] ?? null)} />
                </div>
              </div>
            </div>
          )}

          {/* Schritt 2: Template */}
          {schritt === 2 && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                RechnungsFee versucht das passende Template automatisch zu erkennen. Du kannst es hier manuell wählen.
              </p>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Template</label>
                <select
                  value={templateId}
                  onChange={e => setTemplateId(e.target.value)}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
                >
                  <option value="">– automatisch erkennen –</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.bank})</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Schritt 3: Vorschau-Tabelle */}
          {schritt === 3 && vorschau && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Template: <span className="font-medium text-slate-800 dark:text-slate-100">{vorschau.template_name}</span>
                  {' · '}{vorschau.transaktionen.length} Zeilen erkannt
                  {txDuplikate > 0 && <span className="text-amber-600 dark:text-amber-400"> · {txDuplikate} bereits importiert</span>}
                </p>
                <div className="flex gap-2">
                  <button onClick={() => setAuswahl(new Set(vorschau.transaktionen.filter(t => !t.ist_duplikat).map(t => t.dedupe_hash)))}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Alle wählen</button>
                  <span className="text-slate-300 dark:text-slate-600">|</span>
                  <button onClick={() => setAuswahl(new Set())}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Keine</button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400">
                      <th className="px-3 py-2 text-left w-8">
                        <input type="checkbox" className="h-3 w-3"
                          checked={auswahl.size === vorschau.transaktionen.filter(t => !t.ist_duplikat).length && auswahl.size > 0}
                          onChange={e => e.target.checked
                            ? setAuswahl(new Set(vorschau.transaktionen.filter(t => !t.ist_duplikat).map(t => t.dedupe_hash)))
                            : setAuswahl(new Set())} />
                      </th>
                      <th className="px-3 py-2 text-left">Datum</th>
                      <th className="px-3 py-2 text-right">Betrag</th>
                      <th className="px-3 py-2 text-left">Partner</th>
                      <th className="px-3 py-2 text-left">Verwendungszweck</th>
                      {istMischkonto && <th className="px-3 py-2 text-left">Art</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {vorschau.transaktionen.map(tx => {
                      const selektiert = auswahl.has(tx.dedupe_hash)
                      return (
                        <tr key={tx.dedupe_hash}
                          className={`border-t border-slate-100 dark:border-slate-700/50 ${
                            tx.ist_duplikat ? 'opacity-40' : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'
                          }`}
                        >
                          <td className="px-3 py-1.5">
                            {tx.ist_duplikat
                              ? <span className="text-amber-500 text-xs">↩</span>
                              : <input type="checkbox" className="h-3 w-3"
                                  checked={selektiert}
                                  onChange={() => toggleAuswahl(tx.dedupe_hash)} />
                            }
                          </td>
                          <td className="px-3 py-1.5 whitespace-nowrap text-slate-600 dark:text-slate-300">{datumFmt(tx.datum)}</td>
                          <td className={`px-3 py-1.5 text-right font-mono whitespace-nowrap font-medium ${
                            parseFloat(tx.betrag) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                          }`}>{euroFmt(tx.betrag)}</td>
                          <td className="px-3 py-1.5 text-slate-700 dark:text-slate-200 max-w-[180px] truncate">{tx.partner_name ?? '–'}</td>
                          <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400 max-w-[200px] truncate">{tx.verwendungszweck ?? '–'}</td>
                          {istMischkonto && (
                            <td className="px-3 py-1.5">
                              {tx.ist_duplikat ? null : (
                                <span className="text-xs bg-slate-100 dark:bg-slate-700 rounded px-1.5 py-0.5 text-slate-600 dark:text-slate-300">
                                  geschäftlich
                                </span>
                              )}
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {istMischkonto && (
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Mischkonto: Die Klassifizierung (geschäftlich / privat) kannst du nach dem Import in der Transaktionsliste anpassen.
                </p>
              )}
            </div>
          )}

          {/* Schritt 4: Zusammenfassung */}
          {schritt === 4 && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-400">Folgende Transaktionen werden importiert:</p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Importieren', wert: txAuswahl.length, farbe: 'text-green-600 dark:text-green-400' },
                  { label: 'Ignoriert', wert: txIgnoriert, farbe: 'text-slate-500 dark:text-slate-400' },
                  { label: 'Duplikate', wert: txDuplikate, farbe: 'text-amber-600 dark:text-amber-400' },
                ].map(({ label, wert, farbe }) => (
                  <div key={label} className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4 text-center">
                    <div className={`text-3xl font-bold ${farbe}`}>{wert}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{label}</div>
                  </div>
                ))}
              </div>
              {txAuswahl.length === 0 && (
                <p className="text-sm text-amber-600 dark:text-amber-400">Keine Transaktionen ausgewählt – bitte zurück gehen und Auswahl anpassen.</p>
              )}
            </div>
          )}

          {/* Schritt 5: Fertig */}
          {schritt === 5 && importMut.data && (
            <div className="text-center py-6 space-y-3">
              <div className="text-4xl">✅</div>
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Import abgeschlossen</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {importMut.data.erfolg} Transaktionen importiert · {importMut.data.duplikate} Duplikate übersprungen
                {importMut.data.fehler > 0 && ` · ${importMut.data.fehler} Fehler`}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-700">
          {schritt < 5 ? (
            <>
              <button onClick={onClose} className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                Abbrechen
              </button>
              <div className="flex gap-2">
                {schritt > 1 && (
                  <button onClick={() => setSchritt(s => (s - 1) as Schritt)}
                    className="px-4 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700">
                    Zurück
                  </button>
                )}
                {schritt === 1 && (
                  <button
                    disabled={!datei || !kontoId}
                    onClick={() => setSchritt(2)}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
                    Weiter
                  </button>
                )}
                {schritt === 2 && (
                  <button
                    disabled={laedt}
                    onClick={weiterZuVorschau}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
                    {laedt ? 'Analysiere…' : 'Vorschau laden'}
                  </button>
                )}
                {schritt === 3 && (
                  <button onClick={() => setSchritt(4)}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    Weiter
                  </button>
                )}
                {schritt === 4 && (
                  <button
                    disabled={txAuswahl.length === 0 || importMut.isPending}
                    onClick={() => importMut.mutate()}
                    className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40">
                    {importMut.isPending ? 'Importiere…' : `${txAuswahl.length} Transaktionen importieren`}
                  </button>
                )}
              </div>
            </>
          ) : (
            <button onClick={onErfolg}
              className="ml-auto px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              Zur Transaktionsliste
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Transaktionsliste
// ---------------------------------------------------------------------------

function KlassifizierungBadge({ tx }: { tx: BankTransaktion }) {
  if (tx.ist_privatentnahme) return <span className="text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded px-1.5 py-0.5">Privatentnahme</span>
  if (tx.ist_einlage)        return <span className="text-xs bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded px-1.5 py-0.5">Einlage</span>
  if (!tx.ist_geschaeftlich) return <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded px-1.5 py-0.5">Privat</span>
  return <span className="text-xs bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 rounded px-1.5 py-0.5">Geschäftlich</span>
}

interface TransaktionslisteProps {
  konto: Konto
}

function Transaktionsliste({ konto }: TransaktionslisteProps) {
  const { data: txs = [], isLoading } = useQuery({
    queryKey: ['bank-transaktionen', konto.id],
    queryFn: () => getBankTransaktionen(konto.id!),
    enabled: !!konto.id,
  })

  if (isLoading) return <p className="text-sm text-slate-500 dark:text-slate-400 py-4">Lade Transaktionen…</p>
  if (txs.length === 0) return (
    <div className="py-12 text-center text-slate-400 dark:text-slate-500 text-sm">
      Noch keine Transaktionen importiert.
    </div>
  )

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 text-xs">
            <th className="px-4 py-2.5 text-left">Datum</th>
            <th className="px-4 py-2.5 text-right">Betrag</th>
            <th className="px-4 py-2.5 text-left">Partner</th>
            <th className="px-4 py-2.5 text-left">Verwendungszweck</th>
            <th className="px-4 py-2.5 text-left">Art</th>
          </tr>
        </thead>
        <tbody>
          {txs.map(tx => (
            <tr key={tx.id} className="border-t border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30">
              <td className="px-4 py-2 whitespace-nowrap text-slate-600 dark:text-slate-300 text-xs">{datumFmt(tx.datum)}</td>
              <td className={`px-4 py-2 text-right font-mono font-medium whitespace-nowrap text-sm ${
                parseFloat(tx.betrag) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
              }`}>{euroFmt(tx.betrag)}</td>
              <td className="px-4 py-2 text-slate-700 dark:text-slate-200 max-w-[200px] truncate">{tx.partner_name ?? '–'}</td>
              <td className="px-4 py-2 text-slate-500 dark:text-slate-400 max-w-[260px] truncate text-xs">{tx.verwendungszweck ?? '–'}</td>
              <td className="px-4 py-2"><KlassifizierungBadge tx={tx} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Hauptseite
// ---------------------------------------------------------------------------

export function BankImportPage() {
  const qc = useQueryClient()
  const [dialogOffen, setDialogOffen] = useState(false)
  const [aktivesKontoId, setAktivesKontoId] = useState<number | null>(null)

  const { data: konten = [] } = useQuery({ queryKey: ['konten'], queryFn: getKonten })
  const { data: templates = [] } = useQuery({ queryKey: ['bank-templates'], queryFn: getBankTemplates })

  const geschaeftskonten = konten.filter(k => k.kontotyp !== 'privat' && k.aktiv !== false)
  const aktivesKonto = geschaeftskonten.find(k => k.id === aktivesKontoId) ?? geschaeftskonten[0]

  const handleErfolg = useCallback(() => {
    setDialogOffen(false)
    qc.invalidateQueries({ queryKey: ['bank-transaktionen'] })
  }, [qc])

  return (
    <div className="max-w-5xl px-6 py-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-1">Bank CSV-Import</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Kontoauszüge importieren und Transaktionen klassifizieren.
          </p>
        </div>
        <button
          onClick={() => setDialogOffen(true)}
          disabled={geschaeftskonten.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
        >
          <span>+</span> CSV importieren
        </button>
      </div>

      {geschaeftskonten.length === 0 ? (
        <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-sm text-amber-700 dark:text-amber-300">
          Bitte zuerst ein Konto unter <strong>Einstellungen → Konten</strong> anlegen.
        </div>
      ) : (
        <>
          {/* Konto-Tabs */}
          {geschaeftskonten.length > 1 && (
            <div className="flex gap-2 mb-4 flex-wrap">
              {geschaeftskonten.map(k => (
                <button
                  key={k.id}
                  onClick={() => setAktivesKontoId(k.id!)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    aktivesKonto?.id === k.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                >
                  {k.name}
                  {k.kontotyp === 'mischkonto' && <span className="ml-1 text-xs opacity-70">Mischkonto</span>}
                </button>
              ))}
            </div>
          )}

          {aktivesKonto && <Transaktionsliste konto={aktivesKonto} />}
        </>
      )}

      {dialogOffen && (
        <ImportDialog
          konten={geschaeftskonten}
          templates={templates}
          onClose={() => setDialogOffen(false)}
          onErfolg={handleErfolg}
        />
      )}
    </div>
  )
}
