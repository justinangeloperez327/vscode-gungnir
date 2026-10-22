# Gungnir for Visual Studio Code

[![CI](https://github.com/justinangeloperez327/vscode-gungnir/actions/workflows/ci.yml/badge.svg)](https://github.com/justinangeloperez327/vscode-gungnir/actions/workflows/ci.yml)

The VS Code extension for the [Gungnir](https://github.com/justinangeloperez327/gungnir)
expressive C++23 web framework and `.gnr` language.

> **Group 7 / developer preview:** Syntax highlighting, 26 snippets, SDK detection,
> diagnostics, and native IntelliSense (hover, Go to Definition, completion,
> Outline symbols) are available through `gungnir lsp`. Multi-root support,
> formatting refinement and framework commands remain on the roadmap.

## Requirements

- Node.js **24** for local development, tests and CI.
- A desktop installation of Visual Studio Code (VS Code ^1.100.0).
- A Gungnir SDK is **optional** for editing `.gnr` files, but recommended for
  Group 4 version/installation checks; `gungnir lsp` is used for language intelligence when installed.

## Get started

```sh
npm ci
npm run lint
npm run build
npm run test:unit
```

Open the folder in Visual Studio Code, press **F5** and run
**Gungnir: Show Extension Status** from the Command Palette.

## Syntax highlighting

Open any `.gnr` file. VS Code will select **Gungnir** as its language, highlighting
framework declarations, imports, variables, flow control, model properties, routes,
functions, comments, quoted/raw strings, numbers and operators.

Choose **Gungnir** manually through the language selector for unsaved files.
Highlighting uses the TextMate grammar in `syntaxes/gungnir.tmLanguage.json`.
TextMate highlighting is lexical; it does not provide type checking or IntelliSense.
Semantic features use the native Gungnir language server when installed.

## Snippets and editor assistance

Type `gnr-` inside a Gungnir file to discover 26 editor snippets. Start with
`gnr-controller`, `gnr-model`, `gnr-migration`, `gnr-middleware`, 
`gnr-route-get` or `gnr-validate`, then use **Tab** to fill in placeholders.
Snippets also cover imports, typed functions, events, listeners, policies,
notifications, mail, conditionals and region markers.

Autocomplete snippets are *templates*, not CLI generators. Referenced modules
and application types may need to be created in the project.

Editor configuration supports brace, list and call indentation, folding with
`#region`/`#endregion` or `// #region`/`// #endregion` markers,
doc-comment continuation and token-aware quote closing. These lexical rules
do not provide semantic parsing or formatting.

## Detecting the Gungnir CLI and SDK

Open a trusted VS Code workspace containing a `.gnr` file. The status-bar item
reports the CLI/SDK state. Click it or run **Gungnir: Check SDK Installation**
from the Command Palette to view paths, versions, and setup warnings in the
**Gungnir** output channel. **Gungnir: Refresh Toolchain Detection** rechecks
the installation on demand.

Discovery precedence:

1. `gungnir.executablePath`: absolute path to the executable (strict override)
2. `gungnir.sdkRoot`: absolute directory containing `bin/gungnir` (strict override)
3. `GUNGNIR_CMAKE_PREFIX` environment variable, when absolute
4. `PATH` entries (absolute directories only)

Use **Gungnir: Select CLI Executable** to configure an explicit path through a
file picker, or adjust these settings directly. The installer normally updates
your user `PATH`; restart VS Code after installing Gungnir.

The extension checks `gungnir --version`, adjacent `gungnirc --version`, and
the installed SDK headers/CMake files. A detected CLI without its full SDK is
reported as **partial** rather than ready. The Gungnir SDK provides
`share/gungnir/sdk.txt` to identify the core/application profile where available.

Gungnir version probes use a short timeout and `shell: false`. They are disabled
in restricted/untrusted workspaces; no SDK installation or download is attempted.
Set `gungnir.toolchain.autoDetect` to false to run checks only when explicitly
requested. See the
[official SDK guide](https://github.com/justinangeloperez327/gungnir/blob/main/docs/sdk-packages.md).

## Native language server

The extension connects to the installed `gungnir lsp` over standard input/output
using the VS Code Language Client (LSP/JSON-RPC). Open a `.gnr` file inside a
trusted local Gungnir workspace. The extension checks the CLI, starts one native
server for that workspace and opens only its `.gnr` files to that server.

Command Palette actions:

- **Gungnir: Start / Restart Language Server** — explicitly connect or recover
  after a crash/configuration change.
- **Gungnir: Stop Language Server** — stop it until manually restarted.
- **Gungnir: Language Server Status** — inspect connection state.
- **Gungnir: Check SDK Installation** — inspect paths and installation problems.

You can disable automatic connection with `gungnir.languageServer.enabled=false`.
In a restricted/untrusted workspace, no `gungnir` binary is spawned. The server
requires a local file-backed workspace and a CLI identifying as Gungnir; a missing
full SDK does not block language intelligence if the CLI is otherwise valid.
A `Gungnir Language Server` output channel shows startup failures. Server
stderr is never written to the LSP stdout stream.

**Current limitation:** one active workspace root. Multi-root/per-folder clients,
crash backoff and deeper semantic behavior are subsequent groups. Opening a `.gnr` file activates the extension; an unsaved
document alone does not spawn a server.

## Gungnir IntelliSense

When `gungnir lsp` is running in a trusted local workspace, VS Code registers
the capabilities advertised by the native server:

- **Hover:** View compiler-derived symbol type/signature information by hovering.
- **Go to Definition:** Press **F12** or Ctrl-click a symbol to navigate to its
  declaration; the native server supports imported symbols across `.gnr` files.
- **Completion:** Press **Ctrl+Space** to request names and symbols from the native
  server. The existing static `gnr-` snippets remain available independently.
- **Document symbols:** Use **Outline** or **Go to Symbol in Editor** to navigate
  controller/model declarations and their members.

Responses are provided by Gungnir's C++ language server, not duplicate
TypeScript language analysis. Availability and accuracy depend on the installed
Gungnir SDK version, project configuration and source validity. The native server
advertises these capabilities without custom extension-side provider registration.

VS Code extension-host tests exercise all four features over real JSON-RPC
stdio transport against a protocol-compatible fixture, including cross-file
definitions and isolation from plaintext documents. Testing with the
installed Windows SDK is still a separate release-validation step.

## Compiler diagnostics and synchronization

When a native Gungnir SDK is installed, the language client forwards normal
`textDocument/didOpen`, incremental `didChange`, `didSave` and `didClose`
notifications for `.gnr` files within the selected trusted workspace.

The native `gungnir lsp` server publishes errors and warnings to VS Code's
**Problems** panel and editor squiggles. The extension filters versioned
`textDocument/publishDiagnostics` notifications at the LSP stdio frame boundary:
results older than the editor's current version cannot replace newer diagnostics.
Empty diagnostic arrays clear resolved problems, and closed documents cannot
receive new nonempty errors. Server notifications without a version still follow
standard language-client behavior; a legacy unversioned server cannot provide
strict freshness guarantees. No additional compiler process is started per edit.

Regression tests cover fragmented UTF-8 protocol packets, out-of-order versions,
editing and clearing errors, and a simulated stale publish after a correction.

## Integration tests

```sh
npm run build
npm run test:integration
```

On a headless Linux runner, use `xvfb-run -a npm run test:integration`.
The test runner downloads a VS Code build into `.vscode-test` as needed.

## VSIX package

```sh
npm run package
```

This builds `vscode-gungnir.vsix` for **manual** installation/testing. CI may upload a VSIX
artifact, but will **not** publish to the VS Code Marketplace or deploy it anywhere.

## Architecture & roadmap

- [Architecture](docs/architecture.md)
- [14-group implementation roadmap](docs/roadmap.md)
- [Contributing](CONTRIBUTING.md)

The language server will reuse Gungnir's native `gungnir lsp` command, avoiding a
second language implementation in TypeScript.

## Local tests

`npm run test:unit` checks syntax highlighting rules, snippet definitions, editor
patterns, injected cross-platform SDK detection cases and LSP lifecycle policies. `npm run test:integration` checks `.gnr` registration and the snippet
contribution in an actual VS Code extension host.

## License

MIT. See [LICENSE](LICENSE).
