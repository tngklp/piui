import { useEffect, useState, type CSSProperties, type PointerEvent } from 'react'
import { DialogHost } from './components/DialogHost'
import { MainPane } from './components/MainPane'
import { RightPanel } from './components/RightPanel'
import { SettingsDialog } from './components/SettingsDialog'
import { Sidebar } from './components/Sidebar'
import { StatusFooter } from './components/StatusFooter'
import { TitleBar } from './components/TitleBar'
import { Welcome } from './components/Welcome'
import { usePiUi } from './store'

export default function App() {
  const initialize = usePiUi((state) => state.initialize)
  const rightOpen = usePiUi((state) => state.rightOpen)
  const rightWidth = usePiUi((state) => state.rightWidth)
  const setRightWidth = usePiUi((state) => state.setRightWidth)

  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    void initialize()
  }, [initialize])

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
        <TitleBar />
        <Sidebar />
        <MainPane />
        <RightPanel onGripDown={onGripDown} />
        <StatusFooter />
      </div>

      <DialogHost />
      <SettingsDialog />
      <Welcome />
    </>
  )
}
