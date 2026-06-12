import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { downloadBackup, getUnternehmen, updateUnternehmen, isTauri } from '../../api/client'

const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100 dark:placeholder-slate-400"

function ExterneBackupEinstellungen() {
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: ['unternehmen'], queryFn: getUnternehmen })

  const [pfad1, setPfad1] = useState<string>('')
  const [pfad2, setPfad2] = useState<string>('')
  const [passwort, setPasswort] = useState<string>('')
  const [zeigPasswort, setZeigPasswort] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle')

  useEffect(() => {
    if (!data) return
    setPfad1(data.backup_extern_pfad_1 ?? '')
    setPfad2(data.backup_extern_pfad_2 ?? '')
    setPasswort(data.backup_extern_passwort ?? '')
  }, [data])

  const mutation = useMutation({
    mutationFn: (payload: typeof data) => updateUnternehmen(payload!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unternehmen'] })
      setStatus('ok')
      setTimeout(() => setStatus('idle'), 2000)
    },
    onError: () => setStatus('err'),
  })

  async function waehlePfad(setter: (v: string) => void) {
    if (!isTauri()) return
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({ directory: true, title: 'Backup-Zielordner wählen' })
      if (typeof selected === 'string' && selected) setter(selected)
    } catch { /* Im Browser nicht verfügbar */ }
  }

  function speichern() {
    if (!data) return
    setStatus('saving')
    mutation.mutate({ ...data, backup_extern_pfad_1: pfad1 || null, backup_extern_pfad_2: pfad2 || null, backup_extern_passwort: passwort || null })
  }

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
      <div className="bg-blue-600 px-6 py-4">
        <h2 className="text-white font-bold text-lg">Externe Backup-Ziele</h2>
        <p className="text-blue-100 text-sm mt-0.5">
          Beim Beenden der App automatisch auf NAS, USB oder Netzlaufwerk sichern
        </p>
      </div>
      <div className="p-6 space-y-5">
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Ziel 1</label>
            <div className="flex gap-2">
              <input type="text" value={pfad1} onChange={e => setPfad1(e.target.value)}
                placeholder={`z.B. ${navigator.platform.startsWith('Win') ? '\\\\\\\\NAS\\backup' : '/mnt/nas/backup'}`}
                className={`${inputCls} flex-1`} />
              {isTauri() && (
                <button type="button" onClick={() => waehlePfad(setPfad1)}
                  className="px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                  Ordner wählen
                </button>
              )}
            </div>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              Ziel 2 <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <div className="flex gap-2">
              <input type="text" value={pfad2} onChange={e => setPfad2(e.target.value)}
                placeholder="z.B. /media/usb/backup"
                className={`${inputCls} flex-1`} />
              {isTauri() && (
                <button type="button" onClick={() => waehlePfad(setPfad2)}
                  className="px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                  Ordner wählen
                </button>
              )}
            </div>
          </div>
        </div>

        <hr className="border-slate-100 dark:border-slate-700" />

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Verschlüsselung (AES-256)</label>
          <div className="relative">
            <input
              type={zeigPasswort ? 'text' : 'password'}
              value={passwort}
              onChange={e => setPasswort(e.target.value)}
              placeholder="Backup-Passwort (optional)"
              className={`${inputCls} pr-24`}
            />
            <button type="button" onClick={() => setZeigPasswort(z => !z)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 px-2 py-1">
              {zeigPasswort ? 'Verbergen' : 'Anzeigen'}
            </button>
          </div>
          {(pfad1 || pfad2) && !passwort && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Ohne Passwort wird die externe Backup-Datei unverschlüsselt gespeichert. Empfohlen nur wenn das Ziel selbst verschlüsselt ist.
            </p>
          )}
          {passwort && (
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Verschlüsselte Datei endet auf <code className="font-mono">.db.enc</code> – zum Wiederherstellen wird dieses Passwort benötigt.
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button type="button" onClick={speichern} disabled={status === 'saving' || !data}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {status === 'saving' ? 'Wird gespeichert…' : 'Einstellungen speichern'}
          </button>
          {status === 'ok' && <span className="text-sm text-green-600 dark:text-green-400">Gespeichert</span>}
          {status === 'err' && <span className="text-sm text-red-600 dark:text-red-400">Fehler beim Speichern</span>}
        </div>
      </div>
    </div>
  )
}

