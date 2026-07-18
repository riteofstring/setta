/* eslint-disable @typescript-eslint/no-require-imports */
/* global Buffer, console, process, require */

const { app, safeStorage } = require("electron");

const marker = "setta-safe-storage-phase0-marker-v1";
const linuxBackends = new Set(["gnome_libsecret", "kwallet", "kwallet5", "kwallet6"]);

function byokSafeStoragePolicy(platform, encryptionAvailable, selectedStorageBackend) {
  if (!encryptionAvailable) {
    return { reason: "encryption_unavailable", status: "reject" };
  }
  if (platform !== "linux") {
    return { reason: "os_backed_platform", status: "accept" };
  }
  if (selectedStorageBackend === null || selectedStorageBackend === "unknown") {
    return { reason: "linux_backend_unknown", status: "reject" };
  }
  if (selectedStorageBackend === "basic_text") {
    return { reason: "linux_basic_text_backend", status: "reject" };
  }
  if (linuxBackends.has(selectedStorageBackend)) {
    return { reason: "linux_secret_service_backend", status: "accept" };
  }
  return { reason: "linux_unrecognized_backend", status: "reject" };
}

async function probeSafeStorage() {
  await app.whenReady();

  const platform = process.platform;
  const selectedStorageBackend =
    platform === "linux" ? safeStorage.getSelectedStorageBackend() : null;
  const encryptionAvailable = safeStorage.isEncryptionAvailable();
  const policy = byokSafeStoragePolicy(platform, encryptionAvailable, selectedStorageBackend);
  const encrypted = encryptionAvailable ? safeStorage.encryptString(marker) : null;
  const decrypted = encrypted ? safeStorage.decryptString(encrypted) : null;

  return {
    appReadyBeforeProbe: true,
    arch: process.arch,
    electronVersion: process.versions.electron,
    passwordStoreSwitch: app.commandLine.getSwitchValue("password-store") || null,
    platform,
    safeStorage: {
      ciphertextByteLength: encrypted ? encrypted.byteLength : null,
      ciphertextContainsPlaintext: encrypted ? encrypted.includes(Buffer.from(marker)) : null,
      isEncryptionAvailable: encryptionAvailable,
      policy,
      roundTrip: decrypted === marker,
      selectedStorageBackend,
    },
  };
}

probeSafeStorage()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    if (
      process.argv.includes("--assert-byok-supported") &&
      result.safeStorage.policy.status !== "accept"
    ) {
      console.error(`safeStorage BYOK policy rejected: ${result.safeStorage.policy.reason}`);
      process.exitCode = 1;
    }
    if (process.argv.includes("--assert-round-trip") && result.safeStorage.roundTrip !== true) {
      console.error("safeStorage round-trip failed");
      process.exitCode = 1;
    }
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => {
    app.quit();
  });
