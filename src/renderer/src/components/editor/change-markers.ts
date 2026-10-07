/**
 * The editor's gutter marks for what the agent changed, the way an editor shows
 * an unstaged diff.
 *
 * Two layers, because that is what makes it readable: a coloured bar in a gutter
 * of its own, and a faint tint on the line itself. A bar alone is easy to miss in
 * a file you are scrolling; a tint alone has no edge to align to.
 *
 * The numbers come from a real line diff computed in the main process, where both
 * versions of the file exist. They describe the file as it was written, so they
 * are anchored when the decorations are built and then carried along by the usual
 * mapping as the user types.
 */
import { StateField, type Extension, type Range } from '@codemirror/state'
import { Decoration, GutterMarker, gutter, type DecorationSet } from '@codemirror/view'
import type { LineChangeDto } from '@shared/ipc'

const ADDED_LINE = Decoration.line({ class: 'cm-chg-add' })
const MODIFIED_LINE = Decoration.line({ class: 'cm-chg-mod' })

/** One marker object per kind, so the gutter can compare them cheaply. */
class ChangeMarker extends GutterMarker {
  constructor(readonly kind: 'add' | 'mod' | 'del') {
    super()
  }

  override eq(other: ChangeMarker): boolean {
    return other.kind === this.kind
  }

  override toDOM(): HTMLElement {
    const node = document.createElement('div')
    node.className = `cm-chg-bar ${this.kind}`
    return node
  }
}

const ADD = new ChangeMarker('add')
const MOD = new ChangeMarker('mod')
const DEL = new ChangeMarker('del')

interface Markers {
  added: Set<number>
  modified: Set<number>
  removed: Set<number>
}

function markersFrom(lines: LineChangeDto): Markers {
  return {
    added: new Set(lines.added),
    modified: new Set(lines.modified),
    removed: new Set(lines.removed)
  }
}

/**
 * Tint the changed lines.
 *
 * `Decoration.line` attaches to a position, not a range, so each one sits at the
 * start of its line. Mapping them through every transaction is what keeps them
 * valid: the set is immutable, and an unmapped decoration left behind by an edit
 * above it would point at the wrong place or past the end of the document.
 */
function lineTints(markers: Markers): Extension {
  return StateField.define<DecorationSet>({
    create: (state) => {
      const ranges: Range<Decoration>[] = []
      for (let number = 1; number <= state.doc.lines; number += 1) {
        if (markers.added.has(number)) ranges.push(ADDED_LINE.range(state.doc.line(number).from))
        else if (markers.modified.has(number)) {
          ranges.push(MODIFIED_LINE.range(state.doc.line(number).from))
        }
      }
      return Decoration.set(ranges, true)
    },
    update: (value, transaction) => value.map(transaction.changes)
  })
}

/**
 * The mark itself.
 *
 * `lineMarker` is asked per visible line, which is all the information the set
 * needs — so this stays a plain closure rather than a facet, and reconfiguring the
 * compartment is enough to make a change appear.
 */
function changeGutter(markers: Markers): Extension {
  return gutter({
    class: 'cm-changeGutter',
    lineMarker: (view, line) => {
      const number = view.state.doc.lineAt(line.from).number
      if (markers.added.has(number)) return ADD
      if (markers.modified.has(number)) return MOD
      if (markers.removed.has(number)) return DEL
      return null
    },
    // Every gutter needs a widest element to reserve space for, and the widest
    // marker here is the same size as the others.
    initialSpacer: () => ADD
  })
}

/**
 * Gutter marks and line tints for one file's pending change, or nothing at all
 * when the file has none. Returned as a single extension so the caller can drop
 * it into a compartment and swap it as files switch.
 */
export function changeMarkers(lines: LineChangeDto | null | undefined): Extension {
  if (!lines) return []
  const markers = markersFrom(lines)
  if (markers.added.size === 0 && markers.modified.size === 0 && markers.removed.size === 0) {
    return []
  }
  return [changeGutter(markers), lineTints(markers)]
}
