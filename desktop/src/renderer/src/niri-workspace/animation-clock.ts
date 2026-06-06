type AnimationFrameCallback = (timestamp: number, deltaMs: number) => void;

export class AnimationClock {
  private frameId: number | null = null;
  private lastTimestamp: number | null = null;
  private running = false;

  constructor(private readonly callback: AnimationFrameCallback) {}

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.frameId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    this.lastTimestamp = null;
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }

  private tick = (timestamp: number): void => {
    if (!this.running) {
      return;
    }
    const deltaMs =
      this.lastTimestamp === null ? 1000 / 120 : Math.max(0, timestamp - this.lastTimestamp);
    this.lastTimestamp = timestamp;
    this.callback(timestamp, deltaMs);
    this.frameId = requestAnimationFrame(this.tick);
  };
}
