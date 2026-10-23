# Gungnir VS Code Extension 0.1.0 — Release Checklist

**Status:** preview release candidate; **not automatically published**.

## Automated release gate

On every push to `main`, [GitHub Actions](https://github.com/justinangeloperez327/vscode-gungnir/actions/workflows/ci.yml):

1. Runs Node.js 24 lint, build and unit tests on Windows 2025, Ubuntu 24.04, and macOS 15.
2. Runs the VS Code extension-host tests on all three platforms.
3. Downloads the **official Gungnir 1.0.2 Windows core SDK**, verifies its release checksum, and tests the actual `gungnir.exe` and `gungnirc.exe`: versions, project generation, model generation, LSP `initialize`, `didOpen`, `documentSymbol`, `shutdown`, `exit`.
4. Packages **vscode-gungnir.vsix** after those jobs succeed.
5. Verifies the ZIP structure, manifest, required assets, banned development files and missing runtime entry points using `scripts/verify-vsix.py`.
6. Uploads the VSIX and `vscode-gungnir.vsix.sha256` as a downloadable artifact.

No Marketplace authentication credentials are stored or required in CI, and no Marketplace publication occurs.

## Native Windows acceptance checklist (manual gate)

An SDK **containing native Group 11 LSP features** must be installed before claiming full Windows functionality. The published Windows SDK **v1.0.2 is older** than those features.

- [ ] Install the latest suitable Gungnir SDK on Windows and verify the `gungnir.exe` and `gungnirc.exe` versions.
- [ ] Launch the extension in trusted VS Code 1.100+ on Windows.
- [ ] Test hover, definition, completion, Outline symbols and versioned diagnostics in a real `.gnr` project.
- [ ] Test cross-file References, Rename preview and Signature Help with a newer SDK that advertises them.
- [ ] Test native formatting and optional format-on-save.
- [ ] Test generators, including existing-file protection and bad references.
- [ ] Test build, release build, run, dev watcher and stopping subprocesses on Windows.
- [ ] Open two independent Gungnir workspaces, induce a crash, confirm bounded recovery and cleanup.

Do not mark these steps complete merely because a protocol fixture or Windows 1.0.2 smoke test passed.

## Manual publication

1. Confirm the Marketplace publisher **`gungnir`** exists and is controlled by the releasing account. This repository cannot verify that credential or claim publisher ownership.
2. Review `README.md`, `CHANGELOG.md`, `LICENSE`, `package.json` and the verified VSIX contents. Confirm screenshots/icons, listing text and preview designation.
3. Download the `gungnir-vsix` artifact from a **successful** CI run. Verify its digest against `vscode-gungnir.vsix.sha256`.
4. Install it manually in VS Code: **Extensions → ⋯ → Install from VSIX...**. Confirm the extension identifier is `gungnir.vscode-gungnir` and version `0.1.0`.
5. Validate `.gnr` and `.spear` separately, including Spear HTML/directive highlighting and snippets without triggering native `.gnr` LSP features. Complete the native Windows acceptance checklist and explicitly approve public publication.
6. Authenticate locally using a securely stored Azure DevOps Marketplace personal access token via the VS Code Extension Manager (`vsce`) instructions. **Do not place tokens in source control or Actions.**
7. Publish the verified VSIX manually under the verified publisher, as a preview if appropriate. Validate the live Marketplace listing and installation before tagging a release. A GitHub release may be created manually after sign-off.

To package and audit locally:

```sh
npm ci
npm run lint
npm run build
npm run test:unit
npm run package
python3 scripts/verify-vsix.py vscode-gungnir.vsix
```

**Do not automate Marketplace publication as part of this project without a separate explicit decision.**
