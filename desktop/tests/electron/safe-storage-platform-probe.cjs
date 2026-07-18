/* eslint-disable @typescript-eslint/no-require-imports */
/* global Buffer, console, process, require */

const { app, safeStorage } = require("electron");

const marker = "setta-safe-storage-phase0-marker-v1";
const policyStatuses = new Set(["accept", "reject"]);
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
    applyAssertions(result, parseAssertions(process.argv));
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => {
    app.exit(process.exitCode ?? 0);
  });

function parseAssertions(argv) {
  const expectedPolicyStatus = optionalArgumentValue(argv, "--assert-policy-status");
  if (expectedPolicyStatus !== null && !policyStatuses.has(expectedPolicyStatus)) {
    throw new Error(`--assert-policy-status must be accept or reject: ${expectedPolicyStatus}`);
  }

  return {
    byokSupported: argv.includes("--assert-byok-supported"),
    expectedPolicyReason: optionalArgumentValue(argv, "--assert-policy-reason"),
    expectedPolicyStatus,
    roundTrip: argv.includes("--assert-round-trip"),
  };
}

function optionalArgumentValue(argv, flag) {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return null;
  }
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function applyAssertions(result, assertions) {
  if (assertions.byokSupported && result.safeStorage.policy.status !== "accept") {
    markFailed(`safeStorage BYOK policy rejected: ${result.safeStorage.policy.reason}`);
  }
  if (
    assertions.expectedPolicyStatus !== null &&
    result.safeStorage.policy.status !== assertions.expectedPolicyStatus
  ) {
    markFailed(
      `safeStorage policy status was ${result.safeStorage.policy.status}, expected ${assertions.expectedPolicyStatus}`,
    );
  }
  if (
    assertions.expectedPolicyReason !== null &&
    result.safeStorage.policy.reason !== assertions.expectedPolicyReason
  ) {
    markFailed(
      `safeStorage policy reason was ${result.safeStorage.policy.reason}, expected ${assertions.expectedPolicyReason}`,
    );
  }
  if (assertions.roundTrip && result.safeStorage.roundTrip !== true) {
    markFailed("safeStorage round-trip failed");
  }
}

function markFailed(message) {
  console.error(message);
  process.exitCode = 1;
}
