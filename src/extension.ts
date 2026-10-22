import * as vscode from 'vscode';
import { EXTENSION_VERSION, extensionStatus } from './core/status';
import { discoverToolchain, type ToolchainResult } from './core/toolchain';

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
  context.subscriptions.push(output, indicator);

  let previous: ToolchainResult = untrustedResult();
  let generation = 0;

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
    indicator.tooltip = result.message + '\nClick to check SDK installation.';
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

  function printStatus(status: ToolchainResult): void {
    output.clear();
    output.appendLine('Gungnir toolchain detection');
    output.appendLine('Status: ' + status.state);
    output.appendLine(status.message);
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
      return result;
    }),
    vscode.window.onDidChangeActiveTextEditor(showIndicator),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(configSection)) {
        const settings = vscode.workspace.getConfiguration(configSection);
        if (settings.get<boolean>('toolchain.autoDetect', true)) void refresh();
      }
    }),
    vscode.workspace.onDidGrantWorkspaceTrust(() => {
      if (vscode.workspace.getConfiguration(configSection).get<boolean>('toolchain.autoDetect', true)) {
        void refresh();
      }
    }),
  );
  setIndicator(previous);
  if (vscode.workspace.getConfiguration(configSection).get<boolean>('toolchain.autoDetect', true)) {
    void refresh();
  }
}

export function deactivate(): void {
  // All VS Code registrations and output/status-bar resources are disposed by context.
}
