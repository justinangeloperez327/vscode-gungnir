#!/usr/bin/env node
'use strict';
// Protocol-compliant test double: incremental text sync, versioned diagnostics,
// clean shutdown and an intentionally stale publish after a quick correction.
if (process.argv[2] === '--version') {
  process.stdout.write('Gungnir 1.0.2\n');
  process.exit(0);
}
if (process.argv[2] !== 'lsp') process.exit(2);
let buffer = Buffer.alloc(0);
let shutdown = false;
const documents = new Map();

function send(message) {
  const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...message }), 'utf8');
  process.stdout.write('Content-Length: ' + body.byteLength + '\r\n\r\n');
  process.stdout.write(body);
}
function reply(id, result) { send({ id, result }); }
function diagnostic(uri, version, errors = []) {
  send({ method: 'textDocument/publishDiagnostics', params: {
    uri, version, diagnostics: errors.map((message) => ({
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 1 },
      },
      severity: 1,
      source: 'gungnir',
      code: message.includes('stale') ? 'GNR-STALE' : 'GNR-GROUP6',
      message,
    })),
  } });
}
function analyze(doc) {
  diagnostic(doc.uri, doc.version, doc.text.includes('BROKEN')
    ? ['Gungnir test diagnostic: BROKEN (server v' + doc.version + ', tail=' + JSON.stringify(doc.text.slice(-60)) + ')'] : []);
}
function point(text, position) {
  let start = 0;
  for (let i = 0; i < position.line; i++) {
    const end = text.indexOf('\n', start);
    if (end < 0) return text.length;
    start = end + 1;
  }
  return Math.min(text.length, start + position.character);
}
function change(doc, edits) {
  for (const edit of edits) {
    if (!edit.range) {
      doc.text = edit.text;
    } else {
      const start = point(doc.text, edit.range.start);
      const end = point(doc.text, edit.range.end);
      doc.text = doc.text.slice(0, start) + edit.text + doc.text.slice(end);
    }
  }
}
process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    const boundary = buffer.indexOf('\r\n\r\n');
    if (boundary < 0) return;
    const headers = buffer.subarray(0, boundary).toString('utf8');
    const len = /(?:^|\r\n)Content-Length:\s*(\d+)/i.exec(headers);
    if (!len) process.exit(3);
    const size = Number(len[1]);
    if (buffer.length < boundary + 4 + size) return;
    const body = buffer.subarray(boundary + 4, boundary + 4 + size).toString('utf8');
    buffer = buffer.subarray(boundary + 4 + size);
    const msg = JSON.parse(body);
    const params = msg.params;
    if (msg.method === 'initialize') {
      reply(msg.id, {
        capabilities: {
          positionEncoding: 'utf-16',
          textDocumentSync: { openClose: true, change: 2, save: true },
        },
        serverInfo: { name: 'gungnir-test-double', version: '1.0.2' },
      });
    } else if (msg.method === 'textDocument/didOpen') {
      const doc = params.textDocument;
      documents.set(doc.uri, { ...doc });
      analyze(doc);
    } else if (msg.method === 'textDocument/didChange') {
      const uri = params.textDocument.uri;
      const doc = documents.get(uri);
      if (!doc || params.textDocument.version <= doc.version) continue;
      // Match the native Gungnir server: never apply duplicate/older edits.
      const wasBroken = doc.text.includes('BROKEN');
      const oldVersion = doc.version;
      change(doc, params.contentChanges);
      doc.version = params.textDocument.version;
      analyze(doc);
      if (wasBroken && !doc.text.includes('BROKEN')) {
        setTimeout(() => diagnostic(uri, oldVersion, ['Gungnir stale diagnostic']), 70);
      }
    } else if (msg.method === 'textDocument/didSave') {
      const doc = documents.get(params.textDocument.uri);
      if (doc) analyze(doc);
    } else if (msg.method === 'textDocument/didClose') {
      const uri = params.textDocument.uri;
      documents.delete(uri);
      diagnostic(uri, null, []);
    } else if (msg.method === 'shutdown') {
      shutdown = true;
      reply(msg.id, null);
    } else if (msg.method === 'exit') {
      process.exit(shutdown ? 0 : 1);
    } else if (msg.id !== undefined) {
      reply(msg.id, null);
    }
  }
});
process.stdin.resume();
