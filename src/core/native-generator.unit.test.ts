import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { createProject, generateDeclaration, type NativeCommand } from './native-generator';

let root = '';
let work = '';
const binary = path.resolve('/opt/gungnir/bin/gungnir');
beforeEach(async () => {
  // macOS /var -> /private/var and Windows 8.3 short paths need canonical roots.
  root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'gungnir-vscode-gen-')));
  work = path.join(root, 'app');
  await mkdir(work);
  await writeFile(path.join(work, '.gungnir-project'), 'name=demo\nprofile=structured\n');
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe('native CLI project/declaration execution', () => {
  it('passes exact structured generator arguments and verifies created file', async () => {
    let ran = false;
    const runner: NativeCommand = async (bin, args, cwd) => {
      ran = true;
      expect(bin).toBe(binary);
      expect(cwd).toBe(work);
      expect(args).toEqual(['make:controller', 'User']);
      await mkdir(path.join(cwd, 'app/controllers'), { recursive: true });
      await writeFile(path.join(cwd, 'app/controllers/UserController.gnr'), 'controller UserController {}\n');
      return 'Created app/controllers/UserController.gnr\n';
    };
    const result = await generateDeclaration(binary, work, 'controller', 'User', undefined, runner);
    expect(ran).toBe(true);
    expect(result.source).toBe(path.join(work, 'app/controllers/UserController.gnr'));
    expect(await readFile(result.source!, 'utf8')).toContain('UserController');
    await expect(generateDeclaration(binary, work, 'controller', 'User', undefined, runner))
      .rejects.toThrow(/already exists/);
  });

  it('blocks legacy-only missing structured profile before spawning the binary', async () => {
    await writeFile(path.join(work, '.gungnir-project'), 'name=demo\n');
    const runner: NativeCommand = async () => { throw new Error('Should not execute'); };
    await expect(generateDeclaration(binary, work, 'listener', 'Audit', 'app.events.Foo::Foo', runner))
      .rejects.toThrow(/profile=structured/);
    await expect(generateDeclaration(binary, work, 'model', '../X', undefined, runner))
      .rejects.toThrow(/Name must start/);
  });

  it('rejects a symlinked generator output directory', async () => {
    const outside = path.join(root, 'outside');
    await mkdir(outside);
    await mkdir(path.join(work, 'app'));
    await symlink(outside, path.join(work, 'app/models'), process.platform === 'win32' ? 'junction' : 'dir');
    await expect(generateDeclaration(binary, work, 'model', 'User', undefined,
      async () => { throw new Error('unexpected binary execution'); }))
      .rejects.toThrow(/symbolic link/);
  });

  it('rejects a generated symbolic-link file before opening it', async () => {
    if (process.platform === 'win32') return; // Windows CI runners do not grant symbolic-link privileges.
    const outside = path.join(root, 'outside.gnr');
    await writeFile(outside, 'model Outside {}');
    const runner: NativeCommand = async (_binary, args, cwd) => {
      expect(args).toEqual(['make:model', 'Evil']);
      await mkdir(path.join(cwd, 'app/models'), { recursive: true });
      await symlink(outside, path.join(cwd, 'app/models/Evil.gnr'), 'file');
      return 'Created app/models/Evil.gnr';
    };
    await expect(generateDeclaration(binary, work, 'model', 'Evil', undefined, runner))
      .rejects.toThrow(/regular source file/);
  });

  it('requires a regular Gungnir project marker and real CLI success', async () => {
    await rm(path.join(work, '.gungnir-project'));
    await expect(generateDeclaration(binary, work, 'model', 'User', undefined,
      async () => 'Created app/models/User.gnr')).rejects.toThrow();
    await writeFile(path.join(work, '.gungnir-project'), 'profile=structured\n');
    await expect(generateDeclaration(binary, work, 'model', 'User', undefined,
      async () => 'Created ../other.gnr')).rejects.toThrow(/inside the project/);
    await expect(generateDeclaration(binary, work, 'model', 'User', undefined,
      async () => 'Created app/models/User.gnr')).rejects.toThrow(/ENOENT/);
  });

  it('creates a new project in a previously nonexistent destination only', async () => {
    const runner: NativeCommand = async (_bin, args, cwd) => {
      expect(args).toEqual(['new', 'new_app', path.join(root, 'new_app')]);
      expect(cwd).toBe(root);
      await mkdir(args[2]);
      await writeFile(path.join(args[2], '.gungnir-project'), 'name=new_app\nprofile=structured\n');
      return 'Created Gungnir project: ' + args[2] + '\n';
    };
    const result = await createProject(binary, root, 'new_app', runner);
    expect(result.project).toBe(path.join(root, 'new_app'));
    await expect(createProject(binary, root, 'new_app', runner)).rejects.toThrow(/already exists/);
    await expect(createProject(binary, root, '../unsafe', runner)).rejects.toThrow(/Name must start/);
  });
});
