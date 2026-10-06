import { useEffect, useState, type CSSProperties, type PointerEvent } from 'react'
import { DialogHost } from './components/DialogHost'
import { MainPane } from './components/MainPane'
import { QuickOpen } from './components/QuickOpen'
import { RightPanel } from './components/RightPanel'
import { SettingsDialog } from './components/SettingsDialog'
import { Sidebar } from './components/Sidebar'
import { StatusFooter } from './components/StatusFooter'
import { UpdateToast } from './components/UpdateToast'
import { Welcome } from './components/Welcome'
import { usePiUi } from './store'

export default function App() {
  const initialize = usePiUi((state) => state.initialize)
  const rightOpen = usePiUi((state) => state.rightOpen)
  const rightWidth = usePiUi((state) => state.rightWidth)
  const setRightWidth = usePiUi((state) => state.setRightWidth)
  const newSession = usePiUi((state) => state.newSession)
  const focusSearch = usePiUi((state) => state.focusSearch)
  const closeWelcome = usePiUi((state) => state.closeWelcome)
  const settingsOpen = usePiUi((state) => state.settingsOpen)
  const openQuickOpen = usePiUi((state) => state.openQuickOpen)

  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    void initialize()
  }, [initialize])

  /**
   * Application shortcuts. The native menu is removed in the main process, so
   * nothing else claims these accelerators.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!event.ctrlKey && !event.metaKey) return
      // Let the settings dialog own its own keyboard handling.
      if (settingsOpen) return
      const key = event.key.toLowerCase()

      if (key === 'n') {
        event.preventDefault()
        closeWelcome()
        void newSession()
        return
      }
      if (key === 'k') {
        event.preventDefault()
        closeWelcome()
        focusSearch()
        return
      }
      if (key === 'p') {
        event.preventDefault()
        closeWelcome()
        openQuickOpen()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeWelcome, focusSearch, newSession, openQuickOpen, settingsOpen])

  useEffect(() => {
    if (!dragging) return

    const move = (event: globalThis.PointerEvent): void => {
      setRightWidth(Math.max(300, Math.min(760, window.innerWidth - event.clientX)))
    }
    const up = (): void => setDragging(false)

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [dragging, setRightWidth])

  const onGripDown = (event: PointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    setDragging(true)
  }

  const style = { '--rw': rightOpen ? `${rightWidth}px` : '0px' } as CSSProperties
  const className = `app${rightOpen ? '' : ' rc'}${dragging ? ' drag' : ''}`

  return (
    <>
      <div className={className} style={style}>
        <Sidebar />
        <MainPane />
        {rightOpen ? <RightPanel onGripDown={onGripDown} /> : null}
        <StatusFooter />
      </div>

      {/* The welcome overlay comes first in the DOM and sits below the dialogs
          in the stacking order, so Settings opened from it is visible. */}
      <Welcome />
      <DialogHost />
      <SettingsDialog />
      <QuickOpen />
      <UpdateToast />
    </>
  )
}
