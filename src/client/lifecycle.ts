
/** Serialized lifecycle: stale start requests never replace a newer desired server. */
export interface ManagedClient {
  start(): Promise<void>;
  stop(): Promise<void>;
  dispose(): Promise<void>;
}

export type LifecycleState = 'stopped' | 'starting' | 'running' | 'failed';

export class ClientLifecycle {
  private active?: { key: string; client: ManagedClient };
  private sequence = 0;
  private pending: Promise<unknown> = Promise.resolve();
  private ended = false;
  private currentState: LifecycleState = 'stopped';

  get state(): LifecycleState {
    return this.currentState;
  }

  get key(): string | undefined {
    return this.active?.key;
  }

  private queue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation, operation);
    this.pending = result.then(() => undefined, () => undefined);
    return result;
  }

  private async release(): Promise<void> {
    const previous = this.active;
    this.active = undefined;
    if (previous) {
      try {
        await previous.client.stop();
      } catch {
        // The native server may already have crashed; disposal must still
        // release watchers and diagnostic collections before a restart.
      } finally {
        await previous.client.dispose();
      }
    }
    this.currentState = 'stopped';
  }

  start(key: string, create: () => ManagedClient, force = false): Promise<void> {
    const generation = ++this.sequence;
    return this.queue(async () => {
      if (this.ended || generation !== this.sequence) return;
      if (!force && this.active?.key === key) return;
      await this.release();
      if (this.ended || generation !== this.sequence) return;
      this.currentState = 'starting';
      let client: ManagedClient | undefined;
      try {
        client = create();
        await client.start();
        if (this.ended || generation !== this.sequence) {
          await client.stop();
          await client.dispose();
          this.currentState = 'stopped';
          return;
        }
        this.active = { key, client };
        this.currentState = 'running';
      } catch (error) {
        this.currentState = 'failed';
        if (client) {
          try { await client.dispose(); } catch { /* retain startup error */ }
        }
        throw error;
      }
    });
  }

  stop(): Promise<void> {
    ++this.sequence;
    return this.queue(() => this.release());
  }

  dispose(): Promise<void> {
    this.ended = true;
    return this.stop();
  }
}
