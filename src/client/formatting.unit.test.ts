import { describe, expect, it } from 'vitest';
import { mayFormat, type FormattingContext } from './formatting';

const valid: FormattingContext = {
  trusted: true,
  enabled: true,
  languageId: 'gungnir',
  scheme: 'file',
  inWorkspace: true,
};

describe('native Gungnir formatting policy', () => {
  it('allows local files in a trusted project by default', () => {
    expect(mayFormat(valid)).toBe(true);
  });

  it('rejects untrusted, disabled and non-Gungnir documents', () => {
    const rejected: Array<[Partial<FormattingContext>, string]> = [
      [{ trusted: false }, 'untrusted workspace'],
      [{ enabled: false }, 'disabled formatting'],
      [{ languageId: 'plaintext' }, 'non-Gungnir document'],
      [{ scheme: 'untitled' }, 'untitled document'],
      [{ scheme: 'vscode-remote' }, 'remote document'],
      [{ inWorkspace: false }, 'file outside Gungnir workspace'],
    ];
    for (const [change, name] of rejected) {
      expect(mayFormat({ ...valid, ...change }), name).toBe(false);
    }
  });
});
