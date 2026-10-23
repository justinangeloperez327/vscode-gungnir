# Changelog

## 0.1.0 — Unreleased

### Group 13

- Expand Node.js 24 CI to Ubuntu 24.04, Windows 2025 and macOS 15, with extension-host tests on each.
- Extend POSIX stdio integration fixtures to macOS; retain Windows editor/command smoke tests.
- Validate Windows absolute, UNC and drive-relative generator paths; refuse symlinked generated files.
- Test multi-root lifecycle under 32 projects and repeated workspace switching, plus retry-budget stability reset.
- Document remaining end-to-end validation with the real Windows Gungnir SDK before manual release.


### Group 12

- Run one native Gungnir LSP client per active local workspace folder instead of switching a single client between roots.
- Retain independent document selectors, diagnostics, file watchers and client lifecycles.
- Recover unexpectedly closed servers per project with bounded 1/2/4-second backoff and a 30-second stability reset.
- Cancel pending starts/retries on manual Stop, workspace removal and trust changes.
- Reuse toolchain discovery on normal editor switches; add unit and multi-root extension-host regression tests.


### Group 11

- Extend upstream native Gungnir LSP with compiler-backed References, Prepare Rename, Rename, and Signature Help.
- Verify VS Code receives advertised capabilities and returns multi-file workspace edits.
- Add extension-host protocol regression tests and document the required updated native SDK.


### Group 10

- Add native `gungnir build`, `gungnir run`, `gungnir dev` commands and build/run `--release` task variants.
- Add trusted, workspace-aware VS Code task provider with `ProcessExecution` and integrated terminal output.
- Match compiler/structured-source diagnostics into Problems via native task problem matchers.
- Add explicit Stop Task action and guard against duplicate dev watchers per workspace.
- Add CI unit tests and extension-host integration coverage of task discovery, execution, exit codes and termination.


### Group 9

- Add native Gungnir project and 11 declaration generator commands, including a searchable Quick Pick.
- Enforce structured-project requirements and qualified listener/policy/notification dependencies.
- Validate names and paths, block existing destinations, prevent symlinked generated subdirectories, and validate CLI output.
- Execute native binaries without shells, with timeouts/cancellation and actionable error output; open generated files.
- Add unit and VS Code extension-host generator regression tests, preserving manual-only publication.


### Group 8

- Enable native Gungnir document formatting with VS Code's language-specific default formatter.
- Add `gungnir.formatting.enabled` policy to disable formatting without disabling IntelliSense.
- Document opt-in format-on-save; never force it globally or implement a duplicate formatter.
- Expand the LSP fixture and extension-host tests for formatting edits, idempotence, disabled state and save-time formatting.


### Group 7

- Verify native hover, Go to Definition, completions and hierarchical document symbols through real VS Code language-client registrations.
- Expand the JSON-RPC fixture to implement Gungnir's native semantic capability shapes and cross-file navigation.
- Add extension-host regression checks for supported and unknown symbols and plaintext exclusion.
- Document IntelliSense usage and native-server requirements; no duplicate TypeScript parser.


### Group 6

- Preserve the native Gungnir server's versioned publish-diagnostics semantics before VS Code language-client conversion.
- Reject stale/foreign/closed-document diagnostics while retaining standard stdio LSP framing and incremental document edits.
- Add real VS Code diagnostic regression tests using a versioned server fixture, including rapid corrections and delayed old notifications.
- Confirm the native server's diagnostics are surfaced in the Problems panel without a second parser.


### Group 5

- Add official VS Code Language Client integration for native `gungnir lsp` over stdio.
- Scope requests to the active local Gungnir workspace; respect Workspace Trust and server-enabled settings.
- Add start/restart/stop/status commands, lifecycle recovery and SDK detection integration.
- Add lifecycle/startup policy tests and a real VS Code protocol smoke fixture.


### Group 4

- Detect CLI in explicit configuration, SDK roots, `GUNGNIR_CMAKE_PREFIX` and absolute PATH directories.
- Check CLI/compiler versions, SDK headers/CMake metadata and optional SDK profile.
- Add SDK status bar, configuration settings, setup diagnostics and Command Palette actions.
- Respect Workspace Trust before executing CLI commands; use timeouts and no shell.
- Add injected discovery unit tests and VS Code extension-host integration tests.


### Group 3

- Add 26 framework-specific snippets with searchable `gnr-` prefixes and tab stops.
- Improve Gungnir indentation, word boundaries, comment continuation and region folding.
- Add unit and VS Code integration regression tests for snippet/editor contributions.
- Keep native LSP integration and Marketplace publishing deferred.

### Group 2

- Register the `.gnr` extension and the Gungnir editor language.
- Add TextMate syntax grammar, basic indentation/comments/bracket configuration and language icon.
- Add grammar unit tests and actual VS Code file-association integration tests.

### Group 1

- Bootstrap TypeScript VS Code extension with a testable status command.
- Add esbuild bundling, Vitest unit tests, extension-host tests and linting.
- Add Node.js 24 GitHub Actions verification and VSIX build artifact (not publication).
