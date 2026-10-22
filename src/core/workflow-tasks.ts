import { lstat } from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { discoverToolchain } from './toolchain';
import {
  WORKFLOW_OPERATIONS, workflowPlan, validateWorkflowExecutable,
  type WorkflowOperation,
} from './workflow';

export interface GungnirTaskDefinition extends vscode.TaskDefinition {
  type: 'gungnir';
  operation: WorkflowOperation;
  release?: boolean;
}

export function isGungnirTask(
  execution: vscode.TaskExecution,
): boolean {
  return execution.task.definition.type === 'gungnir'
    && WORKFLOW_OPERATIONS.some((x) => x === execution.task.definition.operation);
}

/** All task execution uses ProcessExecution: no shell expansion or command injection. */
export class GungnirTaskProvider implements vscode.TaskProvider {
  private readonly owned = new Set<vscode.TaskExecution>();

  constructor(private readonly output: vscode.OutputChannel) {}

  async projectFolders(): Promise<vscode.WorkspaceFolder[]> {
    if (!vscode.workspace.isTrusted) return [];
    const folders = (vscode.workspace.workspaceFolders ?? [])
      .filter((folder) => folder.uri.scheme === 'file');
    const valid: vscode.WorkspaceFolder[] = [];
    for (const folder of folders) {
      try {
        const marker = await lstat(path.join(folder.uri.fsPath, '.gungnir-project'));
        if (marker.isFile() && !marker.isSymbolicLink()) valid.push(folder);
      } catch {
        // Non-Gungnir workspaces are not eligible to run native build tasks.
      }
    }
    return valid;
  }

  async verifiedExecutable(): Promise<string | undefined> {
    if (!vscode.workspace.isTrusted) return undefined;
    const settings = vscode.workspace.getConfiguration('gungnir');
    const status = await discoverToolchain({
      executablePath: settings.get<string>('executablePath', ''),
      sdkRoot: settings.get<string>('sdkRoot', ''),
      timeoutMs: settings.get<number>('toolchain.timeoutMs', 3000),
    });
    if ((status.state !== 'ready' && status.state !== 'partial') || !status.executable) {
      this.output.appendLine('Gungnir task cannot start: ' + status.message);
      return undefined;
    }
    return validateWorkflowExecutable(status.executable);
  }

  createTask(
    folder: vscode.WorkspaceFolder,
    operation: WorkflowOperation,
    executable: string,
    release = false,
  ): vscode.Task {
    const plan = workflowPlan(operation, release);
    const definition: GungnirTaskDefinition = {
      type: 'gungnir',
      operation: plan.operation,
      release: plan.release,
    };
    const task = new vscode.Task(
      definition, folder, plan.label, 'gungnir',
      new vscode.ProcessExecution(executable, plan.args, { cwd: folder.uri.fsPath }),
      plan.background ? ['$gungnirDev'] : ['$gungnirCompiler', '$gungnirStructured'],
    );
    task.isBackground = plan.background;
    if (plan.operation === 'build') task.group = vscode.TaskGroup.Build;
    task.presentationOptions = {
      reveal: vscode.TaskRevealKind.Always,
      panel: vscode.TaskPanelKind.Dedicated,
      clear: false,
    };
    return task;
  }

  async provideTasks(): Promise<vscode.Task[]> {
    const folders = await this.projectFolders();
    if (!folders.length) return [];
    const executable = await this.verifiedExecutable();
    if (!executable || !vscode.workspace.isTrusted) return [];
    return folders.flatMap((folder) => [
      this.createTask(folder, 'build', executable),
      this.createTask(folder, 'build', executable, true),
      this.createTask(folder, 'run', executable),
      this.createTask(folder, 'run', executable, true),
      this.createTask(folder, 'dev', executable),
    ]);
  }

  async resolveTask(task: vscode.Task): Promise<vscode.Task | undefined> {
    if (!vscode.workspace.isTrusted) return undefined;
    const definition = task.definition as GungnirTaskDefinition;
    if (!WORKFLOW_OPERATIONS.includes(definition.operation)
      || (definition.operation === 'dev' && definition.release === true)) return undefined;
    const folders = await this.projectFolders();
    const folder = folders.find((item) =>
      typeof task.scope === 'object' && task.scope.uri.toString() === item.uri.toString());
    if (!folder) return undefined;
    const executable = await this.verifiedExecutable();
    if (!executable || !vscode.workspace.isTrusted) return undefined;
    return this.createTask(folder, definition.operation, executable, definition.release === true);
  }

  async start(folder: vscode.WorkspaceFolder, operation: WorkflowOperation, release = false) {
    if (!vscode.workspace.isTrusted) throw new Error('Trust this workspace before running Gungnir.');
    const validFolders = await this.projectFolders();
    if (!validFolders.some((item) => item.uri.toString() === folder.uri.toString())) {
      throw new Error('Open a local Gungnir project containing .gungnir-project.');
    }
    const executable = await this.verifiedExecutable();
    if (!executable || !vscode.workspace.isTrusted) {
      throw new Error('Gungnir CLI not found. Configure gungnir.executablePath.');
    }
    // Never launch a second dev watcher in the same project.
    if (operation === 'dev') {
      const existing = vscode.tasks.taskExecutions.find((item) =>
        isGungnirTask(item) && item.task.definition.operation === 'dev'
        && typeof item.task.scope === 'object'
        && item.task.scope.uri.toString() === folder.uri.toString());
      if (existing) {
        this.output.appendLine('Gungnir dev watcher already running in ' + folder.uri.fsPath);
        return existing;
      }
    }
    const task = this.createTask(folder, operation, executable, release);
    const execution = await vscode.tasks.executeTask(task);
    this.owned.add(execution);
    this.output.appendLine('Started ' + task.name + ' in ' + folder.uri.fsPath);
    return execution;
  }

  async stop(folder?: vscode.WorkspaceFolder): Promise<number> {
    const running = vscode.tasks.taskExecutions.filter((item) => isGungnirTask(item)
      && (!folder || (typeof item.task.scope === 'object'
        && item.task.scope.uri.toString() === folder.uri.toString())));
    for (const execution of running) execution.terminate();
    return running.length;
  }

  onTaskFinished(execution: vscode.TaskExecution, code?: number): void {
    if (isGungnirTask(execution)) {
      this.owned.delete(execution);
      this.output.appendLine(execution.task.name + ' exited with code ' + String(code ?? 'unknown'));
    }
  }

  async dispose(): Promise<void> {
    // Kill only workflows launched by this extension, not all user-defined tasks.
    for (const execution of this.owned) {
      try { execution.terminate(); } catch { /* already exited */ }
    }
    this.owned.clear();
  }
}
