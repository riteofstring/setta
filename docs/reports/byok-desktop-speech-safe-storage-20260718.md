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

## 2026-07-18 Implementation-Pass Host Recheck

Before completing the next Phase 4 workflow item, the local platform options
were checked again:

- `docker info` reported Docker CLI `28.0.4`, but still could not connect to
  the Docker Desktop daemon at
  `unix:///Users/kevin/.docker/run/docker.sock`.
- `command -v docker gh colima lima podman qemu-system-x86_64 wine act
xvfb-run` found only `/usr/local/bin/docker`.

No Windows or Linux `safeStorage` host result is recorded from this recheck.
The host-confirmation item remains open and still requires actual supported
platform hosts.

## 2026-07-18 Latest Host Confirmation Attempt

The next incomplete plan item was revisited after the BYOK implementation work
was otherwise complete.

The pinned macOS probe was re-run:

```sh
desktop/node_modules/.bin/electron desktop/tests/electron/safe-storage-platform-probe.cjs --assert-byok-supported --assert-round-trip
```

It passed again on this machine:

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

The local machine still cannot produce the remaining Linux or Windows host
evidence:

- `docker version && docker info` found Docker CLI `28.0.4`, context
  `desktop-linux`, but the CLI still could not connect to the Docker Desktop
  daemon at `unix:///Users/kevin/.docker/run/docker.sock`.
- Docker Desktop processes were running, but the daemon did not become
  available during a bounded wait. The visible process state showed Docker
  Desktop waiting on its privileged setup prompt, so this pass did not force a
  system-level change.
- `command -v docker gh colima lima limactl podman qemu-system-x86_64
qemu-aarch64 wine act xvfb-run brew` found only `/usr/local/bin/docker` and
  `/opt/homebrew/bin/brew`; no local Linux VM/container runner or Windows
  execution runner was available.
- The repository has no `.github/workflows` directory to reuse for hosted
  probes, the available GitHub API credential returned `401`, the Git SSH
  remote failed with public-key authentication, and the GitHub plugin was not
  connected in this session.
- The reference Codex repository at
  `/Users/kevin/Documents/AppDevelopment/reference_repos/codex` still did not
  provide an Electron `safeStorage` host probe pattern to reuse.

No Windows or Linux `safeStorage` host result is recorded from this attempt.
The Phase 0 host-confirmation item remains open because the missing results
require actual Windows and Linux hosts, not Electron type definitions,
documentation, or source inference.

Open Phase 0 host confirmations:

- Run the probe on Windows and record the `isEncryptionAvailable()` result.
- Run the probe on Linux with the host's default password store and record the
  selected backend.
- Run the Linux `--password-store=basic` command and record the rejected
  `linux_basic_text_backend` policy result.

## 2026-07-18 Additional Platform Confirmation Pass

The remaining Phase 0 host-confirmation item was revisited again while the BYOK
plan stayed open.

The pinned macOS probe was re-run:

```sh
desktop/node_modules/.bin/electron desktop/tests/electron/safe-storage-platform-probe.cjs --assert-byok-supported --assert-round-trip
```

It still passes on this machine:

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

The local machine still cannot produce the remaining Linux or Windows host
evidence:

- `docker version` and `docker info` still cannot connect to the Docker daemon
  at `unix:///Users/kevin/.docker/run/docker.sock`.
- Docker Desktop processes are running, but the visible process state still
  shows Docker Desktop stopped on its privileged setup prompt.
- `command -v docker gh colima lima limactl podman qemu-system-x86_64
qemu-aarch64 wine act xvfb-run brew` found only `/usr/local/bin/docker` and
  `/opt/homebrew/bin/brew`.
- No installed VM helper was found on `PATH` among `orb`, `orbstack`,
  `multipass`, `parallels`, `prlctl`, `VBoxManage`, `vmrun`, `utmctl`,
  `tart`, or `vagrant`.
- A non-interactive `git ls-remote --heads origin` check did not return within
  the bounded probe window, so this session still has no usable
  GitHub-hosted-runner path.
- The reference Codex repository at
  `/Users/kevin/Documents/AppDevelopment/reference_repos/codex` does not
  contain an Electron `safeStorage`, `safe-storage`, `password-store`, or
  `basic_text` probe pattern to reuse.

No Windows or Linux `safeStorage` host result is recorded from this pass. The
Phase 0 host-confirmation item remains open because the missing confirmations
require actual Windows and Linux Electron hosts.

## 2026-07-18 Adapter Policy Actionability Pass

The remaining Phase 0 host-confirmation item was checked again while handling
the next incomplete plan step.

The pinned macOS probe still passes:

```sh
desktop/node_modules/.bin/electron desktop/tests/electron/safe-storage-platform-probe.cjs --assert-byok-supported --assert-round-trip
```

Result:

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

The local machine still cannot produce the remaining Linux or Windows host
evidence:

- `docker version` and `docker info` still cannot connect to the Docker daemon
  at `unix:///Users/kevin/.docker/run/docker.sock`.
- `command -v docker gh colima lima limactl podman qemu-system-x86_64
qemu-aarch64 wine act xvfb-run brew` found only `/usr/local/bin/docker` and
  `/opt/homebrew/bin/brew`.
- Non-interactive Git SSH authentication to the configured origin failed with
  `Permission denied (publickey)`.
