/** Simple in-memory rate limiter: at most `perMinute` starts per rolling minute, FIFO. */
export class RateQueue {
  private starts: number[] = [];
  private chain: Promise<void> = Promise.resolve();
  constructor(private perMinute: number) {}

  /** Resolves when a slot is free, or rejects if the wait would exceed maxWaitMs. */
  acquire(maxWaitMs: number): Promise<void> {
    const p = this.chain.then(async () => {
      const now = Date.now();
      this.starts = this.starts.filter((t) => now - t < 60_000);
      if (this.starts.length >= this.perMinute) {
        const wait = 60_000 - (now - this.starts[0]);
        if (wait > maxWaitMs) throw new QueueTimeout();
        await new Promise((r) => setTimeout(r, wait));
      }
      this.starts.push(Date.now());
    });
    this.chain = p.catch(() => {});
    return p;
  }
}
export class QueueTimeout extends Error {}
