/**
 * Build the body of a GitHub release from the changelog.
 *
 * The release workflow runs this after electron-builder has uploaded the assets, and feeds the
 * result to `gh release edit`. Keeping the text in `CHANGELOG.md` means the repository and the
 * release page cannot drift apart, and that a version cannot be published without notes.
 *
 * The version's section is copied verbatim, then a standard download table is appended so every
 * release page says which file is which without repeating it in the changelog. Throws if the
 * changelog has no entry for the version.
 *
 * Usage:
 *   node scripts/release-notes.mjs                  # version from package.json
 *   node scripts/release-notes.mjs 0.2.0           # an explicit version
 *   node scripts/release-notes.mjs --out notes.md  # write a file instead of stdout
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Matches the heading that opens a version's section, e.g. `## [0.1.0] - 2026-10-07`. */
const SECTION = /^## \[([^\]]+)\]/

/** Matches a trailing link definition, e.g. `[0.1.0]: https://github.com/...`. */
const LINK_DEFINITION = /^\[[^\]]+\]:/

/** The assets each release publishes, in the order the Install table lists them. */
const ASSETS = [
  ['Windows', 'x64-setup.exe', 'Installer. Supports in-app updates.'],
  ['Windows', 'x64.zip', 'Unzip once and run `PiUI.exe`.'],
  ['Windows', 'x64-portable.exe', 'Single file, nothing to install. Re-extracts itself on launch.'],
  ['Linux', 'x86_64.AppImage', 'Make it executable, then run it. Supports in-app updates.'],
  ['Linux', 'amd64.deb', 'Debian and derivatives. Reinstall to update.']
]

/** Read `--out`, returning the path and the positional arguments that are not its value. */
function parseArgs(argv) {
  let out = null
  const positional = []
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--out') {
      out = argv[index + 1]
      if (out === undefined) throw new Error('--out needs a file path')
      index += 1
      continue
    }
    positional.push(argv[index])
  }
  return { out, positional }
}

const { out, positional } = parseArgs(process.argv.slice(2))
const version =
  positional[0] ?? JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version

const lines = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8').split(/\r?\n/)

const start = lines.findIndex((line) => SECTION.exec(line)?.[1] === version)
if (start === -1) throw new Error(`CHANGELOG.md has no "## [${version}]" section`)

// The section runs until the next version heading, or the trailing link definitions.
const rest = lines.findIndex(
  (line, index) => index > start && (SECTION.test(line) || LINK_DEFINITION.test(line))
)
const end = rest === -1 ? lines.length : rest
const notes = lines
  .slice(start + 1, end)
  .join('\n')
  .trim()

const downloads = [
  '---',
  '',
  '### Downloads',
  '',
  '| Platform | File | Notes |',
  '| -------- | ---- | ----- |',
  ...ASSETS.map(
    ([platform, suffix, note]) => `| ${platform} | \`PiUI-${version}-${suffix}\` | ${note} |`
  ),
  '',
  'PiUI needs Node.js 22.19 or newer and the [`pi` CLI](https://pi.dev) on `PATH`.'
].join('\n')

const body = `${notes}\n\n${downloads}\n`

if (out === null) {
  process.stdout.write(body)
} else {
  writeFileSync(out, body)
  process.stderr.write(`wrote ${out} (${body.length} bytes)\n`)
}
