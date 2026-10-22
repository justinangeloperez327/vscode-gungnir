
import { describe, expect, it } from 'vitest';
import { decideServerStart } from './selection';
import type { ToolchainResult } from '../core/toolchain';

const valid: ToolchainResult = {
  state: 'ready', executable: '/opt/gungnir/bin/gungnir',
  version: '1.0.2', message: 'Detected', diagnostics: [],
};

describe('Gungnir LSP startup policy', () => {
  it('rejects any CLI execution for untrusted workspaces', () => {
    expect(decideServerStart(false, true, true, valid)).toEqual({
      allowed: false, reason: 'untrusted',
    });
  });

  it('does not start a server when explicitly disabled or outside a workspace', () => {
    expect(decideServerStart(true, false, true, valid).reason).toBe('disabled');
    expect(decideServerStart(true, true, false, valid).reason).toBe('noWorkspace');
  });

  it('requires the Gungnir CLI banner to have been validated', () => {
    expect(decideServerStart(true, true, true, {
      state: 'invalid', executable: '/usr/bin/not-gungnir',
      message: 'Invalid', diagnostics: [],
    }).allowed).toBe(false);
    expect(decideServerStart(true, true, true, {
      state: 'missing', message: 'Missing', diagnostics: [],
    }).reason).toBe('missingCli');
  });

  it('allows a valid CLI even when unrelated SDK components are missing', () => {
    const partial: ToolchainResult = { ...valid, state: 'partial', sdkVerified: false };
    expect(decideServerStart(true, true, true, partial)).toEqual({
      allowed: true, executable: '/opt/gungnir/bin/gungnir',
    });
  });
});
