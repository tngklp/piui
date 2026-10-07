# Changelog

All notable changes to PiUI are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Releases are cut by hand from the Actions tab. `scripts/release-notes.mjs` reads the section for
the version in `package.json` and becomes the body of the GitHub release, so a version cannot be
published without an entry here.

## [Unreleased]

## [0.3.0] - 2026-10-07

### Added

The change-review features — the pending-changes bar, the Changes tab, and the editor's change marks
— are **off by default**. See **Changed** below for why, and for the one switch that turns them on.

- **An empty editor you can type in.** Opening the Editor tab with nothing open gives an untitled
  buffer instead of a pane telling you to open a file. Ctrl+S asks where to save it, and from then on
  it is an ordinary file with a tab of its own.
- **The editor marks the lines the agent changed**, the way an editor shows an unstaged diff: a
  coloured bar beside the line, a faint tint on the line itself, and a red wedge where lines were
  removed. The marks are computed against the file as it was before the agent touched it, and stay
  until the change is kept or undone.
- **A pending-changes bar above the prompt.** Every file the agent has written is summarised where
  the next instruction gets typed, with **Keep** and **Undo** for the whole list, and a collapsible
  per-file list behind them. The agent writes without asking, so the review belongs in the place you
  are already looking rather than only behind a tab.
- **Copy, Edit, and Try again.** Copy puts a message on the clipboard as markdown. Edit hands a sent
  message back to the prompt, and sending replaces it and everything that followed it. Try again runs
  the turn behind a reply a second time. Both work by moving the session's leaf back to where the turn
  started, so the abandoned version stays in the session file instead of being appended to. Edit sits
  under every message you sent; Copy and Try again only under the reply the agent finished last, since
  older replies have been answered over and a column of identical buttons helps nobody.
- **A Changes tab**, next to the editor, listing every file the agent has written. Each file shows
  what changed and carries **Keep** and **Undo**; the bar carries them for the whole list. Undo
  returns a file to how it was before the agent first touched it, so it still does the right thing
  after several edits have landed.
- **Explorer keyboard shortcuts**: `Delete` removes the selected file, `F2` renames it, `Enter`
  opens it, and `Ctrl+C`, `Ctrl+X`, `Ctrl+V` and `Ctrl+Z` copy, cut, paste and undo.
- **A toolbar** at the top of the file explorer with New File, New Folder, Refresh and Collapse All.
- **`Ctrl+Z` in the explorer** takes back the last file operation, including a delete: removed files
  are parked until the app exits rather than erased, so a delete can be undone.

### Changed

- **Edits are auto-kept by default.** The agent's writes are accepted as they land, so there is no
  pending-changes bar, no Changes tab, and no change marks in the editor's gutter. Turning **Auto-keep
  all edits** off in Settings brings all three back, along with the diffing and the per-file baseline
  they need. It is a preference rather than a hidden default because the review step is worth having
  when an agent is working somewhere you care about, and worth not having when it is not.
- The explorer's context menu no longer offers Refresh. New File and New Folder moved to the menu
  that opens on empty space — creating a file is something you do to a folder, not to a file.
- **Updates install themselves.** Restarting from the update prompt now runs the installer silently
  and reopens PiUI, instead of putting the setup wizard in front of you. The download also starts on
  its own as soon as an update is offered, so pressing the button is all that is left.
- **Release notes open in a panel the size of the settings dialog**, rendered as markdown. They were
  being squeezed into the corner toast, where there was no room to lay a changelog out properly.

### Fixed

- **Streaming tool output now follows its own scrollbar.** A long `write`, or a command that keeps
  talking, filled the card's output box from the top and looked frozen while it was working.
- **The welcome screen's Start list was squashed to one line per row**, so each label overlapped its
  neighbour and its description. The buttons under each message introduced a `.act` style that already
  belonged to the welcome screen's two-line tiles, which pinned them to 25px tall.
- **The prompt box no longer empties when you switch tabs.** The composer is unmounted while the
  editor or the Changes tab is shown, so a half-written prompt lived and died with it. The draft now
  lives outside the component and comes back when you do.
- **A streaming `write` or `edit` no longer shows raw JSON.** Two things were wrong. The
  `toolcall_start` event carries no id and no tool name — those are on the partial message it also
  carries — so every streamed call was anonymous, and an anonymous call could never be matched against
  its own live card. And the card printed the arguments verbatim, which while they are still being
  written is a fragment like `{"edits":`. It now names the file as soon as the path arrives and
  previews the content being produced.
- **The Editor tab is always clickable.** It was disabled until a file was open, which made the only
  way in look broken rather than merely empty.
- **The Changes tab stayed empty.** The agent addresses files the way a person does — `hello.py`,
  not an absolute path — and those paths were read relative to the wrong directory, so the tracker
  never found the file it was supposed to be watching. Tool paths now resolve against the workspace.
- **An open file kept showing its old contents** after the agent changed it on disk. The editor's
  buffer and its remembered editor state both outlive the tab, and nothing was dropping them. A file
  that changes underneath is now re-read, and buffers with unsaved edits are still left alone.
- **Right-clicking empty space in the file explorer** opened nothing, because the pane did not extend
  past the tree it contained, so there was no empty space to hit.
- The unsaved dot next to an open file now re-reads its source of truth when the tab set changes,
  rather than trusting a snapshot taken when the editor mounted.
- Deleting a file that is open in the editor no longer leaves a tab complaining about
  `ENOENT: no such file or directory`. The tab closes instead, which is also what happens when the
  agent or another program removes the file.
- The update prompt no longer shows the changelog as raw markup. The notes arrived as HTML from the
  GitHub releases feed, because the update feed carried none of its own; the release workflow now
  writes them into it.
