import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import * as vscode from 'vscode';
import {
  CloseAction, ErrorAction, LanguageClient,
  type LanguageClientOptions, type ServerOptions,
} from 'vscode-languageclient/node';
import { DiagnosticGate } from './diagnostics';
import { DiagnosticFilterStream } from './diagnostic-stream';
import { mayFormat } from './formatting';
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
  const folderUri = config.folder.uri.toString();
  const gate = new DiagnosticGate(
    (uri) => {
      const document = vscode.workspace.textDocuments.find(
        (candidate) => candidate.uri.toString() === uri && candidate.languageId === 'gungnir',
      );
      return document ? { version: document.version } : undefined;
    },
    (uri) => {
      try {
        const parsed = vscode.Uri.parse(uri);
        return parsed.scheme === 'file'
          && parsed.path.endsWith('.gnr')
          && vscode.workspace.getWorkspaceFolder(parsed)?.uri.toString() === folderUri;
      } catch { return false; }
    },
  );
  const closed = vscode.workspace.onDidCloseTextDocument((document) => {
    gate.close(document.uri.toString());
  });
  let process: ChildProcessWithoutNullStreams | undefined;
  let filter: DiagnosticFilterStream | undefined;
  const server: ServerOptions = async () => {
    // The parent controls stdout framing so stale versioned diagnostics can be
    // dropped before vscode-languageclient converts them (and drops version).
    const child = spawn(config.executable, ['lsp'], {
      cwd: config.folder.uri.fsPath,
      windowsHide: true,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    process = child;
    await new Promise<void>((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', reject);
    });
    const stream = new DiagnosticFilterStream((params) => gate.accept(params));
    filter = stream;
    child.stdout.pipe(stream);
    child.stderr.on('data', (chunk: Buffer) => {
      output.warn('Gungnir LSP stderr: ' + chunk.toString('utf8').trimEnd());
    });
    child.on('error', (error: Error) => {
      output.error('Gungnir language server process error: ' + error.message);
      stream.destroy(error);
    });
    return { reader: stream, writer: child.stdin };
  };
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{
      scheme: 'file', language: 'gungnir',
      pattern: { baseUri: folderUri, pattern: '**/*.gnr' },
    }],
    workspaceFolder: config.folder,
    synchronize: { fileEvents: watcher },
    outputChannel: output,
    diagnosticCollectionName: 'gungnir',
    middleware: {
      provideDocumentFormattingEdits(document, options, token, next) {
        const folder = vscode.workspace.getWorkspaceFolder(document.uri);
        const allowed = mayFormat({
          trusted: vscode.workspace.isTrusted,
          enabled: vscode.workspace.getConfiguration('gungnir', document.uri)
            .get<boolean>('formatting.enabled', true),
          languageId: document.languageId,
          scheme: document.uri.scheme,
          inWorkspace: folder?.uri.toString() === folderUri,
        });
        // Do not replace the C++ formatter with a different TS formatting engine.
        return allowed ? next(document, options, token) : [];
      },
    },

    errorHandler: {
      error: () => ({ action: ErrorAction.Continue }),
      closed: () => ({ action: CloseAction.DoNotRestart }),
    },
  };
  const client = new LanguageClient(
    'gungnir-language-server', 'Gungnir Language Server', server, clientOptions,
  );
  const terminate = () => {
    if (process && !process.killed) process.kill();
    process = undefined;
  };
  return {
    start: () => client.start(),
    stop: async () => {
      try { await client.stop(); } finally { terminate(); }
    },
    dispose: async () => {
      try { await client.dispose(); } finally {
        terminate();
        filter?.destroy();
        watcher.dispose();
        closed.dispose();
      }
    },
  };
}
