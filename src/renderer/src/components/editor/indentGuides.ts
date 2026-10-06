/**
 * Indentation guides, like the ones VS Code draws by default.
 *
 * A line gets one vertical hairline per indentation level it passes. The
 * hairlines are drawn with a repeating gradient whose step is the editor's
 * indent width (in `ch`), so they line up with the characters above and below
 * without needing to measure glyphs.
 */
import {
  Decoration,
  ViewPlugin,
  type DecorationSet,
  type EditorView,
  type ViewUpdate
} from '@codemirror/view'

/** Leading whitespace of a line, as a string of spaces and tabs. */
const LEADING_WHITESPACE = /^[ \t]*/

/** Class applied to lines that are indented, which enables the gradient. */
const GUIDE_CLASS = 'cm-indent'

const guideLine = Decoration.line({ class: GUIDE_CLASS })

function buildDecorations(view: EditorView): DecorationSet {
  const decorations: ReturnType<typeof guideLine.range>[] = []

  for (const { from, to } of view.visibleRanges) {
    let position = from
    while (position <= to) {
      const line = view.state.doc.lineAt(position)
      const indent = LEADING_WHITESPACE.exec(line.text)?.[0] ?? ''
      if (indent.length > 0) decorations.push(guideLine.range(line.from))
      position = line.to + 1
    }
  }

  return Decoration.set(decorations)
}

/** Editor extension that marks indented lines so CSS can draw the guides. */
export const indentGuides = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  { decorations: (plugin) => plugin.decorations }
)
