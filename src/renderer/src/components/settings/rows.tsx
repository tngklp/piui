import type { ReactNode } from 'react'

/** Pill switch used for boolean settings rows. */
export function Switch({
  label,
  checked,
  onChange
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`sw${checked ? ' on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  )
}

/**
 * One settings row: what it does on the left, its control on the right.
 * Rows stack inside a `.gcard`.
 */
export function Row({
  title,
  hint,
  children
}: {
  title: string
  hint: string
  children: ReactNode
}) {
  return (
    <div className="grow">
      <div className="grow__text">
        <b>{title}</b>
        <small>{hint}</small>
      </div>
      <div className="grow__ctl">{children}</div>
    </div>
  )
}

/** Page header shared by every settings tab that leads with a title. */
export function SettingsHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="set-head">
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </header>
  )
}
