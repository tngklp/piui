# PiUI

A desktop GUI for the [Pi](https://pi.dev) coding agent — run your Pi agent in
a purpose-built app instead of a terminal.

PiUI embeds the Pi agent runtime directly in an Electron main process and presents it through a
React interface. It shares the same agent directory (`~/.pi/agent`) as the `pi` CLI, so settings,
credentials, skills, models, and sessions are common to both. Anything you change in PiUI shows up
in the CLI and vice versa.

## Contents

- [Features](#features)
- [Requirements](#requirements)
- [Install](#install)
- [Getting started](#getting-started)
- [Development](#development)
- [Packaging](#packaging)
- [Project layout](#project-layout)
- [How it works](#how-it-works)
- [Running Pi in Docker](#running-pi-in-docker)
- [Releasing](#releasing)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## Features

**Chat**

- Streaming transcript with markdown, syntax highlighting, KaTeX maths, and collapsible reasoning
  blocks.
- Tool calls render as cards showing the command, the diff, or the output, with a duration.
- Model and reasoning-effort pickers in the composer, plus a slash menu for commands, skills, and
  prompt templates.
- Attach images (sent as image blocks) or text files (inlined into the prompt).
- Steer a running turn, or queue a follow-up, without waiting for it to finish.

**Approvals**

- Per-tool policy — allow, ask, or deny — so anything that runs a command or writes a file can
  pause for review. Approvals appear inline in the transcript rather than as a modal.

**Sessions**

- Session browser grouped by date, with pinning, starring, renaming, forking, and deletion.
- Workspace switching with a native folder picker; sessions are grouped by working directory.

**Workspace**

- File explorer with selectable icon packs (Material Icons or Catppuccin Icons).
- CodeMirror 6 editor with tabs, search, autocomplete, indent guides, format-on-save (Prettier),
  and optional auto save.
- Real terminal (xterm.js over a `node-pty` shell) that keeps running while you switch tabs.
- Quick open (`Ctrl+P`) across the whole workspace.
- Monitor tab with live inference telemetry (tokens per second, prompt progress, KV cache), GPU
  load and VRAM, and host CPU and memory.

**Customization**

- Fifteen themes: five families (Graphite, Wisteria, Ocean, Ember, Rose) each in a normal, dark,
  and light variant.
- Settings for the agent, terminal, editor, models, icon packs, packages, and approval policy.

**Updates**

- Installed builds check the GitHub releases feed on launch and offer a download-and-restart prompt.

## Requirements

- **Node.js >= 22.19** — required by Pi's SDK, and by the build.
- **The `pi` CLI**, installed and on `PATH`. PiUI loads the SDK from your installed release, so the
  app and the CLI always agree on behaviour.
- **A model to talk to.** Either a hosted API (OpenAI, Anthropic, DeepSeek, Gemini, xAI, Mistral,
  Groq, OpenRouter — add one under **Settings → Models**), or a local
  [llama.cpp](https://github.com/ggerganov/llama.cpp) server:

  ```sh
  llama-server -m model.gguf --port 8080 --metrics
  ```

  `--metrics` is what the Monitor tab reads; without it the tab explains that the endpoint publishes
  no telemetry.

Install Pi with:

```sh
# Windows
powershell -c "irm https://pi.dev/install.ps1 | iex"
# macOS / Linux
curl -fsSL https://pi.dev/install.sh | sh
```

## Install

Download the latest release from the
[releases page](https://github.com/tngklp/piui/releases):

| Platform | Download                          | Notes                                                             |
| -------- | --------------------------------- | ----------------------------------------------------------------- |
| Windows  | `PiUI-<version>-x64-setup.exe`    | Installer. Supports in-app updates, launches instantly.           |
| Windows  | `PiUI-<version>-x64.zip`          | Unzip once, run `PiUI.exe`. No install, launches instantly.       |
| Windows  | `PiUI-<version>-x64-portable.exe` | One file, nothing to install. Re-extracts itself on every launch. |
| Linux    | `PiUI-<version>-x64.AppImage`     | Supports in-app updates.                                          |
| Linux    | `PiUI-<version>-x64.deb`          | Reinstall to update.                                              |

**Why the portable build is slow to open.** It is a self-extracting launcher. On every launch it
unpacks the whole ~380 MB app into a temp directory, runs it, deletes it on exit, and does the same
again next time — so five to ten seconds pass before the window appears, every single time. The
launcher template inside electron-builder always wipes and re-extracts, so there is no setting that
avoids it. The setup build and the zip both start instantly; use one of those unless you need a
single file. See [Packaging](#packaging).

macOS is not packaged yet.

## Getting started

1. Launch PiUI. The first screen offers your recent workspaces; pick a folder to work in. Everything
   the agent does happens inside that directory.
2. Open **Settings → Models** and add a provider. Choose one from the list to add a hosted API (then
   paste your API key), or add a custom provider for a local endpoint such as
   `http://127.0.0.1:8080/v1`. Press **Add model** to pick from the provider's catalogue.
3. Back in the chat, choose the model in the composer and send a message.
4. When the agent wants to run a tool, an approval card appears in the transcript — unless you
   changed the policy in **Settings → Tools**.

## Development

```sh
npm install
npm run dev          # launch with HMR
npm run typecheck    # type-check main/preload and renderer
npm run build        # type-check, then build to out/
npm run format       # Prettier
npm run smoke        # load the SDK the way the app does, without a window
```

`npm install` may not run lifecycle scripts depending on your npm configuration. If `npm run dev`
fails with `Error: Electron uninstall`, run `node node_modules/electron/install.js` once.

## Packaging

```sh
npm run build:win      # setup + portable, the release artifacts
npm run build:win:zip  # adds a no-install zip that starts instantly
npm run build:linux    # AppImage + deb
npm run build:unpack   # unpacked directory, for inspecting the bundle
```

The three Windows artifacts trade size against startup time:

| Artifact     | Size    | First launch  | Every launch after |
| ------------ | ------- | ------------- | ------------------ |
| setup `.exe` | ~132 MB | installer run | instant            |
| `.zip`       | ~180 MB | one unzip     | instant            |
| portable     | ~132 MB | 5-10 s        | 5-10 s             |

All of them carry the same files; the difference is when the app is unpacked. Nothing is rebuilt at
package time either — `npmRebuild` is off, because node-pty ships N-API prebuilds that Electron can
load as they are. Turning it on makes the build require the Spectre-mitigated VC++ libraries.

## Project layout

```
assets/           generated app icon (from scripts/make-icon.mjs)
build/            electron-builder build resources (generated icon)
scripts/          build-time helpers: icon generation, icon packs, SDK smoke test
src/main/         Electron main process: window, IPC, packaging concerns
  pi/             the agent host: SDK loading, sessions, models, approvals, packages
src/preload/      the contextBridge API exposed to the renderer as window.piui
src/renderer/     the React UI
  src/components/  UI, split into settings/, panels/, editor/
  src/lib/         renderer-side helpers (preferences, attachments, icon packs)
  src/theme/       the theme registry
src/shared/       the IPC contract and DTOs, imported by both sides
```

`assets/icon.png`, `build/icon.png`, and the icon packs under
`src/renderer/public/*-icons/` are **generated**, and therefore gitignored. `npm run assets`
regenerates them and runs automatically before `dev` and `typecheck`, so a fresh clone builds
without them. The `scripts/` directory is committed because those generators are the source.

## How it works

The renderer never touches Node or the SDK. The main process owns the agent and streams typed events
over IPC:

```mermaid
graph LR
  R[Renderer<br/>React + Zustand] -- invoke --> P[Preload<br/>contextBridge]
  P -- ipcRenderer --> M[Main process]
  M -- ipcMain.handle --> H[AgentHost]
  H -- in-process --> S[pi SDK]
  S -- session events --> M
  M -- webContents.send --> R
```

A few decisions worth knowing:

- **The SDK is loaded from the installed `pi` release** (`src/main/pi/sdk.ts`) rather than from
  PiUI's own pinned copy, so the app cannot drift from the CLI. It falls back to the bundled copy if
  no release is found.
- **Approvals are an inline pi extension** hooking `tool_call`, rather than something built on
  `ctx.ui`. PiUI only implements the UI context members it needs.
- **The agent directory is shared.** `models.json`, credentials, skills, and sessions all live under
  `~/.pi/agent`; PiUI edits them in place and preserves keys it does not understand.
- **Hosted providers are treated differently from local ones.** An entry in `models.json` overlays
  pi's built-in provider rather than replacing it, so a hosted provider would otherwise inherit its
  entire built-in catalogue. PiUI hides the model fields the API owns and lists only the models you
  added.
- **`--metrics` is a local-engine feature.** Hosted APIs do not publish inference telemetry, so the
  Monitor tab only has data when the model runs on a llama.cpp-style server you can reach.

## Configuration

| What               | Where                                                    |
| ------------------ | -------------------------------------------------------- |
| Providers & models | `<agentDir>/models.json`, via **Settings → Models**      |
| Tool approvals     | `userData/approval-rules.json`, via **Settings → Tools** |
| Workspace          | `userData/workspace.json`                                |
| Theme, prefs       | `localStorage` in the renderer                           |
| Agent directory    | `PI_CODING_AGENT_DIR`, default `~/.pi/agent`             |
| Default workspace  | `PIUI_CWD`, default your home directory                  |
| Terminal shell     | **Settings → General**, or the `PIUI_SHELL` env var      |

The terminal shell is a whole command, not just a path, so it can start something other than a
local shell — `docker exec -it pi bash`, `wsl.exe -d Ubuntu`, `ssh devbox`. See
[Running Pi in Docker](#running-pi-in-docker).

## Running Pi in Docker

PiUI talks to a model endpoint over HTTP and runs the agent in-process, on the machine PiUI is
installed on. It has no notion of a remote agent, so there is no setting that makes it "use" a
container directly. Two things do work:

**Run the model in a container, not the agent.** This is the usual case and needs no changes to
PiUI: expose llama.cpp from the container and add it as a custom provider.

```sh
docker run --rm -p 8080:8080 -v ./models:/models ghcr.io/ggerganov/llama.cpp:server \
  -m /models/model.gguf --host 0.0.0.0 --port 8080 --metrics
```

Then add a provider with base URL `http://127.0.0.1:8080/v1` under **Settings → Models**. The
Monitor tab works too, because `--metrics` is exposed over the forwarded port.

**Run the agent in a container.** Point the terminal at it, and drive `pi` inside the container
from PiUI's Terminal tab:

```
Settings → General → Shell:  docker exec -it pi-agent bash
```

The integrated terminal is a real pseudo-terminal, so the TUI works normally. Set that shell to
`pi` directly if you want the terminal to open straight into the agent:

```
Settings → General → Shell:  docker exec -it pi-agent pi
```

Note what this does and does not give you: it is a shell inside the container, sharing PiUI's
window, and nothing else. The chat panel, the file explorer, and the editor still operate on the
host workspace, and the agent's tools still run on the host. To work on the same files from both
sides, mount the workspace into the container and keep the paths aligned:

```sh
docker run --rm -it --name pi-agent -v "$PWD:/work" -w /work <image> bash
```

## Releasing

Releases are built by hand — pushing a tag does not publish anything.

1. Bump `version` in `package.json` and commit it.
2. Run the **Release** workflow from the Actions tab, or `npm run release` locally.
3. The run uploads the installers and the `latest.yml` to a **draft** GitHub release.
4. Review the draft and publish it.

### What `latest.yml` is

It is a small text file electron-builder writes next to the installers and uploads as a release
asset. It holds the version, the file name to download, and the SHA-512 to verify it:

```yaml
version: 0.1.0
path: PiUI-0.1.0-x64-setup.exe
sha512: qvCiJ2v8ldNesw59lZ8VfQy...
```

It is not shipped inside the app and not installed anywhere. The running app fetches it **over
HTTPS from the releases feed** on launch, compares the version there with its own, and offers the
download if the feed is newer. So the check is already online — `latest.yml` _is_ what it checks.
Electron-updater needs it because the release page alone does not say which asset is the update,
nor what its hash is; the file gives it both, plus deltas.

Publishing the draft is what makes an update visible. Nothing polls a draft.

To publish automatically on tags instead, add a `push: tags: ['v*']` trigger to
`.github/workflows/release.yml` and switch `releaseType` to `release` in `electron-builder.yml`.

If you would rather not use GitHub as the feed, electron-builder's `publish` block also supports
`provider: generic` (any static host) and `s3`. All of them serve the same `latest.yml`; only the
URL changes. Replacing electron-updater with a hand-rolled "is there a newer release?" check would
mean re-implementing the download, the hash verification, and the install step it already does.

## Troubleshooting

**"No model" and an empty model picker.** `models.json` failed to load. The most common cause is an
empty `apiKey`: pi's schema requires at least one character when the key is present, and one invalid
field invalidates the whole file. The Models tab shows the exact reason — remove the empty key or
fill it in.

**The Monitor tab says the endpoint publishes no telemetry.** Expected for hosted APIs. Start a
local llama.cpp server with `--metrics` to see inference data.

**A hosted model is missing from the picker.** Only models you added from the provider's catalogue
are offered; that is deliberate. Add the model under **Settings → Models**.

**Format on save does nothing.** Prettier only formats languages it can infer a parser for from the
file name, and it respects the project's own `.prettierrc` (including `ignore` rules). Files it
cannot handle are saved unchanged.

**A PDF cannot be attached.** The agent's prompt API accepts text and images only — there is no
document block to send a PDF in, and inlining one would produce binary noise. Paste the text, or
attach an image of the page.

## License

MIT — see [LICENSE](LICENSE).
