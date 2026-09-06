import type { WorkspaceSectionData } from "@setta/workspace";

import type { ContentReference } from "../backend/generatedContract";

export type DrawingSnapshot = {
  blob: Blob;
  scene: WorkspaceSectionData;
};

type DrawingSettlementQueueOptions = {
  canEmit: () => boolean;
  capture: () => Promise<DrawingSnapshot>;
  capturePreview: () => Promise<DrawingSnapshot>;
  commit: (scene: WorkspaceSectionData) => Promise<boolean>;
  delayMilliseconds: number;
  emit: (reference: ContentReference) => boolean;
  isCompletionPaced: () => boolean;
  onError: (error: unknown) => void;
  previewDelayMilliseconds: number;
  upload: (blob: Blob) => Promise<ContentReference>;
};

export class DrawingSettlementQueue {
  private blockedSnapshot: {
    reference: ContentReference | null;
    revision: number;
    snapshot: DrawingSnapshot;
  } | null = null;
  private capacityConsumed = false;
  private readyRevision = 0;
  private previewReady = false;
  private previewTimer: number | null = null;
  private retryPaused = false;
  private revision = 0;
  private running = false;
  private stopped = false;
  private timer: number | null = null;

  public constructor(private readonly options: DrawingSettlementQueueOptions) {}

  public settle(): void {
    if (this.stopped) {
      return;
    }
    const revision = ++this.revision;
    this.blockedSnapshot = null;
    this.retryPaused = false;
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.options.isCompletionPaced()) {
      if (this.previewTimer !== null) {
        window.clearTimeout(this.previewTimer);
        this.previewTimer = null;
      }
      this.previewReady = false;
      this.readyRevision = revision;
      void this.drain();
      return;
    }
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.readyRevision = revision;
      void this.drain();
    }, this.options.delayMilliseconds);
  }

  public preview(): void {
    if (this.stopped) {
      return;
    }
    if (this.options.isCompletionPaced()) {
      this.previewReady = true;
      void this.drain();
      return;
    }
    if (!this.options.canEmit() || this.previewTimer !== null) {
      return;
    }
    this.previewTimer = window.setTimeout(() => {
      this.previewTimer = null;
      this.previewReady = true;
      void this.drain();
    }, this.options.previewDelayMilliseconds);
  }

  public dispose(): void {
    this.stopped = true;
    ++this.revision;
    this.blockedSnapshot = null;
    this.readyRevision = 0;
    this.previewReady = false;
    if (this.previewTimer !== null) {
      window.clearTimeout(this.previewTimer);
      this.previewTimer = null;
    }
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  public resume(): void {
    if (this.stopped || !this.options.canEmit()) {
      return;
    }
    this.retryPaused = false;
    if (this.options.isCompletionPaced()) {
      this.capacityConsumed = false;
    }
    const blocked = this.blockedSnapshot;
    if (blocked !== null) {
      this.readyRevision = blocked.revision;
    }
    void this.drain();
  }

  private canProcess(): boolean {
    return (
      this.options.canEmit() &&
      !this.retryPaused &&
      (!this.options.isCompletionPaced() || !this.capacityConsumed)
    );
  }

  private activeSnapshot(revision: number): {
    reference: ContentReference | null;
    snapshot: DrawingSnapshot;
  } | null {
    const blocked = this.blockedSnapshot;
    return blocked !== null && blocked.revision === revision
      ? { reference: blocked.reference, snapshot: blocked.snapshot }
      : null;
  }

  private isCurrent(revision: number): boolean {
    return !this.stopped && revision === this.revision;
  }

  private async persist(
    revision: number,
    snapshot: DrawingSnapshot,
  ): Promise<boolean> {
    const committed = await this.options.commit(snapshot.scene);
    return committed && this.isCurrent(revision);
  }

  private block(
    revision: number,
    snapshot: DrawingSnapshot,
    reference: ContentReference | null,
  ): false {
    this.blockedSnapshot = { reference, revision, snapshot };
    return false;
  }

  private sent(reference: ContentReference): boolean {
    const emitted = this.options.emit(reference);
    if (emitted && this.options.isCompletionPaced()) {
      this.capacityConsumed = true;
    }
    return emitted;
  }

  private async process(revision: number): Promise<boolean> {
    if (this.options.isCompletionPaced() && !this.canProcess()) {
      this.readyRevision = revision;
      return false;
    }
    const blocked = this.activeSnapshot(revision);
    let snapshot: DrawingSnapshot;
    try {
      snapshot = blocked?.snapshot ?? (await this.options.capture());
    } catch (error) {
      if (this.isCurrent(revision)) {
        this.readyRevision = revision;
        this.retryPaused = true;
      }
      throw error;
    }
    if (!this.isCurrent(revision)) {
      return true;
    }
    if (blocked === null && !(await this.persist(revision, snapshot))) {
      return true;
    }
    if (!this.canProcess()) {
      return this.block(revision, snapshot, blocked?.reference ?? null);
    }
    let reference: ContentReference;
    try {
      reference =
        blocked?.reference ?? (await this.options.upload(snapshot.blob));
    } catch (error) {
      if (this.isCurrent(revision)) {
        this.retryPaused = true;
        this.block(revision, snapshot, null);
      }
      throw error;
    }
    if (!this.isCurrent(revision)) {
      return true;
    }
    if (!this.canProcess()) {
      return this.block(revision, snapshot, reference);
    }
    if (!this.sent(reference)) {
      this.retryPaused = true;
      return this.block(revision, snapshot, reference);
    }
    this.blockedSnapshot = null;
    return !this.options.isCompletionPaced();
  }

  private continueDrain(): void {
    if (this.stopped) {
      return;
    }
    const finalReady =
      this.readyRevision !== 0 &&
      !this.retryPaused &&
      (!this.options.isCompletionPaced() || this.canProcess());
    if (finalReady || (this.previewReady && this.canProcess())) {
      void this.drain();
    }
  }

  private async processPreview(): Promise<boolean> {
    if (!this.canProcess()) {
      return false;
    }
    this.previewReady = false;
    const revision = this.revision;
    const snapshot = await this.options.capturePreview();
    if (!this.isCurrent(revision)) {
      return true;
    }
    if (!this.canProcess()) {
      this.previewReady = true;
      return false;
    }
    const reference = await this.options.upload(snapshot.blob);
    if (!this.isCurrent(revision)) {
      return true;
    }
    if (!this.canProcess()) {
      this.previewReady = true;
      return false;
    }
    if (!this.sent(reference)) {
      return true;
    }
    return !this.options.isCompletionPaced();
  }

  private async processNext(): Promise<boolean> {
    if (this.readyRevision === 0) {
      return this.processPreview();
    }
    const revision = this.readyRevision;
    this.readyRevision = 0;
    return this.process(revision);
  }

  private async drainOne(): Promise<boolean> {
    try {
      return await this.processNext();
    } catch (error) {
      this.options.onError(error);
      return false;
    }
  }

  private async drain(): Promise<void> {
    if (this.running || this.stopped) {
      return;
    }
    this.running = true;
    try {
      while (!this.stopped && (this.readyRevision !== 0 || this.previewReady)) {
        if (!(await this.drainOne())) {
          break;
        }
      }
    } finally {
      this.running = false;
      this.continueDrain();
    }
  }
}
