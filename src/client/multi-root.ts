import type { ManagedClient, LifecycleState } from './lifecycle';
import { ClientLifecycle } from './lifecycle';

export interface RootDescriptor {
  uri: string;
  name: string;
}
export interface RootSnapshot {
  uri: string;
  name: string;
  state: LifecycleState | 'restarting';
  attempts: number;
  executable: string;
}
interface Session<T extends RootDescriptor> {
  root: T;
  executable: string;
  lifecycle: ClientLifecycle;
  generation: number;
  attempts: number;
  recovery?: ReturnType<typeof setTimeout>;
  healthy?: ReturnType<typeof setTimeout>;
  crashed: boolean;
  exhausted: boolean;
}
export interface MultiRootOptions {
  retryDelays?: readonly number[];
  stableAfterMs?: number;
  onStatus?: () => void;
  onFailure?: (uri: string, error: unknown) => void;
}

/** One independent LSP connection and crash budget per local workspace folder. */
export class WorkspaceLanguageServers<T extends RootDescriptor> {
  private sessions = new Map<string, Session<T>>();
  private pending: Promise<void> = Promise.resolve();
  private revision = 0;
  private disposed = false;
  private readonly retryDelays: readonly number[];
  private readonly stableAfterMs: number;

  constructor(
    private readonly create: (root: T, executable: string, onExit: () => void) => ManagedClient,
    private readonly options: MultiRootOptions = {},
  ) {
    this.retryDelays = options.retryDelays ?? [1000, 2000, 4000];
    this.stableAfterMs = options.stableAfterMs ?? 30000;
  }

  get snapshots(): RootSnapshot[] {
    return [...this.sessions.values()].map((session) => ({
      uri: session.root.uri, name: session.root.name,
      state: (session.exhausted ? 'failed'
        : session.crashed ? 'restarting' : session.lifecycle.state) as RootSnapshot['state'],
      attempts: session.attempts, executable: session.executable,
    })).sort((a, b) => a.uri.localeCompare(b.uri));
  }

  get state(): LifecycleState {
    const values = this.snapshots.map((entry) => entry.state);
    if (values.some((value) => value === 'running')) return 'running';
    if (values.some((value) => value === 'starting' || value === 'restarting')) return 'starting';
    if (values.some((value) => value === 'failed')) return 'failed';
    return 'stopped';
  }

  private notify(): void { this.options.onStatus?.(); }

  private clearTimers(session: Session<T>): void {
    if (session.recovery) clearTimeout(session.recovery);
    if (session.healthy) clearTimeout(session.healthy);
    session.recovery = undefined;
    session.healthy = undefined;
  }

  private schedule(session: Session<T>): void {
    if (this.disposed || this.sessions.get(session.root.uri) !== session || session.recovery) return;
    if (session.healthy) clearTimeout(session.healthy);
    session.healthy = undefined;
    session.crashed = true;
    if (session.attempts >= this.retryDelays.length) {
      session.exhausted = true;
      this.notify();
      return;
    }
    const delay = this.retryDelays[session.attempts++];
    this.notify();
    session.recovery = setTimeout(() => {
      session.recovery = undefined;
      if (this.disposed || this.sessions.get(session.root.uri) !== session) return;
      void this.startSession(session, true);
    }, delay);
  }

  private async startSession(session: Session<T>, force: boolean): Promise<void> {
    if (this.disposed || this.sessions.get(session.root.uri) !== session) return;
    if (!force && (session.recovery || session.exhausted || session.crashed)) return;
    const generation = ++session.generation;
    session.crashed = false;
    session.exhausted = false;
    this.notify();
    try {
      await session.lifecycle.start(
        session.root.uri + '|' + session.executable,
        () => this.create(session.root, session.executable, () => {
          if (this.sessions.get(session.root.uri) !== session || session.generation !== generation) return;
          this.schedule(session);
        }), force,
      );
      if (session.generation !== generation || this.sessions.get(session.root.uri) !== session) return;
      session.healthy = setTimeout(() => {
        if (this.sessions.get(session.root.uri) === session && !session.crashed) session.attempts = 0;
      }, this.stableAfterMs);
      this.notify();
    } catch (error) {
      if (this.sessions.get(session.root.uri) !== session || session.generation !== generation) return;
      this.options.onFailure?.(session.root.uri, error);
      this.schedule(session);
    }
  }

  private async remove(session: Session<T>): Promise<void> {
    this.clearTimers(session);
    ++session.generation;
    this.sessions.delete(session.root.uri);
    try { await session.lifecycle.dispose(); }
    catch (error) { this.options.onFailure?.(session.root.uri, error); }
  }

  private enqueue(job: () => Promise<void>): Promise<void> {
    const work = this.pending.then(job, job);
    this.pending = work.catch(() => undefined);
    return work;
  }

  synchronize(roots: readonly T[], executable: string, force = false): Promise<void> {
    const revision = ++this.revision;
    // Deduplicate roots defensively and preserve only local, selected folders.
    const desired = new Map(roots.map((root) => [root.uri, root]));
    return this.enqueue(async () => {
      if (this.disposed || revision !== this.revision) return;
      for (const session of [...this.sessions.values()]) {
        if (!desired.has(session.root.uri) || session.executable !== executable) await this.remove(session);
      }
      if (this.disposed || revision !== this.revision) return;
      const launches: Promise<void>[] = [];
      for (const root of desired.values()) {
        let session = this.sessions.get(root.uri);
        if (!session) {
          session = {
            root, executable, lifecycle: new ClientLifecycle(),
            generation: 0, attempts: 0, crashed: false, exhausted: false,
          };
          this.sessions.set(root.uri, session);
          launches.push(this.startSession(session, false));
        } else {
          session.root = root;
          if (force) {
            this.clearTimers(session);
            session.attempts = 0;
            launches.push(this.startSession(session, true));
          }
        }
      }
      this.notify();
      await Promise.all(launches);
    });
  }

  stopAll(): Promise<void> {
    ++this.revision;
    return this.enqueue(async () => {
      for (const session of [...this.sessions.values()]) await this.remove(session);
      this.notify();
    });
  }

  dispose(): Promise<void> {
    this.disposed = true;
    return this.stopAll();
  }
}
