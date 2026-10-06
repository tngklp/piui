# PiUI

A desktop GUI for the [Pi](https://pi.dev) coding agent — run your local Pi agent in a
purpose-built app instead of a terminal.

> **Status:** early development. Phase 0 (project scaffold) is complete; the agent
> integration and chat UI are in progress.

## What it is

PiUI embeds the Pi agent runtime (`@earendil-works/pi-coding-agent`) directly in an
Electron main process and presents it through a React UI. It shares the same agent
directory (`~/.pi/agent`) as the `pi` CLI, so settings, credentials, skills, and sessions
are common to both.

## Requirements

- Node.js **>= 22.19** (Pi's SDK requires it)
- The `pi` CLI installed and on `PATH` — PiUI pins its bundled SDK to your installed
  `pi` version. Install Pi with:

  ```sh
  # Windows
  powershell -c "irm https://pi.dev/install.ps1 | iex"
  # macOS / Linux
  curl -fsSL https://pi.dev/install.sh | sh
  ```

## Development

```sh
npm install
npm run dev          # launch the app with HMR
npm run typecheck    # type-check main/preload and renderer
npm run build        # type-check, then build to out/
npm run format       # Prettier
```

Packaging:

```sh
npm run build:win     # Windows installer (NSIS)
npm run build:linux   # AppImage + deb
```

## Architecture

| Area | Location |
| --- | --- |
| Electron main process, window lifecycle, IPC | `src/main` |
| Pi agent host (SDK wrapper, sessions, models, tools) | `src/main/pi` |
| Preload bridge (`window.piui`) | `src/preload` |
| React renderer | `src/renderer` |
| Shared IPC contract and DTO types | `src/shared` |

The renderer never touches Node or the SDK directly: the main process owns the agent and
streams typed events over IPC.

## License

MIT — see [LICENSE](./LICENSE).
