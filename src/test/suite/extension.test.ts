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
      await vscode.workspace.openTextDocument(vscode.Uri.joinPath(project.uri, 'app/controllers/HomeController.gnr'));
      const status = await vscode.commands.executeCommand<{ state: string; detail: string }>(
        'gungnir.startLanguageServer',
      );
      assert.equal(status.state, 'running', status.detail);
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
