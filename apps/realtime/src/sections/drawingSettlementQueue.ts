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
  emit: (reference: ContentReference) => void;
  onError: (error: unknown) => void;
  previewDelayMilliseconds: number;
  upload: (blob: Blob) => Promise<ContentReference>;
};

export class DrawingSettlementQueue {
  private blockedSnapshot: {
    revision: number;
    snapshot: DrawingSnapshot;
  } | null = null;
  private readyRevision = 0;
  private previewReady = false;
  private previewTimer: number | null = null;
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
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
    }
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.readyRevision = revision;
      void this.drain();
    }, this.options.delayMilliseconds);
  }

  public preview(): void {
    if (this.stopped || !this.options.canEmit() || this.previewTimer !== null) {
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
    const blocked = this.blockedSnapshot;
    if (this.stopped || blocked === null || !this.options.canEmit()) {
      return;
    }
    this.readyRevision = blocked.revision;
    void this.drain();
  }

  private activeSnapshot(revision: number): DrawingSnapshot | null {
    const blocked = this.blockedSnapshot;
    return blocked !== null && blocked.revision === revision
      ? blocked.snapshot
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

  private async process(revision: number): Promise<boolean> {
    const blocked = this.activeSnapshot(revision);
    const snapshot = blocked ?? (await this.options.capture());
    if (!this.isCurrent(revision)) {
      return true;
    }
    if (blocked === null && !(await this.persist(revision, snapshot))) {
      return true;
    }
    if (!this.options.canEmit()) {
      this.blockedSnapshot = { revision, snapshot };
      return false;
    }
    this.blockedSnapshot = null;
    const reference = await this.options.upload(snapshot.blob);
    if (this.isCurrent(revision)) {
      this.options.emit(reference);
    }
    return true;
  }

  private continueDrain(): void {
    if (
      !this.stopped &&
      (this.readyRevision !== 0 ||
        (this.previewReady && this.options.canEmit()))
    ) {
      void this.drain();
    }
  }

  private async processPreview(): Promise<void> {
    this.previewReady = false;
    if (!this.options.canEmit()) {
      return;
    }
    const snapshot = await this.options.capturePreview();
    if (this.stopped || !this.options.canEmit()) {
      return;
    }
    const reference = await this.options.upload(snapshot.blob);
    if (!this.stopped) {
      this.options.emit(reference);
    }
  }

  private async drain(): Promise<void> {
    if (this.running || this.stopped) {
      return;
    }
    this.running = true;
    try {
      while (!this.stopped && (this.readyRevision !== 0 || this.previewReady)) {
        try {
          if (this.readyRevision !== 0) {
            const revision = this.readyRevision;
            this.readyRevision = 0;
            if (!(await this.process(revision))) {
              break;
            }
          } else {
            await this.processPreview();
          }
        } catch (error) {
          this.options.onError(error);
        }
      }
    } finally {
      this.running = false;
      this.continueDrain();
    }
  }
}
