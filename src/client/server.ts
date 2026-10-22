
import * as vscode from 'vscode';
import {
  CloseAction, ErrorAction, LanguageClient, TransportKind,
  type LanguageClientOptions, type ServerOptions,
} from 'vscode-languageclient/node';
import type { ManagedClient } from './lifecycle';

export interface LaunchConfiguration {
  executable: string;
  folder: vscode.WorkspaceFolder;
}

export function createLanguageServer(
  config: LaunchConfiguration,
  output: vscode.LogOutputChannel,
): ManagedClient {
  const pattern = new vscode.RelativePattern(config.folder, '**/*.gnr');
  const watcher = vscode.workspace.createFileSystemWatcher(pattern);
  const server: ServerOptions = {
    command: config.executable,
    args: ['lsp'],
    transport: TransportKind.stdio,
    options: { cwd: config.folder.uri.fsPath },
  };
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'gungnir', pattern: '**/*.gnr' }],
    workspaceFolder: config.folder,
    synchronize: { fileEvents: watcher },
    outputChannel: output,
    errorHandler: {
      error: () => ({ action: ErrorAction.Continue }),
      closed: () => ({ action: CloseAction.DoNotRestart }),
    },
  };
  const client = new LanguageClient('gungnir-language-server', 'Gungnir Language Server', server, clientOptions);
  return {
    start: () => client.start(),
    stop: () => client.stop(),
    dispose: async () => {
      try { await client.dispose(); } finally { watcher.dispose(); }
    },
  };
}
