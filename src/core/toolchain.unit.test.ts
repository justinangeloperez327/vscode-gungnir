import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import { discoverToolchain, type ProbeIO } from './toolchain';

function fixture(options: { version?: string; compilerVersion?: string; sdk?: boolean } = {}) {
  const files = new Set<string>();
  const outputs = new Map<string, string | Error>();
  const add = (name: string, output: string | Error) => {
    files.add(name);
    outputs.set(name, output);
  };
  const io: ProbeIO = {
    async isExecutable(file) { return outputs.has(file); },
    async isFile(file) { return files.has(file); },
    async readText(file) {
      return file.endsWith('/sdk.txt') && options.sdk ? 'profile=application\n' : undefined;
    },
    async version(file) {
      const value = outputs.get(file);
      if (value instanceof Error) throw value;
      if (value === undefined) throw Error('unknown executable');
      return value;
    },
  };
  const cli = '/opt/gungnir/bin/gungnir';
  const compiler = '/opt/gungnir/bin/gungnirc';
  add(cli, options.version ?? 'Gungnir 1.0.2');
  if (options.compilerVersion !== 'none') add(
    compiler, options.compilerVersion ?? 'Gungnir compiler 1.0.2 (language 1)',
  );
  if (options.sdk) {
    files.add('/opt/gungnir/include/gungnir/gungnir.hpp');
    files.add('/opt/gungnir/lib/cmake/Gungnir/GungnirConfig.cmake');
  }
  return { files, outputs, io, cli, compiler };
}

describe('Gungnir CLI / SDK detection', () => {
  it('prefers explicit absolute executable paths to all other candidates', async () => {
    const f = fixture({ sdk: true });
    const result = await discoverToolchain({
      executablePath: f.cli, environment: { PATH: '/bin' }, platform: 'linux',
    }, f.io);
    expect(result.state).toBe('ready');
    expect(result.source).toBe('configured');
    expect(result.version).toBe('1.0.2');
    expect(result.compilerVersion).toBe('1.0.2');
    expect(result.sdkProfile).toBe('application');
    expect(result.sdkVerified).toBe(true);
    expect(result.sdkRoot).toBe('/opt/gungnir');
  });

  it('does not silently fall back when configured paths are invalid', async () => {
    const f = fixture();
    const relative = await discoverToolchain({ executablePath: './gungnir', platform: 'linux' }, f.io);
    expect(relative.state).toBe('invalid');
    const missing = await discoverToolchain({
      executablePath: '/missing/gungnir', platform: 'linux',
      environment: { PATH: '/opt/gungnir/bin' },
    }, f.io);
    expect(missing.state).toBe('invalid');
    expect(missing.executable).toBeUndefined();
  });

  it('discovers an SDK root when configured', async () => {
    const f = fixture({ sdk: true });
    const result = await discoverToolchain({ sdkRoot: '/opt/gungnir', platform: 'linux' }, f.io);
    expect(result.state).toBe('ready');
    expect(result.source).toBe('sdkRoot');
  });

  it('discovers a Gungnir executable on PATH', async () => {
    const f = fixture({ sdk: true });
    const result = await discoverToolchain({
      platform: 'linux', environment: { PATH: '/invalid:/opt/gungnir/bin:/opt/gungnir/bin' },
    }, f.io);
    expect(result.state).toBe('ready');
    expect(result.source).toBe('PATH');
    expect(result.executable).toBe(f.cli);
  });

  it('ignores relative or empty PATH entries for security', async () => {
    const f = fixture();
    f.outputs.set('gungnir', 'Gungnir 1.0.2');
    const result = await discoverToolchain({
      platform: 'linux', environment: { PATH: ':.:relative' },
    }, f.io);
    expect(result.state).toBe('missing');
  });

  it('supports documented SDK prefix environment variable', async () => {
    const f = fixture({ sdk: true });
    const result = await discoverToolchain({
      platform: 'linux', environment: { PATH: '', GUNGNIR_CMAKE_PREFIX: '/opt/gungnir' },
    }, f.io);
    expect(result.source).toBe('environment');
    expect(result.state).toBe('ready');
  });

  it('reports compiler version differences without advertising a complete setup', async () => {
    const f = fixture({ sdk: true, compilerVersion: 'Gungnir compiler 1.0.1 (language 1)' });
    const result = await discoverToolchain({ executablePath: f.cli, platform: 'linux' }, f.io);
    expect(result.state).toBe('partial');
    expect(result.diagnostics.join(' ')).toContain('Version mismatch');
  });

  it('distinguishes a usable CLI from missing SDK files and compiler', async () => {
    const f = fixture({ compilerVersion: 'none' });
    const result = await discoverToolchain({ executablePath: f.cli, platform: 'linux' }, f.io);
    expect(result.state).toBe('partial');
    expect(result.sdkVerified).toBe(false);
    expect(result.diagnostics.join(' ')).toContain('gungnirc was not found');
  });

  it('rejects binaries which do not identify as Gungnir', async () => {
    const f = fixture();
    f.outputs.set(f.cli, 'totally different compiler');
    const result = await discoverToolchain({ executablePath: f.cli, platform: 'linux' }, f.io);
    expect(result.state).toBe('invalid');
    expect(result.diagnostics.join(' ')).toContain('Expected');
  });

  it('handles version process failures without throwing', async () => {
    const f = fixture();
    f.outputs.set(f.cli, Error('timed out'));
    const result = await discoverToolchain({ executablePath: f.cli, platform: 'linux' }, f.io);
    expect(result.state).toBe('invalid');
    expect(result.message).toContain('timed out');
  });

  it('supports Windows .exe discovery from semicolon-separated PATH', async () => {
    const files = new Set(['C:\\SDK\\bin\\gungnir.exe', 'C:\\SDK\\bin\\gungnirc.exe']);
    const io: ProbeIO = {
      async isExecutable(file) { return files.has(file); },
      async isFile(file) { return files.has(file); },
      async readText() { return undefined; },
      async version(file) {
        return file.endsWith('gungnirc.exe')
          ? 'Gungnir compiler 1.0.2 (language 1)' : 'Gungnir 1.0.2';
      },
    };
    const result = await discoverToolchain({
      platform: 'win32', environment: { PATH: 'relative;"C:\\SDK\\bin"' },
    }, io);
    expect(result.executable).toBe(path.win32.join('C:\\SDK\\bin', 'gungnir.exe'));
    expect(result.source).toBe('PATH');
    expect(result.state).toBe('partial');
  });
});
