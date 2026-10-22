# Gungnir for Visual Studio Code

[![CI](https://github.com/justinangeloperez327/vscode-gungnir/actions/workflows/ci.yml/badge.svg)](https://github.com/justinangeloperez327/vscode-gungnir/actions/workflows/ci.yml)

The VS Code extension for the [Gungnir](https://github.com/justinangeloperez327/gungnir)
expressive C++23 web framework and `.gnr` language.

> **Group 3 / developer preview:** `.gnr` files receive Gungnir syntax highlighting,
> editor indentation/folding rules, documentation-comment continuation, 26 editor
> snippets and the **Gungnir: Show Extension Status** command. Native LSP
> integration, diagnostics and build/generator commands are **not yet implemented**.

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

`npm run test:unit` checks syntax highlighting rules, snippet definitions and editor
patterns. `npm run test:integration` checks `.gnr` registration and the snippet
contribution in an actual VS Code extension host.

## License

MIT. See [LICENSE](LICENSE).
