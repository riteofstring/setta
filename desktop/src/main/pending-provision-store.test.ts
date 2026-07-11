import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import {
  PendingProvisionStore,
  pendingProvisionStoragePath,
  type PendingProvisionInput,
} from "./pending-provision-store";
import { MemoryRuntimeSecretStore } from "./runtime-secret-store";

describe("PendingProvisionStore", () => {
  test("persists pending provisions with secret refs instead of plaintext tokens", async () => {
    const userDataDir = await mkdtemp(join(tmpdir(), "setta-pending-provisions-"));
    const secrets = new MemoryRuntimeSecretStore();
    const store = new PendingProvisionStore(userDataDir, secrets);
    const input = pendingProvisionInput();

    await expect(store.upsert(input)).resolves.toMatchObject(input);

    await expect(store.read(input.provisionId)).resolves.toMatchObject(input);
    const rawText = await readFile(pendingProvisionStoragePath(userDataDir), "utf8");
    expect(rawText).not.toContain(input.pairingToken);
    expect(rawText).not.toContain(input.attestationKey);
    const raw = JSON.parse(rawText);
    expect(raw).toMatchObject({
      provisions: [
        {
          attestation_key_ref: "pending-provision:v1:provision_test:attestation-key",
          pairing_token_ref: "pending-provision:v1:provision_test:pairing-token",
          provision_id: "provision_test",
        },
      ],
      schema_version: 1,
    });
    await expect(
      secrets.getSecret("pending-provision:v1:provision_test:pairing-token"),
    ).resolves.toBe(input.pairingToken);
    await expect(
      secrets.getSecret("pending-provision:v1:provision_test:attestation-key"),
    ).resolves.toBe(input.attestationKey);
    const mode = (await stat(pendingProvisionStoragePath(userDataDir))).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  test("deletes pending provision secrets when records are removed", async () => {
    const userDataDir = await mkdtemp(join(tmpdir(), "setta-pending-provisions-"));
    const secrets = new MemoryRuntimeSecretStore();
    const store = new PendingProvisionStore(userDataDir, secrets);
    const input = pendingProvisionInput();

    await store.upsert(input);
    await store.delete(input.provisionId);

    await expect(store.readAll()).resolves.toEqual([]);
    await expect(
      secrets.getSecret("pending-provision:v1:provision_test:pairing-token"),
    ).resolves.toBeNull();
    await expect(
      secrets.getSecret("pending-provision:v1:provision_test:attestation-key"),
    ).resolves.toBeNull();
  });
});

function pendingProvisionInput(): PendingProvisionInput {
  return {
    attestationKey: "attestation-key-000000000000000000000000",
    createdAt: "2026-07-07T10:00:00.000Z",
    expiresAt: "2026-07-07T11:00:00.000Z",
    pairingToken: "pairing-token-000000000000000000000000",
    provisionId: "provision_test",
    runtimeName: "setta-worker",
  };
}
