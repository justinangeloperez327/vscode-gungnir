# Gungnir for Visual Studio Code

[![CI](https://github.com/justinangeloperez327/vscode-gungnir/actions/workflows/ci.yml/badge.svg)](https://github.com/justinangeloperez327/vscode-gungnir/actions/workflows/ci.yml)

The VS Code extension for the [Gungnir](https://github.com/justinangeloperez327/gungnir)
expressive C++23 web framework and `.gnr` language.

> **Group 2 / developer preview:** The extension registers `.gnr` files as Gungnir,
> provides TextMate syntax highlighting, basic editor configuration and the
> **Gungnir: Show Extension Status** command. Native LSP integration and
> build/generator commands are **not yet implemented**.

## Requirements

- Node.js **24** for local development, tests and CI.
- A desktop installation of Visual Studio Code (VS Code ^1.100.0).
- Gungnir SDK / `gungnir lsp` will become a prerequisite for language intelligence
  from Group 5 onward; it is **not** required for Group 1.

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

`npm run test:unit` includes syntax grammar structure and token-rule regression
checks. `npm run test:integration` confirms VS Code recognizes the `.gnr` language
for files in a sample project.

## License

MIT. See [LICENSE](LICENSE).
