import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Rule = {
  name?: string;
  match?: string;
  begin?: string;
  end?: string;
  include?: string;
  patterns?: Rule[];
  captures?: Record<string, { name: string }>;
};
type Grammar = {
  name: string;
  scopeName: string;
  fileTypes: string[];
  patterns: Rule[];
  repository: Record<string, { patterns: Rule[] }>;
};

const root = process.cwd();
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const grammar: Grammar = JSON.parse(
  readFileSync(resolve(root, 'syntaxes/gungnir.tmLanguage.json'), 'utf8'),
);
const configuration = JSON.parse(
  readFileSync(resolve(root, 'language-configuration.json'), 'utf8'),
);

function matches(section: string, snippet: string): boolean {
  const patterns = grammar.repository[section].patterns;
  return patterns.some((pattern) =>
    typeof pattern.match === 'string' && new RegExp(pattern.match).test(snippet),
  );
}

describe('Gungnir language registration', () => {
  it('registers .gnr and binds it to the TextMate grammar', () => {
    expect(manifest.contributes.languages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'gungnir',
          extensions: expect.arrayContaining(['.gnr']),
          configuration: './language-configuration.json',
        }),
      ]),
    );
    expect(manifest.contributes.grammars).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          language: 'gungnir',
          scopeName: 'source.gungnir',
          path: './syntaxes/gungnir.tmLanguage.json',
        }),
      ]),
    );
    expect(grammar.scopeName).toBe('source.gungnir');
    expect(grammar.fileTypes).toContain('gnr');
  });

  it('includes only valid repositories and provides token rules', () => {
    const includes = grammar.patterns.map((rule) => rule.include);
    expect(includes).toContain('#comments');
    expect(includes).toContain('#strings');
    expect(includes).toContain('#declarations');
    for (const include of includes) {
      expect(include?.startsWith('#')).toBe(true);
      expect(grammar.repository[include!.slice(1)]).toBeDefined();
    }
    for (const section of Object.values(grammar.repository)) {
      expect(section.patterns.length).toBeGreaterThan(0);
      for (const rule of section.patterns) {
        expect(rule.match || (rule.begin && rule.end)).toBeTruthy();
        if (rule.match) expect(() => new RegExp(rule.match!)).not.toThrow();
        if (rule.begin) expect(() => new RegExp(rule.begin!)).not.toThrow();
        if (rule.end) expect(() => new RegExp(rule.end!)).not.toThrow();
      }
    }
  });

  it('highlights framework declarations, module imports and typed functions', () => {
    expect(matches('declarations', 'model User')).toBe(true);
    expect(matches('declarations', 'controller HomeController')).toBe(true);
    expect(matches('declarations', 'migration CreateUsers')).toBe(true);
    expect(matches('declarations', 'async function int add(')).toBe(true);
    expect(matches('declarations', 'unrelatedModel')).toBe(false);
    expect(matches('imports', 'import app.models.User as Models;')).toBe(true);
  });

  it('recognizes numeric, boolean, model metadata, functions and operators', () => {
    expect(matches('numbers', '0xFF')).toBe(true);
    expect(matches('numbers', '0b1010')).toBe(true);
    expect(matches('numbers', '123.45')).toBe(true);
    expect(matches('numbers', '.75')).toBe(true);
    expect(matches('languageConstants', 'true')).toBe(true);
    expect(matches('modelMetadata', 'fillable = [')).toBe(true);
    expect(matches('modelMetadata', 'fillable(')).toBe(false);
    expect(matches('namespaces', 'Route::get')).toBe(true);
    expect(matches('calls', 'get("/users")')).toBe(true);
    expect(matches('operators', '=>')).toBe(true);
    expect(matches('operators', '??')).toBe(true);
  });

  it('provides editor comments and bracket configuration', () => {
    expect(configuration.comments.lineComment).toBe('//');
    expect(configuration.comments.blockComment).toEqual(['/*', '*/']);
    expect(configuration.brackets).toContainEqual(['{', '}']);
    expect(configuration.brackets).toContainEqual(['(', ')']);
  });
});
