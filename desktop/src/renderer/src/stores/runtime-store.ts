import type { CreateDevicePairingResponse } from "@generated/backend";
import type { RuntimeConnectionStatus, RuntimeRegistrySnapshot } from "@shared/types";
import { create } from "zustand";

export type RuntimeStoreOperation = "adding" | "pairing" | "removing" | "switching" | null;
type RuntimeStoreStatus = "idle" | "loading" | "ready" | "error";

interface RuntimeStore {
  addByPairingUrl: (pairingUrl: string) => Promise<void>;
  clearError: () => void;
  createDevicePairing: () => Promise<CreateDevicePairingResponse>;
  error: string | null;
  load: () => Promise<void>;
  operation: RuntimeStoreOperation;
  removeRuntime: (runtimeId: string) => Promise<void>;
  setSnapshot: (snapshot: RuntimeRegistrySnapshot) => void;
  snapshot: RuntimeRegistrySnapshot | null;
  status: RuntimeStoreStatus;
  switchRuntime: (runtimeId: string) => Promise<void>;
}

export const useRuntimeStore = create<RuntimeStore>((set) => {
  async function runRuntimeOperation(
    operation: Exclude<RuntimeStoreOperation, null>,
    action: () => Promise<RuntimeRegistrySnapshot>,
  ) {
    set({ error: null, operation });
    try {
      const snapshot = await action();
      set({ operation: null, snapshot, status: "ready" });
    } catch (error) {
      set({
        error: errorMessage(error),
        operation: null,
        status: "error",
      });
    }
  }

  return {
    addByPairingUrl: (pairingUrl) =>
      runRuntimeOperation("adding", () => window.setta.runtimes.addByPairingUrl(pairingUrl)),
    clearError: () => set({ error: null }),
    createDevicePairing: async () => {
      set({ error: null, operation: "pairing" });
      try {
        const pairing = await window.setta.runtimes.createDevicePairing();
        set({ operation: null, status: "ready" });
        return pairing;
      } catch (error) {
        set({
          error: errorMessage(error),
          operation: null,
          status: "error",
        });
        throw error;
      }
    },
    error: null,
    load: async () => {
      set({ error: null, status: "loading" });
      try {
        const snapshot = await window.setta.runtimes.current();
        set({ snapshot, status: "ready" });
      } catch (error) {
        set({ error: errorMessage(error), status: "error" });
      }
    },
    operation: null,
    removeRuntime: (runtimeId) =>
      runRuntimeOperation("removing", () => window.setta.runtimes.remove(runtimeId)),
    setSnapshot: (snapshot) =>
      set((state) => ({
        operation: runtimeOperationAfterSnapshot(snapshot, state.operation),
        snapshot,
        status: "ready",
      })),
    snapshot: null,
    status: "idle",
    switchRuntime: (runtimeId) =>
      runRuntimeOperation("switching", () => window.setta.runtimes.switch(runtimeId)),
  };
});

export function runtimeControlsDisabled(snapshot: RuntimeRegistrySnapshot | null): boolean {
  if (!snapshot || snapshot.switching) {
    return true;
  }
  return snapshot.connection.status !== "connected";
}

export function runtimePickerControlsDisabled(
  snapshot: RuntimeRegistrySnapshot | null,
  operation: RuntimeStoreOperation,
): boolean {
  return operation !== null || Boolean(snapshot?.switching);
}

function runtimeOperationAfterSnapshot(
  snapshot: RuntimeRegistrySnapshot,
  operation: RuntimeStoreOperation,
): RuntimeStoreOperation {
  if (snapshot.switching) {
    return operation;
  }
  if (connectionStateEndsPickerOperation(snapshot.connection.status)) {
    return null;
  }
  if (operation === "switching" && snapshot.connection.status === "connected") {
    return null;
  }
  return operation;
}

function connectionStateEndsPickerOperation(status: RuntimeConnectionStatus): boolean {
  return (
    {
      connected: false,
      connecting: false,
      disconnected: false,
      incompatible: true,
      mismatched: true,
      revoked: true,
      unreachable: true,
    } satisfies Record<RuntimeConnectionStatus, boolean>
  )[status];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Runtime operation failed";
}
