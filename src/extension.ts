import * as vscode from 'vscode';
import * as path from 'node:path';
import { EXTENSION_VERSION, extensionStatus } from './core/status';
import { discoverToolchain, type ToolchainResult } from './core/toolchain';
import { ClientLifecycle } from './client/lifecycle';
import { createLanguageServer } from './client/server';
import { decideServerStart } from './client/selection';
import { GENERATORS, validateName, validateDependency, type GeneratorKind } from './core/generators';
import { generateDeclaration, createProject } from './core/native-generator';
import { GungnirTaskProvider, isGungnirTask } from './core/workflow-tasks';
import { workflowPlan, type WorkflowOperation } from './core/workflow';

const configSection = 'gungnir';
const statusCommand = 'gungnir.checkInstallation';

function untrustedResult(): ToolchainResult {
  return {
    state: 'untrusted',
    message: 'Workspace Trust is required before running Gungnir version checks.',
    diagnostics: ['Trust this workspace to enable local CLI discovery.'],
  };
}

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Gungnir');
  const indicator = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  indicator.name = 'Gungnir SDK';
  indicator.command = statusCommand;
  const lspOutput = vscode.window.createOutputChannel('Gungnir Language Server', { log: true });
  const lifecycle = new ClientLifecycle();
  const taskProvider = new GungnirTaskProvider(output);
  context.subscriptions.push(vscode.tasks.registerTaskProvider('gungnir', taskProvider));
  context.subscriptions.push({ dispose: () => { void taskProvider.dispose(); } });
  context.subscriptions.push(vscode.tasks.onDidEndTaskProcess((event) => {
    if (isGungnirTask(event.execution)) taskProvider.onTaskFinished(event.execution, event.exitCode);
  }));
  context.subscriptions.push(output, indicator, lspOutput);
  context.subscriptions.push({ dispose: () => { void lifecycle.dispose(); } });

  let previous: ToolchainResult = untrustedResult();
  let generation = 0;
  let lspGeneration = 0;
  let manualStop = false;
  let lspDetail = 'Not started';

  function showIndicator(): void {
    if (vscode.window.activeTextEditor?.document.languageId === 'gungnir') {
      indicator.show();
    } else {
      indicator.hide();
    }
  }

  function setIndicator(result: ToolchainResult): void {
    const label = result.version ? 'Gungnir ' + result.version : 'Gungnir SDK';
    indicator.text = result.state === 'ready'
      ? '$(check) ' + label
      : result.state === 'untrusted'
        ? '$(lock) Gungnir'
        : '$(warning) ' + label;
    indicator.tooltip = result.message + '\nLanguage server: ' + lspDetail
      + '\nClick to check SDK installation.';
    showIndicator();
  }

  async function refresh(): Promise<ToolchainResult> {
    const revision = ++generation;
    let detected: ToolchainResult;
    if (!vscode.workspace.isTrusted) {
      detected = untrustedResult();
    } else {
      const settings = vscode.workspace.getConfiguration(configSection);
      try {
        detected = await discoverToolchain({
          executablePath: settings.get<string>('executablePath', ''),
          sdkRoot: settings.get<string>('sdkRoot', ''),
          timeoutMs: settings.get<number>('toolchain.timeoutMs', 3000),
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        detected = {
          state: 'invalid',
          message: 'Gungnir toolchain detection failed: ' + detail,
          diagnostics: [detail],
        };
      }
    }
    if (revision === generation) {
      previous = detected;
      setIndicator(detected);
    }
    return detected;
  }


  function selectedFolder(): vscode.WorkspaceFolder | undefined {
    const candidates = [
      vscode.window.activeTextEditor?.document,
      ...vscode.workspace.textDocuments,
    ];
    for (const doc of candidates) {
      if (!doc || doc.languageId !== 'gungnir' || doc.uri.scheme !== 'file') continue;
      const folder = vscode.workspace.getWorkspaceFolder(doc.uri);
      if (folder?.uri.scheme === 'file') return folder;
    }
    return undefined;
  }

  function autoStart(): boolean {
    const settings = vscode.workspace.getConfiguration(configSection);
    return settings.get<boolean>('toolchain.autoDetect', true)
      && settings.get<boolean>('languageServer.enabled', true)
      && !manualStop;
  }

  async function reconcile(force = false): Promise<void> {
    const current = ++lspGeneration;
    const folder = selectedFolder();
    const settings = vscode.workspace.getConfiguration(configSection);
    const enabled = settings.get<boolean>('languageServer.enabled', true) && !manualStop;
    if (!vscode.workspace.isTrusted || !enabled || !folder) {
      await lifecycle.stop();
      if (current === lspGeneration) {
        lspDetail = !vscode.workspace.isTrusted ? 'Workspace is not trusted'
          : !enabled ? 'Disabled or stopped' : 'Open a .gnr file in a workspace';
        setIndicator(previous);
      }
      return;
    }

    const detected = await refresh();
    if (current !== lspGeneration || manualStop || !vscode.workspace.isTrusted) return;
    const decision = decideServerStart(true, enabled, true, detected);
    if (!decision.allowed || !decision.executable) {
      await lifecycle.stop();
      lspDetail = detected.message;
      setIndicator(detected);
      return;
    }
    const executable = decision.executable;
    const key = folder.uri.toString() + '|' + executable;
    try {
      lspDetail = 'Starting';
      setIndicator(detected);
      await lifecycle.start(key, () => createLanguageServer(
        { executable, folder }, lspOutput,
      ), force);
      if (current === lspGeneration) {
        lspDetail = 'Running (' + folder.name + ')';
        lspOutput.appendLine('Connected to ' + executable + ' lsp in ' + folder.uri.fsPath);
        setIndicator(detected);
      }
    } catch (error) {
      const description = error instanceof Error ? error.message : String(error);
      if (current === lspGeneration) {
        lspDetail = 'Failed: ' + description;
        lspOutput.appendLine('Gungnir language server failed: ' + description);
        setIndicator(detected);
      }
    }
  }

  async function stopLanguageServer(): Promise<void> {
    manualStop = true;
    ++lspGeneration;
    await lifecycle.stop();
    lspDetail = 'Stopped by user';
    setIndicator(previous);
  }

  function printStatus(status: ToolchainResult): void {
    output.clear();
    output.appendLine('Gungnir toolchain detection');
    output.appendLine('Status: ' + status.state);
    output.appendLine(status.message);
    output.appendLine('Language server: ' + lspDetail);
    if (status.executable) output.appendLine('CLI: ' + status.executable);
    if (status.version) output.appendLine('CLI version: ' + status.version);
    if (status.compiler) output.appendLine('Compiler: ' + status.compiler);
    if (status.compilerVersion) output.appendLine('Compiler version: ' + status.compilerVersion);
    if (status.sdkRoot) output.appendLine('SDK root: ' + status.sdkRoot);
    if (status.sdkProfile) output.appendLine('SDK profile: ' + status.sdkProfile);
    if (status.sdkVerified !== undefined) {
      output.appendLine('SDK headers/CMake: ' + (status.sdkVerified ? 'Verified' : 'Not verified'));
    }
    for (const diagnostic of status.diagnostics) output.appendLine('Warning: ' + diagnostic);
    if (status.state === 'missing' || status.state === 'invalid' || status.state === 'partial') {
      output.appendLine('Installation guide: https://github.com/justinangeloperez327/gungnir/blob/main/docs/sdk-packages.md');
    }
    output.show(true);
  }

  async function executableForGenerator(): Promise<string | undefined> {
    const detected = await refresh();
    if ((detected.state === 'ready' || detected.state === 'partial') && detected.executable) {
      return detected.executable;
    }
    void vscode.window.showWarningMessage(
      'Gungnir CLI is unavailable: ' + detected.message + ' Configure gungnir.executablePath first.',
    );
    return undefined;
  }

  async function chooseProjectFolder(): Promise<vscode.WorkspaceFolder | undefined> {
    const folders = vscode.workspace.workspaceFolders?.filter((folder) => folder.uri.scheme === 'file') ?? [];
    if (folders.length === 0) {
      void vscode.window.showWarningMessage('Open a local Gungnir project folder first.');
      return undefined;
    }
    if (folders.length === 1) return folders[0];
    const chosen = await vscode.window.showQuickPick(
      folders.map((folder) => ({ label: folder.name, description: folder.uri.fsPath, folder })),
      { title: 'Choose the Gungnir project to generate into' },
    );
    return chosen?.folder;
  }

  async function promptName(kind: string, supplied?: string): Promise<string | undefined> {
    if (supplied !== undefined) return validateName(supplied);
    const entered = await vscode.window.showInputBox({
      title: kind === 'project' ? 'Gungnir: New Project' : 'Gungnir: Generate ' + kind,
      prompt: 'Enter a project or declaration name',
      validateInput: (value) => {
        try { validateName(value); return undefined; }
        catch (error) { return error instanceof Error ? error.message : String(error); }
      },
    });
    return entered === undefined ? undefined : validateName(entered);
  }

  async function promptDependency(kind: string, supplied?: string): Promise<string | undefined> {
    if (supplied !== undefined) return validateDependency(supplied);
    const entered = await vscode.window.showInputBox({
      title: 'Gungnir: ' + kind + ' Dependency',
      prompt: kind === 'listener' ? 'Existing event as module.path::Event'
        : 'Existing model as module.path::Model',
      placeHolder: kind === 'listener'
        ? 'app.events.UserCreated::UserCreated' : 'app.models.User::User',
      validateInput: (value) => {
        try { validateDependency(value); return undefined; }
        catch (error) { return error instanceof Error ? error.message : String(error); }
      },
    });
    return entered === undefined ? undefined : validateDependency(entered);
  }

  async function generateKind(kind: GeneratorKind, givenName?: string, givenDependency?: string) {
    if (!vscode.workspace.isTrusted) {
      void vscode.window.showWarningMessage('Trust this workspace before running Gungnir generators.');
      return undefined;
    }
    const folder = await chooseProjectFolder();
    if (!folder) return undefined;
    try {
      const name = await promptName(kind, givenName);
      if (!name) return undefined;
      const spec = GENERATORS.find((item) => item.kind === kind)!;
      const dependency = spec.dependency
        ? await promptDependency(kind, givenDependency) : givenDependency;
      if (spec.dependency && !dependency) return undefined;
      const executable = await executableForGenerator();
      if (!executable || !vscode.workspace.isTrusted) return undefined;
      const result = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification,
          title: 'Gungnir: Generate ' + spec.label, cancellable: true },
        async (_progress, token) => {
          const abort = new AbortController();
          const cancellation = token.onCancellationRequested(() => abort.abort());
          try {
            return await generateDeclaration(
              executable, folder.uri.fsPath, kind, name, dependency, undefined, abort.signal,
            );
          } finally { cancellation.dispose(); }
        },
      );
      output.appendLine('Generated ' + result.source);
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(result.source!));
      await vscode.window.showTextDocument(document, { preview: false });
      return result;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      output.appendLine('Generator failed: ' + detail);
      if ((error as NodeJS.ErrnoException).name !== 'AbortError') {
        void vscode.window.showErrorMessage('Gungnir generator: ' + detail, 'Show Output')
          .then((choice) => { if (choice === 'Show Output') output.show(true); });
      }
      return undefined;
    }
  }

  async function newProject(givenName?: string, givenParent?: string) {
    if (!vscode.workspace.isTrusted) {
      void vscode.window.showWarningMessage('Trust this workspace before creating a Gungnir project.');
      return undefined;
    }
    try {
      const name = await promptName('project', givenName);
      if (!name) return undefined;
      let parent = givenParent;
      if (!parent) {
        const folders = await vscode.window.showOpenDialog({
          title: 'Choose an existing parent directory for the new Gungnir project',
          canSelectFiles: false, canSelectFolders: true, canSelectMany: false,
          openLabel: 'Use This Folder',
        });
        parent = folders?.[0]?.fsPath;
      }
      if (!parent) return undefined;
      const executable = await executableForGenerator();
      if (!executable || !vscode.workspace.isTrusted) return undefined;
      const result = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification,
          title: 'Gungnir: Create Project ' + name, cancellable: true },
        async (_progress, token) => {
          const abort = new AbortController();
          const cancellation = token.onCancellationRequested(() => abort.abort());
          try { return await createProject(executable, parent, name, undefined, abort.signal); }
          finally { cancellation.dispose(); }
        },
      );
      output.appendLine('Created Gungnir project: ' + result.project);
      // Never change the current workspace without an explicit user choice.
      const action = await vscode.window.showInformationMessage(
        'Created Gungnir project in ' + path.basename(result.project!), 'Open Folder',
      );
      if (action === 'Open Folder') {
        await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(result.project!), false);
      }
      return result;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      output.appendLine('Project generator failed: ' + detail);
      if ((error as NodeJS.ErrnoException).name !== 'AbortError') {
        void vscode.window.showErrorMessage('Gungnir project creation: ' + detail, 'Show Output')
          .then((choice) => { if (choice === 'Show Output') output.show(true); });
      }
      return undefined;
    }
  }

  async function generateWithPicker() {
    if (!vscode.workspace.isTrusted) {
      void vscode.window.showWarningMessage('Trust this workspace before running Gungnir generators.');
      return undefined;
    }
    const chosen = await vscode.window.showQuickPick(
      GENERATORS.map((generator) => ({
        label: generator.label,
        description: generator.structured ? 'Structured project' : 'Legacy and structured',
        detail: 'gungnir make:' + generator.kind,
        generatorKind: generator.kind,
      })),
      { title: 'Generate a Gungnir declaration' },
    );
    return chosen ? generateKind(chosen.generatorKind) : undefined;
  }

  async function runWorkflow(operation: WorkflowOperation, release = false): Promise<vscode.TaskExecution | undefined> {
    if (!vscode.workspace.isTrusted) {
      void vscode.window.showWarningMessage('Trust this workspace before running Gungnir tasks.');
      return undefined;
    }
    try {
      // Validate all operation/release combinations, including programmatic command calls.
      const plan = workflowPlan(operation, release);
      const folder = await chooseProjectFolder();
      if (!folder) return undefined;
      const execution = await taskProvider.start(folder, plan.operation, plan.release);
      return execution;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      output.appendLine('Gungnir workflow failed: ' + message);
      void vscode.window.showErrorMessage('Gungnir workflow: ' + message);
      return undefined;
    }
  }

  async function stopWorkflow(): Promise<number> {
    const running = vscode.tasks.taskExecutions.filter((execution) => isGungnirTask(execution));
    if (!running.length) {
      void vscode.window.showInformationMessage('No Gungnir build, run or dev tasks are running.');
      return 0;
    }
    let selected: vscode.TaskExecution | undefined;
    if (running.length === 1) selected = running[0];
    else {
      const pick = await vscode.window.showQuickPick(
        running.map((execution) => ({
          label: execution.task.name,
          description: typeof execution.task.scope === 'object'
            ? execution.task.scope.uri.fsPath : undefined,
          execution,
        })),
        { title: 'Stop a running Gungnir task' },
      );
      selected = pick?.execution;
    }
    if (!selected) return 0;
    selected.terminate();
    return 1;
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('gungnir.build', (release?: boolean) => runWorkflow('build', release === true)),
    vscode.commands.registerCommand('gungnir.run', (release?: boolean) => runWorkflow('run', release === true)),
    vscode.commands.registerCommand('gungnir.dev', () => runWorkflow('dev')),
    vscode.commands.registerCommand('gungnir.stopTask', stopWorkflow),
    vscode.commands.registerCommand('gungnir.newProject', newProject),
    vscode.commands.registerCommand('gungnir.generateDeclaration', generateWithPicker),
    ...GENERATORS.map((generator) => vscode.commands.registerCommand(
      'gungnir.make' + generator.label,
      (name?: string, dependency?: string) => generateKind(generator.kind, name, dependency),
    )),
    vscode.commands.registerCommand('gungnir.showStatus', () => {
      const message = extensionStatus(EXTENSION_VERSION);
      void vscode.window.showInformationMessage(message);
      return message;
    }),
    vscode.commands.registerCommand(statusCommand, async () => {
      const status = await refresh();
      printStatus(status);
      return status;
    }),
    vscode.commands.registerCommand('gungnir.refreshToolchain', async () => {
      const status = await refresh();
      printStatus(status);
      await reconcile(true);
      return status;
    }),
    vscode.commands.registerCommand('gungnir.selectExecutable', async () => {
      const selection = await vscode.window.showOpenDialog({
        title: 'Select the Gungnir CLI executable',
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
      });
      if (!selection?.length) return undefined;
      const selected = selection[0].fsPath;
      const config = vscode.workspace.getConfiguration(configSection);
      const scope = vscode.workspace.workspaceFolders?.length
        ? vscode.ConfigurationTarget.Workspace
        : vscode.ConfigurationTarget.Global;
      await config.update('executablePath', selected, scope);
      const result = await refresh();
      printStatus(result);
      manualStop = false;
      await reconcile(true);
      return result;
    }),
    vscode.commands.registerCommand('gungnir.startLanguageServer', async () => {
      manualStop = false;
      await reconcile(true);
      return { state: lifecycle.state, detail: lspDetail };
    }),
    vscode.commands.registerCommand('gungnir.stopLanguageServer', async () => {
      await stopLanguageServer();
      return { state: lifecycle.state, detail: lspDetail };
    }),
    vscode.commands.registerCommand('gungnir.languageServerStatus', () => ({
      state: lifecycle.state,
      detail: lspDetail,
      workspace: selectedFolder()?.uri.fsPath,
      executable: previous.executable,
    })),
    vscode.window.onDidChangeActiveTextEditor(() => {
      showIndicator();
      if (autoStart()) void reconcile();
    }),
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (doc.languageId === 'gungnir' && autoStart()) void reconcile();
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      if (autoStart()) void reconcile(true);
      else void stopLanguageServer();
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      // Formatting preferences are read per request by the LSP middleware.
      // They must never tear down the server during an editor save.
      if ([
        'gungnir.executablePath',
        'gungnir.sdkRoot',
        'gungnir.toolchain.autoDetect',
        'gungnir.toolchain.timeoutMs',
        'gungnir.languageServer.enabled',
      ].some((section) => event.affectsConfiguration(section))) {
        if (autoStart()) void reconcile(true);
        else { ++lspGeneration; void lifecycle.stop(); }
      }
    }),
    vscode.workspace.onDidGrantWorkspaceTrust(() => {
      if (autoStart()) void reconcile(true);
    }),
  );
  setIndicator(previous);
  if (autoStart() && selectedFolder()) {
    void reconcile();
  } else if (vscode.workspace.getConfiguration(configSection).get<boolean>('toolchain.autoDetect', true)) {
    void refresh();
  }
}

export function deactivate(): void {
  // All VS Code registrations and output/status-bar resources are disposed by context.
}
