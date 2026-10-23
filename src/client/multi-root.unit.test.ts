import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceLanguageServers, type RootDescriptor } from './multi-root';
import type { ManagedClient } from './lifecycle';

const first: RootDescriptor = { uri: 'file:///one', name: 'one' };
const second: RootDescriptor = { uri: 'file:///two', name: 'two' };
function fixture(retries: readonly number[] = [10, 20]) {
  const events: string[] = [];
  const exits = new Map<string, () => void>();
  let fail = false;
  const manager = new WorkspaceLanguageServers(
    (root, executable, onExit): ManagedClient => {
      exits.set(root.uri, onExit);
      return {
        async start() {
          events.push('start:' + root.name + ':' + executable);
          if (fail) throw new Error('cannot start');
        },
        async stop() { events.push('stop:' + root.name); },
        async dispose() { events.push('dispose:' + root.name); },
      };
    }, { retryDelays: retries, stableAfterMs: 30000 },
  );
  return { manager, events, exits, setFail(value: boolean) { fail = value; } };
}
afterEach(() => vi.useRealTimers());

describe('independent workspace LSP lifecycle', () => {
  it('starts independent sessions, keeps them across editor switches and stops removed roots', async () => {
    const f = fixture();
    await f.manager.synchronize([first, second], '/usr/bin/gungnir');
    expect(f.manager.snapshots.map((x) => x.state)).toEqual(['running', 'running']);
    expect(f.events.filter((x) => x.startsWith('start'))).toHaveLength(2);
    await f.manager.synchronize([second, first], '/usr/bin/gungnir');
    expect(f.events.filter((x) => x.startsWith('start'))).toHaveLength(2);
    await f.manager.synchronize([second], '/usr/bin/gungnir');
    expect(f.events).toContain('stop:one');
    expect(f.manager.snapshots.map((x) => x.uri)).toEqual([second.uri]);
    await f.manager.dispose();
  });

  it('recreates only changed executables and supports explicit restart of all roots', async () => {
    const f = fixture();
    await f.manager.synchronize([first, second], '/first');
    await f.manager.synchronize([first, second], '/second');
    expect(f.events.filter((x) => x.startsWith('start:'))).toHaveLength(4);
    await f.manager.synchronize([first, second], '/second', true);
    expect(f.events.filter((x) => x.startsWith('start:'))).toHaveLength(6);
    await f.manager.dispose();
  });

  it('stops stale queued launches when workspace becomes untrusted', async () => {
    const f = fixture();
    const pending = f.manager.synchronize([first, second], '/bin/cli');
    const stopped = f.manager.stopAll();
    await Promise.all([pending, stopped]);
    expect(f.manager.snapshots).toEqual([]);
    expect(f.events.filter((x) => x.startsWith('start'))).toHaveLength(0);
    await f.manager.dispose();
  });

  it('recovers from crashes per root with bounded backoff and no cross-root interruption', async () => {
    vi.useFakeTimers();
    const f = fixture();
    await f.manager.synchronize([first, second], '/bin/cli');
    f.exits.get(first.uri)?.();
    expect(f.manager.snapshots.find((x) => x.uri === first.uri)?.state).toBe('restarting');
    expect(f.manager.snapshots.find((x) => x.uri === second.uri)?.state).toBe('running');
    await vi.advanceTimersByTimeAsync(10);
    expect(f.events.filter((x) => x === 'start:one:/bin/cli')).toHaveLength(2);
    f.exits.get(first.uri)?.();
    await vi.advanceTimersByTimeAsync(20);
    f.exits.get(first.uri)?.();
    expect(f.manager.snapshots.find((x) => x.uri === first.uri)?.state).toBe('failed');
    expect(f.events.filter((x) => x === 'start:two:/bin/cli')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.events.filter((x) => x === 'start:one:/bin/cli')).toHaveLength(3);
    await f.manager.dispose();
  });

  it('never respawns after manual stop or disposal, even if an old exit arrives late', async () => {
    vi.useFakeTimers();
    const f = fixture();
    await f.manager.synchronize([first], '/bin/cli');
    const oldExit = f.exits.get(first.uri);
    oldExit?.();
    await f.manager.stopAll();
    oldExit?.();
    await vi.advanceTimersByTimeAsync(500);
    expect(f.manager.snapshots).toHaveLength(0);
    expect(f.events.filter((x) => x.startsWith('start:'))).toHaveLength(1);
    await f.manager.dispose();
  });
});
