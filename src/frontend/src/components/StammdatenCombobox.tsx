import { useState, useEffect, useRef } from 'react'

export function StammdatenCombobox({
  items,
  selectedId,
  freitext,
  onChange,
  placeholder = 'Suchen oder frei eingeben…',
}: {
  items: { id: number; label: string }[]
  selectedId: number | null
  freitext: string
  onChange: (id: number | null, freitext: string) => void
  placeholder?: string
}) {
  const [query, setQuery] = useState(() => {
    if (selectedId != null) {
      return items.find((i) => i.id === selectedId)?.label ?? ''
    }
    return freitext
  })
  const [offen, setOffen] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Wenn selectedId / freitext von außen geändert wird (z.B. Formular-Reset)
  useEffect(() => {
    if (selectedId != null) {
      const label = items.find((i) => i.id === selectedId)?.label ?? ''
      setQuery(label)
    } else {
      setQuery(freitext)
    }
  }, [selectedId, freitext, items])

  // Außen-Klick schließt Dropdown
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOffen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const q = query.trim()
  const gefiltert = q === ''
    ? []
    : items.filter((i) => i.label.toLowerCase().includes(q.toLowerCase())).slice(0, 50)

  const mehrVorhanden = q !== '' &&
    items.filter((i) => i.label.toLowerCase().includes(q.toLowerCase())).length > 50

  function handleInputChange(v: string) {
    setQuery(v)
    setOffen(v.trim() !== '')
    setHighlightIdx(0)
    onChange(null, v)
  }

  function handleSelect(item: { id: number; label: string }) {
    setQuery(item.label)
    setOffen(false)
    onChange(item.id, '')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!offen) {
      if ((e.key === 'ArrowDown' || e.key === 'Enter') && query.trim()) {
        setOffen(true)
        e.preventDefault()
      }
      return
    }
    if (e.key === 'ArrowDown') {
      setHighlightIdx((i) => Math.min(i + 1, gefiltert.length - 1))
      e.preventDefault()
    } else if (e.key === 'ArrowUp') {
      setHighlightIdx((i) => Math.max(i - 1, 0))
      e.preventDefault()
    } else if (e.key === 'Enter') {
      if (gefiltert[highlightIdx]) {
        handleSelect(gefiltert[highlightIdx])
      }
      e.preventDefault()
    } else if (e.key === 'Escape') {
      setOffen(false)
    }
  }

  function handleBlur() {
    setTimeout(() => setOffen(false), 150)
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => { if (query.trim()) setOffen(true) }}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 pr-20 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-400"
        />
        {selectedId != null && (
          <span className="absolute right-8 top-1/2 -translate-y-1/2 text-xs text-green-600 font-medium whitespace-nowrap">
            ✓ Stammdaten
          </span>
        )}
        {query.trim() && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => { setOffen((o) => !o); inputRef.current?.focus() }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
          >
            {offen ? '▲' : '▼'}
          </button>
        )}
      </div>

      {offen && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg max-h-64 overflow-y-auto">
          {gefiltert.length === 0 ? (
            <div className="px-3 py-2.5 text-sm text-slate-400 dark:text-slate-500 italic">
              Kein Treffer – wird als Freitext übernommen
            </div>
          ) : (
            <>
              {gefiltert.map((item, idx) => (
                <button
                  key={item.id}
                  type="button"
                  onMouseDown={() => handleSelect(item)}
                  onMouseEnter={() => setHighlightIdx(idx)}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                    idx === highlightIdx
                      ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                >
                  {item.label}
                </button>
              ))}
              {mehrVorhanden && (
                <div className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                  Weitere Treffer – Suche verfeinern
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
