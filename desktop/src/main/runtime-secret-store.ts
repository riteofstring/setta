export interface RuntimeSecretStorageStatus {
  backend: string;
  message: string | null;
  security: "encrypted" | "plaintext-equivalent" | "unavailable";
}

export interface RuntimeSecretStore {
  deleteSecret(ref: string): Promise<void>;
  getSecret(ref: string): Promise<string | null>;
  setSecret(ref: string, value: string): Promise<void>;
  status(): RuntimeSecretStorageStatus;
}

export class MemoryRuntimeSecretStore implements RuntimeSecretStore {
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

  status(): RuntimeSecretStorageStatus {
    return {
      backend: "memory",
      message: "Runtime secrets are stored in memory for tests.",
      security: "encrypted",
    };
  }
}
