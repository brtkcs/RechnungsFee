import { useState, useEffect, useRef } from 'react'

interface DateInputProps {
  value: string
  onChange: (value: string) => void
  required?: boolean
  className?: string
  min?: string
  max?: string
}

function isoToGerman(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return ''
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`
}

function germanToIso(s: string): string {
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (!m) return ''
  const dd = m[1].padStart(2, '0')
  const mm = m[2].padStart(2, '0')
  const y = m[3]
  if (parseInt(mm) < 1 || parseInt(mm) > 12) return ''
  if (parseInt(dd) < 1 || parseInt(dd) > 31) return ''
  const iso = `${y}-${mm}-${dd}`
  const dt = new Date(iso + 'T00:00:00')
  if (isNaN(dt.getTime())) return ''
  if (dt.getFullYear() !== parseInt(y) || dt.getMonth() + 1 !== parseInt(mm) || dt.getDate() !== parseInt(dd)) return ''
  return iso
}

export function DateInput({ value, onChange, required, className, min, max }: DateInputProps) {
  const [text, setText] = useState(() => isoToGerman(value))
  const [invalid, setInvalid] = useState(false)
  const prevValue = useRef(value)

  useEffect(() => {
    if (value !== prevValue.current) {
      prevValue.current = value
      setText(isoToGerman(value))
      setInvalid(false)
    }
  }, [value])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    const adding = raw.length >= text.length

    let s = raw.replace(/[^0-9.]/g, '').replace(/\.{2,}/g, '.')

    if (adding) {
      const digits = s.replace(/\./g, '')
      if (digits.length === 2 && !s.includes('.')) {
        s = s + '.'
      } else if (digits.length === 4 && s.split('.').length === 2 && !s.endsWith('.')) {
        s = s + '.'
      }
    }

    const parts = s.split('.')
    if (parts.length === 3 && parts[2].length > 4) {
      s = `${parts[0]}.${parts[1]}.${parts[2].slice(0, 4)}`
    }

    setText(s)
    setInvalid(false)

    if (!s) {
      prevValue.current = ''
      onChange('')
      return
    }

    const iso = germanToIso(s)
    if (iso && (!min || iso >= min) && (!max || iso <= max)) {
      prevValue.current = iso
      onChange(iso)
    }
  }

  function handleBlur() {
    if (!text) { setInvalid(false); return }
    const iso = germanToIso(text)
    if (iso) {
      setInvalid(false)
      setText(isoToGerman(iso))
    } else {
      setInvalid(true)
    }
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={text}
      onChange={handleChange}
      onBlur={handleBlur}
      required={required}
      placeholder="TT.MM.JJJJ"
      maxLength={10}
      className={`${className ?? ''}${invalid ? ' !border-red-400 dark:!border-red-500' : ''}`}
    />
  )
}
