import { safeStorage } from "electron";

import { SafeStorageFileRuntimeSecretStore } from "./safe-storage-secret-store";

export function createElectronRuntimeSecretStore(
  userDataDir: string,
): SafeStorageFileRuntimeSecretStore {
  return new SafeStorageFileRuntimeSecretStore(userDataDir, safeStorage);
}
