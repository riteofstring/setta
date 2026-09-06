import type { WorkspaceSectionData } from "@setta/workspace";

import type { ContentReference } from "../backend/generatedContract";

export type DrawingSnapshot = {
  blob: Blob;
  scene: WorkspaceSectionData;
};

type DrawingSettlementQueueOptions = {
  canEmit: () => boolean;
  capture: () => Promise<DrawingSnapshot>;
  commit: (scene: WorkspaceSectionData) => Promise<boolean>;
  delayMilliseconds: number;
  emit: (reference: ContentReference) => void;
  onError: (error: unknown) => void;
  upload: (blob: Blob) => Promise<ContentReference>;
};

export class DrawingSettlementQueue {
  private blockedSnapshot: {
    revision: number;
    snapshot: DrawingSnapshot;
  } | null = null;
  private readyRevision = 0;
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

  public dispose(): void {
    this.stopped = true;
    ++this.revision;
    this.blockedSnapshot = null;
    this.readyRevision = 0;
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

  private async process(revision: number): Promise<boolean> {
    const blocked = this.blockedSnapshot;
    const snapshot =
      blocked?.revision === revision
        ? blocked.snapshot
        : await this.options.capture();
    if (this.stopped || revision !== this.revision) {
      return true;
    }
    if (blocked?.revision !== revision) {
      const committed = await this.options.commit(snapshot.scene);
      if (!committed || this.stopped || revision !== this.revision) {
        return true;
      }
    }
    if (!this.options.canEmit()) {
      this.blockedSnapshot = { revision, snapshot };
      return false;
    }
    this.blockedSnapshot = null;
    const reference = await this.options.upload(snapshot.blob);
    if (!this.stopped && revision === this.revision) {
      this.options.emit(reference);
    }
    return true;
  }

  private async drain(): Promise<void> {
    if (this.running || this.stopped) {
      return;
    }
    this.running = true;
    try {
      while (!this.stopped && this.readyRevision !== 0) {
        const revision = this.readyRevision;
        this.readyRevision = 0;
        try {
          if (!(await this.process(revision))) {
            break;
          }
        } catch (error) {
          this.options.onError(error);
        }
      }
    } finally {
      this.running = false;
      if (!this.stopped && this.readyRevision !== 0 && this.options.canEmit()) {
        void this.drain();
      }
    }
  }
}
