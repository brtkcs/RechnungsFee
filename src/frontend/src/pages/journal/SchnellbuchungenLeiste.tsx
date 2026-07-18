import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getSchnellbuchungen, createSchnellbuchung, updateSchnellbuchung, deleteSchnellbuchung,
  getKategorien, type Schnellbuchung, type SchnellbuchungCreate,
} from '../../api/client'

interface Props {
  onAuswahl: (preset: Schnellbuchung) => void
}

const LEERES_FORMULAR: SchnellbuchungCreate = {
  name: '', art: 'Ausgabe', kategorie_id: 0, zahlungsart: 'Bar', beschreibung: '',
}

export function SchnellbuchungenLeiste({ onAuswahl }: Props) {
  const qc = useQueryClient()
  const [showVerwalten, setShowVerwalten] = useState(false)

  const { data: presets } = useQuery({
    queryKey: ['schnellbuchungen'],
    queryFn: getSchnellbuchungen,
  })

  if (!presets || (presets.length === 0 && !showVerwalten)) {
    return (
      <button
        onClick={() => setShowVerwalten(true)}
        className="border border-dashed border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 rounded-lg px-3 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
      >
        ⚡ Schnellbuchung anlegen
      </button>
    )
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {presets.map(p => (
          <button
            key={p.id}
            onClick={() => onAuswahl(p)}
            title={`${p.kategorie_name} · ${p.zahlungsart} · ${p.beschreibung}`}
            className="px-2.5 py-1 text-xs rounded-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-blue-50 hover:border-blue-300 dark:hover:bg-slate-700"
          >
            ⚡ {p.name}
          </button>
        ))}
        <button
          onClick={() => setShowVerwalten(true)}
          title="Schnellbuchungen verwalten"
          className="w-6 h-6 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 dark:hover:text-slate-300"
        >
          <span className="material-symbols-outlined text-base">settings</span>
        </button>
      </div>

      {showVerwalten && (
        <VerwaltenDialog
          presets={presets}
          onClose={() => setShowVerwalten(false)}
          onChange={() => qc.invalidateQueries({ queryKey: ['schnellbuchungen'] })}
        />
      )}
    </>
  )
}

function VerwaltenDialog({ presets, onClose, onChange }: {
  presets: Schnellbuchung[]
  onClose: () => void
  onChange: () => void
}) {
  const [formular, setFormular] = useState<SchnellbuchungCreate>(LEERES_FORMULAR)
  const [bearbeitenId, setBearbeitenId] = useState<number | null>(null)
  const [speichertLaedt, setSpeichertLaedt] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  const { data: kategorien } = useQuery({
    queryKey: ['kategorien', 'alle-aktive'],
    queryFn: () => getKategorien(true, false),
  })

  function neuFormular() {
    setBearbeitenId(null)
    setFormular(LEERES_FORMULAR)
  }

  function bearbeiten(p: Schnellbuchung) {
    setBearbeitenId(p.id)
    setFormular({
      name: p.name, art: p.art, kategorie_id: p.kategorie_id,
      zahlungsart: p.zahlungsart, beschreibung: p.beschreibung,
    })
  }

  async function speichern() {
    if (!formular.name.trim() || !formular.kategorie_id || !formular.beschreibung.trim()) {
      setFehler('Name, Kategorie und Buchungstext sind erforderlich.')
      return
    }
    setSpeichertLaedt(true)
    setFehler(null)
    try {
      if (bearbeitenId) {
        await updateSchnellbuchung(bearbeitenId, formular)
      } else {
        await createSchnellbuchung(formular)
      }
      onChange()
      neuFormular()
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.')
    } finally {
      setSpeichertLaedt(false)
    }
  }

  async function loeschen(id: number) {
    if (!confirm('Diese Schnellbuchung wirklich löschen?')) return
    await deleteSchnellbuchung(id)
    onChange()
    if (bearbeitenId === id) neuFormular()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Schnellbuchungen verwalten</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {presets.length > 0 && (
            <div className="space-y-1.5">
              {presets.map(p => (
                <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm">
                  <div>
                    <span className="font-medium text-slate-700 dark:text-slate-200">⚡ {p.name}</span>
                    <span className="text-slate-400 dark:text-slate-500"> — {p.kategorie_name} · {p.zahlungsart} · {p.art}</span>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => bearbeiten(p)} className="text-slate-400 hover:text-blue-600" title="Bearbeiten">
                      <span className="material-symbols-outlined text-lg">edit</span>
                    </button>
                    <button onClick={() => loeschen(p.id)} className="text-slate-400 hover:text-red-600" title="Löschen">
                      <span className="material-symbols-outlined text-lg">delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300">
              {bearbeitenId ? 'Schnellbuchung bearbeiten' : 'Neue Schnellbuchung'}
            </h3>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Name (Button-Text)</label>
              <input
                type="text"
                value={formular.name}
                onChange={e => setFormular(f => ({ ...f, name: e.target.value }))}
                placeholder="z. B. Tankquittung"
                className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Art</label>
                <select
                  value={formular.art}
                  onChange={e => setFormular(f => ({ ...f, art: e.target.value as 'Einnahme' | 'Ausgabe' }))}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                >
                  <option value="Ausgabe">Ausgabe</option>
                  <option value="Einnahme">Einnahme</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Zahlungsart</label>
                <select
                  value={formular.zahlungsart}
                  onChange={e => setFormular(f => ({ ...f, zahlungsart: e.target.value as SchnellbuchungCreate['zahlungsart'] }))}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                >
                  <option value="Bar">Bar</option>
                  <option value="Karte">Karte</option>
                  <option value="Bank">Bank</option>
                  <option value="PayPal">PayPal</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Kategorie</label>
              <select
                value={formular.kategorie_id || ''}
                onChange={e => setFormular(f => ({ ...f, kategorie_id: Number(e.target.value) }))}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
              >
                <option value="">– wählen –</option>
                {(kategorien ?? []).map(k => (
                  <option key={k.id} value={k.id}>{k.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Buchungstext</label>
              <input
                type="text"
                value={formular.beschreibung}
                onChange={e => setFormular(f => ({ ...f, beschreibung: e.target.value }))}
                placeholder="z. B. Tankquittung"
                className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
              />
            </div>

            {fehler && <p className="text-sm text-red-600 dark:text-red-400">{fehler}</p>}

            <div className="flex gap-2">
              <button
                onClick={speichern}
                disabled={speichertLaedt}
                className="bg-blue-600 text-white rounded-lg px-4 py-1.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {bearbeitenId ? 'Speichern' : 'Hinzufügen'}
              </button>
              {bearbeitenId && (
                <button
                  onClick={neuFormular}
                  className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 px-3 py-1.5"
                >
                  Abbrechen
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
