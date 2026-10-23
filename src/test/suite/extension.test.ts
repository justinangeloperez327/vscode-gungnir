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

  test('registers Gungnir as default formatter, without enabling format-on-save globally', () => {
    const extension = vscode.extensions.getExtension('gungnir.vscode-gungnir');
    assert.ok(extension);
    const defaults = extension.packageJSON.contributes.configurationDefaults;
    assert.equal(defaults['[gungnir]']['editor.defaultFormatter'], 'gungnir.vscode-gungnir');
    assert.equal(defaults['[gungnir]']['editor.formatOnSave'], undefined);
    const enabled = extension.packageJSON.contributes.configuration.properties[
      'gungnir.formatting.enabled'
    ];
    assert.equal(enabled.default, true);
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
    if (process.platform === 'win32' || !vscode.workspace.isTrusted) return;
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


      const references = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeReferenceProvider', routeDoc.uri, routePos,
      );
      assert.ok(references?.length >= 2, 'Native LSP References must include the declaration and its use');
      assert.ok(references.some((item) => item.uri.toString() === document.uri.toString()));
      assert.ok(references.some((item) => item.uri.toString() === routeDoc.uri.toString()));

      const preparatory = await vscode.commands.executeCommand<
        vscode.Range | { range: vscode.Range; placeholder: string }
      >('vscode.prepareRename', routeDoc.uri, routePos);
      assert.ok(preparatory, 'Native LSP Prepare Rename must resolve the identifier');
      const renameRange = 'range' in preparatory ? preparatory.range : preparatory;
      assert.equal(routeDoc.getText(renameRange), 'HomeController');

      const rename = await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
        'vscode.executeDocumentRenameProvider', routeDoc.uri, routePos, 'BetterController',
      );
      assert.ok(rename, 'Native LSP Rename must provide a multi-file workspace edit');
      assert.ok(rename.get(document.uri)?.some((edit) => edit.newText === 'BetterController'));
      assert.ok(rename.get(routeDoc.uri)?.some((edit) => edit.newText === 'BetterController'));
      // A rename preview may not modify source until the user applies it.
      assert.ok(document.getText().includes('HomeController'));
      assert.ok(routeDoc.getText().includes('HomeController'));

      const signature = await vscode.commands.executeCommand<vscode.SignatureHelp>(
        'vscode.executeSignatureHelpProvider',
        routeDoc.uri,
        routeDoc.positionAt(routeDoc.getText().indexOf('HomeController') + 2),
      );
      assert.ok(signature?.signatures.length, 'Expected native callable Signature Help');
      assert.ok(signature.signatures[0].label.includes('get(string path, Handler handler)'));
      assert.equal(signature.activeParameter, 1);

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

      // The VS Code formatting command must invoke the real LanguageClient
      // provider, preserve edits, and avoid rewriting already formatted code.
      const formattedUri = vscode.Uri.joinPath(project.uri, 'app/controllers/FormatTest.gnr');
      const raw = 'controller HomeController{Response index(){return text("Hello from Gungnir");}}';
      const expected = [
        'controller HomeController {',
        '    Response index() {',
        '        return text("Hello from Gungnir");',
        '    }',
        '}',
        '',
      ].join('\n');
      await vscode.workspace.fs.writeFile(formattedUri, Buffer.from(raw, 'utf8'));
      const originalFormatEnabled = settings.inspect<boolean>('formatting.enabled')?.globalValue;
      const languageConfig = vscode.workspace.getConfiguration('editor', {
        uri: formattedUri, languageId: 'gungnir',
      });
      const oldFormatOnSave = languageConfig.inspect<boolean>('formatOnSave')?.workspaceLanguageValue;
      try {
        const formatDoc = await vscode.workspace.openTextDocument(formattedUri);
        await vscode.window.showTextDocument(formatDoc);
        // Native LSP formatting emits edits rather than writing the file.
        const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
          'vscode.executeFormatDocumentProvider', formattedUri,
          { tabSize: 4, insertSpaces: true },
        );
        assert.ok(edits?.length, 'Expected native formatting edits from gungnir lsp');
        // VS Code may normalize a full-document LSP edit into smaller diff edits.
        const apply = new vscode.WorkspaceEdit();
        apply.set(formattedUri, edits);
        assert.equal(await vscode.workspace.applyEdit(apply), true);
        assert.equal(formatDoc.getText(), expected);
        const second = await vscode.commands.executeCommand<vscode.TextEdit[]>(
          'vscode.executeFormatDocumentProvider', formattedUri,
          { tabSize: 4, insertSpaces: true },
        );
        assert.equal(second?.length ?? 0, 0, 'Formatting must be idempotent');
        await settings.update('formatting.enabled', false, vscode.ConfigurationTarget.Global);
        const disabled = await vscode.commands.executeCommand<vscode.TextEdit[]>(
          'vscode.executeFormatDocumentProvider', formattedUri,
          { tabSize: 4, insertSpaces: true },
        );
        assert.equal(disabled?.length ?? 0, 0, 'Disabled formatting must return no edits');
        await settings.update('formatting.enabled', true, vscode.ConfigurationTarget.Global);
        // Test VS Code's own opt-in format-on-save, never a competing save hook.
        await languageConfig.update('formatOnSave', true, vscode.ConfigurationTarget.Workspace);
        const scoped = vscode.workspace.getConfiguration('editor', {
          uri: formattedUri, languageId: 'gungnir',
        });
        assert.equal(scoped.get<boolean>('formatOnSave'), true,
          'Language-specific editor.formatOnSave must be active');
        // The editor save participant observes the configuration asynchronously.
        await new Promise((resolve) => setTimeout(resolve, 250));
        const unformat = new vscode.WorkspaceEdit();
        unformat.replace(formattedUri, new vscode.Range(
          formatDoc.positionAt(0), formatDoc.positionAt(formatDoc.getText().length),
        ), raw);
        assert.equal(await vscode.workspace.applyEdit(unformat), true);
        assert.equal(formatDoc.getText(), raw);
        assert.equal(vscode.window.activeTextEditor?.document.uri.toString(), formattedUri.toString());
        assert.equal(await formatDoc.save(), true);
        const saved = Buffer.from(await vscode.workspace.fs.readFile(formattedUri)).toString('utf8');
        assert.equal(saved, expected, 'Format on Save should apply the native formatter');
      } finally {
        await settings.update('formatting.enabled', originalFormatEnabled, vscode.ConfigurationTarget.Global);
        await languageConfig.update('formatOnSave', oldFormatOnSave, vscode.ConfigurationTarget.Workspace);
        await vscode.workspace.fs.delete(formattedUri, { useTrash: false });
      }

      const stopped = await vscode.commands.executeCommand<{ state: string }>(
        'gungnir.stopLanguageServer',
      );
      assert.equal(stopped.state, 'stopped');
    } finally {
      await settings.update('executablePath', original, vscode.ConfigurationTarget.Global);
      await settings.update('languageServer.enabled', originalEnabled, vscode.ConfigurationTarget.Global);
    }
  });
  test('exposes project and declaration generator commands', async () => {
    const commands = await vscode.commands.getCommands(true);
    for (const id of [
      'gungnir.newProject', 'gungnir.generateDeclaration',
      'gungnir.makeModel', 'gungnir.makeController', 'gungnir.makeMiddleware',
      'gungnir.makeMigration', 'gungnir.makeRequest', 'gungnir.makeJob',
      'gungnir.makeEvent', 'gungnir.makeMail', 'gungnir.makeListener',
      'gungnir.makePolicy', 'gungnir.makeNotification',
    ]) {
      assert.ok(commands.includes(id), 'Missing generator command ' + id);
    }
  });

  test('generates a model using a verified native CLI executable without overwrites', async () => {
    if (process.platform === 'win32' || !vscode.workspace.isTrusted) return;
    const folder = vscode.workspace.workspaceFolders?.[0];
    const extension = vscode.extensions.getExtension('gungnir.vscode-gungnir');
    assert.ok(folder);
    assert.ok(extension);
    const fake = vscode.Uri.joinPath(extension.extensionUri, 'test-fixtures', 'mock-generator.cjs');
    const config = vscode.workspace.getConfiguration('gungnir');
    const oldExecutable = config.inspect<string>('executablePath')?.globalValue;
    const oldLsp = config.inspect<boolean>('languageServer.enabled')?.globalValue;
    const name = 'GroupNineModelTest';
    const created = vscode.Uri.joinPath(folder.uri, 'app', 'models', name + '.gnr');
    try {
      await config.update('languageServer.enabled', false, vscode.ConfigurationTarget.Global);
      await config.update('executablePath', fake.fsPath, vscode.ConfigurationTarget.Global);
      const result = await vscode.commands.executeCommand<{ source: string; stdout: string }>(
        'gungnir.makeModel', name,
      );
      assert.ok(result, 'Model generator should return a file reference');
      assert.equal(result.source, created.fsPath);
      assert.match(result.stdout, /Created app\/models\/GroupNineModelTest.gnr/);
      const code = Buffer.from(await vscode.workspace.fs.readFile(created)).toString('utf8');
      assert.equal(code, 'model GroupNineModelTest { string name; }\n');
      const retry = await vscode.commands.executeCommand('gungnir.makeModel', name);
      assert.equal(retry, undefined, 'Generator must not overwrite an existing model');
      const preserved = Buffer.from(await vscode.workspace.fs.readFile(created)).toString('utf8');
      assert.equal(preserved, code);
    } finally {
      try { await vscode.workspace.fs.delete(created); } catch { /* already absent */ }
      await config.update('executablePath', oldExecutable, vscode.ConfigurationTarget.Global);
      await config.update('languageServer.enabled', oldLsp, vscode.ConfigurationTarget.Global);
    }
  });


  test('provides Gungnir tasks and verifies build execution and dev termination', async () => {
    if (process.platform === 'win32' || !vscode.workspace.isTrusted) return;
    const project = vscode.workspace.workspaceFolders?.[0];
    const extension = vscode.extensions.getExtension('gungnir.vscode-gungnir');
    assert.ok(project);
    assert.ok(extension);
    const cli = vscode.Uri.joinPath(extension.extensionUri, 'test-fixtures', 'mock-workflow.cjs');
    const config = vscode.workspace.getConfiguration('gungnir');
    const oldCli = config.inspect<string>('executablePath')?.globalValue;
    const oldLsp = config.inspect<boolean>('languageServer.enabled')?.globalValue;
    try {
      await config.update('languageServer.enabled', false, vscode.ConfigurationTarget.Global);
      await config.update('executablePath', cli.fsPath, vscode.ConfigurationTarget.Global);
      const tasks = await vscode.tasks.fetchTasks({ type: 'gungnir' });
      const own = tasks.filter((task) =>
        typeof task.scope === 'object' && task.scope.uri.toString() === project.uri.toString(),
      );
      assert.equal(own.length, 5, 'Expected build, build-release, run, run-release and dev tasks');
      for (const task of own) {
        assert.ok(task.execution instanceof vscode.ProcessExecution, 'Tasks must never execute through a shell');
        assert.equal(task.execution.process, cli.fsPath);
      }
      const release = own.find((task) =>
        task.definition.operation === 'build' && task.definition.release === true);
      assert.ok(release);
      assert.deepEqual((release.execution as vscode.ProcessExecution).args, ['build', '--release']);

      const endBuild = new Promise<vscode.TaskProcessEndEvent>((resolve, reject) => {
        const timer = setTimeout(() => { sub.dispose(); reject(new Error('Build task timeout')); }, 12000);
        const sub = vscode.tasks.onDidEndTaskProcess((event) => {
          if (event.execution.task.definition.type === 'gungnir'
            && event.execution.task.definition.operation === 'build'
            && event.execution.task.definition.release !== true) {
            clearTimeout(timer);
            sub.dispose();
            resolve(event);
          }
        });
      });
      const launched = await vscode.commands.executeCommand<vscode.TaskExecution>('gungnir.build');
      assert.ok(launched, 'Build command should create a task execution');
      assert.equal(launched.task.definition.operation, 'build');
      const finished = await endBuild;
      assert.equal(finished.exitCode, 0, 'Native build task should preserve process exit code');

      const dev = await vscode.commands.executeCommand<vscode.TaskExecution>('gungnir.dev');
      assert.ok(dev, 'Dev watcher should start on explicit command');
      assert.equal(dev.task.isBackground, true);
      const duplicate = await vscode.commands.executeCommand<vscode.TaskExecution>('gungnir.dev');
      assert.equal(duplicate, dev, 'An existing dev watcher should be reused for the workspace');
      assert.ok(vscode.tasks.taskExecutions.some((execution) => execution === dev));

      const terminated = await vscode.commands.executeCommand<number>('gungnir.stopTask');
      assert.equal(terminated, 1, 'Stop command must only terminate the Gungnir workflow');
      const deadline = Date.now() + 8000;
      while (vscode.tasks.taskExecutions.some((execution) => execution === dev)
        && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
      assert.ok(!vscode.tasks.taskExecutions.some((execution) => execution === dev),
        'Terminated dev watcher must be removed from running task executions');
    } finally {
      for (const task of vscode.tasks.taskExecutions) {
        if (task.task.definition.type === 'gungnir') task.terminate();
      }
      await config.update('executablePath', oldCli, vscode.ConfigurationTarget.Global);
      await config.update('languageServer.enabled', oldLsp, vscode.ConfigurationTarget.Global);
    }
  });

  test('registers native Gungnir task definitions and problem matchers', async () => {
    const extension = vscode.extensions.getExtension('gungnir.vscode-gungnir');
    assert.ok(extension);
    const contributes = extension.packageJSON.contributes;
    assert.ok(contributes.taskDefinitions.some((definition: { type: string }) => definition.type === 'gungnir'));
    for (const matcher of ['gungnirCompiler', 'gungnirStructured', 'gungnirDev']) {
      assert.ok(contributes.problemMatchers.some((item: { name: string }) => item.name === matcher));
    }
    const commands = await vscode.commands.getCommands(true);
    for (const command of ['gungnir.build', 'gungnir.run', 'gungnir.dev', 'gungnir.stopTask']) {
      assert.ok(commands.includes(command), 'Missing command: ' + command);
    }
  });


  test('isolates two workspace roots, survives a server crash, and removes stale clients', async () => {
    if (process.platform === 'win32' || !vscode.workspace.isTrusted) return;
    const originalRoot = vscode.workspace.workspaceFolders?.[0];
    const extension = vscode.extensions.getExtension('gungnir.vscode-gungnir');
    assert.ok(originalRoot);
    assert.ok(extension);
    const cli = vscode.Uri.joinPath(extension.extensionUri, 'test-fixtures', 'mock-gungnir.cjs');
    const config = vscode.workspace.getConfiguration('gungnir');
    const originalCli = config.inspect<string>('executablePath')?.globalValue;
    const originalEnabled = config.inspect<boolean>('languageServer.enabled')?.globalValue;
    const os = await import('node:os');
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'gungnir-multiroot-'));
    const secondUri = vscode.Uri.file(temporary);
    const secondFile = vscode.Uri.joinPath(secondUri, 'app', 'controllers', 'Secondary.gnr');
    const status = async () => vscode.commands.executeCommand<{
      state: string;
      servers: Array<{ uri: string; state: string; attempts: number }>;
    }>('gungnir.languageServerStatus');
    const eventually = async (condition: () => Promise<boolean>, message: string) => {
      const deadline = Date.now() + 12000;
      while (Date.now() < deadline) {
        if (await condition()) return;
        await new Promise((resolve) => setTimeout(resolve, 90));
      }
      assert.fail(message + ': ' + JSON.stringify(await status()));
    };
    try {
      await fs.mkdir(path.dirname(secondFile.fsPath), { recursive: true });
      await fs.writeFile(path.join(temporary, '.gungnir-project'), 'name=secondary\nprofile=structured\n');
      await fs.writeFile(path.join(temporary, '.gungnir-fixture-crash-once'), 'crash');
      await fs.writeFile(secondFile.fsPath, 'controller Secondary { Response index() { return text("CRASH_ONCE"); } }\n');
      await config.update('languageServer.enabled', true, vscode.ConfigurationTarget.Global);
      await config.update('executablePath', cli.fsPath, vscode.ConfigurationTarget.Global);
      const oldDoc = await vscode.workspace.openTextDocument(
        vscode.Uri.joinPath(originalRoot.uri, 'app/controllers/HomeController.gnr'),
      );
      await vscode.window.showTextDocument(oldDoc);
      await vscode.commands.executeCommand('gungnir.startLanguageServer');
      const index = vscode.workspace.workspaceFolders?.length ?? 0;
      assert.equal(vscode.workspace.updateWorkspaceFolders(index, 0, { uri: secondUri }), true);
      await eventually(async () => vscode.workspace.getWorkspaceFolder(secondFile) !== undefined,
        'Second project must become a workspace folder');
      const secondary = await vscode.workspace.openTextDocument(secondFile);
      await vscode.window.showTextDocument(secondary);
      await eventually(async () => {
        const result = await status();
        return result.servers?.length === 2
          && result.servers.every((item) => item.state === 'running')
          && result.servers.some((item) => item.uri === secondUri.toString() && item.attempts >= 1);
      }, 'Both independent servers should run after recovering the secondary crash');
      assert.equal((await status()).servers.length, 2);
      // Switching the active editor must not replace/restart either session.
      await vscode.window.showTextDocument(oldDoc);
      assert.equal((await status()).servers.length, 2);
      const dropIndex = vscode.workspace.workspaceFolders?.findIndex(
        (folder) => folder.uri.toString() === secondUri.toString(),
      ) ?? -1;
      assert.ok(dropIndex >= 0);
      assert.equal(vscode.workspace.updateWorkspaceFolders(dropIndex, 1), true);
      await eventually(async () => {
        const result = await status();
        return result.servers?.length === 1
          && result.servers[0].uri === originalRoot.uri.toString();
      }, 'Removing a workspace folder must dispose only its server');
      await vscode.commands.executeCommand('gungnir.stopLanguageServer');
      assert.equal((await status()).servers.length, 0);
    } finally {
      const maybeIndex = vscode.workspace.workspaceFolders?.findIndex(
        (folder) => folder.uri.toString() === secondUri.toString(),
      ) ?? -1;
      if (maybeIndex >= 0) vscode.workspace.updateWorkspaceFolders(maybeIndex, 1);
      await vscode.commands.executeCommand('gungnir.stopLanguageServer');
      await config.update('executablePath', originalCli, vscode.ConfigurationTarget.Global);
      await config.update('languageServer.enabled', originalEnabled, vscode.ConfigurationTarget.Global);
      await fs.rm(temporary, { recursive: true, force: true });
    }
  });

});
