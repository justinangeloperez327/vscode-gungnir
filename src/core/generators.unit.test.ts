import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import {
  GENERATORS, className, isStructuredProject, parseGeneratedSource, planDeclaration,
  safeGeneratedPath, validateDependency, validateName,
} from './generators';

describe('Gungnir CLI generator plans', () => {
  it('includes every documented structured generator', () => {
    expect(GENERATORS.map((x) => x.kind)).toEqual([
      'model', 'controller', 'middleware', 'migration', 'request', 'job',
      'event', 'mail', 'listener', 'policy', 'notification',
    ]);
  });
  it('makes correctly named paths and exact argument arrays', () => {
    expect(planDeclaration('model', 'user', false)).toEqual({
      kind: 'model', args: ['make:model', 'user'],
      relativePath: path.join('app/models', 'User.gnr'), dependency: undefined,
    });
    expect(planDeclaration('controller', 'Home', false).relativePath)
      .toBe(path.join('app/controllers', 'HomeController.gnr'));
    expect(planDeclaration('middleware', 'AuthMiddleware', false).relativePath)
      .toBe(path.join('app/middleware', 'AuthMiddleware.gnr'));
    expect(planDeclaration('migration', 'create_users_table', false).relativePath)
      .toBe(path.join('database/migrations', 'create_users_table.gnr'));
    expect(planDeclaration('request', 'StoreUser', true).relativePath)
      .toBe(path.join('app/requests', 'StoreUserRequest.gnr'));
  });
  it('accepts qualified dependencies only for listener/policy/notification', () => {
    const ref = 'app.events.UserCreated::UserCreated';
    expect(planDeclaration('listener', 'RecordUser', true, ref).args)
      .toEqual(['make:listener', 'RecordUser', ref]);
    expect(planDeclaration('policy', 'User', true, 'app.models.User::User').relativePath)
      .toBe(path.join('app/policies', 'UserPolicy.gnr'));
    expect(() => planDeclaration('listener', 'Record', true)).toThrow(/needs a qualified/);
    expect(() => planDeclaration('model', 'Foo', true, ref)).toThrow(/does not accept/);
    expect(() => validateDependency('app/events/X;rm -rf /')).toThrow(/qualified/);
  });
  it('refuses unsupported kinds in legacy projects', () => {
    for (const generator of GENERATORS.filter((g) => g.structured)) {
      expect(() => planDeclaration(generator.kind, 'Foo', false)).toThrow(/profile=structured/);
    }
  });
  it('rejects traversal, shell injection, whitespace, invalid names', () => {
    for (const name of ['../X', '/tmp/X', 'x y', 'A;rm', '--help', '3User', 'A\\B', 'X'.repeat(65)]) {
      expect(() => validateName(name)).toThrow();
    }
    expect(className('store_user')).toBe('StoreUser');
    expect(() => planDeclaration('unknown', 'Foo', true)).toThrow(/Unsupported/);
  });
  it('parses project profile strictly', () => {
    expect(isStructuredProject('name=demo\nprofile=structured\n')).toBe(true);
    expect(isStructuredProject('name=demo\n')).toBe(false);
    expect(isStructuredProject('profile=legacy\n')).toBe(false);
  });
  it('rejects Windows absolute, UNC and drive-qualified output paths on every host', () => {
    const root = path.resolve('/tmp/gungnir-app');
    for (const candidate of [
      'C:\\Windows\\Temp\\Evil.gnr',
      '\\\\server\\share\\Evil.gnr',
      'D:/sdk/app/models/Outside.gnr',
      '../../outside.gnr',
      'app/models/../../../../outside.gnr',
      'app/models/Bad.gnr\\junk',
    ]) expect(() => safeGeneratedPath(root, candidate)).toThrow();
  });

  it('only opens declared local .gnr files beneath project root', () => {
    const root = path.resolve('/tmp/gungnir-app');
    expect(parseGeneratedSource('Created app/models/User.gnr\n', root))
      .toBe(path.join(root, 'app/models/User.gnr'));
    for (const value of ['../outside.gnr', '/tmp/outside.gnr', 'models\\user.gnr', 'model.txt']) {
      expect(() => safeGeneratedPath(root, value)).toThrow();
    }
    expect(() => parseGeneratedSource('Failed\n', root)).toThrow(/did not report/);
  });
});