export function BackupPage() {
  const [laedt, setLaedt] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [erfolg, setErfolg] = useState<string | null>(null)

  async function handleBackup() {
    setLaedt(true)
    setFehler(null)
    setErfolg(null)
    try {
      const name = await downloadBackup()
      if (name) setErfolg(`Backup gespeichert: ${name}`)
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Unbekannter Fehler')
    } finally {
      setLaedt(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Backup</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
          Deine Daten sichern und im Notfall wiederherstellen.
        </p>
      </div>

      {/* Manuelles Backup */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
        <div className="bg-green-600 px-6 py-4">
          <h2 className="text-white font-bold text-lg">Backup erstellen</h2>
          <p className="text-green-100 text-sm mt-0.5">
            Vollständige Kopie deiner Datenbank als SQLite-Datei herunterladen
          </p>
        </div>

        <div className="p-6 space-y-5">
          {fehler && (
            <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-300">
              Fehler: {fehler}
            </div>
          )}
          {erfolg && (
            <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg px-4 py-3 text-sm text-green-700 dark:text-green-300">
              ✓ {erfolg}
            </div>
          )}
          <div className="flex items-start gap-4">
            <button
              onClick={handleBackup}
              disabled={laedt}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-medium text-sm px-5 py-2 rounded-lg transition-colors shrink-0"
            >
              {laedt ? (
                <>
                  <span className="animate-spin">⏳</span>
                  Wird erstellt…
                </>
              ) : (
                <>
                  <span>💾</span>
                  Backup erstellen
                </>
              )}
            </button>
            <p className="text-sm text-slate-500 dark:text-slate-400 pt-1.5">
              Erstellt eine konsistente Kopie deiner Datenbank und startet den Download.
              Die Datei heißt <span className="font-mono text-slate-700 dark:text-slate-200">RechnungsFee-Backup-JJJJ-MM-TT.db</span>.
            </p>
          </div>

          <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-4 space-y-2">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Was wird gesichert?</p>
            <ul className="text-sm text-slate-600 dark:text-slate-300 space-y-1 list-none">
              {[
                'Alle Journaleinträge und Tagesabschlüsse',
                'Rechnungen (Eingang & Ausgang) mit Zahlungen',
                'Kunden und Lieferanten',
                'Unternehmensdaten, Konten, Kategorien',
                'Nummernkreise und alle Einstellungen',
              ].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <span className="text-green-500 shrink-0">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-3 flex gap-3">
            <span className="text-blue-500 dark:text-blue-400 shrink-0 mt-0.5">ℹ</span>
            <p className="text-xs text-blue-800 dark:text-blue-300">
              Das Backup ist eine vollständige SQLite-Datenbank und kann direkt mit dem
              SQLite-Browser oder DB Browser for SQLite geöffnet werden.
              Bewahre Backups an einem sicheren Ort auf – idealerweise auf einem externen
              Laufwerk oder in einem Cloud-Speicher.
            </p>
          </div>
        </div>
      </div>

      {/* Externe Backup-Ziele */}
      <ExterneBackupEinstellungen />

      {/* Automatische Backups */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-6 space-y-3">
        <h2 className="font-semibold text-slate-800 dark:text-slate-100">Automatische Backups</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          RechnungsFee erstellt automatisch ein Backup beim Beenden der App sowie vor
          Datenbankmigrationen. Die letzten 5 Backups werden lokal aufbewahrt.
        </p>
        <div className="space-y-1.5">
          {[
            { os: 'Linux', pfad: '~/.local/share/RechnungsFee/backups/' },
            { os: 'Windows', pfad: '%APPDATA%\\RechnungsFee\\backups\\' },
            { os: 'macOS', pfad: '~/Library/Application Support/RechnungsFee/backups/' },
          ].map(({ os, pfad }) => (
            <div key={os} className="flex items-center gap-2 text-sm">
              <span className="text-xs bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded font-medium w-16 text-center shrink-0">{os}</span>
              <code className="text-slate-600 dark:text-slate-300 font-mono text-xs">{pfad}</code>
            </div>
          ))}
        </div>
      </div>

      {/* Wiederherstellen */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-6 space-y-3">
        <h2 className="font-semibold text-slate-800 dark:text-slate-100">Backup wiederherstellen</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Eine automatische Wiederherstellungsfunktion ist in Vorbereitung. Bis dahin kannst
          du ein Backup manuell wiederherstellen:
        </p>
        <ol className="text-sm text-slate-600 dark:text-slate-300 space-y-2 list-none">
          <li className="flex items-start gap-2">
            <span className="bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0 mt-0.5">1</span>
            RechnungsFee beenden
          </li>
          <li className="flex items-start gap-2">
            <span className="bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0 mt-0.5">2</span>
            <span>Aktuelle Datenbank sichern (optional) – Datei umbenennen:
              <div className="mt-1 space-y-0.5">
                {[
                  { os: 'Linux', pfad: '~/.local/share/RechnungsFee/rechnungsfee.db' },
                  { os: 'Windows', pfad: '%APPDATA%\\RechnungsFee\\rechnungsfee.db' },
                  { os: 'macOS', pfad: '~/Library/Application Support/RechnungsFee/rechnungsfee.db' },
                ].map(({ os, pfad }) => (
                  <div key={os} className="flex items-center gap-2">
                    <span className="text-xs bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded font-medium w-16 text-center shrink-0">{os}</span>
                    <code className="font-mono text-xs text-slate-500 dark:text-slate-400">{pfad}</code>
                  </div>
                ))}
              </div>
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0 mt-0.5">3</span>
            Backup-Datei in den jeweiligen Ordner kopieren und in <code className="font-mono text-xs">rechnungsfee.db</code> umbenennen
          </li>
          <li className="flex items-start gap-2">
            <span className="bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0 mt-0.5">4</span>
            RechnungsFee neu starten
          </li>
        </ol>
      </div>
    </div>
  )
}
