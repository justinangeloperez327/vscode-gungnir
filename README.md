# Gungnir for Visual Studio Code

[![CI](https://github.com/justinangeloperez327/vscode-gungnir/actions/workflows/ci.yml/badge.svg)](https://github.com/justinangeloperez327/vscode-gungnir/actions/workflows/ci.yml)

The VS Code extension for the [Gungnir](https://github.com/justinangeloperez327/gungnir)
expressive C++23 web framework and `.gnr` language.

> **Group 1 / developer preview:** The extension is a runnable foundation. It currently
> registers **Gungnir: Show Extension Status**. Syntax highlighting, language-server
> integration and build/generator commands are planned, **not implemented** in Group 1.

## Requirements

- Node.js **24** for local development, tests and CI.
- A desktop installation of Visual Studio Code (VS Code ^1.100.0).
- Gungnir SDK / `gungnir lsp` will become a prerequisite for language intelligence
  from Group 5 onward; it is **not** required for Group 1.

## Get started

```sh
npm install
npm run lint
npm run build
npm run test:unit
```

Open the folder in Visual Studio Code, press **F5** and run
**Gungnir: Show Extension Status** from the Command Palette.

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

## License

MIT. See [LICENSE](LICENSE).
