# Architecture — Groups 1–11

The extension runs in VS Code's extension host. TypeScript is bundled with esbuild to
`dist/extension.js`. Gungnir's C++ CLI and native `gungnir lsp` server are not bundled.

- **Group 1:** Activation, status command, tests, CI and VSIX packaging.
- **Group 2:** `.gnr` registration, TextMate grammar and basic editor configuration.
- **Group 3:** Editor-behavior refinements, indentation/folding tests and documentation-backed snippets (editor-only; no CLI or language server).
- **Group 4:** Discover the installed CLI/SDK without starting a language server. Respect Workspace Trust; verify CLI/compiler versions and adjacent SDK files.
- **Group 5:** Connect to native `gungnir lsp` over stdio using the verified CLI path. A single file-backed workspace root supplies LSP initialization. The lifecycle manager serializes start/stop/restart, and the client uses a workspace-scoped document selector and file watcher.
- **Group 6:** Native server publishes versioned diagnostics. An LSP stdio frame filter drops stale results before the official client discards version metadata, while retaining incremental document synchronization and avoiding diagnostics outside the selected workspace.
- **Group 7:** Exercise the native server's existing `hoverProvider`, `definitionProvider`, `completionProvider`, and `documentSymbolProvider` through VS Code's actual registered feature commands. Cross-file definition results and nested Outline symbols are verified using a protocol fixture; no second semantic parser is introduced.
- **Group 8:** Route VS Code document formatting and format-on-save to the native LSP formatter. Contribute an opt-out guard for trusted `.gnr` resources; select `gungnir.vscode-gungnir` as the default formatter for Gungnir without enabling global format-on-save. Native formatter uses fixed four-space indentation.
- **Group 9:** Invoke native CLI `new` and `make:*` commands with trusted-workspace checks, strict argument arrays and validation, project-profile-aware support, no-overwrite verification, cancellable bounded execution, and open generated `.gnr` files.
- **Group 10:** Workspace-scoped VS Code TaskProvider and commands for `build`, `run`, `dev`, and `--release` variants. Tasks use `ProcessExecution`, parse native diagnostic output with problem matchers, maintain task lifecycle and allow explicit termination. Never start processes automatically.
- **Group 11:** The upstream Gungnir native language server adds compiler-backed references, rename and signature help. The existing VS Code language client automatically registers the providers from LSP capability negotiation; extension-host tests verify cross-file edits and call signatures.
- **Groups 12–14:** Performance, multi-root, regression and manual release.

Source of truth for language semantics is the Gungnir C++ compiler. The extension must not
maintain an independent Gungnir parser or spawn a compiler for every completion request.

Security: respect VS Code Workspace Trust before executing project commands or processes.
Do not auto-run `gungnir dev`, download an SDK, or publish extensions on activation.
