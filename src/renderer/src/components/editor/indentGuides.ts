/**
 * Indentation guides, like the ones VS Code draws by default.
 *
 * A line only gets guides for the levels it is *actually* indented to, so the
 * guides stop where the line's own indentation ends instead of running across
 * the whole row. Each guide sits at the start of one indentation level, which is
 * why the background is limited to `levels * step` characters wide.
 */
import type { Extension, Range } from '@codemirror/state'
import {
  Decoration,
  ViewPlugin,
  type DecorationSet,
  type EditorView,
  type ViewUpdate
} from '@codemirror/view'

/**
 * How far a line is indented, counted in levels. A tab always advances to the
 * next level, so tab-indented files get the same guides as space-indented ones.
 */
function indentLevels(text: string, step: number): number {
  let columns = 0
  for (const character of text) {
    if (character === ' ') columns += 1
    else if (character === '\t') columns += step - (columns % step)
    else break
  }
  return Math.floor(columns / step)
}

/** Build the guide extension for an editor whose indent is `step` spaces. */
export function indentGuides(step: number): Extension {
  const width = Math.max(1, step)

  /** Inline style: a 1px hairline per level, bounded to the line's indent. */
  const styleFor = (levels: number): string =>
    [
      `background-image:repeating-linear-gradient(to right,var(--line) 0 1px,transparent 1px ${width}ch)`,
      `background-size:${levels * width}ch 100%`,
      'background-repeat:no-repeat'
    ].join(';')

  function build(view: EditorView): DecorationSet {
    const decorations: Range<Decoration>[] = []

    for (const { from, to } of view.visibleRanges) {
      let position = from
      while (position <= to) {
        const line = view.state.doc.lineAt(position)
        const levels = indentLevels(line.text, width)
        if (levels > 0) {
          decorations.push(
            Decoration.line({
              class: 'cm-indent',
              attributes: { style: styleFor(levels) }
            }).range(line.from)
          )
        }
        position = line.to + 1
      }
    }

    return Decoration.set(decorations)
  }

  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet

      constructor(view: EditorView) {
        this.decorations = build(view)
      }

      update(update: ViewUpdate): void {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = build(update.view)
        }
      }
    },
    { decorations: (plugin) => plugin.decorations }
  )
}
