import { describe, expect, it } from 'vitest';
import { DiagnosticGate } from './diagnostics';
import { DiagnosticFilterStream } from './diagnostic-stream';

const uri = 'file:///project/app/controllers/HomeController.gnr';
const diagnostic = (version: number, text = 'error') => ({
  jsonrpc: '2.0', method: 'textDocument/publishDiagnostics',
  params: { uri, version, diagnostics: [{ message: text }] },
});
function frame(message: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  return Buffer.concat([Buffer.from('Content-Length: ' + body.length + '\r\n\r\n'), body]);
}
async function filtered(
  chunks: Buffer[], gate: DiagnosticGate,
): Promise<Buffer> {
  const stream = new DiagnosticFilterStream((params) => gate.accept(params));
  const output: Buffer[] = [];
  stream.on('data', (value: Buffer) => output.push(value));
  const completed = new Promise<void>((resolve, reject) => {
    stream.once('end', resolve);
    stream.once('error', reject);
  });
  for (const chunk of chunks) stream.write(chunk);
  stream.end();
  await completed;
  return Buffer.concat(output);
}

describe('diagnostic version gate', () => {
  it('keeps current diagnostics and rejects older document versions', () => {
    let current = 5;
    const gate = new DiagnosticGate(() => ({ version: current }), (value) => value === uri);
    expect(gate.accept({ uri, version: 5, diagnostics: [{}] })).toBe(true);
    current = 6;
    expect(gate.accept({ uri, version: 5, diagnostics: [{}] })).toBe(false);
    expect(gate.accept({ uri, version: 6, diagnostics: [] })).toBe(true);
    expect(gate.accept({ uri, version: 5, diagnostics: [{}] })).toBe(false);
  });

  it('does not accept non-Gungnir or closed-document diagnostics', () => {
    const gate = new DiagnosticGate(() => undefined, (value) => value === uri);
    expect(gate.accept({ uri, version: 2, diagnostics: [{}] })).toBe(false);
    expect(gate.accept({ uri, version: 2, diagnostics: [] })).toBe(true);
    expect(gate.accept({ uri: 'file:///other.gnr', version: 2, diagnostics: [] })).toBe(false);
  });

  it('rejects malformed version metadata and preserves unversioned legacy payloads', () => {
    const gate = new DiagnosticGate(() => ({ version: 7 }), () => true);
    expect(gate.accept({ uri, version: -1, diagnostics: [{}] })).toBe(false);
    expect(gate.accept({ uri, version: 6.3, diagnostics: [{}] })).toBe(false);
    expect(gate.accept({ uri, diagnostics: [{}] })).toBe(true);
  });

  it('discards out-of-order frames, preserving initialization and current clears', async () => {
    let version = 2;
    const gate = new DiagnosticGate(() => ({ version }), (value) => value === uri);
    const init = frame({ jsonrpc: '2.0', id: 0, result: { capabilities: {} } });
    const current = frame(diagnostic(2, 'fresh'));
    const old = frame(diagnostic(1, 'old'));
    const clear = frame({ ...diagnostic(3), params: { uri, version: 3, diagnostics: [] } });
    const combined = Buffer.concat([init, current, old]);
    const segments = [combined.subarray(0, 3), combined.subarray(3, 29), combined.subarray(29)];
    expect(await filtered(segments, gate)).toEqual(Buffer.concat([init, current]));
    version = 3;
    expect(await filtered([old, clear], gate)).toEqual(clear);
  });

  it('keeps multi-byte UTF-8 payloads across arbitrary boundaries', async () => {
    const gate = new DiagnosticGate(() => ({ version: 3 }), () => true);
    const expected = frame(diagnostic(3, 'خطأ compilation – 🚀'));
    const chunks = Array.from(expected, (byte) => Buffer.from([byte]));
    expect(await filtered(chunks, gate)).toEqual(expected);
  });

  it('rejects impossible or incomplete LSP framing', async () => {
    const gate = new DiagnosticGate(() => ({ version: 1 }), () => true);
    await expect(filtered([Buffer.from('Content-Length: 999999999\r\n\r\n')], gate))
      .rejects.toThrow('Invalid LSP Content-Length');
    await expect(filtered([Buffer.from('Content-Length: 10\r\n\r\nabc')], gate))
      .rejects.toThrow('Incomplete LSP frame');
  });
});
