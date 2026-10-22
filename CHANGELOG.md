# Changelog

## 0.1.0 — Unreleased

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
