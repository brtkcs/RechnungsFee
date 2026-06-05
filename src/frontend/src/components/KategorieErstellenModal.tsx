import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createKategorie, getUnternehmen,
  type Kategorie, type KategorieCreate,
} from '../api/client'

const LEER: KategorieCreate = {
  name: '', kontenart: 'Aufwand', konto_skr03: '', konto_skr04: '',
  euer_zeile: undefined, eks_kategorie: '', vorsteuer_prozent: 100, ust_satz_standard: 19,
  beschreibung: '',
}

interface Props {
  onSave: (neuKategorie: Kategorie) => void
  onClose: () => void
}

export function KategorieErstellenModal({ onSave, onClose }: Props) {
  const [form, setForm] = useState<KategorieCreate>(LEER)
  const [err, setErr] = useState('')
  const qc = useQueryClient()

  const { data: unternehmen } = useQuery({ queryKey: ['unternehmen'], queryFn: getUnternehmen, staleTime: 1000 * 60 * 10 })
  const hatEks = !!(unternehmen?.jobcenter_name || unternehmen?.bg_nummer)

  const mut = useMutation({
    mutationFn: createKategorie,
    onSuccess: (neu) => {
      qc.invalidateQueries({ queryKey: ['kategorien'] })
      onSave(neu)
    },
    onError: (e: Error) => setErr(e.message),
  })

  const set = (k: keyof KategorieCreate, v: string | number | undefined) =>
    setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Neue Kategorie anlegen</h3>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Bezeichnung *</label>
            <input
              autoFocus
              className="mt-1 w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="z.B. Fachzeitschriften"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Kontenart *</label>
            <select
              className="mt-1 w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm"
              value={form.kontenart}
              onChange={e => set('kontenart', e.target.value)}
            >
              <option>Aufwand</option>
              <option>Erlös</option>
              <option>Anlage</option>
              <option>Privat</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">USt-Satz Standard</label>
            <select
              className="mt-1 w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm"
              value={form.ust_satz_standard}
              onChange={e => set('ust_satz_standard', Number(e.target.value))}
            >
              <option value={0}>0 % (§19 / steuerfrei)</option>
              <option value={7}>7 %</option>
              <option value={19}>19 %</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">SKR03-Konto</label>
            <input
              className="mt-1 w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm font-mono"
              value={form.konto_skr03 ?? ''}
              onChange={e => set('konto_skr03', e.target.value)}
              placeholder="z.B. 4945"
              maxLength={10}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">SKR04-Konto</label>
            <input
              className="mt-1 w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm font-mono"
              value={form.konto_skr04 ?? ''}
              onChange={e => set('konto_skr04', e.target.value)}
              placeholder="z.B. 6821"
              maxLength={10}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">EÜR-Zeile</label>
            <input
              type="number"
              className="mt-1 w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm"
              value={form.euer_zeile ?? ''}
              onChange={e => set('euer_zeile', e.target.value ? Number(e.target.value) : undefined)}
              placeholder="optional"
            />
          </div>

          {hatEks && (
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">EKS-Feld</label>
              <input
                className="mt-1 w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm font-mono"
                value={form.eks_kategorie ?? ''}
                onChange={e => set('eks_kategorie', e.target.value)}
                placeholder="z.B. B13 (optional)"
              />
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Vorsteuer %</label>
            <input
              type="number"
              min={0} max={100}
              className="mt-1 w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm"
              value={form.vorsteuer_prozent ?? 100}
              onChange={e => set('vorsteuer_prozent', Number(e.target.value))}
            />
          </div>

          <div className="col-span-2">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Verwendungsbeispiele (optional)</label>
            <textarea
              rows={2}
              className="mt-1 w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm resize-none"
              value={form.beschreibung ?? ''}
              onChange={e => set('beschreibung', e.target.value)}
              placeholder="z. B. was gehört in diese Kategorie, was nicht …"
            />
          </div>
        </div>

        {err && <p className="text-xs text-red-500">{err}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            Abbrechen
          </button>
          <button
            type="button"
            disabled={!form.name || mut.isPending}
            onClick={() => mut.mutate(form)}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {mut.isPending ? 'Wird angelegt…' : 'Anlegen'}
          </button>
        </div>
      </div>
    </div>
  )
}
