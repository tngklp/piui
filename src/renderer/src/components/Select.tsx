import { useEffect, useRef, useState, type ReactElement } from 'react'

export interface SelectOption<T extends string> {
  value: T
  label: string
  /** Colours rendered as a small swatch before the label. */
  swatch?: string[]
}

interface SelectProps<T extends string> {
  value: T
  options: SelectOption<T>[]
  onChange: (value: T) => void
  disabled?: boolean
  title?: string
  /** Open the menu upward. Use where the control sits near the bottom. */
  direction?: 'up' | 'down'
  /** Stretch to the width of the container. */
  block?: boolean
  placeholder?: string
}

/** Themed dropdown that replaces the native `select`. */
export function Select<T extends string>({
  value,
  options,
  onChange,
  disabled,
  title,
  direction = 'down',
  block,
  placeholder
}: SelectProps<T>) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: globalThis.PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }

    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = options.find((option) => option.value === value)

  const renderSwatch = (colors: string[]): ReactElement => (
    <span className="select__swatch" aria-hidden="true">
      {colors.map((color) => (
        <i key={color} style={{ background: color }} />
      ))}
    </span>
  )

  return (
    <div className="select" ref={rootRef} style={block ? { width: '100%' } : undefined}>
      <button
        type="button"
        className={`pick select__button${block ? ' block' : ''}`}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        disabled={disabled}
        title={title}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {current?.swatch ? renderSwatch(current.swatch) : null}
        <span className="select__label">{current?.label ?? placeholder ?? '—'}</span>
        <span className="select__caret" aria-hidden="true">
          ⌄
        </span>
      </button>

      {open ? (
        <div className={`select__menu ${direction}`} role="listbox">
          {options.map((option) => (
            <button
              type="button"
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              className={option.value === value ? 'on' : ''}
              onClick={() => {
                setOpen(false)
                if (option.value !== value) onChange(option.value)
              }}
            >
              <span className="select__option">
                {option.swatch ? renderSwatch(option.swatch) : null}
                {option.label}
              </span>
              {option.value === value ? <span className="check">✓</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
