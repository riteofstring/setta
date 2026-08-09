import { useSyncExternalStore } from "react";

type ProofDiagnosticsSnapshot = {
  commandCount: number;
  previewTargetId: string | null;
  status: string;
};

export class ProofDiagnosticsStore {
  readonly #listeners = new Set<() => void>();
  #snapshot: ProofDiagnosticsSnapshot = {
    commandCount: 0,
    previewTargetId: null,
    status: "Adapter proof ready.",
  };

  getSnapshot = (): ProofDiagnosticsSnapshot => this.#snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  recordCommand(): void {
    this.#set({ commandCount: this.#snapshot.commandCount + 1 });
  }

  setPreviewTarget(previewTargetId: string | null): void {
    this.#set({ previewTargetId });
  }

  setStatus(status: string): void {
    this.#set({ status });
  }

  #set(update: Partial<ProofDiagnosticsSnapshot>): void {
    this.#snapshot = { ...this.#snapshot, ...update };
    for (const listener of this.#listeners) {
      listener();
    }
  }
}

export function ProofDiagnostics({ store }: { store: ProofDiagnosticsStore }) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return (
    <>
      <p data-proof-command-count="">Commands: {snapshot.commandCount}</p>
      <p data-proof-preview-target="">Preview target: {snapshot.previewTargetId ?? "none"}</p>
      <p aria-live="polite" role="status">
        {snapshot.status}
      </p>
    </>
  );
}
