import * as path from 'node:path';

export const WORKFLOW_OPERATIONS = ['build', 'run', 'dev'] as const;
export type WorkflowOperation = typeof WORKFLOW_OPERATIONS[number];

export interface WorkflowPlan {
  operation: WorkflowOperation;
  release: boolean;
  args: string[];
  label: string;
  background: boolean;
}

export function workflowPlan(operation: string, release = false): WorkflowPlan {
  if (!WORKFLOW_OPERATIONS.some((item) => item === operation)) {
    throw new Error('Unsupported Gungnir task: ' + operation);
  }
  if (operation === 'dev' && release) {
    throw new Error('gungnir dev does not accept --release.');
  }
  return {
    operation: operation as WorkflowOperation,
    release,
    args: [operation, ...(release ? ['--release'] : [])],
    label: 'Gungnir: ' + operation.charAt(0).toUpperCase() + operation.slice(1)
      + (release ? ' (Release)' : ''),
    background: operation === 'dev',
  };
}

export function validateWorkflowExecutable(executable: string): string {
  if (!path.isAbsolute(executable)) {
    throw new Error('Gungnir task requires an absolute CLI executable path.');
  }
  return path.normalize(executable);
}

export function isLocalProjectMarker(root: string, marker: string): boolean {
  return path.basename(marker) === '.gungnir-project'
    && path.dirname(marker) === root;
}

export interface WorkflowProblem {
  file: string;
  line: number;
  column: number;
  severity: 'error' | 'warning';
  message: string;
  code?: string;
}

/** Gungnir compiler and structured-project validation diagnostics. */
export function parseWorkflowProblem(line: string): WorkflowProblem | undefined {
  // eslint-disable-next-line no-control-regex -- ANSI SGR escape sequences from native CLI output.
  const raw = line.replace(/\x1B\[[0-9;]*m/g, '').trim();
  const source = /^(.+):(\d+):(\d+):\s+(error|warning)(?:\[([^\]]+)\])?:\s+(.+)$/.exec(raw);
  const structured = !source
    ? /^(.+):(\d+):(\d+)\s+\[([^\]]+)\]:\s+(.+)$/.exec(raw)
    : undefined;
  if (source) {
    return {
      file: source[1], line: Number(source[2]), column: Number(source[3]),
      severity: source[4] as 'error' | 'warning', code: source[5], message: source[6],
    };
  }
  if (structured) {
    return {
      file: structured[1], line: Number(structured[2]), column: Number(structured[3]),
      severity: 'error', code: structured[4], message: structured[5],
    };
  }
  return undefined;
}
