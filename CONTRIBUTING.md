# Contributing to PiUI

Thanks for wanting to help. This is a small project, so the most useful thing you can do is open an
issue with a clear reproduction — the [bug report template](.github/ISSUE_TEMPLATE/bug_report.yml)
asks for the versions that make a report actionable.

## Getting set up

You need **Node.js 22.19 or newer** and the **`pi` CLI**. PiUI loads the agent SDK out of your
installed `pi` release rather than from its own pinned copy, so the app and the CLI always agree on
behaviour — and a broken `pi` install will look like a broken PiUI.

```sh
git clone https://github.com/tngklp/piui.git
cd piui
npm install
```

`npm install` does not finish the job on its own here. npm 12 blocks install scripts, and Electron
ships its binary through one, so a fresh clone needs:

```sh
node node_modules/electron/install.js
```

If a Vite build then fails on a missing esbuild binary, the same applies: `node
node_modules/esbuild/install.js`.

### Commands

| Command             | What it does                                                   |
| ------------------- | -------------------------------------------------------------- |
| `npm run dev`       | Electron with hot reload                                       |
| `npm run build`     | Typecheck, then build to `out/`                                |
| `npm run typecheck` | TypeScript for the main and renderer projects                  |
| `npm run format`    | Prettier, which also checks markdown and the workflow files    |
| `npm run smoke`     | Loads the agent SDK and binds the extensions, without a window |

`predev` and `pretypecheck` regenerate the icons and the icon packs, so those never need committing.

### Packaging

`npm run build:win` and `npm run build:linux` produce installers in `release/`. `npm run build:win`
needs no signing certificate; the Linux targets are best built on Linux or in a container, because
`node-pty` has no Linux prebuild and has to be compiled.

## How the code is arranged

```
src/main/       Node: owns the agent, the filesystem, the terminal, updates
src/preload/    contextBridge; the only bridge between the two
src/renderer/   React: the entire UI
src/shared/     The IPC contract, imported by all three
```

Three rules keep this manageable:

- **The renderer never touches Node or the SDK.** Everything it can do is a method on
  `src/shared/ipc.ts`, handled in `src/main/ipc.ts`. Adding a feature usually starts by adding a
  channel there.
- **The main process is the only place that reads the disk**, and it refuses rather than guesses. A
  destructive operation validates its target and returns a reason instead of throwing somewhere the
  user cannot see.
- **Anything cached across a tab switch lives at module scope.** `EditorView` keeps buffers, undo
  history and scroll offsets in module-level maps, because the component unmounts whenever another
  tab is shown. If you add state that must survive that, follow the same pattern — and remember to
  invalidate it when the file changes underneath.

## Conventions

- **Conventional Commits.** `feat(explorer): ...`, `fix(editor): ...`. The changelog and the release
  notes are written by hand, so the subject line is the summary a reviewer reads first.
- **Prettier is the arbiter**, with no semicolons and single quotes. Run `npm run format` before
  committing; CI checks it.
- **Comments explain why, not what.** The interesting decisions in this codebase are the ones that
  look wrong until you know the reason — a `minmax(0, 1fr)` that stops a column growing, a
  `quitAndInstall(true, true)` that skips an installer wizard. Those are worth a sentence. A comment
  restating the code is not.
- **Type everything.** `strict` is on, and `noUnusedLocals` will catch a variable you stopped using.

## Verifying a change

There is no test framework. What exists is:

```sh
npm run typecheck && npm run format:check && npm run build
npm run smoke           # the agent SDK loads and both extensions bind
node_modules/electron/dist/electron.exe .    # the app actually starts
```

For main-process logic that is awkward to reach from the UI, the module can be bundled and exercised
directly — its type-only imports disappear, so it runs under plain Node:

```sh
npx esbuild src/main/pi/changes.ts --bundle --format=esm --platform=node --outfile=/tmp/x.mjs
```

That is how the agent change tracking is verified, and it is worth doing for anything with logic
worth being wrong about.

**Be honest about what you checked.** "Builds and launches" is a weaker claim than "verified the
relative-path case", and a reviewer needs to know which one they are reading.

## Releasing

Releases are cut by hand from the Actions tab; a push never publishes on its own.

1. Move the `## [Unreleased]` entries into a new `## [<version>] - <date>` section in
   `CHANGELOG.md`, and reopen an empty `Unreleased`. `scripts/release-notes.mjs` throws if the
   version has no section, so this cannot be skipped by accident.
2. Bump `version` in `package.json`, and update the direct download links at the top of the README —
   they carry the version in the file name, so they cannot point at "latest".
3. Commit, then dispatch **Release** from the Actions tab, ticking `force` only to rebuild a version
   that is already published.
