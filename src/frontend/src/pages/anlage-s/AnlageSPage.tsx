import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { berechneAnlageS, type AnlageSErgebnis } from '../../api/client'

function euroFmt(v: string | number): string {
  const n = typeof v === 'string' ? parseFloat(v) : v
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Math.abs(n))
}

function Zeile({ zeile, feld, wert, hinweis, leer }: {
  zeile?: string
  feld: string
  wert?: string
  hinweis?: string
  leer?: boolean
}) {
  return (
    <div className={`flex items-start gap-3 px-4 py-2.5 border-b border-slate-100 dark:border-slate-700 last:border-0 ${leer ? 'opacity-40' : ''}`}>
      {zeile && (
        <span className="shrink-0 w-16 text-xs font-mono text-slate-400 dark:text-slate-500 pt-0.5">
          Zeile {zeile}
        </span>
      )}
      {!zeile && <span className="shrink-0 w-16" />}
      <span className="flex-1 text-sm text-slate-600 dark:text-slate-300">{feld}</span>
      <span className={`text-sm font-medium tabular-nums ${
        leer
          ? 'text-slate-400 dark:text-slate-500'
          : 'text-slate-800 dark:text-slate-100'
      }`}>
        {wert ?? '—'}
      </span>
      {hinweis && (
        <span className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{hinweis}</span>
      )}
    </div>
  )
}

function Abschnitt({ titel, kinder }: { titel: string; kinder: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden mb-5">
      <div className="bg-slate-50 dark:bg-slate-800 px-4 py-2 border-b border-slate-200 dark:border-slate-700">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{titel}</h2>
      </div>
      {kinder}
    </div>
  )
}

export function AnlageSPage() {
  const now = new Date()
  const [jahr, setJahr] = useState(now.getFullYear() - (now.getMonth() < 3 ? 1 : 0))
  const jahre = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i)

  const { data, isLoading, error } = useQuery<AnlageSErgebnis>({
    queryKey: ['anlage-s', jahr],
    queryFn: () => berechneAnlageS(jahr),
  })

  const gv = data ? parseFloat(data.gewinn_verlust) : 0
  const istGewinn = gv >= 0

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-1">
        Anlage S – Einkünfte aus selbstständiger Arbeit
      </h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        Anzeigehilfe für die Einkommensteuererklärung (§18 EStG) · Werte aus EÜR und Stammdaten
      </p>

      {/* Jahr-Auswahl */}
      <div className="flex items-center gap-3 mb-6">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Steuerjahr</label>
        <select
          value={jahr}
          onChange={e => setJahr(Number(e.target.value))}
          className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
        >
          {jahre.map(j => <option key={j} value={j}>{j}</option>)}
        </select>
      </div>

      {isLoading && (
        <p className="text-sm text-slate-400">Berechne…</p>
      )}
      {error && (
        <p className="text-sm text-red-500">Fehler beim Laden der Daten.</p>
      )}

      {data && (
        <>
          {/* Persönliche Angaben */}
          <Abschnitt titel="Persönliche Angaben">
            <Zeile
              zeile="1"
              feld="Name, Vorname"
              wert={[data.nachname, data.vorname].filter(Boolean).join(', ') || undefined}
              leer={!data.nachname && !data.vorname}
            />
            <Zeile
              zeile="2"
              feld="Steuernummer"
              wert={data.steuernummer || undefined}
              leer={!data.steuernummer}
            />
            <Zeile
              zeile="3"
              feld="Art der Tätigkeit (Berufsbezeichnung)"
              wert={data.berufsbezeichnung || undefined}
              leer={!data.berufsbezeichnung}
            />
            <Zeile
              feld="Finanzamt"
              wert={data.finanzamt || undefined}
              leer={!data.finanzamt}
            />
          </Abschnitt>

          {/* Laufende Einkünfte */}
          <Abschnitt titel="Laufende Einkünfte (aus EÜR)">
            {istGewinn ? (
              <Zeile
                zeile="4"
                feld="Gewinn"
                wert={euroFmt(gv)}
              />
            ) : (
              <Zeile
                zeile="5"
                feld="Verlust"
                wert={euroFmt(gv)}
              />
            )}
            <Zeile
              zeile={istGewinn ? '5' : '4'}
              feld={istGewinn ? 'Verlust' : 'Gewinn'}
              wert="0,00 €"
              leer
            />
          </Abschnitt>

          {/* KFZ mit Privatanteil */}
          {data.kfz_hinweise.length > 0 && (
            <Abschnitt titel="KFZ – Privatnutzung (Zeile 18 prüfen)">
              <div className="px-4 py-2.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border-b border-slate-100 dark:border-slate-700">
                Du hast KFZ-Anlagegüter mit Privatanteil. Wenn du die <strong>1%-Methode</strong> nutzt, ist der Privatnutzungsanteil in Zeile 18 einzutragen. Bei der <strong>Fahrtenbuchmethode</strong> oder der <strong>km-Pauschale</strong> (Privatfahrzeug) entfällt Zeile 18.
              </div>
              {data.kfz_hinweise.map((k, i) => (
                <Zeile
                  key={i}
                  feld={`${k.bezeichnung}${k.kennzeichen ? ` (${k.kennzeichen})` : ''}`}
                  wert={`${parseFloat(k.privat_anteil_prozent).toFixed(0)} % Privatanteil`}
                />
              ))}
            </Abschnitt>
          )}

          {/* Fehlende Stammdaten */}
          {(!data.steuernummer || !data.finanzamt || !data.berufsbezeichnung) && (
            <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-3 text-sm text-blue-800 dark:text-blue-300 mb-5">
              <span className="shrink-0 mt-0.5">ℹ️</span>
              <span>
                Einige Felder sind leer.{' '}
                <a href="/unternehmen" className="underline font-medium">
                  Unter Einstellungen → Unternehmen
                </a>{' '}
                kannst du Steuernummer, Finanzamt und Berufsbezeichnung hinterlegen.
              </span>
            </div>
          )}

          {/* Disclaimer */}
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
            Diese Anzeigehilfe ersetzt keine Steuerberatung. Zeilennummern beziehen sich auf das amtliche Formular Anlage S {jahr}. Bei Unsicherheiten wende dich an eine Steuerberaterin oder das Finanzamt.
          </p>
        </>
      )}
    </div>
  )
}
