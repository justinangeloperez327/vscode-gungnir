import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';

suite('Gungnir extension', () => {
  test('activates and exposes the status command', async () => {
    const extension = vscode.extensions.getExtension('gungnir.vscode-gungnir');
    assert.ok(extension, 'Expected the Gungnir extension to be installed in the test host');
    await extension.activate();

    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('gungnir.showStatus'));

    const status = await vscode.commands.executeCommand<string>('gungnir.showStatus');
    assert.equal(status, 'Gungnir VS Code Extension v0.1.0 — Group 1 foundation ready');
  });
  test('registers Gungnir for .gnr source files', async () => {
    const languages = await vscode.languages.getLanguages();
    assert.ok(languages.includes('gungnir'), 'Gungnir must appear in the language selector');
    const project = vscode.workspace.workspaceFolders?.[0];
    assert.ok(project, 'Integration tests must open the sample-project workspace');
    for (const relative of [
      'app/controllers/HomeController.gnr',
      'app/models/User.gnr',
      'routes/web.gnr',
    ]) {
      const opened: vscode.TextDocument = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(project.uri, relative));
      assert.equal(opened.languageId, 'gungnir', `Unexpected language for ${relative}`);
    }
  });

  test('does not hijack other file types', async () => {
    const document = await vscode.workspace.openTextDocument({ language: 'plaintext', content: 'model User {}' });
    assert.equal(document.languageId, 'plaintext');
  });

  test('contributes Gungnir snippets and region markers', async () => {
    const extension = vscode.extensions.getExtension('gungnir.vscode-gungnir');
    assert.ok(extension);
    const manifest = extension.packageJSON as {
      contributes: {
        snippets: { language: string; path: string }[];
        languages: { id: string; configuration: string }[];
      };
    };
    assert.ok(
      manifest.contributes.snippets.some(
        (snippet) => snippet.language === 'gungnir' && snippet.path === './snippets/gungnir.code-snippets',
      ),
    );
    assert.ok(
      manifest.contributes.languages.some(
        (language) => language.id === 'gungnir' && language.configuration === './language-configuration.json',
      ),
    );
    const document = await vscode.workspace.openTextDocument({
      language: 'gungnir',
      content: '// #region Routes\nRoute::get("/", HomeController::index);\n// #endregion\n',
    });
    assert.equal(document.languageId, 'gungnir');
  });
  test('exposes SDK discovery commands and never throws when checking a missing SDK', async () => {
    const commands = await vscode.commands.getCommands(true);
    for (const id of ['gungnir.checkInstallation', 'gungnir.refreshToolchain', 'gungnir.selectExecutable']) {
      assert.ok(commands.includes(id), 'Missing command: ' + id);
    }
    const result = await vscode.commands.executeCommand<{
      state: string;
      diagnostics: string[];
      message: string;
    }>('gungnir.checkInstallation');
    assert.ok(result);
    assert.ok(['ready', 'partial', 'missing', 'invalid', 'untrusted'].includes(result.state));
    assert.ok(Array.isArray(result.diagnostics));
    assert.equal(typeof result.message, 'string');
  });

  test('contributes SDK detection settings', () => {
    const extension = vscode.extensions.getExtension('gungnir.vscode-gungnir');
    assert.ok(extension);
    const config = extension.packageJSON.contributes.configuration.properties as Record<
      string, { type: string; default: unknown }
    >;
    assert.equal(config['gungnir.executablePath'].type, 'string');
    assert.equal(config['gungnir.sdkRoot'].type, 'string');
    assert.equal(config['gungnir.toolchain.autoDetect'].default, true);
    assert.equal(config['gungnir.toolchain.timeoutMs'].default, 3000);
  });
  test('exposes language server controls without requiring a Gungnir installation', async () => {
    const commands = await vscode.commands.getCommands(true);
    for (const id of [
      'gungnir.startLanguageServer',
      'gungnir.stopLanguageServer',
      'gungnir.languageServerStatus',
    ]) {
      assert.ok(commands.includes(id), id);
    }
    const stopped = await vscode.commands.executeCommand<{ state: string }>('gungnir.stopLanguageServer');
    assert.equal(stopped.state, 'stopped');
    const snapshot = await vscode.commands.executeCommand<{ state: string; detail: string }>(
      'gungnir.languageServerStatus',
    );
    assert.equal(snapshot.state, 'stopped');
    assert.equal(typeof snapshot.detail, 'string');
  });

  test('connects to an LSP process over stdio (Linux test fixture)', async () => {
    if (process.platform !== 'linux' || !vscode.workspace.isTrusted) return;
    const project = vscode.workspace.workspaceFolders?.[0];
    assert.ok(project);
    const manifest = vscode.extensions.getExtension('gungnir.vscode-gungnir');
    assert.ok(manifest);
    const fake = vscode.Uri.joinPath(manifest.extensionUri, 'test-fixtures', 'mock-gungnir.cjs');
    const settings = vscode.workspace.getConfiguration('gungnir');
    const original = settings.inspect<string>('executablePath')?.globalValue;
    const originalEnabled = settings.inspect<boolean>('languageServer.enabled')?.globalValue;
    try {
      await settings.update('languageServer.enabled', true, vscode.ConfigurationTarget.Global);
      await settings.update('executablePath', fake.fsPath, vscode.ConfigurationTarget.Global);
      const document: vscode.TextDocument = await vscode.workspace.openTextDocument(
        vscode.Uri.joinPath(project.uri, 'app/controllers/HomeController.gnr'),
      );
      let status = await vscode.commands.executeCommand<{ state: string; detail: string }>(
        'gungnir.startLanguageServer',
      );
      const startupDeadline = Date.now() + 7000;
      while (status.state !== 'running' && Date.now() < startupDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 75));
        status = await vscode.commands.executeCommand<{ state: string; detail: string }>(
          'gungnir.languageServerStatus',
        );
      }
      assert.equal(status.state, 'running', status.detail);
      // Simulate editing a Gungnir document. The mock server responds only to
      // didOpen/didChange/didSave, proving the standard LSP synchronization path.
      const waitFor = async (check: () => boolean, label: string): Promise<void> => {
        const deadline = Date.now() + 7000;
        while (!check() && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 40));
        }
        assert.ok(check(), label + ' | document version=' + document.version
          + ' | diagnostics=' + JSON.stringify(vscode.languages.getDiagnostics(document.uri)
            .map((d) => ({ message: d.message, code: d.code, source: d.source })))
          + ' | document end=' + JSON.stringify(document.getText().slice(-120)));
      };
      const mark = new vscode.WorkspaceEdit();
      mark.insert(document.uri, document.positionAt(document.getText().length), '\n// BROKEN\n');
      assert.equal(await vscode.workspace.applyEdit(mark), true);
      await waitFor(
        () => vscode.languages.getDiagnostics(document.uri).some((d) => d.code === 'GNR-GROUP6'),
        'Expected Gungnir compiler diagnostics from didChange',
      );
      const repair = new vscode.WorkspaceEdit();
      const currentText = document.getText();
      const at = currentText.indexOf('BROKEN');
      assert.ok(at >= 0);
      repair.replace(
        document.uri, new vscode.Range(document.positionAt(at), document.positionAt(at + 6)),
        'FIXED',
      );
      assert.equal(await vscode.workspace.applyEdit(repair), true);
      await waitFor(
        () => vscode.languages.getDiagnostics(document.uri).length === 0,
        'Expected corrected document to clear diagnostics',
      );
      // The fixture publishes an obsolete version after the new clear. It must
      // not revive a stale error in the Problems panel.
      await new Promise((resolve) => setTimeout(resolve, 220));
      assert.deepEqual(vscode.languages.getDiagnostics(document.uri), [],
        'A stale diagnostic must be dropped at the LSP transport boundary');

      // The language-client must register actual semantic providers, not just
      // advertise capabilities. VS Code built-in commands traverse the LSP.
      const controllerOffset = document.getText().indexOf('HomeController');
      assert.ok(controllerOffset >= 0);
      const controllerPos = document.positionAt(controllerOffset + 2);
      const hover = await vscode.commands.executeCommand<vscode.Hover[]>(
        'vscode.executeHoverProvider', document.uri, controllerPos,
      );
      assert.ok(hover?.length, 'Expected a native LSP hover provider');
      assert.ok(hover[0].contents.some((entry) => (
        typeof entry === 'string' ? entry.includes('HomeController')
          : entry.value.includes('HomeController')
      )), 'Hover should retain the native server detail');

      const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
        'vscode.executeCompletionItemProvider', document.uri, controllerPos,
      );
      const named = completions?.items.find((item) => item.label === 'HomeController');
      assert.ok(named, 'Expected a native LSP completion item');
      assert.equal(named.kind, vscode.CompletionItemKind.Class);

      const documentSymbols = await vscode.commands.executeCommand<
        Array<vscode.DocumentSymbol | vscode.SymbolInformation>
      >('vscode.executeDocumentSymbolProvider', document.uri);
      const controllerSymbol = documentSymbols?.find((item) => item.name === 'HomeController');
      assert.ok(controllerSymbol, 'Expected controller in Outline');
      assert.ok('children' in controllerSymbol
        && Array.isArray(controllerSymbol.children),
      'Expected hierarchical Outline result: ' + JSON.stringify(controllerSymbol));
      assert.ok(controllerSymbol.children.some((item) => item.name === 'index'),
        'Expected controller action under its parent symbol');

      const routeDoc: vscode.TextDocument = await vscode.workspace.openTextDocument(
        vscode.Uri.joinPath(project.uri, 'routes/web.gnr'),
      );
      const routeOffset = routeDoc.getText().indexOf('HomeController');
      assert.ok(routeOffset >= 0);
      const routePos = routeDoc.positionAt(routeOffset + 2);
      const locations = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeDefinitionProvider', routeDoc.uri, routePos,
      );
      assert.ok(locations?.length, 'Expected cross-file Go to Definition location');
      assert.equal(locations[0].uri.toString(), document.uri.toString());
      assert.equal(document.getText(locations[0].range), 'HomeController');

      const missing = await vscode.commands.executeCommand<vscode.Hover[]>(
        'vscode.executeHoverProvider', routeDoc.uri, new vscode.Position(0, 0),
      );
      assert.ok(!missing?.length, 'Unknown symbols should not receive fabricated hover');

      // Gungnir providers are restricted to file-backed .gnr documents, not
      // unsaved plaintext buffers, markdown, or unrelated file types.
      const plain = await vscode.workspace.openTextDocument({
        language: 'plaintext', content: 'HomeController',
      });
      const unrelated = await vscode.commands.executeCommand<vscode.Hover[]>(
        'vscode.executeHoverProvider', plain.uri, new vscode.Position(0, 2),
      );
      assert.ok(!unrelated?.length, 'Must not attach Gungnir hover to plaintext');

      const stopped = await vscode.commands.executeCommand<{ state: string }>(
        'gungnir.stopLanguageServer',
      );
      assert.equal(stopped.state, 'stopped');
    } finally {
      await settings.update('executablePath', original, vscode.ConfigurationTarget.Global);
      await settings.update('languageServer.enabled', originalEnabled, vscode.ConfigurationTarget.Global);
    }
  });
});
