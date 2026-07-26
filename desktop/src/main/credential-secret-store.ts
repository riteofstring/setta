export interface CredentialSecretStorageStatus {
  backend: string;
  message: string | null;
  security: "encrypted" | "plaintext-equivalent" | "unavailable";
}

export interface CredentialSecretStore {
  deleteSecret(ref: string): Promise<void>;
  getSecret(ref: string): Promise<string | null>;
  setSecret(ref: string, value: string): Promise<void>;
  status(): CredentialSecretStorageStatus;
}

export class MemoryCredentialSecretStore implements CredentialSecretStore {
  private readonly secrets = new Map<string, string>();

  constructor(initialSecrets: Iterable<readonly [string, string]> = []) {
    for (const [ref, value] of initialSecrets) {
      this.secrets.set(ref, value);
    }
  }

  async deleteSecret(ref: string): Promise<void> {
    this.secrets.delete(ref);
  }

  async getSecret(ref: string): Promise<string | null> {
    return this.secrets.get(ref) ?? null;
  }

  async setSecret(ref: string, value: string): Promise<void> {
    this.secrets.set(ref, value);
  }

  status(): CredentialSecretStorageStatus {
    return {
      backend: "memory",
      message: "Desktop credential secrets are stored in memory for tests.",
      security: "encrypted",
    };
  }
}
