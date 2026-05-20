import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getKategorien, toggleKategorieAktiv } from '../../api/client'

const KONTENART_META: Record<string, { label: string; cls: string; beschreibung: string }> = {
  Erlös:   { label: 'Erlöse',   cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300', beschreibung: 'Betriebseinnahmen' },
  Aufwand: { label: 'Aufwand',  cls: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',                 beschreibung: 'Betriebsausgaben' },
  Anlage:  { label: 'Anlage',   cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',             beschreibung: 'Anlagevermögen' },
  Privat:  { label: 'Privat',   cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',         beschreibung: 'Private Entnahmen/Einlagen' },
}

const REIHENFOLGE = ['Erlös', 'Aufwand', 'Anlage', 'Privat']

function UstBadge({ satz }: { satz: number }) {
  if (satz === 0)  return <span className="text-xs text-slate-400 dark:text-slate-500">§19 / 0 %</span>
  if (satz === 7)  return <span className="text-xs text-amber-600 dark:text-amber-400">7 %</span>
  if (satz === 19) return <span className="text-xs text-blue-600 dark:text-blue-400">19 %</span>
  return <span className="text-xs text-slate-400">{satz} %</span>
}

// ---------------------------------------------------------------------------
// KategorienPage
// ---------------------------------------------------------------------------

export function KategorienPage() {
  const [filter, setFilter] = useState('')
  const [nurAktive, setNurAktive] = useState(false)
  const qc = useQueryClient()
  const { data: kategorien = [], isLoading } = useQuery({
    queryKey: ['kategorien'],
    queryFn: () => getKategorien(false),
  })
  const toggleMutation = useMutation({
    mutationFn: (id: number) => toggleKategorieAktiv(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kategorien'] })
    },
  })

  const suchtext = filter.toLowerCase()
  const gefiltert = kategorien.filter(k =>
    (nurAktive ? k.aktiv : true) &&
    (k.name.toLowerCase().includes(suchtext) ||
    (k.konto_skr03 ?? '').includes(suchtext) ||
    (k.konto_skr04 ?? '').includes(suchtext) ||
    (k.eks_kategorie ?? '').toLowerCase().includes(suchtext))
  )

  const gruppen = REIHENFOLGE
    .map(art => ({ art, liste: gefiltert.filter(k => k.kontenart === art) }))
    .filter(g => g.liste.length > 0)

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Kategorien</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          {kategorien.length} Buchungskategorien mit SKR03/04-Konten und EÜR-Zuordnung
        </p>
      </div>

      {/* Suche + Filter */}
      <div className="mb-5 flex items-center gap-3">
        <input
          type="search"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Name, SKR-Konto oder EKS-Feld suchen …"
          className="w-full max-w-sm border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={() => setNurAktive(v => !v)}
          className={`shrink-0 text-sm px-3 py-2 rounded-lg border transition-colors ${
            nurAktive
              ? 'bg-blue-600 text-white border-blue-600'
              : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
          }`}
        >
          {nurAktive ? 'Nur aktive' : 'Alle'}
        </button>
      </div>

      {isLoading && <p className="text-slate-400 text-sm">Lade…</p>}

      {/* Gruppen */}
      <div className="space-y-8">
        {gruppen.map(({ art, liste }) => {
          const meta = KONTENART_META[art] ?? { label: art, cls: 'bg-slate-100 text-slate-600', beschreibung: '' }
          return (
            <div key={art}>
              {/* Gruppenheader */}
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${meta.cls}`}>
                  {meta.label}
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500">{meta.beschreibung}</span>
                <span className="text-xs text-slate-300 dark:text-slate-600 ml-auto">{liste.length} Kategorien</span>
              </div>

              {/* Tabelle */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                      <th className="text-left px-4 py-2.5 font-medium sticky left-0 bg-slate-50 dark:bg-slate-900 z-10">Bezeichnung</th>
                      <th className="text-left px-3 py-2.5 font-medium w-20">SKR03</th>
                      <th className="text-left px-3 py-2.5 font-medium w-20">SKR04</th>
                      <th className="text-left px-3 py-2.5 font-medium w-24">EÜR-Zeile</th>
                      <th className="text-left px-3 py-2.5 font-medium w-20">EKS</th>
                      <th className="text-left px-3 py-2.5 font-medium w-24">USt-Satz</th>
                      <th className="text-left px-3 py-2.5 font-medium w-16">VSt %</th>
                      <th className="px-3 py-2.5 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {liste.map((k, i) => (
                      <tr
                        key={k.id}
                        className={`border-b border-slate-100 dark:border-slate-700 last:border-0 transition-opacity ${
                          !k.aktiv ? 'opacity-40' : ''
                        } ${i % 2 === 0 ? '' : 'bg-slate-50/50 dark:bg-slate-900/30'}`}
                      >
                        <td className="px-4 py-2.5 sticky left-0 bg-white dark:bg-slate-800 z-10">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-800 dark:text-slate-100">{k.name}</span>
                            {!k.ist_system && (
                              <span className="text-xs bg-violet-100 text-violet-600 dark:bg-violet-900 dark:text-violet-300 px-1.5 py-0.5 rounded font-medium">
                                Eigene
                              </span>
                            )}
                            {!k.aktiv && (
                              <span className="text-xs bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500 px-1.5 py-0.5 rounded font-medium">
                                Inaktiv
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-slate-600 dark:text-slate-300 text-xs">
                          {k.konto_skr03 ?? <span className="text-slate-300 dark:text-slate-600">—</span>}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-slate-600 dark:text-slate-300 text-xs">
                          {k.konto_skr04 ?? <span className="text-slate-300 dark:text-slate-600">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 text-xs">
                          {k.euer_zeile
                            ? <span>Zeile {k.euer_zeile}</span>
                            : <span className="text-slate-300 dark:text-slate-600">—</span>
                          }
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs">
                          {k.eks_kategorie
                            ? <span className="text-slate-700 dark:text-slate-300">{k.eks_kategorie}</span>
                            : <span className="text-slate-300 dark:text-slate-600">—</span>
                          }
                        </td>
                        <td className="px-3 py-2.5">
                          <UstBadge satz={k.ust_satz_standard} />
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400">
                          {Number(k.vorsteuer_prozent) === 100
                            ? '100 %'
                            : <span className="text-amber-600 dark:text-amber-400">{k.vorsteuer_prozent} %</span>
                          }
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <button
                            type="button"
                            title={k.aktiv ? 'Deaktivieren' : 'Aktivieren'}
                            onClick={() => toggleMutation.mutate(k.id)}
                            className={`text-xs px-2 py-1 rounded border transition-colors ${
                              k.aktiv
                                ? 'border-slate-200 dark:border-slate-600 text-slate-400 hover:border-red-300 hover:text-red-500 dark:hover:text-red-400'
                                : 'border-green-300 text-green-600 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-950'
                            }`}
                          >
                            {k.aktiv ? 'Aus' : 'Ein'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
      </div>

      {/* Legende */}
      {!isLoading && kategorien.length > 0 && (
        <div className="mt-8 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-5 py-4 text-xs text-slate-500 dark:text-slate-400 space-y-1">
          <p className="font-semibold text-slate-600 dark:text-slate-300 mb-2">Legende</p>
          <p><span className="font-mono">SKR03/04</span> – DATEV-Kontonummern (Standardkontenrahmen)</p>
          <p><span className="font-mono">EÜR-Zeile</span> – Zeile in der Einnahmen-Überschuss-Rechnung (Anlage EÜR)</p>
          <p><span className="font-mono">EKS</span> – Tabellenfeld in der Anlage EKS (Jobcenter-Einkommenserklärung)</p>
          <p><span className="font-mono">VSt %</span> – Anteil der Vorsteuer der abgezogen wird (100 % = voller Abzug)</p>
        </div>
      )}
    </div>
  )
}
