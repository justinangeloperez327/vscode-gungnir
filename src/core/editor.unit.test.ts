import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Snippet = { prefix: string; description: string; body: string[] };
const root = process.cwd();
const read = (path: string): unknown =>
  JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const manifest = read('package.json') as {
  contributes: {
    languages: { id: string; configuration: string }[];
    snippets: { language: string; path: string }[];
  };
};
const language = read('language-configuration.json') as {
  comments: { lineComment: string; blockComment: string[] };
  brackets: string[][];
  autoClosingPairs: { open: string; close: string; notIn?: string[] }[];
  surroundingPairs: string[][];
  wordPattern: string;
  indentationRules: Record<string, string>;
  folding: { markers: { start: string; end: string } };
  onEnterRules: {
    beforeText: string;
    afterText?: string;
    action: { indent: string; appendText?: string };
  }[];
};
const snippets = read('snippets/gungnir.code-snippets') as Record<string, Snippet>;

describe('Gungnir editor configuration', () => {
  it('wires the Gungnir snippet collection into VS Code', () => {
    expect(manifest.contributes.snippets).toContainEqual({
      language: 'gungnir',
      path: './snippets/gungnir.code-snippets',
    });
    expect(manifest.contributes.languages.some((entry) => entry.id === 'gungnir')).toBe(true);
  });

  it('provides unique searchable prefixes and a final cursor for every snippet', () => {
    expect(Object.keys(snippets).length).toBeGreaterThanOrEqual(20);
    const prefixes = Object.values(snippets).map((snippet) => snippet.prefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
    for (const [name, snippet] of Object.entries(snippets)) {
      expect(name.length).toBeGreaterThan(0);
      expect(snippet.description.trim().length).toBeGreaterThan(0);
      expect(snippet.prefix).toMatch(/^gnr-[a-z][a-z-]*$/);
      expect(Array.isArray(snippet.body)).toBe(true);
      expect(snippet.body.join('\n')).toContain('$0');
      expect((snippet.body.join('\n').match(/\$0\b/g) ?? []).length).toBe(1);
    }
  });

  it('includes accurate framework declarations and command templates', () => {
    const samples = [
      ['Gungnir Controller', 'controller ${1:HomeController}'],
      ['Gungnir Model', 'model ${1:User}'],
      ['Gungnir Migration', 'Table::create'],
      ['Gungnir Middleware', 'await next(request)'],
      ['Gungnir GET Route', 'Route::get'],
      ['Gungnir POST Route', 'Route::post'],
      ['Gungnir Event', 'event ${1:UserRegistered}'],
      ['Gungnir Listener', 'listener ${1:RecordRegistration}'],
      ['Gungnir Mail', 'subject()'],
      ['Gungnir Policy', 'policy ${1:ProjectPolicy}'],
      ['Gungnir Notification', 'notification ${1:WelcomeNotification}'],
    ];
    for (const [name, token] of samples) {
      expect(snippets[name]?.body.join('\n'), name).toContain(token);
    }
    expect(snippets['Gungnir Migration'].body.join('\n')).toContain('Table::dropIfExists');
    expect(snippets['Gungnir Resource Routes'].body.join('\n')).toContain('Route::delete');
  });

  it('compiles indentation, folding, word and OnEnter patterns', () => {
    const patterns = [
      language.wordPattern,
      ...Object.values(language.indentationRules),
      ...Object.values(language.folding.markers),
      ...language.onEnterRules.flatMap((rule) =>
        rule.afterText ? [rule.beforeText, rule.afterText] : [rule.beforeText],
      ),
    ];
    for (const pattern of patterns) {
      expect(() => new RegExp(pattern)).not.toThrow();
    }
  });

  it('indents code blocks, lists and multi-line call arguments', () => {
    const increase = new RegExp(language.indentationRules.increaseIndentPattern);
    const decrease = new RegExp(language.indentationRules.decreaseIndentPattern);
    for (const sample of ['controller UserController {', '    fillable = [', '    call(']) {
      expect(increase.test(sample), sample).toBe(true);
    }
    for (const sample of ['    }', '  ];', '  );', '});']) {
      expect(decrease.test(sample), sample).toBe(true);
    }
    for (const sample of ['// region test {', '  #region section {', '  * comment {']) {
      expect(increase.test(sample), sample).toBe(false);
    }
  });

  it('folds hash and slash comment regions without matching random words', () => {
    const start = new RegExp(language.folding.markers.start);
    const end = new RegExp(language.folding.markers.end);
    for (const marker of ['#region Utilities', '// region Methods', '// #region Routes']) {
      expect(start.test(marker), marker).toBe(true);
    }
    for (const marker of ['#endregion', '// endregion', '// #endregion']) {
      expect(end.test(marker), marker).toBe(true);
    }
    expect(start.test('const region = 1;')).toBe(false);
    expect(end.test('// endregionally')).toBe(false);
  });

  it('keeps comment syntax and quote pairing safe', () => {
    expect(language.comments).toEqual({ lineComment: '//', blockComment: ['/*', '*/'] });
    expect(language.brackets).toContainEqual(['{', '}']);
    const quote = language.autoClosingPairs.find((pair) => pair.open === '"');
    expect(quote?.notIn).toEqual(['string', 'comment']);
    expect(language.surroundingPairs).toContainEqual(['"', '"']);
    expect(language.onEnterRules.some((rule) => rule.action.appendText?.includes('*'))).toBe(true);
  });
});
