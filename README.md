# Gungnir for Visual Studio Code

[![CI](https://github.com/justinangeloperez327/vscode-gungnir/actions/workflows/ci.yml/badge.svg)](https://github.com/justinangeloperez327/vscode-gungnir/actions/workflows/ci.yml)

The VS Code extension for the [Gungnir](https://github.com/justinangeloperez327/gungnir)
expressive C++23 web framework and `.gnr` language.

> **Group 4 / developer preview:** `.gnr` syntax highlighting, editor assistance, 26
> snippets, and trusted-workspace Gungnir CLI/SDK detection are available. Native
> LSP integration, diagnostics and build/generator commands are **not yet implemented**.

## Requirements

- Node.js **24** for local development, tests and CI.
- A desktop installation of Visual Studio Code (VS Code ^1.100.0).
- A Gungnir SDK is **optional** for editing `.gnr` files, but recommended for
  Group 4 version/installation checks; `gungnir lsp` will be used from Group 5.

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
Those features will use the native Gungnir language server in subsequent groups.

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

Open a trusted VS Code workspace containing a \`.gnr\` file. The status-bar item
reports the CLI/SDK state. Click it or run **Gungnir: Check SDK Installation**
from the Command Palette to view paths, versions, and setup warnings in the
**Gungnir** output channel. **Gungnir: Refresh Toolchain Detection** rechecks
the installation on demand.

Discovery precedence:

1. \`gungnir.executablePath\`: absolute path to the executable (strict override)
2. \`gungnir.sdkRoot\`: absolute directory containing \`bin/gungnir\` (strict override)
3. \`GUNGNIR_CMAKE_PREFIX\` environment variable, when absolute
4. \`PATH\` entries (absolute directories only)

Use **Gungnir: Select CLI Executable** to configure an explicit path through a
file picker, or adjust these settings directly. The installer normally updates
your user \`PATH\`; restart VS Code after installing Gungnir.

The extension checks \`gungnir --version\`, adjacent \`gungnirc --version\`, and
the installed SDK headers/CMake files. A detected CLI without its full SDK is
reported as **partial** rather than ready. The Gungnir SDK provides
\`share/gungnir/sdk.txt\` to identify the core/application profile where available.

Gungnir version probes use a short timeout and \`shell: false\`. They are disabled
in restricted/untrusted workspaces; no SDK installation or download is attempted.
Set \`gungnir.toolchain.autoDetect\` to false to run checks only when explicitly
requested. See the
[official SDK guide](https://github.com/justinangeloperez327/gungnir/blob/main/docs/sdk-packages.md).

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
patterns and injected cross-platform SDK detection cases. `npm run test:integration` checks `.gnr` registration and the snippet
contribution in an actual VS Code extension host.

## License

MIT. See [LICENSE](LICENSE).
