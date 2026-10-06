/**
 * Generate the PiUI application icon.
 *
 * The mark is the same "pi" symbol the app shows in its own chrome: a lilac
 * squircle with a dark geometric pi glyph. Everything is drawn procedurally so
 * the repository does not need to carry binary artwork through a design tool.
 *
 * Outputs `resources/icon.png` (used as the window/taskbar icon) and
 * `build/icon.png` (used by electron-builder to derive the installer icon).
 *
 * Usage: node scripts/make-icon.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Canvas size in pixels. */
const SIZE = 512
/** Samples per axis, used to anti-alias the hard-edged shapes. */
const SUPERSAMPLE = 4

/** Lilac accent, matching the `lilac-dark` theme. */
const BACKGROUND = [0xbe, 0xa4, 0xf0]
/** Dark violet drawn on top, matching the theme's `onAccent` token. */
const FOREGROUND = [0x24, 0x15, 0x3f]

/** Axis-aligned rectangle in canvas coordinates. */
const GLYPH_RECTS = [
  // Crossbar, overhanging the legs on both sides.
  { x0: 112, y0: 144, x1: 400, y1: 200 },
  // Left leg.
  { x0: 164, y0: 200, x1: 220, y1: 388 },
  // Right leg.
  { x0: 292, y0: 200, x1: 348, y1: 388 }
]

/** Corner radius of the squircle background. */
const RADIUS = 112

/** True when the point lies inside a rounded rectangle covering the canvas. */
function insideBackground(x, y) {
  const r = RADIUS
  const cx = Math.min(Math.max(x, r), SIZE - r)
  const cy = Math.min(Math.max(y, r), SIZE - r)
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= r * r
}

/** True when the point lies inside any glyph rectangle. */
function insideGlyph(x, y) {
  return GLYPH_RECTS.some((rect) => x >= rect.x0 && x < rect.x1 && y >= rect.y0 && y < rect.y1)
}

/** Render the icon to a straight RGBA buffer. */
function render() {
  const pixels = Buffer.alloc(SIZE * SIZE * 4)
  const step = 1 / SUPERSAMPLE
  const samples = SUPERSAMPLE * SUPERSAMPLE

  for (let py = 0; py < SIZE; py += 1) {
    for (let px = 0; px < SIZE; px += 1) {
      let backgroundCoverage = 0
      let glyphCoverage = 0

      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const x = px + (sx + 0.5) * step
          const y = py + (sy + 0.5) * step
          if (!insideBackground(x, y)) continue
          backgroundCoverage += 1
          if (insideGlyph(x, y)) glyphCoverage += 1
        }
      }

      const alpha = backgroundCoverage / samples
      const glyph = backgroundCoverage === 0 ? 0 : glyphCoverage / backgroundCoverage
      const offset = (py * SIZE + px) * 4
      for (let channel = 0; channel < 3; channel += 1) {
        pixels[offset + channel] = Math.round(
          BACKGROUND[channel] * (1 - glyph) + FOREGROUND[channel] * glyph
        )
      }
      pixels[offset + 3] = Math.round(alpha * 255)
    }
  }

  return pixels
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let value = n
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[n] = value >>> 0
  }
  return table
})()

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([length, body, crc])
}

/** Wrap a raw RGBA buffer in a minimal PNG container. */
function encodePng(pixels) {
  const stride = SIZE * 4
  const raw = Buffer.alloc((stride + 1) * SIZE)
  for (let row = 0; row < SIZE; row += 1) {
    raw[row * (stride + 1)] = 0 // filter: none
    pixels.copy(raw, row * (stride + 1) + 1, row * stride, (row + 1) * stride)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(SIZE, 0)
  ihdr.writeUInt32BE(SIZE, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  ihdr[10] = 0 // deflate
  ihdr[11] = 0 // adaptive filtering
  ihdr[12] = 0 // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const png = encodePng(render())

for (const target of ['resources', 'build']) {
  const directory = join(ROOT, target)
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'icon.png'), png)
  console.log(`icon: wrote ${target}/icon.png (${SIZE}x${SIZE}, ${png.length} bytes)`)
}
