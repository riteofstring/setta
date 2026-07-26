import { safeStorage } from "electron";

import { SafeStorageFileCredentialSecretStore } from "./safe-storage-credential-secret-store";

export function createElectronCredentialSecretStore(
  userDataDir: string,
): SafeStorageFileCredentialSecretStore {
  return new SafeStorageFileCredentialSecretStore(userDataDir, safeStorage);
}
