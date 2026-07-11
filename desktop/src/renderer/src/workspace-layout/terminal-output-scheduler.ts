import type { TerminalEvent } from "@generated/backend";
import type { TerminalOutputSchedule } from "@shared/recording";

const interactiveOutputBurstLimit = 4;

export interface ScheduledTerminalOutput {
  bytes: Uint8Array;
  event: TerminalEvent;
  outputSchedule: TerminalOutputSchedule;
}

export interface ScheduledTerminalOutputItem<T> {
  item: T;
  outputSchedule: TerminalOutputSchedule;
}

type FrameRequest = (callback: FrameRequestCallback) => number;
type FrameCancel = (handle: number) => void;
type MicrotaskRequest = (callback: () => void) => void;

interface TerminalOutputSchedulerOptions<T> {
  cancelFrame: FrameCancel;
  requestFrame: FrameRequest;
  requestMicrotask: MicrotaskRequest;
  write: (items: ScheduledTerminalOutputItem<T>[], onComplete?: () => void) => void;
}

interface TerminalPresentationSchedulerOptions {
  cancelFrame: FrameCancel;
  present: (dirtyRows: number) => void;
  requestFrame: FrameRequest;
}

export class TerminalOutputScheduler<T> {
  private bulkItems: ScheduledTerminalOutputItem<T>[] = [];
  private bulkWriteId: number | null = null;
  private frameHandle: number | null = null;
  private immediateFlushGeneration = 0;
  private immediateFlushScheduled = false;
  private immediateItems: ScheduledTerminalOutputItem<T>[] = [];
  private interactiveWrites = 0;
  private nextBulkWriteId = 1;

  constructor(private readonly options: TerminalOutputSchedulerOptions<T>) {}

  enqueue(item: T): void {
    if (
      this.bulkItems.length === 0 &&
      this.bulkWriteId === null &&
      this.interactiveWrites < interactiveOutputBurstLimit
    ) {
      this.interactiveWrites += 1;
      this.immediateItems.push({ item, outputSchedule: "immediate" });
      this.ensureImmediateFlush();
      this.ensureFrame();
      return;
    }
    this.bulkItems.push({ item, outputSchedule: "coalesced" });
    this.ensureFrame();
  }

  enqueueBulk(items: T[]): void {
    if (items.length === 0) {
      return;
    }
    this.bulkItems.push(...items.map((item) => ({ item, outputSchedule: "replay" as const })));
    this.ensureFrame();
  }

  clear(): void {
    if (this.frameHandle !== null) {
      this.options.cancelFrame(this.frameHandle);
    }
    this.frameHandle = null;
    this.bulkItems = [];
    this.bulkWriteId = null;
    this.immediateFlushGeneration += 1;
    this.immediateFlushScheduled = false;
    this.immediateItems = [];
    this.interactiveWrites = 0;
  }

  private ensureImmediateFlush(): void {
    if (this.immediateFlushScheduled) {
      return;
    }
    this.immediateFlushScheduled = true;
    const generation = this.immediateFlushGeneration;
    this.options.requestMicrotask(() => this.flushImmediate(generation));
  }

  private flushImmediate(generation: number): void {
    if (generation !== this.immediateFlushGeneration) {
      return;
    }
    this.immediateFlushScheduled = false;
    if (this.immediateItems.length === 0) {
      return;
    }
    const items = this.immediateItems;
    this.immediateItems = [];
    this.options.write(items);
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
    if (this.bulkItems.length === 0 || this.bulkWriteId !== null) {
      return;
    }
    const items = this.bulkItems;
    this.bulkItems = [];
    const writeId = this.nextBulkWriteId;
    this.nextBulkWriteId += 1;
    this.bulkWriteId = writeId;
    this.options.write(items, () => this.onBulkWriteComplete(writeId));
  }

  private onBulkWriteComplete(writeId: number): void {
    if (this.bulkWriteId !== writeId) {
      return;
    }
    this.bulkWriteId = null;
    if (this.bulkItems.length > 0) {
      this.ensureFrame();
    }
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
