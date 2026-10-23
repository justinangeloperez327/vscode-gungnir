# Gungnir for Visual Studio Code

[![CI](https://github.com/justinangeloperez327/vscode-gungnir/actions/workflows/ci.yml/badge.svg)](https://github.com/justinangeloperez327/vscode-gungnir/actions/workflows/ci.yml)

The VS Code extension for the [Gungnir](https://github.com/justinangeloperez327/gungnir)
expressive C++23 web framework and `.gnr` language.

> **Group 12 / developer preview:** Multi-root Gungnir workspaces, native
> IntelliSense, diagnostics, generators, formatting, and build/run/dev tasks.
> Native advanced language features require a compatible installed SDK.

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

## Project and declaration generators

Run **Gungnir: New Project** to choose a name and an existing parent directory.
The extension calls `gungnir new <name> <absolute-destination>`, refuses to
reuse even an empty destination folder, and offers to open the new project.
It does not change workspaces without your choice.

In a trusted local Gungnir workspace, run **Gungnir: Generate Declaration** and
select a generator, or use one of the dedicated **Gungnir: Generate Model /
Controller / Middleware / Migration / Request / Job / Event / Mail / Listener /
Policy / Notification** commands.

- Models, controllers, middleware and migrations support both legacy and
  structured projects. Other generators require `profile=structured` in
  `.gungnir-project`.
- Listeners require an event reference, such as
  `app.events.UserCreated::UserCreated`; policies and notifications require
  a model reference, such as `app.models.User::User`. Gungnir verifies that
  the referenced declaration actually exists.
- Names must start with an ASCII letter and contain only letters, numbers,
  underscore or hyphen, up to 64 characters. Relative paths and arbitrary
  shell arguments are not permitted.
- Generated files are **never overwritten**: the extension checks the expected
  destination and the native CLI checks for existing files too.
- The native command runs with `shell: false`, a bounded execution time and
  cancellable progress. Generated `.gnr` files open in VS Code on success.
- Generation needs a verified Gungnir executable, a trusted workspace and
  a valid project marker. Failure details appear in the Gungnir output channel.
  Generator commands never run automatically when opening a project.

The extension uses native Gungnir templates rather than maintaining a second
set of generated language files. For details, see the
[CLI code generation guide](https://github.com/justinangeloperez327/gungnir/blob/main/docs/cli-codegen.md).

## Build, run and development tasks

In a trusted local Gungnir project, use the Command Palette:

- **Gungnir: Build Project** — `gungnir build`
- **Gungnir: Run Project** — `gungnir run`
- **Gungnir: Start Dev Server** — `gungnir dev`; the native watcher rebuilds and
  restarts the application after supported source changes
- **Gungnir: Stop Running Task** — terminate one running Gungnir task

Use **Terminal → Run Task** to access **Gungnir: Build**, **Build (Release)**,
**Run**, **Run (Release)** and **Dev** tasks, with a task for each detected project
folder. The task provider requires an installed Gungnir CLI, Workspace Trust and a
local `.gungnir-project` marker. All tasks use native VS Code
`ProcessExecution` with argument arrays, never shell interpolated commands.

Output appears in VS Code's integrated task terminal. Compiler and structured
validation errors that include a source path, line and column are linked through
Gungnir problem matchers in the **Problems** panel. Native C++ toolchain output
continues to appear in the terminal, and additional compiler diagnostics can be
provided by the installed toolchain. Exit codes are preserved by VS Code tasks.

**Stopping and safety:** The Stop command only terminates Gungnir task
executions. VS Code also supports **Terminal → Run Task → Terminate Task**.
The extension refuses duplicate `dev` watchers in the same workspace.
No build, application or watcher starts automatically at activation.
Terminating a process task is platform-dependent; the native Gungnir watcher
owns its application subprocess, and shutdown behavior should be validated on
Windows with the real SDK.

You can define a task in `.vscode/tasks.json` to bind a shortcut or make it
part of your existing workflow:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Build Gungnir Release",
      "type": "gungnir",
      "operation": "build",
      "release": true,
      "group": "build"
    }
  ]
}
```

The extension is the task provider. You do not need to hard-code executable
paths in `tasks.json`; configure `gungnir.executablePath` or
`gungnir.sdkRoot` in VS Code settings.

## Multi-root workspaces and recovery

Group 12 runs one independent `gungnir lsp` process for each trusted local
workspace folder containing an open `.gnr` document. Opening or switching
between documents no longer evicts another project's language server. Closing
the last document or removing a workspace folder releases that session.

If an LSP process exits unexpectedly, the extension retries that folder
after delays of **1, 2 and 4 seconds**. Repeated fast crashes exhaust the retry
budget to avoid a restart loop. After 30 seconds of healthy operation, its
failure budget resets. **Gungnir: Start / Restart Language Server** retries
all desired workspaces on demand. Manual Stop, untrusted workspaces and disabled
language server settings cancel pending retries.

Use **Gungnir: Language Server Status** to inspect per-project states, and
**Gungnir: Stop Language Server** to stop all active sessions. Documents and
diagnostics remain scoped to their own project. No build or dev tasks run
automatically as part of language server recovery.

## Advanced native IntelliSense

With a Gungnir SDK version that advertises the new LSP capabilities, VS Code
also supports **Find All References** (`Shift+F12`), **Rename Symbol** (`F2`),
and **Signature Help** (`Ctrl+Shift+Space`). Reference discovery and renaming
are based on compiler-resolved symbol identity across imported modules.
Rename returns a previewable workspace edit rather than silently writing files.
Signature Help uses resolved argument types and names.

These features require an updated `gungnir lsp` executable. Older SDKs do not
advertise them, and the extension intentionally does not guess references using
text matches or perform unsafe renames. The existing official VS Code Language
Client automatically registers features from the server capabilities.

## Native formatting

The extension registers itself as the default document formatter for Gungnir
(`.gnr`) files only. With the native `gungnir lsp` process running:

- Use **Format Document** (`Shift+Alt+F` on Windows) to format your source.
- To opt in to format-on-save, add these language-scoped VS Code settings:

```json
{
  "[gungnir]": {
    "editor.defaultFormatter": "gungnir.vscode-gungnir",
    "editor.formatOnSave": true
  }
}
```

- Set `gungnir.formatting.enabled` to `false` to disable native document
  formatting without disabling diagnostics or IntelliSense.

Formatting is delegated to Gungnir's C++ Formatter via LSP; the extension does
not implement a second formatter or transform source locally. Its current
indentation style is **four spaces**, and the native formatter does not yet
honor VS Code tab-size or insert-spaces formatting preferences. Certain
compatibility/preprocessor constructs deliberately result in a server-side
formatting error rather than a destructive rewrite.

Format-on-save is **opt in**. The extension does not force formatting globally
and does not register a second save hook. VS Code's formatting commands are
only available for trusted local `.gnr` files within the active workspace.

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
