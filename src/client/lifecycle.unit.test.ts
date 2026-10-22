
import { describe, expect, it } from 'vitest';
import { ClientLifecycle, type ManagedClient } from './lifecycle';

function fixture() {
  const events: string[] = [];
  function make(name: string, fail = false): ManagedClient {
    return {
      async start() { events.push(name + ':start'); if (fail) throw new Error('cannot start'); },
      async stop() { events.push(name + ':stop'); },
      async dispose() { events.push(name + ':dispose'); },
    };
  }
  return { events, make };
}

describe('LSP client lifecycle', () => {
  it('starts once and reuses a matching server', async () => {
    const f = fixture();
    const lifecycle = new ClientLifecycle();
    await lifecycle.start('one', () => f.make('a'));
    await lifecycle.start('one', () => f.make('b'));
    expect(lifecycle.state).toBe('running');
    expect(f.events).toEqual(['a:start']);
    await lifecycle.dispose();
    expect(f.events).toEqual(['a:start', 'a:stop', 'a:dispose']);
  });

  it('releases the existing server before switching roots or binary', async () => {
    const f = fixture();
    const lifecycle = new ClientLifecycle();
    await lifecycle.start('first', () => f.make('one'));
    await lifecycle.start('second', () => f.make('two'));
    expect(f.events).toEqual(['one:start', 'one:stop', 'one:dispose', 'two:start']);
    await lifecycle.dispose();
  });

  it('forces a clean manual restart', async () => {
    const f = fixture();
    const lifecycle = new ClientLifecycle();
    await lifecycle.start('same', () => f.make('one'));
    await lifecycle.start('same', () => f.make('two'), true);
    expect(f.events).toEqual(['one:start', 'one:stop', 'one:dispose', 'two:start']);
    await lifecycle.dispose();
  });

  it('cleans up after failed start and allows recovery', async () => {
    const f = fixture();
    const lifecycle = new ClientLifecycle();
    await expect(lifecycle.start('bad', () => f.make('bad', true))).rejects.toThrow('cannot start');
    expect(lifecycle.state).toBe('failed');
    expect(f.events).toEqual(['bad:start', 'bad:dispose']);
    await lifecycle.start('good', () => f.make('good'));
    expect(lifecycle.state).toBe('running');
    await lifecycle.dispose();
  });

  it('skips stale pending starts when newer requests arrive', async () => {
    const f = fixture();
    const lifecycle = new ClientLifecycle();
    const first = lifecycle.start('old', () => f.make('old'));
    const next = lifecycle.start('new', () => f.make('new'));
    await Promise.all([first, next]);
    expect(f.events).toEqual(['new:start']);
    await lifecycle.dispose();
  });

  it('rejects starts after disposal and makes stop idempotent', async () => {
    const f = fixture();
    const lifecycle = new ClientLifecycle();
    await lifecycle.start('one', () => f.make('one'));
    await lifecycle.stop();
    await lifecycle.stop();
    await lifecycle.dispose();
    await lifecycle.start('ignored', () => f.make('ignored'));
    expect(lifecycle.state).toBe('stopped');
    expect(f.events).toEqual(['one:start', 'one:stop', 'one:dispose']);
  });
});
