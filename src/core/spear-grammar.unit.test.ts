import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const load = (name: string) => JSON.parse(readFileSync(resolve(process.cwd(), name), 'utf8'));
type TextMateRule = { name?: string; match?: string; begin?: string; end?: string; include?: string };
const manifest = load('package.json');
const grammar = load('syntaxes/spear.tmLanguage.json');
const config = load('spear-language-configuration.json');
const snippets = load('snippets/spear.code-snippets');
const rule = (section: string): TextMateRule => grammar.repository[section].patterns[0];

describe('Spear HTML template registration', () => {
  it('binds .spear to a separate HTML-based grammar and snippets', () => {
    expect(manifest.contributes.languages).toContainEqual(expect.objectContaining({
      id: 'gungnir-spear', extensions: ['.spear'], configuration: './spear-language-configuration.json',
    }));
    expect(manifest.contributes.grammars).toContainEqual(expect.objectContaining({
      language: 'gungnir-spear', scopeName: 'text.html.spear', path: './syntaxes/spear.tmLanguage.json',
    }));
    expect(manifest.contributes.snippets).toContainEqual(expect.objectContaining({
      language: 'gungnir-spear', path: './snippets/spear.code-snippets',
    }));
    expect(manifest.contributes.configurationDefaults['[gungnir-spear]']).toBeUndefined();
    expect(grammar.fileTypes).toEqual(['spear']);
    expect(grammar.patterns.at(-1).include).toBe('text.html.basic');
  });

  it('recognizes escaped and raw expressions, comments, literal escapes and verbatim', () => {
    expect(new RegExp(rule('escapedExpression').begin!).test('{{ user.name }}')).toBe(true);
    expect(new RegExp(rule('escapedExpression').begin!).test('{{-- comment --}}')).toBe(false);
    expect(new RegExp(rule('rawExpression').begin!).test('{!! trustedHtml !!}')).toBe(true);
    expect(new RegExp(rule('comments').begin!).test('{{-- comment --}}')).toBe(true);
    expect(new RegExp(grammar.repository.escapedSyntax.patterns[0].match).test('@@if')).toBe(true);
    expect(new RegExp(grammar.repository.escapedSyntax.patterns[1].begin).test('@{{ client }}')).toBe(true);
    expect(new RegExp(rule('verbatim').begin!).test('@verbatim')).toBe(true);
    expect(new RegExp(rule('verbatim').end!).test('@endverbatim')).toBe(true);
  });

  it('highlights supported directives without treating CSS @rules and email text as Spear', () => {
    const directive = new RegExp(rule('directives').match!);
    for (const word of ['if', 'elseif', 'else', 'endif', 'unless', 'endunless',
      'foreach', 'endforeach', 'forelse', 'empty', 'endforelse', 'include',
      'extends', 'section', 'endsection', 'yield']) {
      expect(directive.test('@' + word), word).toBe(true);
    }
    for (const text of ['@media', '@font-face', '@incldue', 'user@if.example', '@@if']) {
      expect(directive.test(text), text).toBe(false);
    }
  });

  it('uses Spear comments, directives indentation and scoped snippets', () => {
    expect(config.comments.blockComment).toEqual(['{{--', '--}}']);
    const increase = new RegExp(config.indentationRules.increaseIndentPattern);
    const decrease = new RegExp(config.indentationRules.decreaseIndentPattern);
    for (const x of ["@section('content')", '@forelse(users as user)', '@if(active)']) expect(increase.test(x)).toBe(true);
    for (const x of ['@endif', '@endforelse', '@else']) expect(decrease.test(x)).toBe(true);
    const prefixes = Object.values(snippets).map((v) => (v as {prefix:string}).prefix);
    for (const prefix of ['spear-echo', 'spear-raw', 'spear-if', 'spear-forelse',
      'spear-section', 'spear-include', 'spear-verbatim']) expect(prefixes).toContain(prefix);
    expect(snippets['Spear: trusted raw HTML'].body.join('\n')).toContain('trustedHtml');
  });
});
