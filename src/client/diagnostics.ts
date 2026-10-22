export interface DiagnosticNotification {
  uri: string;
  version?: number | null;
  diagnostics: unknown[];
}

export type DocumentSnapshot = { version: number } | undefined;

/** Reject stale versioned diagnostics before vscode-languageclient loses the LSP version. */
export class DiagnosticGate {
  private latest = new Map<string, number>();

  constructor(
    private readonly snapshot: (uri: string) => DocumentSnapshot,
    private readonly belongsToWorkspace: (uri: string) => boolean,
  ) {}

  accept(params: DiagnosticNotification): boolean {
    if (!this.belongsToWorkspace(params.uri)) return false;
    const current = this.snapshot(params.uri);
    // Closing a document may clear diagnostics, but may not resurrect them.
    if (!current && params.diagnostics.length > 0) return false;
    const version = params.version;
    if (version !== undefined && version !== null) {
      if (!Number.isSafeInteger(version) || version < 0) return false;
      if (current && version < current.version) return false;
      const last = this.latest.get(params.uri);
      if (last !== undefined && version < last) return false;
      this.latest.set(params.uri, version);
    }
    if (!current) this.latest.delete(params.uri);
    return true;
  }

  close(uri: string): void {
    this.latest.delete(uri);
  }
}
