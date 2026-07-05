import { safeStorage } from "electron";

import { MemoryRuntimeSecretStore, type RuntimeSecretStore } from "./runtime-secret-store";
import { SafeStorageFileRuntimeSecretStore } from "./safe-storage-secret-store";

export function createElectronRuntimeSecretStore(userDataDir: string): RuntimeSecretStore {
  if (process.env.SETTA_E2E === "1" && process.env.SETTA_E2E_RUNTIME_SECRET_STORE === "memory") {
    return new MemoryRuntimeSecretStore();
  }
  return new SafeStorageFileRuntimeSecretStore(userDataDir, safeStorage);
}
