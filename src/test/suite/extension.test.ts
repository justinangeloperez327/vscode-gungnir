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
});