- The welcome screen no longer lets a long session name widen the layout past the window. The text
  truncates, and the buttons keep their size.

## [0.2.0] - 2026-10-07

### Added

- **PiUI offers to install `pi` on first run.** When nothing on the machine looks like the CLI,
  the chat says so and installs it with the same command the documentation gives a human, then asks
  for a restart. Detection now also looks on `PATH`, so an install from npm or a package manager is
  not mistaken for a missing one.
- **Live tool output.** A running tool's card fills in as the command prints, instead of appearing
  only once it has finished. Finished calls collapse to a single line — chevron, description, and
  outcome — and expand on click.
- **A context menu in the file explorer**: Open, Cut, Copy, Paste, Rename, Delete, New File, New
  Folder, Copy Path, Copy Relative Path, Show in File Explorer, and Refresh. Renaming and creating
  happen in an inline input rather than a dialog.
- **More file types in the editor.** Images and PDFs render in place of the text editor, SVG opens
  as a picture, and markdown opens in a rendered view with a toggle back to its source.
- **The prompt box grows with the text**, up to a cap, and files can be dropped onto it — from your
  file manager or from PiUI's own file panel — to reference them.
- **A jump-to-the-end button** appears in the chat once you scroll away from the bottom, and
  switching between Chat and Editor keeps each one at the position it was left.
- README: a banner, screenshots, status badges, a troubleshooting section, and a known issues and
  roadmap section.
- Issue templates for bug reports and feature requests.

### Fixed

- A running tool call is no longer drawn twice, once in the transcript and once as the live card.
- The jump-to-the-end button no longer hovers over an empty session, and the chat no longer
  restores a scroll position that belonged to a session that is gone.
- Renaming or deleting a file closes any editor tab pointing at it, so a later save cannot quietly
  recreate the file at its old path.
- The markdown preview uses the full width of the pane; the transcript's line-length cap was
  leaking into it.

## [0.1.0] - 2026-10-07

The first release. PiUI runs the Pi coding agent in a desktop window and shares the same agent
directory as the `pi` CLI, so credentials, models, skills, approval policy, and sessions are common
to both. Anything you change in one shows up in the other.

### Added

**Chat**

- Streaming transcript with markdown, syntax highlighting, KaTeX maths, and collapsible reasoning
  blocks.
- Tool calls rendered as cards showing the command, the diff, the output, and how long each took.
- Model and reasoning-effort pickers in the composer, matching whatever the active model supports.
- A slash menu built from your actual commands, skills, and prompt templates, plus the `/compact`,
  `/fork`, and `/new` built-ins.
- Attachments: images are sent as image blocks, text files are inlined into the prompt.
- Steering a turn while it runs, and queueing a follow-up to be sent when it finishes.

**Approvals**

- A per-tool policy of allow, ask, or deny, so anything that runs a command or writes a file can
  pause for review. Bash, PowerShell, edit, and write default to asking.
- Approvals appear inline in the transcript, next to the tool call they belong to, rather than as a
  modal that hides the surrounding context.
- Extensions that ask questions through the extension UI get a native select, confirm, input, or
  editor dialog.

**Sessions**

- A session browser grouped by date, with search, All/Running/Starred filters, pinning, starring,
  renaming, duplicating, forking, and deletion.
- Fork lineage is shown, so you can see where a session branched from.
- Workspace switching with a native folder picker. Sessions are grouped by working directory.

**Workspace**

- File explorer with a choice of Material Icons or Catppuccin Icons.
- A CodeMirror 6 editor with tabs, unsaved-change indicators, search and replace, autocompletion,
  indent guides, breadcrumbs, bracket matching, multi-cursor editing, format-on-save through
  Prettier, and optional auto save. Unsaved buffers and undo history survive switching to another
  tab.
- Quick open (`Ctrl+P`) across the whole workspace, and `Ctrl+G` to jump to a line.
- A real terminal: `node-pty` driving xterm.js, which keeps running while you switch tabs. The
  shell is configurable, and accepts a command line rather than only a path, so
  `docker exec -it pi bash` works directly.
- A Monitor tab with live inference telemetry from a local llama.cpp server (tokens per second,
  prompt progress, queue state), GPU utilisation and VRAM, and host CPU and memory.

**Models and packages**

- A Models tab that edits `models.json` in place. Provider presets for OpenAI, Anthropic,
  DeepSeek, Google, xAI, Mistral, Groq, and OpenRouter, and custom providers for local endpoints
  such as a llama.cpp server.
- Adding a model can pull its metadata from the provider's catalogue, filling in the context
  window, output limit, and capabilities.
- A Packages tab that browses pi.dev and installs or removes skills, extensions, prompts, and
  themes, streaming the installer's output into a log.

**Customization**

- Fifteen themes: Graphite, Wisteria, Ocean, Ember, and Rose, each in a normal, dark, and light
  variant.
- Settings covering the agent, terminal, editor, models, icon packs, packages, and approval
  policy. Controls write through immediately; there is no Save button.

**Updates**

- Installed builds check the releases feed on launch and offer a download-and-restart prompt.
  Portable builds and non-AppImage Linux packages report that self-updating is not available to
  them rather than failing silently.

**Platforms**

- Windows: an installer that supports in-app updates, a portable executable, and a no-install zip.
- Linux: an AppImage that supports in-app updates, and a `.deb`.

[Unreleased]: https://github.com/tngklp/piui/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/tngklp/piui/releases/tag/v0.3.0
[0.2.0]: https://github.com/tngklp/piui/releases/tag/v0.2.0
[0.1.0]: https://github.com/tngklp/piui/releases/tag/v0.1.0
