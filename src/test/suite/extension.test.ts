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
});
