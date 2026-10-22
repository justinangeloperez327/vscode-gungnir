import * as vscode from 'vscode';
import { EXTENSION_VERSION, extensionStatus } from './core/status';

/** Group 1 establishes activation and one testable command. LSP comes in Group 5. */
export function activate(context: vscode.ExtensionContext): void {
  const command = vscode.commands.registerCommand('gungnir.showStatus', () => {
    const status = extensionStatus(EXTENSION_VERSION);
    void vscode.window.showInformationMessage(status);
    return status;
  });
  context.subscriptions.push(command);
}

export function deactivate(): void {
  // No background processes in Group 1.
}
