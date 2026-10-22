import { execFile } from 'node:child_process';
import { lstat, readFile, realpath, stat } from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';
import {
  isStructuredProject, parseGeneratedSource, planDeclaration, validateName,
  type GeneratorKind,
} from './generators';

const execFileAsync = promisify(execFile);

export type NativeCommand = (
  executable: string, args: string[], cwd: string, signal?: AbortSignal,
) => Promise<string>;

export const runNativeCommand: NativeCommand = async (executable, args, cwd, signal) => {
  const { stdout } = await execFileAsync(executable, args, {
    cwd, shell: false, windowsHide: true, timeout: 30000,
    maxBuffer: 128 * 1024, signal,
  });
  return stdout;
};

export interface GeneratorResult {
  command: string[];
  source?: string;
  project?: string;
  stdout: string;
}

async function exists(target: string): Promise<boolean> {
  try { await lstat(target); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function ensureSafeAncestors(root: string, relative: string): Promise<void> {
  const target = path.resolve(root, relative);
  const relativeParts = path.relative(root, target).split(path.sep);
  if (relativeParts[0] === '..' || path.isAbsolute(path.relative(root, target))) {
    throw new Error('Generator destination escapes the chosen project.');
  }
  let current = root;
  for (const part of relativeParts.slice(0, -1)) {
    current = path.join(current, part);
    try {
      const entry = await lstat(current);
      if (entry.isSymbolicLink() || !entry.isDirectory()) {
        throw new Error('Generator directory must not be a symbolic link or regular file: ' + current);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

export async function generateDeclaration(
  executable: string, root: string, kind: GeneratorKind,
  name: string, dependency?: string, runner: NativeCommand = runNativeCommand,
  signal?: AbortSignal,
): Promise<GeneratorResult> {
  if (!path.isAbsolute(executable) || !path.isAbsolute(root)) {
    throw new Error('Gungnir executable and project paths must be absolute.');
  }
  const cwd = await realpath(root);
  const rootInfo = await stat(cwd);
  if (!rootInfo.isDirectory()) throw new Error('Project root is not a directory.');
  const marker = path.join(cwd, '.gungnir-project');
  const markerInfo = await lstat(marker);
  if (!markerInfo.isFile() || markerInfo.isSymbolicLink()) {
    throw new Error('A regular .gungnir-project marker is required.');
  }
  const content = await readFile(marker, 'utf8');
  if (content.length > 8192) throw new Error('Gungnir project marker is too large.');
  const planned = planDeclaration(kind, name, isStructuredProject(content), dependency);
  await ensureSafeAncestors(cwd, planned.relativePath);
  const target = path.resolve(cwd, planned.relativePath);
  if (await exists(target)) throw new Error('Generated file already exists: ' + target);
  const stdout = await runner(executable, planned.args, cwd, signal);
  const reported = parseGeneratedSource(stdout, cwd);
  // Do not trust CLI stdout or open a file other than the one just requested.
  if (reported !== target) {
    throw new Error('Gungnir reported an unexpected generated path: ' + reported);
  }
  const created = await stat(target);
  if (!created.isFile()) throw new Error('Gungnir did not create the expected source file.');
  return { command: planned.args, source: target, stdout };
}

export async function createProject(
  executable: string, parent: string, name: string,
  runner: NativeCommand = runNativeCommand, signal?: AbortSignal,
): Promise<GeneratorResult> {
  if (!path.isAbsolute(executable) || !path.isAbsolute(parent)) {
    throw new Error('Gungnir executable and destination must be absolute.');
  }
  const checkedName = validateName(name);
  const cwd = await realpath(parent);
  if (!(await stat(cwd)).isDirectory()) throw new Error('Choose an existing parent directory.');
  const destination = path.join(cwd, checkedName);
  if (await exists(destination)) {
    throw new Error('Project destination already exists (no overwrite): ' + destination);
  }
  const args = ['new', checkedName, destination];
  const stdout = await runner(executable, args, cwd, signal);
  const marker = await lstat(path.join(destination, '.gungnir-project'));
  if (!marker.isFile() || marker.isSymbolicLink()) throw new Error('Gungnir did not create a regular project marker.');
  return { command: args, project: destination, stdout };
}
