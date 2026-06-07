import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  getAngebote, getKunden, getUstSaetze, getDokumentenPakete,
  createRechnung, updateRechnung, deleteRechnung,
  rechnungAusAngebot, angebotStatusSetzen,
  getApiBase, openUrl,
  type Rechnung,
} from '../../api/client'

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

function formatDatum(iso: string | null | undefined) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

function heuteIso() {
  return new Date().toISOString().slice(0, 10)
}

function inXTagen(n: number) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100 dark:placeholder-slate-400"
const selectCls = `${inputCls} bg-white dark:bg-slate-700`

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  offen:      { label: 'Offen',      cls: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-700' },
  akzeptiert: { label: 'Akzeptiert', cls: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300 border-green-200 dark:border-green-700' },
  abgelehnt:  { label: 'Abgelehnt', cls: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300 border-red-200 dark:border-red-700' },
  abgelaufen: { label: 'Abgelaufen', cls: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700' },
}

function StatusBadge({ status }: { status: string | null }) {
  const s = status ?? 'offen'
  const info = STATUS_LABEL[s] ?? STATUS_LABEL.offen
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded border ${info.cls}`}>
      {info.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Positions-Tabelle
// ---------------------------------------------------------------------------

interface Pos {
  beschreibung: string
  menge: string
  einheit: string
  einzelpreis: string
  ust_satz: string
}

function leerePos(): Pos {
  return { beschreibung: '', menge: '1', einheit: 'Stk.', einzelpreis: '', ust_satz: '19' }
}

function berechnePos(pos: Pos) {
  const menge = parseFloat(pos.menge) || 0
  const ep    = parseFloat(pos.einzelpreis.replace(',', '.')) || 0
  const ust   = parseFloat(pos.ust_satz) || 0
  const netto = menge * ep
  const ustBet = (netto * ust) / 100
  return { netto, ustBet, brutto: netto + ustBet }
}

function PositionenTabelle({
  positionen, onChange, ustSaetze,
}: {
  positionen: Pos[]
  onChange: (p: Pos[]) => void
  ustSaetze: { satz: string }[]
}) {
  function update(i: number, field: keyof Pos, val: string) {
    const neu = positionen.map((p, idx) => idx === i ? { ...p, [field]: val } : p)
    onChange(neu)
  }

  const gesamt = positionen.reduce((acc, p) => {
    const { netto, ustBet, brutto } = berechnePos(p)
    return { netto: acc.netto + netto, ust: acc.ust + ustBet, brutto: acc.brutto + brutto }
  }, { netto: 0, ust: 0, brutto: 0 })

  return (
    <div className="space-y-2">
      <div className="hidden sm:grid grid-cols-[1fr_80px_80px_110px_80px_32px] gap-2 px-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
        <span>Beschreibung</span><span>Menge</span><span>Einheit</span><span>Einzelpreis</span><span>USt %</span><span />
      </div>

      {positionen.map((pos, i) => (
        <div key={i} className="grid grid-cols-[1fr_80px_80px_110px_80px_32px] gap-2 items-center">
          <input value={pos.beschreibung} onChange={e => update(i, 'beschreibung', e.target.value)}
            placeholder="Leistungsbeschreibung" className={inputCls} />
          <input value={pos.menge} onChange={e => update(i, 'menge', e.target.value)}
            type="number" min="0" step="0.01" className={inputCls} />
          <input value={pos.einheit} onChange={e => update(i, 'einheit', e.target.value)}
            placeholder="Stk." className={inputCls} />
          <input value={pos.einzelpreis} onChange={e => update(i, 'einzelpreis', e.target.value)}
            type="number" step="0.01" min="0" placeholder="0,00" className={inputCls} />
          <select value={pos.ust_satz} onChange={e => update(i, 'ust_satz', e.target.value)}
            className={selectCls}>
            {ustSaetze.map(u => (
              <option key={u.satz} value={u.satz}>{u.satz} %</option>
            ))}
          </select>
          <button type="button" onClick={() => onChange(positionen.filter((_, idx) => idx !== i))}
            disabled={positionen.length === 1}
            className="text-red-400 hover:text-red-600 disabled:opacity-20 text-lg leading-none">×</button>
        </div>
      ))}

      <button type="button" onClick={() => onChange([...positionen, leerePos()])}
        className="text-sm text-blue-600 hover:underline dark:text-blue-400">
        + Position hinzufügen
      </button>

      <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 text-sm space-y-1">
        <div className="flex justify-between text-slate-500 dark:text-slate-400">
          <span>Netto</span><span>{gesamt.netto.toFixed(2).replace('.', ',')} €</span>
        </div>
        <div className="flex justify-between text-slate-500 dark:text-slate-400">
          <span>USt</span><span>{gesamt.ust.toFixed(2).replace('.', ',')} €</span>
        </div>
        <div className="flex justify-between font-semibold text-slate-800 dark:text-slate-100">
          <span>Brutto</span><span>{gesamt.brutto.toFixed(2).replace('.', ',')} €</span>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Formular
// ---------------------------------------------------------------------------

function AngebotFormular({
  initial,
  onSpeichern,
  onAbbrechen,
}: {
  initial?: Rechnung
  onSpeichern: (id: number) => void
  onAbbrechen: () => void
}) {
  const qc = useQueryClient()
  const [fehler, setFehler] = useState<string | null>(null)
  const [laedt, setLaedt] = useState(false)

  const { data: kunden } = useQuery({ queryKey: ['kunden'], queryFn: getKunden })
  const { data: ustSaetze } = useQuery({ queryKey: ['ust-saetze'], queryFn: getUstSaetze })
  const { data: pakete } = useQuery({ queryKey: ['dokumentenpakete'], queryFn: getDokumentenPakete })

  const [kundeId, setKundeId] = useState(initial?.kunde_id?.toString() ?? '')
  const [datum, setDatum] = useState(initial?.datum ?? heuteIso())
  const [gueltigBis, setGueltigBis] = useState(initial?.gueltig_bis ?? inXTagen(30))
  const [notizen, setNotizen] = useState(initial?.notizen ?? '')
  const [paketId, setPaketId] = useState(initial?.dokumentenpaket_id?.toString() ?? '')
  const [positionen, setPositionen] = useState<Pos[]>(() => {
    if (initial?.positionen?.length) {
      return initial.positionen.map(p => ({
        beschreibung: p.beschreibung,
        menge: String(p.menge),
        einheit: p.einheit,
        einzelpreis: String(p.einzelpreis),
        ust_satz: String(p.ust_satz),
      }))
    }
    return [leerePos()]
  })

  const ustSaetzeListe = ustSaetze?.filter(u => u.ist_aktiv) ?? [{ satz: '19' }, { satz: '7' }, { satz: '0' }]

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!kundeId) { setFehler('Bitte einen Kunden wählen.'); return }
    if (!gueltigBis) { setFehler('Gültig-bis-Datum ist erforderlich.'); return }
    if (positionen.some(p => !p.beschreibung.trim())) { setFehler('Alle Positionen benötigen eine Beschreibung.'); return }

    setLaedt(true)
    setFehler(null)
    try {
      const posPayload = positionen.map((p, i) => {
        const { netto, ustBet, brutto } = berechnePos(p)
        return {
          beschreibung: p.beschreibung.trim(),
          menge: parseFloat(p.menge) || 1,
          einheit: p.einheit || 'Stk.',
          einzelpreis: parseFloat(p.einzelpreis.replace(',', '.')) || 0,
          ust_satz: parseFloat(p.ust_satz) || 0,
          netto,
          ust_betrag: ustBet,
          brutto,
          position: i + 1,
        }
      })

      const payload = {
        typ: 'ausgang' as const,
        datum,
        gueltig_bis: gueltigBis,
        kunde_id: parseInt(kundeId),
        notizen: notizen || undefined,
        dokument_typ: 'Angebot',
        dokumentenpaket_id: paketId ? parseInt(paketId) : undefined,
        ist_entwurf: false,
        positionen: posPayload,
      }

      let result: Rechnung
      if (initial) {
        result = await updateRechnung(initial.id, payload)
      } else {
        result = await createRechnung(payload)
      }
      qc.invalidateQueries({ queryKey: ['angebote'] })
      onSpeichern(result.id)
    } catch (e: any) {
      setFehler(e?.message ?? 'Fehler beim Speichern.')
    } finally {
      setLaedt(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5 p-6">
      <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
        {initial ? 'Angebot bearbeiten' : 'Neues Angebot'}
      </h2>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Kunde *</label>
          <select value={kundeId} onChange={e => setKundeId(e.target.value)} className={selectCls} required>
            <option value="">— Kunden wählen —</option>
            {kunden?.map(k => (
              <option key={k.id} value={k.id}>
                {k.firmenname || [k.vorname, k.nachname].filter(Boolean).join(' ')}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Angebotsdatum</label>
          <input type="date" value={datum} onChange={e => setDatum(e.target.value)} className={inputCls} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Gültig bis *</label>
          <input type="date" value={gueltigBis} onChange={e => setGueltigBis(e.target.value)} className={inputCls} required />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Dokumentenpaket</label>
          <select value={paketId} onChange={e => setPaketId(e.target.value)} className={selectCls}>
            <option value="">— Kein Paket —</option>
            {pakete?.filter(p => p.aktiv).map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Positionen</label>
        <PositionenTabelle
          positionen={positionen}
          onChange={setPositionen}
          ustSaetze={ustSaetzeListe}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Notizen</label>
        <textarea value={notizen} onChange={e => setNotizen(e.target.value)}
          rows={3} className={`${inputCls} resize-none`}
          placeholder="Interne Notizen oder Text für die Fußzeile" />
      </div>

      {fehler && <p className="text-sm text-red-600">{fehler}</p>}

      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={laedt}
          className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50">
          {laedt ? 'Speichern…' : initial ? 'Speichern' : 'Angebot erstellen'}
        </button>
        <button type="button" onClick={onAbbrechen}
          className="px-4 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">
          Abbrechen
        </button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Detail-Panel
// ---------------------------------------------------------------------------

function AngebotDetail({
  angebot,
  onEdit,
  onClose,
  onDelete,
}: {
  angebot: Rechnung
  onEdit: () => void
  onClose: () => void
  onDelete: () => void
}) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [statusLaedt, setStatusLaedt] = useState(false)
  const [konvLaedt, setKonvLaedt] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  async function handlePdf() {
    const base = await getApiBase()
    openUrl(`${base}/rechnungen/${angebot.id}/pdf`)
  }

  async function handleStatusChange(s: string) {
    setStatusLaedt(true)
    try {
      await angebotStatusSetzen(angebot.id, s)
      qc.invalidateQueries({ queryKey: ['angebote'] })
    } catch (e: any) { setFehler(e?.message) }
    finally { setStatusLaedt(false) }
  }

  async function handleRechnungErstellen() {
    if (!confirm('Rechnung aus diesem Angebot erstellen?')) return
    setKonvLaedt(true)
    try {
      const re = await rechnungAusAngebot(angebot.id)
      qc.invalidateQueries({ queryKey: ['angebote'] })
      navigate(`/rechnungen?id=${re.id}`)
    } catch (e: any) { setFehler(e?.message) }
    finally { setKonvLaedt(false) }
  }

  const brutto = parseFloat(angebot.brutto_gesamt as any) || 0

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-start justify-between gap-2 shrink-0">
        <div>
          <p className="font-mono text-xs text-slate-400 dark:text-slate-500">{angebot.rechnungsnummer}</p>
          <p className="font-semibold text-slate-800 dark:text-slate-100 mt-0.5">
            {angebot.kunde_name ?? angebot.partner_freitext ?? '—'}
          </p>
          <div className="mt-1">
            <StatusBadge status={angebot.angebot_status} />
          </div>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xl leading-none p-1">×</button>
      </div>

      {/* Inhalt */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-slate-400 dark:text-slate-500">Datum</p>
            <p className="text-slate-700 dark:text-slate-200">{formatDatum(angebot.datum)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 dark:text-slate-500">Gültig bis</p>
            <p className={`font-medium ${angebot.gueltig_bis && angebot.gueltig_bis < heuteIso() && angebot.angebot_status === 'offen' ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-200'}`}>
              {formatDatum(angebot.gueltig_bis)}
            </p>
          </div>
          <div className="col-span-2">
            <p className="text-xs text-slate-400 dark:text-slate-500">Betrag</p>
            <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{brutto.toFixed(2).replace('.', ',')} €</p>
          </div>
        </div>

        {/* Positionen */}
        <div>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Positionen</p>
          <div className="space-y-1">
            {angebot.positionen?.map((pos, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-slate-700 dark:text-slate-200 truncate flex-1 mr-2">
                  {pos.menge}× {pos.beschreibung}
                </span>
                <span className="text-slate-500 dark:text-slate-400 shrink-0">
                  {(parseFloat(pos.brutto_gesamt as any) || 0).toFixed(2).replace('.', ',')} €
                </span>
              </div>
            ))}
          </div>
        </div>

        {angebot.notizen && (
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Notizen</p>
            <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{angebot.notizen}</p>
          </div>
        )}

        {/* Verknüpfte Rechnung */}
        {angebot.rechnung_zu_angebot_id && (
          <div className="rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 px-3 py-2 text-sm">
            <span className="text-green-700 dark:text-green-300 font-medium">Rechnung erstellt: </span>
            <button
              onClick={() => navigate(`/rechnungen?id=${angebot.rechnung_zu_angebot_id}`)}
              className="text-green-700 dark:text-green-300 underline"
            >
              {angebot.rechnung_zu_angebot_nr ?? `#${angebot.rechnung_zu_angebot_id}`}
            </button>
          </div>
        )}

        {fehler && <p className="text-sm text-red-600">{fehler}</p>}
      </div>

      {/* Aktionen */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-700 space-y-2 shrink-0">
        <button onClick={handlePdf}
          className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-left">
          PDF anzeigen
        </button>

        {/* Status ändern */}
        {!angebot.rechnung_zu_angebot_id && (
          <div className="flex gap-1 flex-wrap">
            {(['offen', 'akzeptiert', 'abgelehnt', 'abgelaufen'] as const).map(s => (
              <button key={s} disabled={angebot.angebot_status === s || statusLaedt}
                onClick={() => handleStatusChange(s)}
                className={`flex-1 px-2 py-1.5 text-xs rounded border transition-colors disabled:opacity-40 ${
                  angebot.angebot_status === s
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}>
                {STATUS_LABEL[s].label}
              </button>
            ))}
          </div>
        )}

        {/* In Rechnung umwandeln */}
        <button
          onClick={handleRechnungErstellen}
          disabled={!!angebot.rechnung_zu_angebot_id || konvLaedt}
          className="w-full px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed font-medium"
        >
          {konvLaedt ? 'Erstelle Rechnung…' : angebot.rechnung_zu_angebot_id ? 'Rechnung bereits erstellt' : '→ In Rechnung umwandeln'}
        </button>

        <div className="flex gap-2">
          <button onClick={onEdit}
            disabled={!!angebot.rechnung_zu_angebot_id}
            className="flex-1 px-3 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40">
            Bearbeiten
          </button>
          <button onClick={onDelete}
            disabled={!!angebot.rechnung_zu_angebot_id}
            className="flex-1 px-3 py-1.5 text-xs border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-950 text-red-600 dark:text-red-400 disabled:opacity-40">
            Löschen
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Haupt-Seite
// ---------------------------------------------------------------------------

export function AngebotePage() {
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [formModus, setFormModus] = useState<'neu' | 'bearbeiten' | null>(null)

  const { data: angebote, isLoading } = useQuery({
    queryKey: ['angebote'],
    queryFn: getAngebote,
  })

  const deleteMut = useMutation({
    mutationFn: deleteRechnung,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['angebote'] }); setSelectedId(null) },
  })

  const selected = angebote?.find(a => a.id === selectedId) ?? null

  function handleDelete() {
    if (!selected) return
    if (!confirm(`Angebot ${selected.rechnungsnummer} wirklich löschen?`)) return
    deleteMut.mutate(selected.id)
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Liste */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between shrink-0">
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Angebote</h1>
          <button
            onClick={() => { setFormModus('neu'); setSelectedId(null) }}
            className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-xl"
          >
            + Neues Angebot
          </button>
        </div>

        {/* Formular */}
        {formModus && (
          <div className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-y-auto max-h-[60vh]">
            <AngebotFormular
              initial={formModus === 'bearbeiten' && selected ? selected : undefined}
              onSpeichern={(id) => { setFormModus(null); setSelectedId(id) }}
              onAbbrechen={() => setFormModus(null)}
            />
          </div>
        )}

        {/* Tabelle */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-6 animate-pulse space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-12 bg-slate-100 dark:bg-slate-800 rounded" />)}
            </div>
          ) : !angebote?.length ? (
            <div className="p-10 text-center">
              <p className="text-slate-500 dark:text-slate-400">Noch keine Angebote vorhanden.</p>
              <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">Klicke auf „+ Neues Angebot" um zu starten.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Nummer</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Datum</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Gültig bis</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Kunde</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Brutto</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody>
                {angebote.map(a => (
                  <tr
                    key={a.id}
                    onClick={() => { setSelectedId(a.id); setFormModus(null) }}
                    className={`border-b border-slate-50 dark:border-slate-700 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer transition-colors ${
                      selectedId === a.id ? 'bg-blue-50 dark:bg-slate-600 border-l-2 border-l-blue-500' : ''
                    }`}
                  >
                    <td className="px-5 py-3 font-mono text-xs text-slate-400 dark:text-slate-500">{a.rechnungsnummer}</td>
                    <td className="px-5 py-3 text-slate-500 dark:text-slate-400">{formatDatum(a.datum)}</td>
                    <td className={`px-5 py-3 font-medium ${a.gueltig_bis && a.gueltig_bis < heuteIso() && a.angebot_status === 'offen' ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>
                      {formatDatum(a.gueltig_bis)}
                    </td>
                    <td className="px-5 py-3 text-slate-700 dark:text-slate-200">{a.kunde_name ?? a.partner_freitext ?? '—'}</td>
                    <td className="px-5 py-3 text-right text-slate-700 dark:text-slate-200">
                      {(parseFloat(a.brutto_gesamt as any) || 0).toFixed(2).replace('.', ',')} €
                    </td>
                    <td className="px-5 py-3 text-center"><StatusBadge status={a.angebot_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Detail-Panel */}
      {selected && !formModus && (
        <div className="w-80 shrink-0 border-l border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden flex flex-col">
          <AngebotDetail
            angebot={selected}
            onEdit={() => setFormModus('bearbeiten')}
            onClose={() => setSelectedId(null)}
            onDelete={handleDelete}
          />
        </div>
      )}
    </div>
  )
}