- The GitHub connector was suggested as a possible hosted-runner path but was
  not connected in this session.
- The reference Codex repository at
  `/Users/kevin/Documents/AppDevelopment/reference_repos/codex` still does not
  contain an Electron `safeStorage`, `safe-storage`, `password-store`, or
  `basic_text` probe pattern to reuse.

No Windows or Linux `safeStorage` host result is recorded from this pass. The
Phase 0 host-confirmation item remains open because those confirmations require
actual Windows and Linux Electron hosts.

One deterministic implementation gap related to the open item was found and
closed: the standalone probe already rejected unrecognized Linux backend names,
but the production `safeStorage` adapter only rejected `basic_text` and
`unknown`. The adapter now accepts only `gnome_libsecret`, `kwallet`,
`kwallet5`, and `kwallet6`, and the vault test covers an unexpected
`future_secret_service` backend string. Verified with:

```sh
pnpm -C desktop exec vitest run src/main/speech-credential-vault.test.ts
```

## 2026-07-18 Current Local Host Recheck

The remaining Phase 0 host-confirmation item was revisited again.

The pinned macOS probe was re-run:

```sh
desktop/node_modules/.bin/electron desktop/tests/electron/safe-storage-platform-probe.cjs --assert-byok-supported --assert-round-trip
```

It still passes on this machine:

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

The local machine still cannot produce the remaining Linux or Windows host
evidence:

- `docker version` and `docker info` still cannot connect to the Docker daemon
  at `unix:///Users/kevin/.docker/run/docker.sock`.
- Docker Desktop processes are running, but the process state still shows an
  `osascript` administrator prompt for privileged port-mapping setup.
- `command -v docker gh colima lima limactl podman qemu-system-x86_64
qemu-aarch64 wine act xvfb-run brew orb orbstack multipass parallels prlctl
VBoxManage vmrun utmctl tart vagrant` found only `/usr/local/bin/docker` and
  `/opt/homebrew/bin/brew`.
- `brew list --formula` and `brew list --cask` did not show an installed
  Windows/Linux VM or container helper from that runner set.
- The repo still has no `.github` directory to provide a hosted-runner workflow
  path.
- A non-interactive `git ls-remote --heads origin` probe did not complete
  within the bounded window and was interrupted.
- The GitHub connector was suggested as a possible hosted-runner path, but it
  was not connected in this session.
- The reference Codex repository at
  `/Users/kevin/Documents/AppDevelopment/reference_repos/codex` still does not
  contain an Electron `safeStorage`, `safe-storage`, `password-store`, or
  `basic_text` probe pattern to reuse.

No Windows or Linux `safeStorage` host result is recorded from this recheck.
The Phase 0 host-confirmation item remains open because the missing
confirmations require actual Windows and Linux Electron hosts.

## 2026-07-18 Follow-Up Host Recheck

The remaining Phase 0 host-confirmation item was revisited as the next
incomplete plan step.

The pinned macOS probe was re-run:

```sh
desktop/node_modules/.bin/electron desktop/tests/electron/safe-storage-platform-probe.cjs --assert-byok-supported --assert-round-trip
```

It still passes on this machine:

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

The local machine still cannot produce the remaining Linux or Windows host
evidence:

- `docker version` and `docker info` found Docker CLI `28.0.4`, context
  `desktop-linux`, but still could not connect to the Docker daemon at
  `unix:///Users/kevin/.docker/run/docker.sock`.
- `docker desktop status` could not retrieve status, and `docker desktop start`
  reported Docker Desktop is already running. The visible process state still
  shows an `osascript` administrator prompt for Docker Desktop's privileged
  port-mapping setup.
- `command -v docker gh colima lima limactl podman qemu-system-x86_64
qemu-aarch64 wine act xvfb-run brew orb orbstack multipass parallels prlctl
VBoxManage vmrun utmctl tart vagrant` found only `/usr/local/bin/docker` and
  `/opt/homebrew/bin/brew`.
- `brew list --formula` and `brew list --cask` did not show an installed
  Windows/Linux VM or container helper from that runner set.
- The repo still has no `.github` directory to provide a hosted-runner workflow
  path.
- Noninteractive Git SSH authentication to the configured origin failed with
  `Permission denied (publickey)`.
- A GitHub connector was suggested as a possible hosted-runner path, but it was
  not connected in this session.
- The reference Codex repository at
  `/Users/kevin/Documents/AppDevelopment/reference_repos/codex` still does not
  contain an Electron `safeStorage`, `safe-storage`, `password-store`, or
  `basic_text` probe pattern to reuse.

No Windows or Linux `safeStorage` host result is recorded from this recheck.
The Phase 0 host-confirmation item remains open because the missing
confirmations require actual Windows and Linux Electron hosts.

## Phase 2 Adapter Requirements

- The production adapter is constructed only after Electron `ready`.
- It calls `safeStorage.isEncryptionAvailable()` before encrypting or
  decrypting.
- On Linux it also calls `safeStorage.getSelectedStorageBackend()` and rejects
  `basic_text`, `unknown`, and any unrecognized value.
- It never calls `safeStorage.setUsePlainTextEncryption(true)`.
- Tests inject the protection interface so `basic_text`, `unknown`,
  unavailable encryption, encrypt failure, and decrypt failure are deterministic
  without relying on the developer's host platform.
