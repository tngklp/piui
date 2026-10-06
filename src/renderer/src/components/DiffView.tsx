import { memo } from 'react'

/** Classify one line of a unified/display diff for colouring. */
function lineClass(line: string): string {
  if (line.startsWith('+++') || line.startsWith('---')) return 'diff__line diff__line--meta'
  if (line.startsWith('@@')) return 'diff__line diff__line--hunk'
  if (line.startsWith('+')) return 'diff__line diff__line--add'
  if (line.startsWith('-')) return 'diff__line diff__line--del'
  return 'diff__line'
}

interface DiffViewProps {
  diff: string
  filePath?: string
}

/** Renders a display-oriented diff with add/remove line colouring. */
export const DiffView = memo(function DiffView({ diff, filePath }: DiffViewProps) {
  const lines = diff.length > 0 ? diff.split('\n') : []

  return (
    <div className="diff">
      {filePath ? <div className="diff__path">{filePath}</div> : null}
      <pre className="diff__body">
        {lines.map((line, index) => (
          <span className={lineClass(line)} key={index}>
            {line}
            {'\n'}
          </span>
        ))}
      </pre>
    </div>
  )
})
