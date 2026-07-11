import type { TerminalEvent } from "@generated/backend";

const interactiveOutputBurstLimit = 4;

export interface ScheduledTerminalOutput {
  bytes: Uint8Array;
  event: TerminalEvent;
}

type FrameRequest = (callback: FrameRequestCallback) => number;
type FrameCancel = (handle: number) => void;

interface TerminalOutputSchedulerOptions<T> {
  cancelFrame: FrameCancel;
  requestFrame: FrameRequest;
  write: (items: T[]) => void;
}

interface TerminalPresentationSchedulerOptions {
  cancelFrame: FrameCancel;
  present: (dirtyRows: number) => void;
  requestFrame: FrameRequest;
}

export class TerminalOutputScheduler<T> {
  private bulkItems: T[] = [];
  private frameHandle: number | null = null;
  private interactiveWrites = 0;

  constructor(private readonly options: TerminalOutputSchedulerOptions<T>) {}

  enqueue(item: T): void {
    if (this.bulkItems.length === 0 && this.interactiveWrites < interactiveOutputBurstLimit) {
      this.interactiveWrites += 1;
      this.options.write([item]);
      this.ensureFrame();
      return;
    }
    this.bulkItems.push(item);
    this.ensureFrame();
  }

  enqueueBulk(items: T[]): void {
    if (items.length === 0) {
      return;
    }
    this.bulkItems.push(...items);
    this.ensureFrame();
  }

  clear(): void {
    if (this.frameHandle !== null) {
      this.options.cancelFrame(this.frameHandle);
    }
    this.frameHandle = null;
    this.bulkItems = [];
    this.interactiveWrites = 0;
  }

  private ensureFrame(): void {
    if (this.frameHandle !== null) {
      return;
    }
    this.frameHandle = this.options.requestFrame(() => this.onFrame());
  }

  private onFrame(): void {
    this.frameHandle = null;
    this.interactiveWrites = 0;
    if (this.bulkItems.length === 0) {
      return;
    }
    const items = this.bulkItems;
    this.bulkItems = [];
    this.options.write(items);
  }
}

export class TerminalPresentationScheduler {
  private dirtyRows = 0;
  private frameHandle: number | null = null;

  constructor(private readonly options: TerminalPresentationSchedulerOptions) {}

  schedule(dirtyRows: number): void {
    this.dirtyRows = Math.max(this.dirtyRows, dirtyRows);
    if (this.frameHandle !== null) {
      return;
    }
    this.frameHandle = this.options.requestFrame(() => this.onFrame());
  }

  clear(): void {
    if (this.frameHandle !== null) {
      this.options.cancelFrame(this.frameHandle);
    }
    this.frameHandle = null;
    this.dirtyRows = 0;
  }

  private onFrame(): void {
    this.frameHandle = null;
    const dirtyRows = this.dirtyRows;
    this.dirtyRows = 0;
    this.options.present(dirtyRows);
  }
}
