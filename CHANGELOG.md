# Changelog

All notable changes to PiUI are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Releases are cut by hand from the Actions tab. `scripts/release-notes.mjs` reads the section for
the version in `package.json` and becomes the body of the GitHub release, so a version cannot be
published without an entry here.

## [Unreleased]

### Added

- **Live tool output.** A running tool's card fills in as the command prints, instead of appearing
  only once it has finished.
- **More file types in the editor.** Images and PDFs render in place of the text editor, and
  markdown opens in a rendered view with a toggle back to its source.
- **The prompt box grows with the text**, up to a cap, and files can be dropped onto it — from your
  file manager or from PiUI's own file panel — to reference them.
- **A jump-to-the-end button** appears in the chat once you scroll away from the bottom, and
  switching between Chat and Editor keeps each one at the position it was left.
- README: a banner, screenshots, status badges, a troubleshooting section, and a known issues and
  roadmap section.
- Issue templates for bug reports and feature requests.

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

[Unreleased]: https://github.com/tngklp/piui/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/tngklp/piui/releases/tag/v0.1.0
