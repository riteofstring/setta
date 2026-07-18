# BYOK Desktop Speech Credentials SafeStorage Probe

Date: 2026-07-18

Plan: `docs/plans/byok-desktop-speech-credentials-20260717.md`

## Scope

This records the Phase 0 safeStorage contract evidence available in this
iteration before implementing the BYOK vault. It confirms the pinned Electron
API surface, records a local macOS probe, and adds a repeatable probe that
Phase 2 can reuse when validating the production adapter.

Setta's current desktop scripts run Electron directly from the pinned desktop
dependency. The supported Electron runtime platforms for this check are
`darwin`, `win32`, and `linux`.

## Sources

- `desktop/package.json` pins Electron at `41.7.0`.
- `desktop/node_modules/electron/electron.d.ts` exposes:
  - `safeStorage.isEncryptionAvailable()`;
  - `safeStorage.encryptString()` / `decryptString()`;
  - Linux-only `safeStorage.getSelectedStorageBackend()` with
    `basic_text`, `gnome_libsecret`, `kwallet`, `kwallet5`, `kwallet6`, and
    `unknown`;
  - `safeStorage.setUsePlainTextEncryption()`, which the vault must never call.
- `desktop/tests/electron/safe-storage-platform-probe.cjs` records the actual
  runtime values after Electron `ready`.

## Local Probe

Command:

```sh
desktop/node_modules/.bin/electron desktop/tests/electron/safe-storage-platform-probe.cjs --assert-byok-supported --assert-round-trip
```

Result on this machine:

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

macOS therefore satisfies the future vault requirements on this machine:
construct after `ready`, require encryption availability, encrypt before file
I/O, and treat operation failures as explicit secure-storage failures.

## Required Platform Contract

| Platform        | Current evidence                                                                                                                                          | BYOK vault policy                                                                                                                                            |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| macOS `darwin`  | Local Electron 41.7.0 probe after `ready` reports encryption available, successful round-trip, and ciphertext that does not contain the marker plaintext. | Accept when `isEncryptionAvailable()` is true; otherwise surface `secure_storage_unavailable`.                                                               |
| Windows `win32` | Pinned Electron API has no Windows backend selector; a Windows host probe is still required.                                                              | Construct after `ready`, require `isEncryptionAvailable()`, and fail explicitly on unavailable encryption or encrypt/decrypt errors.                         |
| Linux `linux`   | Pinned Electron API exposes the actual selected backend only after `ready` through `getSelectedStorageBackend()`; Linux host probes are still required.   | Accept only `gnome_libsecret`, `kwallet`, `kwallet5`, or `kwallet6`; reject `basic_text`, `unknown`, unavailable encryption, and unrecognized backend names. |

The Linux backend is host-dependent and must be checked at runtime. The probe
prints the actual selected backend for a Linux host. To prove the plaintext
fallback failure path on Linux, run:

```sh
desktop/node_modules/.bin/electron --password-store=basic desktop/tests/electron/safe-storage-platform-probe.cjs --assert-byok-supported
```

That command must fail with policy reason `linux_basic_text_backend` when
Electron selects `basic_text`. The Phase 2 production adapter must present this
as `secure_storage_unavailable`; it must not call
`safeStorage.setUsePlainTextEncryption(true)` and must not persist ciphertext
created under `basic_text` or `unknown`.

## 2026-07-18 Host Confirmation Attempt

The local machine for this iteration is macOS arm64, so it can run the
`darwin` probe above but cannot directly execute the Windows or Linux Electron
binaries.

Available local cross-platform execution paths were checked:

- Docker CLI is installed (`28.0.4`), but `docker info` could not connect to
  the Docker Desktop daemon at
  `unix:///Users/kevin/.docker/run/docker.sock`.
- `open -a Docker` and `docker desktop start` were attempted; Docker Desktop
  reported that it was already running, but the daemon socket still did not
  become available during a bounded wait.
- `podman`, `colima`, `lima`, `qemu-system-x86_64`, `qemu-aarch64`,
  `xvfb-run`, and `wine` were not present on `PATH`.
- The reference Codex repository at
  `/Users/kevin/Documents/AppDevelopment/reference_repos/codex` does not
  contain an Electron `safeStorage` or Linux `basic_text` probe pattern to
  reuse.

No Windows or Linux `safeStorage` host result is recorded from this attempt.
The Phase 0 host-confirmation item therefore remains open.

## 2026-07-18 Current Host Recheck

The next implementation pass rechecked available execution paths before moving
to the next actionable Phase 1 item:

- `docker info` still could not connect to the Docker Desktop daemon at
  `unix:///Users/kevin/.docker/run/docker.sock`.
- `gh` was not available on `PATH`.
- `colima`, `lima`, `podman`, `qemu-system-x86_64`, `wine`, and `act` were
  still not available on `PATH`.

No Windows or Linux `safeStorage` host result is recorded from this recheck.
The host-confirmation item remains open rather than inferred from docs or
source.

Open Phase 0 host confirmations:

- Run the probe on Windows and record the `isEncryptionAvailable()` result.
- Run the probe on Linux with the host's default password store and record the
  selected backend.
- Run the Linux `--password-store=basic` command and record the rejected
  `linux_basic_text_backend` policy result.

## Follow-Up Requirements For Phase 2

- The production adapter must be constructed only after Electron `ready`.
- It must call `safeStorage.isEncryptionAvailable()` before encrypting or
  decrypting.
- On Linux it must also call `safeStorage.getSelectedStorageBackend()` and
  reject `basic_text`, `unknown`, and any unrecognized value.
- It must never call `safeStorage.setUsePlainTextEncryption(true)`.
- Tests should inject the protection interface so `basic_text`, `unknown`,
  unavailable encryption, encrypt failure, and decrypt failure are deterministic
  without relying on the developer's host platform.
