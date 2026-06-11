import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getVorlagen, createVorlage, updateVorlage, deleteVorlage,
  entwurfJetzt, preiseSynchronisieren, getKunden, sucheArtikel,
  type Rechnungsvorlage, type VorlageCreate, type VorlagePosition,
  type EntwurfErgebnis, type ArtikelSuche, type Kunde,
} from '../../api/client'

// ---------------------------------------------------------------------------
// Typen & Konstanten
// ---------------------------------------------------------------------------

const INTERVALL_LABEL: Record<string, string> = {
  monatlich: 'Monatlich',
  quartalsweise: 'Quartalsweise',
  jaehrlich: 'Jährlich',
}

const INTERVALL_ICON: Record<string, string> = {
  monatlich: '📅',
  quartalsweise: '📆',
  jaehrlich: '🗓️',
}

type PositionEntwurf = Omit<VorlagePosition, 'netto'> & { netto: string; _suche?: string; _treffer?: ArtikelSuche[] }

const leerPosition = (): PositionEntwurf => ({
  beschreibung: '', menge: '1.000', einheit: 'Stück', netto: '', ust_satz: '0.00',
  artikel_id: null, kategorie_id: null, _suche: '', _treffer: [],
})

function fmt(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

function fmtBetrag(s: string) {
  return parseFloat(s || '0').toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ---------------------------------------------------------------------------
// Unterkomponente: Positions-Zeile
// ---------------------------------------------------------------------------

function PositionZeile({
  pos, index, onChange, onRemove,
}: {
  pos: PositionEntwurf
  index: number
  onChange: (i: number, p: PositionEntwurf) => void
  onRemove: (i: number) => void
}) {
  const [sucheOffen, setSucheOffen] = useState(false)

  async function handleSuche(q: string) {
    onChange(index, { ...pos, _suche: q })
    if (q.length < 2) { setSucheOffen(false); return }
    const treffer = await sucheArtikel(q)
    onChange(index, { ...pos, _suche: q, _treffer: treffer })
    setSucheOffen(treffer.length > 0)
  }

  function waehleArtikel(a: ArtikelSuche) {
    onChange(index, {
      ...pos,
      beschreibung: a.bezeichnung,
      einheit: a.einheit,
      netto: a.vk_netto,
      ust_satz: a.steuersatz,
      artikel_id: a.id,
      _suche: a.bezeichnung,
      _treffer: [],
    })
    setSucheOffen(false)
  }

  return (
    <div className="grid grid-cols-[2fr_80px_80px_90px_80px_32px] gap-2 items-start">
      {/* Beschreibung + Artikel-Suche */}
      <div className="relative">
        <input
          value={pos._suche ?? pos.beschreibung}
          onChange={e => handleSuche(e.target.value)}
          onBlur={() => {
            if (!pos.artikel_id) onChange(index, { ...pos, beschreibung: pos._suche ?? pos.beschreibung })
            setTimeout(() => setSucheOffen(false), 150)
          }}
          placeholder="Bezeichnung oder Artikel suchen…"
          className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
        />
        {sucheOffen && pos._treffer && pos._treffer.length > 0 && (
          <div className="absolute z-20 top-full left-0 right-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded shadow-lg max-h-48 overflow-y-auto mt-0.5">
            {pos._treffer.map(a => (
              <button
                key={a.id}
                onMouseDown={() => waehleArtikel(a)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-between gap-2"
              >
                <span className="text-slate-800 dark:text-slate-100">{a.bezeichnung}</span>
                <span className="text-slate-400 dark:text-slate-500 text-xs shrink-0">{fmtBetrag(a.vk_netto)} €</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <input
        value={pos.menge}
        onChange={e => onChange(index, { ...pos, menge: e.target.value })}
        placeholder="Menge"
        className="px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-right"
      />
      <input
        value={pos.einheit}
        onChange={e => onChange(index, { ...pos, einheit: e.target.value })}
        placeholder="Einheit"
        className="px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
      />
      <input
        value={pos.netto}
        onChange={e => onChange(index, { ...pos, netto: e.target.value, artikel_id: null })}
        placeholder="Netto €"
        className="px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-right"
      />
      <input
        value={pos.ust_satz}
        onChange={e => onChange(index, { ...pos, ust_satz: e.target.value })}
        placeholder="USt %"
        className="px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-right"
      />
      <button
        onClick={() => onRemove(index)}
        className="mt-1 text-slate-400 hover:text-red-500 transition-colors text-lg leading-none"
        title="Position entfernen"
      >
        ×
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Unterkomponente: Formular (Neu / Bearbeiten)
// ---------------------------------------------------------------------------

function VorlageFormular({
  initial,
  kunden,
  onSave,
  onAbbrechen,
  isSaving,
}: {
  initial?: Rechnungsvorlage
  kunden: Kunde[]
  onSave: (data: VorlageCreate) => void
  onAbbrechen: () => void
  isSaving: boolean
}) {
  const heute = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState<{
    bezeichnung: string
    intervall: string
    naechstes_datum: string
    aktiv: boolean
    kunde_id: string
    zahlungsziel_tage: string
    notizen: string
  }>({
    bezeichnung: initial?.bezeichnung ?? '',
    intervall: initial?.intervall ?? 'monatlich',
    naechstes_datum: initial?.naechstes_datum ?? heute,
    aktiv: initial?.aktiv ?? true,
    kunde_id: initial?.kunde_id ? String(initial.kunde_id) : '',
    zahlungsziel_tage: initial?.zahlungsziel_tage ? String(initial.zahlungsziel_tage) : '',
    notizen: initial?.notizen ?? '',
  })

  const [positionen, setPositionen] = useState<PositionEntwurf[]>(
    initial?.positionen.length
      ? initial.positionen.map(p => ({ ...p, _suche: p.beschreibung, _treffer: [] }))
      : [leerPosition()]
  )

  const set = (k: string, v: string | boolean) => setForm(f => ({ ...f, [k]: v }))

  function handlePositionChange(i: number, p: PositionEntwurf) {
    setPositionen(prev => prev.map((x, j) => j === i ? p : x))
  }

  function handlePositionRemove(i: number) {
    setPositionen(prev => prev.filter((_, j) => j !== i))
  }

  function handleSave() {
    const data: VorlageCreate = {
      bezeichnung: form.bezeichnung.trim(),
      intervall: form.intervall as VorlageCreate['intervall'],
      naechstes_datum: form.naechstes_datum,
      aktiv: form.aktiv,
      kunde_id: form.kunde_id ? parseInt(form.kunde_id) : null,
      zahlungsziel_tage: form.zahlungsziel_tage ? parseInt(form.zahlungsziel_tage) : null,
      notizen: form.notizen.trim() || null,
      positionen: positionen
        .filter(p => p.beschreibung.trim())
        .map(p => ({
          beschreibung: p.beschreibung.trim(),
          menge: p.menge || '1.000',
          einheit: p.einheit || 'Stück',
          netto: p.netto || '0.00',
          ust_satz: p.ust_satz || '0.00',
          artikel_id: p.artikel_id ?? null,
          kategorie_id: p.kategorie_id ?? null,
        })),
    }
    onSave(data)
  }

  const kannSpeichern = form.bezeichnung.trim().length > 0 && form.naechstes_datum

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Bezeichnung *</label>
          <input
            value={form.bezeichnung}
            onChange={e => set('bezeichnung', e.target.value)}
            placeholder="z. B. Webhosting Muster GmbH"
            className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Intervall *</label>
          <select
            value={form.intervall}
            onChange={e => set('intervall', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
          >
            <option value="monatlich">Monatlich</option>
            <option value="quartalsweise">Quartalsweise</option>
            <option value="jaehrlich">Jährlich</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Erster / nächster Entwurf *</label>
          <input
            type="date"
            value={form.naechstes_datum}
            onChange={e => set('naechstes_datum', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Zahlungsziel (Tage)</label>
          <input
            type="number"
            value={form.zahlungsziel_tage}
            onChange={e => set('zahlungsziel_tage', e.target.value)}
            placeholder="Unternehmens-Standard"
            className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
          />
        </div>
        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.aktiv}
              onChange={e => set('aktiv', e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600"
            />
            <span className="text-sm text-slate-700 dark:text-slate-200">Aktiv</span>
          </label>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Kunde</label>
        <select
          value={form.kunde_id}
          onChange={e => set('kunde_id', e.target.value)}
          className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
        >
          <option value="">— kein Kunde —</option>
          {kunden.map(k => (
            <option key={k.id} value={k.id}>
              {k.firmenname || `${k.vorname ?? ''} ${k.nachname ?? ''}`.trim()}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Notiz (erscheint auf Rechnung)</label>
        <textarea
          value={form.notizen}
          onChange={e => set('notizen', e.target.value)}
          rows={2}
          className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 resize-none"
        />
      </div>

      {/* Positionen */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Positionen</label>
          <div className="grid grid-cols-[2fr_80px_80px_90px_80px_32px] gap-2 text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wide">
            <span>Bezeichnung</span><span className="text-right">Menge</span><span>Einheit</span><span className="text-right">Netto €</span><span className="text-right">USt %</span><span />
          </div>
        </div>
        <div className="space-y-2">
          {positionen.map((pos, i) => (
            <PositionZeile key={i} pos={pos} index={i} onChange={handlePositionChange} onRemove={handlePositionRemove} />
          ))}
        </div>
        <button
          onClick={() => setPositionen(prev => [...prev, leerPosition()])}
          className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          + Position hinzufügen
        </button>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
        <button
          onClick={onAbbrechen}
          className="px-4 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
        >
          Abbrechen
        </button>
        <button
          onClick={handleSave}
          disabled={!kannSpeichern || isSaving}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {isSaving ? 'Wird gespeichert…' : 'Speichern'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Unterkomponente: Vorlage-Karte
// ---------------------------------------------------------------------------

function VorlageKarte({
  vorlage,
  onBearbeiten,
  onLoeschen,
  onEntwurfJetzt,
  onPreisSync,
}: {
  vorlage: Rechnungsvorlage
  onBearbeiten: () => void
  onLoeschen: () => void
  onEntwurfJetzt: () => void
  onPreisSync: () => void
}) {
  const brutto = vorlage.positionen.reduce((s, p) => {
    const n = parseFloat(p.netto || '0')
    const u = parseFloat(p.ust_satz || '0')
    return s + parseFloat(p.menge || '1') * n * (1 + u / 100)
  }, 0)

  return (
    <div className={`bg-white dark:bg-slate-800 rounded-xl border ${vorlage.aktiv ? 'border-slate-200 dark:border-slate-700' : 'border-slate-100 dark:border-slate-800 opacity-60'} p-5 space-y-3`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg">{INTERVALL_ICON[vorlage.intervall] ?? '📄'}</span>
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100 truncate">{vorlage.bezeichnung}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {INTERVALL_LABEL[vorlage.intervall]} · {vorlage.kunde_name ?? 'Kein Kunde'}
            </p>
          </div>
        </div>
        {!vorlage.aktiv && (
          <span className="shrink-0 text-xs bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full">Inaktiv</span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-0.5">Nächster Entwurf</p>
          <p className="font-medium text-slate-700 dark:text-slate-200">{fmt(vorlage.naechstes_datum)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-0.5">Betrag (ca. brutto)</p>
          <p className="font-medium text-slate-700 dark:text-slate-200">{fmtBetrag(String(brutto))} €</p>
        </div>
        <div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-0.5">Erstellt</p>
          <p className="font-medium text-slate-700 dark:text-slate-200">
            {vorlage.erstellte_rechnungen}× {vorlage.letzte_erstellung ? `· ${fmt(vorlage.letzte_erstellung)}` : ''}
          </p>
        </div>
      </div>

      {vorlage.positionen.length > 0 && (
        <div className="border-t border-slate-100 dark:border-slate-700 pt-2">
          {vorlage.positionen.slice(0, 3).map((p, i) => (
            <div key={i} className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 py-0.5">
              <span className="truncate">{p.beschreibung}</span>
              <span className="shrink-0 ml-2">{fmtBetrag(p.netto)} €</span>
            </div>
          ))}
          {vorlage.positionen.length > 3 && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">+{vorlage.positionen.length - 3} weitere…</p>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={onEntwurfJetzt}
          title="Jetzt Entwurf erstellen"
          className="flex-1 px-3 py-1.5 text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
        >
          Entwurf jetzt erstellen
        </button>
        <button
          onClick={onPreisSync}
          title="Artikel-Preise auf aktuellen Stand bringen"
          className="px-3 py-1.5 text-xs font-medium bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
        >
          Preise sync
        </button>
        <button
          onClick={onBearbeiten}
          className="px-3 py-1.5 text-xs font-medium bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
        >
          Bearbeiten
        </button>
        <button
          onClick={onLoeschen}
          className="px-3 py-1.5 text-xs text-red-500 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >
          Löschen
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Hauptseite
// ---------------------------------------------------------------------------

export function WiederkehrendePage() {
  const qc = useQueryClient()
  const [formModus, setFormModus] = useState<'neu' | number | null>(null)
  const [letzterEntwurf, setLetzterEntwurf] = useState<EntwurfErgebnis | null>(null)

  const { data: vorlagen = [], isLoading } = useQuery({
    queryKey: ['wiederkehrend'],
    queryFn: getVorlagen,
  })

  const { data: kunden = [] } = useQuery({
    queryKey: ['kunden'],
    queryFn: () => getKunden({}),
  })

  const createMut = useMutation({
    mutationFn: createVorlage,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['wiederkehrend'] }); setFormModus(null) },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: VorlageCreate }) => updateVorlage(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['wiederkehrend'] }); setFormModus(null) },
  })

  const deleteMut = useMutation({
    mutationFn: deleteVorlage,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wiederkehrend'] }),
  })

  const entwurfMut = useMutation({
    mutationFn: entwurfJetzt,
    onSuccess: (ergebnis) => {
      qc.invalidateQueries({ queryKey: ['wiederkehrend'] })
      qc.invalidateQueries({ queryKey: ['rechnungen'] })
      setLetzterEntwurf(ergebnis)
    },
  })

  const syncMut = useMutation({
    mutationFn: preiseSynchronisieren,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wiederkehrend'] }),
  })

  function handleSave(data: VorlageCreate) {
    if (formModus === 'neu') createMut.mutate(data)
    else if (typeof formModus === 'number') updateMut.mutate({ id: formModus, data })
  }

  function handleLoeschen(id: number, bezeichnung: string) {
    if (confirm(`Vorlage „${bezeichnung}" wirklich löschen?`)) deleteMut.mutate(id)
  }

  const editVorlage = typeof formModus === 'number' ? vorlagen.find(v => v.id === formModus) : undefined

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Wiederkehrende Rechnungen</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Vorlagen werden automatisch als Entwurf angelegt wenn das Datum erreicht ist.
          </p>
        </div>
        {formModus === null && (
          <button
            onClick={() => setFormModus('neu')}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            + Neue Vorlage
          </button>
        )}
      </div>

      {/* Letzter Entwurf – Ergebnis-Banner */}
      {letzterEntwurf && (
        <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-xl p-4 flex items-start gap-3">
          <span className="text-green-600 dark:text-green-400 text-xl">✓</span>
          <div className="flex-1 space-y-1">
            <p className="text-sm font-medium text-green-800 dark:text-green-300">
              Entwurf <span className="font-bold">{letzterEntwurf.rechnungsnummer}</span> erstellt aus „{letzterEntwurf.vorlage_bezeichnung}"
            </p>
            {letzterEntwurf.preisaenderungen.length > 0 && (
              <div>
                <p className="text-xs text-amber-700 dark:text-amber-400 font-medium mt-1">
                  ⚠ Preisänderungen im Entwurf übernommen:
                </p>
                {letzterEntwurf.preisaenderungen.map((pa, i) => (
                  <p key={i} className="text-xs text-amber-700 dark:text-amber-400 ml-3">
                    · {pa.beschreibung}: {parseFloat(pa.preis_vorlage).toFixed(2)} € → {parseFloat(pa.preis_aktuell).toFixed(2)} €
                  </p>
                ))}
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Klicke „Preise sync" um die Vorlage auf die neuen Preise zu aktualisieren.
                </p>
              </div>
            )}
          </div>
          <button onClick={() => setLetzterEntwurf(null)} className="text-green-400 hover:text-green-600 text-lg leading-none">×</button>
        </div>
      )}

      {/* Formular */}
      {formModus !== null && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-blue-200 dark:border-blue-800 p-6">
          <h2 className="text-base font-semibold text-slate-700 dark:text-slate-200 mb-4">
            {formModus === 'neu' ? 'Neue Vorlage' : 'Vorlage bearbeiten'}
          </h2>
          <VorlageFormular
            initial={editVorlage}
            kunden={kunden}
            onSave={handleSave}
            onAbbrechen={() => setFormModus(null)}
            isSaving={createMut.isPending || updateMut.isPending}
          />
        </div>
      )}

      {/* Liste */}
      {isLoading ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">Lade Vorlagen…</p>
      ) : vorlagen.length === 0 && formModus === null ? (
        <div className="text-center py-16 text-slate-400 dark:text-slate-500 space-y-2">
          <p className="text-4xl">🔁</p>
          <p className="text-sm">Noch keine Vorlagen angelegt.</p>
          <p className="text-xs">Erstelle eine Vorlage für regelmäßige Leistungen wie Hosting, Wartung oder Miete.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {vorlagen.map(v => (
            <VorlageKarte
              key={v.id}
              vorlage={v}
              onBearbeiten={() => setFormModus(v.id)}
              onLoeschen={() => handleLoeschen(v.id, v.bezeichnung)}
              onEntwurfJetzt={() => entwurfMut.mutate(v.id)}
              onPreisSync={() => syncMut.mutate(v.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
