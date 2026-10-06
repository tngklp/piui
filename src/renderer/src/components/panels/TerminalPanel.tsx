import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { usePiUi } from '../../store'

/** Session id shared by every mount, so switching tabs re-attaches to the shell. */
const SESSION_ID = 'piui-main'

/** Read the current theme's colours for the terminal palette. */
function terminalTheme(): Record<string, string> {
  const style = getComputedStyle(document.documentElement)
  const token = (name: string, fallback: string): string =>
    style.getPropertyValue(name).trim() || fallback

  const text = token('--text', '#e9e9ec')
  const dim = token('--dim', '#9b9ba4')
  const accent = token('--lilac-strong', '#c9b2f5')

  return {
    background: token('--term', '#0e0e10'),
    foreground: text,
    cursor: accent,
    cursorAccent: token('--term', '#0e0e10'),
    selectionBackground: token('--lilac-soft', 'rgba(190,164,240,.25)'),
    black: dim,
    red: token('--del', '#f08aa3'),
    green: token('--add', '#6fd6a2'),
    yellow: token('--mod', '#e2c08d'),
    blue: '#8fd3ff',
    magenta: accent,
    cyan: '#7fd6d0',
    white: text,
    brightBlack: dim,
    brightRed: token('--del', '#f08aa3'),
    brightGreen: token('--add', '#6fd6a2'),
    brightYellow: token('--mod', '#e2c08d'),
    brightBlue: '#a7dcff',
    brightMagenta: accent,
    brightCyan: '#9fe6e0',
    brightWhite: text
  }
}

/** Interactive shell attached to the workspace directory. */
export function TerminalPanel() {
  const workspace = usePiUi((state) => state.workspace)
  const themeId = usePiUi((state) => state.themeId)

  const hostRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const readyRef = useRef(false)

  const [shell, setShell] = useState<string>('')
  const [cwd, setCwd] = useState<string>('')
  const [exited, setExited] = useState<number | null>(null)

  const workspaceCwd = workspace?.cwd ?? ''

  // Create the emulator once, then attach it to the main-process session.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const term = new Terminal({
      fontFamily: 'var(--mono), "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 12.5,
      lineHeight: 1.35,
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: true,
      theme: terminalTheme()
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    termRef.current = term
    fitRef.current = fit

    let disposed = false

    const start = async (): Promise<void> => {
      fit.fit()
      const session = await window.piui.terminalCreate({
        id: SESSION_ID,
        cwd: workspaceCwd,
        cols: term.cols,
        rows: term.rows
      })
      if (disposed) return

      readyRef.current = true
      setShell(session.shell)
      setCwd(session.cwd)
      setExited(null)

      // Replace whatever the emulator has with the shell's replay buffer.
      term.reset()
      if (session.buffer) term.write(session.buffer)
      else term.focus()
    }

    const offData = window.piui.onTerminalData((payload) => {
      if (payload.id === SESSION_ID) term.write(payload.data)
    })
    const offExit = window.piui.onTerminalExit((payload) => {
      if (payload.id !== SESSION_ID) return
      readyRef.current = false
      setExited(payload.exitCode)
      term.write(`\r\n\x1b[2m[process exited with code ${payload.exitCode}]\x1b[0m\r\n`)
    })

    const input = term.onData((data) => {
      if (readyRef.current) void window.piui.terminalWrite(SESSION_ID, data)
    })

    void start().catch((cause: unknown) => {
      term.write(`\r\n\x1b[31mFailed to start the shell: ${String(cause)}\x1b[0m\r\n`)
    })

    const observer = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        // The host can briefly be zero-sized while the panel animates.
      }
      if (readyRef.current) void window.piui.terminalResize(SESSION_ID, term.cols, term.rows)
    })
    observer.observe(host)

    return () => {
      disposed = true
      observer.disconnect()
      offData()
      offExit()
      input.dispose()
      term.dispose()
      termRef.current = null
      fitRef.current = null
      readyRef.current = false
    }
  }, [workspaceCwd])

  // Repaint the palette when the app theme changes.
  useEffect(() => {
    const term = termRef.current
    if (term) term.options.theme = terminalTheme()
  }, [themeId])

  const restart = async (): Promise<void> => {
    await window.piui.terminalDispose(SESSION_ID)
    const term = termRef.current
    if (!term) return
    term.reset()
    const session = await window.piui.terminalCreate({
      id: SESSION_ID,
      cwd: workspaceCwd,
      cols: term.cols,
      rows: term.rows
    })
    readyRef.current = true
    setShell(session.shell)
    setCwd(session.cwd)
    setExited(null)
  }

  return (
    <div className="term">
      <div className="term__bar">
        <span className="mono" title={cwd}>
          {cwd || 'starting…'}
        </span>
        <span className="sp" />
        <button className="ibtn" onClick={() => termRef.current?.clear()} title="Clear">
          ⌫
        </button>
        <button className="ibtn" onClick={() => void restart()} title="Restart shell">
          ↻
        </button>
      </div>

      {exited !== null ? (
        <p className="hint">
          Shell exited with code {exited}. <span className="mono">{shell}</span>
        </p>
      ) : null}

      <div className="term__body" ref={hostRef} />
    </div>
  )
}
