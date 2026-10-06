import { useEffect, useState } from 'react'
import { usePiUi } from '../store'

/**
 * Renders extension-UI dialogs (and PiUI's own approval prompts) as a modal and
 * sends the answer back to the main process.
 */
export function DialogHost() {
  const dialog = usePiUi((state) => state.dialog)
  const respond = usePiUi((state) => state.respondToDialog)
  const [text, setText] = useState('')

  useEffect(() => {
    if (dialog?.method === 'editor') {
      setText(dialog.prefill ?? '')
    } else {
      setText('')
    }
  }, [dialog])

  if (!dialog) return null

  const cancel = (): void => void respond({ id: dialog.id, cancelled: true })

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal__backdrop" onClick={cancel} />
      <div className="modal__panel">
        <h2 className="modal__title">{dialog.title}</h2>

        {dialog.method === 'confirm' ? (
          <pre className="modal__message">{dialog.message}</pre>
        ) : null}

        {dialog.method === 'select' ? (
          <div className="modal__options">
            {dialog.options.map((option) => (
              <button
                key={option}
                className="modal__option"
                onClick={() => void respond({ id: dialog.id, value: option })}
              >
                {option}
              </button>
            ))}
          </div>
        ) : null}

        {dialog.method === 'input' ? (
          <input
            className="modal__input"
            value={text}
            placeholder={dialog.placeholder ?? ''}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void respond({ id: dialog.id, value: text })
              if (event.key === 'Escape') cancel()
            }}
            autoFocus
          />
        ) : null}

        {dialog.method === 'editor' ? (
          <textarea
            className="modal__input modal__input--multiline"
            value={text}
            onChange={(event) => setText(event.target.value)}
            autoFocus
          />
        ) : null}

        <div className="modal__actions">
          <button className="button" onClick={cancel}>
            Cancel
          </button>
          {dialog.method === 'input' || dialog.method === 'editor' ? (
            <button
              className="button button--primary"
              onClick={() => void respond({ id: dialog.id, value: text })}
            >
              OK
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
