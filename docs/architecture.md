# Architecture — Group 1

The extension runs in VS Code's extension host. TypeScript is bundled with esbuild to
`dist/extension.js`. Gungnir's C++ CLI and native `gungnir lsp` server are not bundled.

- **Group 1:** Activation, status command, tests, CI and VSIX packaging.
- **Group 2:** `.gnr` registration, TextMate grammar and basic editor configuration.
- **Group 3:** Editor-behavior refinements, indentation/folding tests and snippets.
- **Group 4–5:** Find `gungnir`, check versions and connect to `gungnir lsp` over stdio.
- **Group 6–8:** Diagnostics, semantic navigation and formatting.
- **Group 9–10:** CLI scaffolding, build, run and dev tasks.
- **Group 11–14:** Advanced language intelligence, performance, verification and release.

Source of truth for language semantics is the Gungnir C++ compiler. The extension must not
maintain an independent Gungnir parser or spawn a compiler for every completion request.

Security: respect VS Code Workspace Trust before executing project commands or processes.
Do not auto-run `gungnir dev`, download an SDK, or publish extensions on activation.
