import * as vscode from 'vscode';
import { EXTENSION_VERSION, extensionStatus } from './core/status';
import { discoverToolchain, type ToolchainResult } from './core/toolchain';
import { ClientLifecycle } from './client/lifecycle';
import { createLanguageServer } from './client/server';
import { decideServerStart } from './client/selection';

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
  const lspOutput = vscode.window.createOutputChannel('Gungnir Language Server');
  const lifecycle = new ClientLifecycle();
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

  context.subscriptions.push(
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
      if (event.affectsConfiguration(configSection)) {
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
