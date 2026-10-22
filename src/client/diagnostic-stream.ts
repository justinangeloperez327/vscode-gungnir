import { Transform, type TransformCallback } from 'node:stream';
import type { DiagnosticNotification } from './diagnostics';

const HEADER_END = Buffer.from('\r\n\r\n');
const MAX_HEADER = 8192;
const MAX_BODY = 16 * 1024 * 1024;

/**
 * LSP byte-stream filter. Leaves every non-diagnostic frame unchanged and
 * discards versioned diagnostics from older editor revisions.
 * Handles coalesced, split and UTF-8 frames without interpreting text as lines.
 */
export class DiagnosticFilterStream extends Transform {
  private buffered = Buffer.alloc(0);
  private expected: number | undefined;
  private header: Buffer | undefined;

  constructor(private readonly allow: (params: DiagnosticNotification) => boolean) {
    super();
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    try {
      this.buffered = Buffer.concat([this.buffered, chunk]);
      while (true) {
        if (this.expected === undefined) {
          const end = this.buffered.indexOf(HEADER_END);
          if (end < 0) {
            if (this.buffered.length > MAX_HEADER) throw new Error('LSP header exceeds 8192 bytes');
            break;
          }
          if (end > MAX_HEADER) throw new Error('LSP header exceeds 8192 bytes');
          const header = this.buffered.subarray(0, end + HEADER_END.length);
          const lines = header.toString('ascii').split('\r\n');
          const lengths = lines.flatMap((line) => {
            const match = /^content-length:\s*(\d+)\s*$/i.exec(line);
            return match ? [Number(match[1])] : [];
          });
          if (lengths.length !== 1 || !Number.isSafeInteger(lengths[0]) || lengths[0] > MAX_BODY) {
            throw new Error('Invalid LSP Content-Length');
          }
          this.header = header;
          this.expected = lengths[0];
          this.buffered = this.buffered.subarray(end + HEADER_END.length);
        }
        if (this.buffered.length < this.expected) break;
        const payload = this.buffered.subarray(0, this.expected);
        this.buffered = this.buffered.subarray(this.expected);
        const frame = Buffer.concat([this.header!, payload]);
        this.header = undefined;
        this.expected = undefined;
        if (this.forward(payload)) this.push(frame);
      }
      callback();
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private forward(body: Buffer): boolean {
    // The server must speak JSON-RPC; retain malformed frames for the LSP client
    // to handle as protocol errors rather than hiding them.
    let data: unknown;
    try { data = JSON.parse(body.toString('utf8')); } catch { return true; }
    if (!data || typeof data !== 'object') return true;
    const message = data as { method?: unknown; params?: unknown };
    if (message.method !== 'textDocument/publishDiagnostics') return true;
    const params = message.params;
    if (!params || typeof params !== 'object') return true;
    const diagnostic = params as Partial<DiagnosticNotification>;
    if (typeof diagnostic.uri !== 'string' || !Array.isArray(diagnostic.diagnostics)) return true;
    return this.allow(diagnostic as DiagnosticNotification);
  }

  override _flush(callback: TransformCallback): void {
    if (this.buffered.length || this.expected !== undefined) {
      callback(new Error('Incomplete LSP frame at end of server stream'));
    } else callback();
  }
}
