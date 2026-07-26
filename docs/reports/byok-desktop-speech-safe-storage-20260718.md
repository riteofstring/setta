# BYOK Desktop Speech Credentials SafeStorage Verification

Date: 2026-07-18

Plan: `docs/plans/byok-desktop-speech-credentials-20260717.md`

## Outcome

The BYOK vault has an actual macOS `safeStorage` result, deterministic policy
coverage for every accepted and rejected Linux backend, and a checked-in hosted
probe for macOS, Windows, and Linux. Actual Windows and Linux workflow artifacts
remain a pre-release gate for those platforms; they are not inferred from API
types or deterministic tests.

External runner availability is not an implementation-loop task. A local agent
must report missing platform access as an external blocker instead of starting
Docker Desktop, requesting privileges, probing OS credentials, or repeatedly
committing the same blocked status.

## Pinned API Contract

`desktop/package.json` pins Electron at `41.7.0`. Its checked-in type surface
provides:

- `safeStorage.isEncryptionAvailable()`;
- `safeStorage.encryptString()` and `safeStorage.decryptString()`;
- Linux-only `safeStorage.getSelectedStorageBackend()` values including
  `basic_text`, `gnome_libsecret`, `kwallet`, `kwallet5`, `kwallet6`, and
  `unknown`; and
- `safeStorage.setUsePlainTextEncryption()`, which Setta never calls.

The production policy is:

| Platform | Acceptance policy |
| --- | --- |
| macOS | Require encryption availability and successful encryption/decryption. |
| Windows | Require encryption availability and successful encryption/decryption. |
| Linux | Accept only `gnome_libsecret`, `kwallet`, `kwallet5`, or `kwallet6`; reject `basic_text`, `unknown`, unavailable encryption, and unrecognized backend names. |

## Actual macOS Probe

The probe runs after Electron `ready` and verifies encryption availability,
round-trip decryption, accepted policy, and ciphertext marker exclusion:

```sh
desktop/node_modules/.bin/electron \
  desktop/tests/electron/safe-storage-platform-probe.cjs \
  --assert-byok-supported \
  --assert-ciphertext-excludes-plaintext \
  --assert-encryption-available true \
  --assert-policy-reason os_backed_platform \
  --assert-policy-status accept \
  --assert-round-trip
```

Result on the implementation host:

```json
{
  "appReadyBeforeProbe": true,
  "arch": "arm64",
  "electronVersion": "41.7.0",
  "passwordStoreSwitch": null,
  "platform": "darwin",
  "safeStorage": {
    "ciphertextByteLength": 51,
    "ciphertextContainsPlaintext": false,
    "isEncryptionAvailable": true,
    "policy": {
      "reason": "os_backed_platform",
      "status": "accept"
    },
    "roundTrip": true,
    "selectedStorageBackend": null
  }
}
```

## Deterministic Adapter Coverage

The production adapter test is host-independent:

```sh
pnpm -C desktop exec vitest run src/main/speech-credential-vault.test.ts
```

Its Linux cases accept `gnome_libsecret`, `kwallet`, `kwallet5`, and `kwallet6`
and reject `basic_text`, `unknown`, unavailable encryption, and an unrecognized
future backend. Additional cases cover unavailable encryption, encrypt/decrypt
failure, corrupt ciphertext, atomic replacement/removal, and file permissions.

## Hosted Platform Probe

`.github/workflows/electron-safe-storage-platform-probe.yml` runs manually and
when relevant vault, probe, dependency, plan, or report files are pushed. It
uses the repository-pinned Electron and pnpm versions and uploads each JSON
result with a commit-pinned artifact action.

The matrix intentionally separates:

- macOS OS-backed encryption acceptance;
- Windows OS-backed encryption acceptance;
- the Linux runner's default selected backend as an observation;
- Linux `gnome_libsecret` acceptance with an isolated D-Bus/keyring session;
  and
- forced Linux `basic_text` rejection with the exact backend and policy reason.

The workflow assertions fail loudly when a platform reports a different
backend, policy reason, availability result, round-trip result, or plaintext
marker result.

## External Pre-Release Gate

Before distributing Setta on Windows or Linux, collect successful artifacts
from the corresponding hosted jobs and review their exact JSON. Until those
artifacts exist, the implementation is complete but those platform releases
remain unverified.

This gate requires an authenticated repository push or manual workflow run. It
must not be satisfied by granting an unattended local implementation loop
Keychain access, GitHub credentials, administrator privileges, or Docker
Desktop control.

## Production Adapter Requirements

- Construct the adapter only after Electron `ready`.
- Check `safeStorage.isEncryptionAvailable()` before encrypting or decrypting.
- On Linux, inspect the selected backend and reject every value not in the
  explicit supported set.
- Never call `safeStorage.setUsePlainTextEncryption(true)`.
- Persist only ciphertext and never duplicate the key in Go app data.
- Surface unavailable or rejected protection as
  `secure_storage_unavailable`; do not fall back to plaintext.
