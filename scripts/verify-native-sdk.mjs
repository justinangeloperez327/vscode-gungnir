#!/usr/bin/env node
/**
 * Real native SDK smoke check, intentionally separate from the mock LSP tests.
 * Needs GUNGNIR_WINDOWS_CLI pointing to an official Windows gungnir.exe.
 * Does NOT require the Group 11-only LSP features added after SDK v1.0.2.
 */
import { spawn, execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';

const execute = promisify(execFile);
const executable = process.env.GUNGNIR_WINDOWS_CLI;
assert.ok(executable && path.isAbsolute(executable), 'Set GUNGNIR_WINDOWS_CLI to an absolute path');
assert.ok((await stat(executable)).isFile(), 'Native CLI binary does not exist');
const temp = await mkdtemp(path.join(tmpdir(), 'gungnir-real-sdk-'));
const project = path.join(temp, 'release_smoke');

async function cli(args, cwd = temp) {
  const { stdout, stderr } = await execute(executable, args, {
    cwd, windowsHide: true, timeout: 45000, maxBuffer: 1_048_576,
  });
  if (stderr.trim()) process.stdout.write(stderr);
  return stdout;
}

async function lspSmoke(modelPath, modelText) {
  const child = spawn(executable, ['lsp'], {
    cwd: project, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
  });
  let buffered = Buffer.alloc(0);
  let stderr = '';
  let nextId = 1;
  const pending = new Map();
  let exited = false;
  const exit = new Promise((resolve) => child.once('close', (code) => {
    exited = true;
    for (const waiter of pending.values()) waiter.reject(new Error('LSP exited: ' + code + ' ' + stderr));
    pending.clear();
    resolve(code);
  }));
  child.stderr.on('data', (part) => { stderr += part.toString('utf8'); });
  child.stdout.on('data', (chunk) => {
    buffered = Buffer.concat([buffered, chunk]);
    while (true) {
      const headerEnd = buffered.indexOf('\r\n\r\n');
      if (headerEnd < 0) return;
      const header = buffered.subarray(0, headerEnd).toString('ascii');
      const lengthText = /^Content-Length:\s*(\d+)\s*$/im.exec(header);
      if (!lengthText) throw new Error('LSP missing Content-Length');
      const length = Number(lengthText[1]);
      if (!Number.isSafeInteger(length) || length > 4_194_304) throw new Error('Invalid LSP frame size');
      if (buffered.length < headerEnd + 4 + length) return;
      const message = JSON.parse(buffered.subarray(headerEnd + 4, headerEnd + 4 + length).toString('utf8'));
      buffered = buffered.subarray(headerEnd + 4 + length);
      if (message.id !== undefined && pending.has(message.id)) {
        const waiter = pending.get(message.id);
        pending.delete(message.id);
        waiter.resolve(message);
      }
    }
  });
  function send(method, params, id) {
    const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...(id ? { id } : {}), method, params }), 'utf8');
    child.stdin.write(Buffer.concat([Buffer.from('Content-Length: ' + body.length + '\r\n\r\n'), body]));
  }
  async function request(method, params) {
    const id = nextId++;
    const response = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    send(method, params, id);
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('LSP timeout: ' + method + ' ' + stderr)), 12000));
    return Promise.race([response, timeout]);
  }

  try {
    const rootUri = pathToFileURL(project).toString();
    const initialized = await request('initialize', {
      processId: process.pid,
      rootUri,
      capabilities: {},
      workspaceFolders: [{ uri: rootUri, name: 'release_smoke' }],
    });
    assert.ok(!initialized.error, 'Native initialize failed: ' + JSON.stringify(initialized.error));
    assert.ok(initialized.result?.capabilities?.textDocumentSync, 'No LSP document-sync capability');
    send('initialized', {});
    const uri = pathToFileURL(modelPath).toString();
    send('textDocument/didOpen', {
      textDocument: { uri, languageId: 'gungnir', version: 1, text: modelText },
    });
    const symbols = await request('textDocument/documentSymbol', { textDocument: { uri } });
    assert.ok(!symbols.error && Array.isArray(symbols.result), 'Document symbols failed: ' + JSON.stringify(symbols));
    send('textDocument/didClose', { textDocument: { uri } });
    const shutdown = await request('shutdown', null);
    assert.ok(!shutdown.error, 'LSP shutdown error: ' + JSON.stringify(shutdown.error));
    send('exit', null);
    child.stdin.end();
    const code = await Promise.race([exit, new Promise((_, reject) =>
      setTimeout(() => reject(new Error('LSP exit timeout')), 7000))]);
    assert.equal(code, 0, 'Native language server must exit cleanly');
    console.log('Native Gungnir LSP initialized, synchronized a model, returned document symbols and shut down.');
  } finally {
    if (!exited) child.kill();
  }
}

try {
  const version = await cli(['--version']);
  assert.match(version, /^Gungnir\s+v?1\.0\.2\b/m, 'Unexpected SDK version');
  const compilerPath = path.join(path.dirname(executable), 'gungnirc.exe');
  const compilerVersion = await execute(compilerPath, ['--version'], { timeout: 15000, windowsHide: true });
  assert.match(compilerVersion.stdout, /^Gungnir compiler\s+/m);
  console.log(version.trim());
  const output = await cli(['new', 'release_smoke', project]);
  assert.match(output, /Created Gungnir project/i);
  const marker = await readFile(path.join(project, '.gungnir-project'), 'utf8');
  assert.match(marker, /profile\s*=/);
  await cli(['make:model', 'User'], project);
  const modelPath = path.join(project, 'app', 'models', 'User.gnr');
  const modelText = await readFile(modelPath, 'utf8');
  assert.match(modelText, /model User/);
  await lspSmoke(modelPath, modelText);
  console.log('PASS: Real Windows SDK CLI, generated model and LSP transport.');
} finally {
  await rm(temp, { recursive: true, force: true });
}
