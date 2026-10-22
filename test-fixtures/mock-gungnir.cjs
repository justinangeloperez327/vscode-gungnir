#!/usr/bin/env node
'use strict';
if (process.argv[2] === '--version') {
  process.stdout.write('Gungnir 1.0.2\n');
  process.exit(0);
}
if (process.argv[2] !== 'lsp') process.exit(2);
let buffer = Buffer.alloc(0);
let shutdown = false;
function respond(id, result) {
  const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id, result }), 'utf8');
  process.stdout.write('Content-Length: ' + body.byteLength + '\r\n\r\n');
  process.stdout.write(body);
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
    if (msg.method === 'initialize') {
      respond(msg.id, {
        capabilities: { positionEncoding: 'utf-16', textDocumentSync: 2 },
        serverInfo: { name: 'gungnir-test-double', version: '1.0.2' },
      });
    } else if (msg.method === 'shutdown') {
      shutdown = true;
      respond(msg.id, null);
    } else if (msg.method === 'exit') {
      process.exit(shutdown ? 0 : 1);
    } else if (msg.id !== undefined) {
      respond(msg.id, null);
    }
  }
});
process.stdin.resume();
