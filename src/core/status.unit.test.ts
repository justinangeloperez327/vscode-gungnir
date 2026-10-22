import { describe, expect, it } from 'vitest';
import { EXTENSION_VERSION, extensionStatus } from './status';

describe('extensionStatus', () => {
  it('returns a deterministic Group 1 status', () => {
    expect(extensionStatus(EXTENSION_VERSION)).toBe(
      'Gungnir VS Code Extension v0.1.0 — Group 1 foundation ready',
    );
  });

  it('uses the supplied version', () => {
    expect(extensionStatus('0.2.0')).toContain('v0.2.0');
  });
});
