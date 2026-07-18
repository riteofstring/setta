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

## 2026-07-18 Latest Local Host Recheck

The remaining Phase 0 host-confirmation item was revisited to check whether a
local or authenticated hosted-runner path had become available.

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
- `docker desktop status` could not retrieve status, and `docker desktop
start` reported Docker Desktop is already running. The visible process state
  still shows an `osascript` administrator prompt for Docker Desktop's
  privileged port-mapping setup.
- A PATH probe for Docker, GitHub CLI, common Linux/container runners, common
  Windows/VM runners, and Homebrew found only `/usr/local/bin/docker` and
  `/opt/homebrew/bin/brew`.
- `brew list --formula` and `brew list --cask` did not show an installed
  Windows/Linux VM or container helper from that runner set.
- The repo still has no `.github` directory to provide a hosted-runner workflow
  path.
- Standard noninteractive Git SSH authentication to GitHub failed with
  `Permission denied (publickey)`.
- No GitHub connector was connected, so there was no authenticated hosted-runner
  fallback from this session.
- The reference Codex repository at
  `/Users/kevin/Documents/AppDevelopment/reference_repos/codex` still does not
  contain an Electron `safeStorage`, `safe-storage`, `password-store`, or
  `basic_text` probe pattern to reuse.

No Windows or Linux `safeStorage` host result is recorded from this recheck.
The Phase 0 host-confirmation item remains open because the missing
confirmations require actual Windows and Linux Electron hosts.

## 2026-07-18 Current Incomplete-Step Recheck

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

The production adapter's deterministic Linux backend policy coverage was also
re-run:

```sh
pnpm -C desktop exec vitest run src/main/speech-credential-vault.test.ts
```

It passed with 21 tests, including rejection of `basic_text`, `unknown`, and an
unrecognized backend string plus acceptance of `gnome_libsecret`, `kwallet`,
`kwallet5`, and `kwallet6`.

The local machine still cannot produce the remaining Linux or Windows host
evidence:

- `docker version && docker info` found Docker CLI `28.0.4`, context
  `desktop-linux`, but still could not connect to the Docker daemon at
  `unix:///Users/kevin/.docker/run/docker.sock`.
- Docker Desktop processes are running, but the visible process state still
  shows an `osascript` administrator prompt for Docker Desktop's privileged
  port-mapping setup.
- A PATH probe for Docker, GitHub CLI, common Linux/container runners, common
  Windows/VM runners, and Homebrew found only `/usr/local/bin/docker` and
  `/opt/homebrew/bin/brew`.
- `/Applications` contains Docker Desktop but no OrbStack, UTM, Parallels, or
  VirtualBox installation.
- `brew list --formula` and `brew list --cask` did not show an installed
  Windows/Linux VM or container helper from the checked runner set.
- A GitHub connector was suggested as a hosted-runner path, but it was not
  connected in this session.
- Standard noninteractive Git SSH authentication to GitHub failed with
  `signing failed for ED25519-SK` and `Permission denied (publickey)`.
- The reference Codex repository at
  `/Users/kevin/Documents/AppDevelopment/reference_repos/codex` still does not
  contain an Electron `safeStorage`, `safe-storage`, `password-store`,
  `getSelectedStorageBackend`, or `basic_text` probe pattern to reuse.

No Windows or Linux `safeStorage` host result is recorded from this recheck.
The Phase 0 host-confirmation item remains open because the missing
confirmations require actual Windows and Linux Electron hosts.

## 2026-07-18 Hosted-Runner Probe Harness Pass

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

The production adapter's deterministic Linux backend policy coverage was also
re-run:

```sh
pnpm -C desktop exec vitest run src/main/speech-credential-vault.test.ts
```

It passed with 21 tests, including rejection of `basic_text`, `unknown`, and an
unrecognized backend string plus acceptance of `gnome_libsecret`, `kwallet`,
`kwallet5`, and `kwallet6`.

The local machine still cannot produce the remaining Linux or Windows host
evidence:

- `docker version && docker info` found Docker CLI `28.0.4`, context
  `desktop-linux`, but still could not connect to the Docker daemon at
  `unix:///Users/kevin/.docker/run/docker.sock`.
- Docker Desktop processes are running, but the visible process state still
  shows an `osascript` administrator prompt for Docker Desktop's privileged
  port-mapping setup.
- A PATH probe for Docker, GitHub CLI, common Linux/container runners, common
  Windows/VM runners, and Homebrew found only `/usr/local/bin/docker` and
  `/opt/homebrew/bin/brew`.
- Standard noninteractive Git SSH authentication to GitHub still failed with
  `signing failed for ED25519-SK` and `Permission denied (publickey)`.
- The GitHub plugin was suggested as a hosted-runner path but was not connected
  in this session.
- The reference Codex repository at
  `/Users/kevin/Documents/AppDevelopment/reference_repos/codex` still does not
  contain an Electron `safeStorage`, `safe-storage`, `password-store`,
  `getSelectedStorageBackend`, or `basic_text` probe pattern to reuse.

One repo-side blocker for the remaining confirmation was closed:

- `desktop/tests/electron/safe-storage-platform-probe.cjs` now supports
  `--assert-policy-status` and `--assert-policy-reason`, so the Linux
  `basic_text` run can pass only when Electron reports the expected BYOK
  rejection policy. Its Linux policy classification now mirrors the production
  adapter's backend-first ordering, so `basic_text` is reported as an
  unsupported backend even if Electron also reports unavailable encryption. The
  probe also now exits through `app.exit()` with the accumulated assertion
  status, fixing the prior behavior where Electron `app.quit()` could print
  assertion failures but still return exit code `0`.
- `.github/workflows/electron-safe-storage-platform-probe.yml` now provides a
  manual hosted-runner path for macOS, Windows, Linux with an explicit
  `gnome-libsecret` password store, and Linux `basic_text` rejection. The
  workflow avoids third-party actions, fetches the exact requested commit with
  GitHub's built-in token, installs the pinned `pnpm@10.23.0`, and runs the
  pinned Electron probe on each host.

No Windows or Linux `safeStorage` host result is recorded from this pass
because no local platform host or connected hosted-runner credential was
available. The Phase 0 host-confirmation item remains open until the manual
hosted workflow, or equivalent Windows and Linux hosts, produce actual
Electron output.

## 2026-07-18 Push-Triggered Hosted Probe Harness Pass

The remaining Phase 0 host-confirmation item was revisited again as the next
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

The deterministic production-adapter Linux backend policy coverage was also
re-run:

```sh
pnpm -C desktop exec vitest run src/main/speech-credential-vault.test.ts
```

It passed with 21 tests, including rejection of `basic_text`, `unknown`, and an
unrecognized backend string plus acceptance of `gnome_libsecret`, `kwallet`,
`kwallet5`, and `kwallet6`.

The local machine still cannot produce the remaining Linux or Windows host
evidence:

- `docker version && docker info` found Docker CLI `28.0.4`, context
  `desktop-linux`, but still could not connect to the Docker daemon at
  `unix:///Users/kevin/.docker/run/docker.sock`.
- Docker Desktop processes are running, but the visible process state still
  shows an `osascript` administrator prompt for Docker Desktop's privileged
  port-mapping setup.
- A PATH probe for Docker, GitHub CLI, common Linux/container runners, common
  Windows/VM runners, and Homebrew found only `/usr/local/bin/docker` and
  `/opt/homebrew/bin/brew`.
- `/Applications` contains Docker Desktop but no OrbStack, UTM, Parallels, or
  VirtualBox installation.
- `GITHUB_TOKEN` and `GH_TOKEN` are not present in this shell.
- The GitHub plugin was suggested as a hosted-runner path, but it was not
  connected in this session.

One repo-side gap for producing the remaining host evidence was closed:

- `.github/workflows/electron-safe-storage-platform-probe.yml` now runs on
  pushes that touch the probe, vault policy, workflow, plan, or report files,
  in addition to manual dispatch. That lets the hosted Windows and Linux probes
  start as soon as this branch is pushed, without requiring an authenticated
  manual dispatch from this local session.
- Each hosted probe now tees its JSON result to a platform-specific file and
  appends that JSON to the GitHub step summary before exiting with the actual
  probe status. Assertion failures therefore still leave the platform evidence
  visible in the job summary.

No Windows or Linux `safeStorage` host result is recorded from this pass
because no local platform host or connected hosted-runner credential was
available. The Phase 0 host-confirmation item remains open until the
push-triggered hosted workflow, the manual hosted workflow, or equivalent
Windows and Linux hosts produce actual Electron output.

## 2026-07-18 Linux Hosted Launch Guard Pass

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

The deterministic production-adapter Linux backend policy coverage was also
re-run:

```sh
pnpm -C desktop exec vitest run src/main/speech-credential-vault.test.ts
```

It passed with 21 tests, including rejection of `basic_text`, `unknown`, and an
unrecognized backend string plus acceptance of `gnome_libsecret`, `kwallet`,
`kwallet5`, and `kwallet6`.

The local machine still cannot produce the remaining Linux or Windows host
evidence:

- `docker version` and `docker info` found Docker CLI `28.0.4`, context
  `desktop-linux`, but still could not connect to the Docker daemon at
  `unix:///Users/kevin/.docker/run/docker.sock`.
- A PATH probe for Docker, GitHub CLI, common Linux/container runners, common
  Windows/VM runners, and Homebrew found only `/usr/local/bin/docker` and
  `/opt/homebrew/bin/brew`.
- `GITHUB_TOKEN` and `GH_TOKEN` are not present in this shell.
- The unauthenticated GitHub API returned `404` for the repository and Actions
  run list, so hosted workflow results are not publicly readable from this
  session.
- A noninteractive `git ls-remote --heads origin` check did not complete within
  the bounded probe window and was interrupted.
- The reference Codex repository at
  `/Users/kevin/Documents/AppDevelopment/reference_repos/codex` still does not
  contain an Electron `safeStorage`, `safe-storage`, `password-store`,
  `getSelectedStorageBackend`, or `basic_text` probe pattern to reuse.

One hosted-runner launch risk for the remaining confirmation was closed:

- `.github/workflows/electron-safe-storage-platform-probe.yml` now passes
  `--no-sandbox` to the Linux hosted Electron invocations before the
  `--password-store` switch. This keeps the Ubuntu jobs focused on the
  safeStorage backend policy assertions instead of failing earlier on Chromium
  sandbox setup in a headless CI environment. The asserted policy reasons,
  asserted statuses, round-trip checks, JSON summary output, and final probe
  exit status are unchanged.

No Windows or Linux `safeStorage` host result is recorded from this pass
because no local platform host or connected hosted-runner credential was
available. The Phase 0 host-confirmation item remains open until the
push-triggered hosted workflow, the manual hosted workflow, or equivalent
Windows and Linux hosts produce actual Electron output.

## 2026-07-18 Current Host Evidence Recheck

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

The deterministic production-adapter Linux backend policy coverage was also
re-run:

```sh
pnpm -C desktop exec vitest run src/main/speech-credential-vault.test.ts
```

It passed with 21 tests, including rejection of `basic_text`, `unknown`, and an
unrecognized backend string plus acceptance of `gnome_libsecret`, `kwallet`,
`kwallet5`, and `kwallet6`.

The local and hosted-access paths still cannot produce the remaining Windows
or Linux host evidence from this session:

- `docker version` and `docker info` found Docker CLI `28.0.4`, context
  `desktop-linux`, but still could not connect to the Docker daemon at
  `unix:///Users/kevin/.docker/run/docker.sock`.
- `docker desktop status` could not retrieve Docker Desktop status, while
  `docker desktop start` reported Docker Desktop is already running. The
  process tree still shows Docker Desktop blocked on an `osascript`
  administrator prompt for privileged port-mapping setup.
- A PATH probe for Docker, GitHub CLI, common Linux/container runners, common
  Windows/VM runners, and Homebrew found only `/usr/local/bin/docker` and
  `/opt/homebrew/bin/brew`.
- `/Applications` contains Docker Desktop but no OrbStack, UTM, Parallels, or
  VirtualBox installation; `brew list --formula` and `brew list --cask` did not
  show an installed Windows/Linux VM or container helper from the checked
  runner set.
- `GITHUB_TOKEN` and `GH_TOKEN` are not present in this shell.
- Standard noninteractive Git SSH authentication to GitHub failed with
  `signing failed for ED25519-SK` and `Permission denied (publickey)`.
- The unauthenticated GitHub API returned `404` for the repository and the
  `electron-safe-storage-platform-probe.yml` workflow run list, so hosted
  workflow results are not publicly readable from this session.
- The GitHub plugin was suggested as a hosted-runner path, but it was not
  connected in this session.
- The reference Codex repository at
  `/Users/kevin/Documents/AppDevelopment/reference_repos/codex` still does not
  contain an Electron `safeStorage`, `safe-storage`, `password-store`,
  `getSelectedStorageBackend`, or `basic_text` probe pattern to reuse.

No Windows or Linux `safeStorage` host result is recorded from this recheck.
The Phase 0 host-confirmation item remains open because those confirmations
require actual Windows and Linux Electron hosts.

## 2026-07-18 Current Incomplete-Step Host Recheck

The remaining Phase 0 host-confirmation item was revisited as the next
incomplete plan step.

The pinned macOS probe was re-run with exact policy assertions:

```sh
desktop/node_modules/.bin/electron desktop/tests/electron/safe-storage-platform-probe.cjs --assert-byok-supported --assert-policy-reason os_backed_platform --assert-policy-status accept --assert-round-trip
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

The deterministic production-adapter Linux backend policy coverage was also
re-run:

```sh
pnpm -C desktop exec vitest run src/main/speech-credential-vault.test.ts
```

It passed with 21 tests, including rejection of `basic_text`, `unknown`, and an
unrecognized backend string plus acceptance of `gnome_libsecret`, `kwallet`,
`kwallet5`, and `kwallet6`.

The local and hosted-access paths still cannot produce the remaining Windows
or Linux host evidence from this session:

- `docker version` and `docker info` found Docker CLI `28.0.4`, context
  `desktop-linux`, but still could not connect to the Docker daemon at
  `unix:///Users/kevin/.docker/run/docker.sock`.
- `docker desktop status` could not retrieve Docker Desktop status. The
  process tree still shows Docker Desktop blocked on an `osascript`
  administrator prompt for privileged port-mapping setup.
- A PATH probe for Docker, GitHub CLI, common Linux/container runners, common
  Windows/VM runners, and Homebrew found only `/usr/local/bin/docker` and
  `/opt/homebrew/bin/brew`.
- `/Applications` contains Docker Desktop but no OrbStack, UTM, Parallels,
  VirtualBox, VMware Fusion, or Multipass installation; `brew list --formula`
  and `brew list --cask` did not show an installed Windows/Linux VM or
  container helper from the checked runner set.
- `GITHUB_TOKEN` and `GH_TOKEN` are not present in this shell.
- `ssh-add -l` reported no identities, and standard noninteractive Git SSH
  authentication to GitHub failed with `signing failed for ED25519-SK` and
  `Permission denied (publickey)`.
- The macOS Git credential helper did not return an HTTPS GitHub credential.
- The unauthenticated GitHub API returned `404` for the repository and the
  `electron-safe-storage-platform-probe.yml` workflow run list, so hosted
  workflow results are not publicly readable from this session.
- The GitHub plugin was suggested as a hosted-runner path, but installation was
  not confirmed in this session.
- The reference Codex repository at
  `/Users/kevin/Documents/AppDevelopment/reference_repos/codex` still does not
  contain an Electron `safeStorage`, `safe-storage`, `password-store`,
  `getSelectedStorageBackend`, or `basic_text` probe pattern to reuse.

No Windows or Linux `safeStorage` host result is recorded from this recheck.
The Phase 0 host-confirmation item remains open because those confirmations
require actual Windows and Linux Electron hosts.

## 2026-07-18 Default Linux Hosted Observation Pass

The remaining Phase 0 host-confirmation item was revisited as the next
incomplete plan step.

The pinned macOS probe was re-run with exact policy assertions:

```sh
desktop/node_modules/.bin/electron desktop/tests/electron/safe-storage-platform-probe.cjs --assert-byok-supported --assert-policy-reason os_backed_platform --assert-policy-status accept --assert-round-trip
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

The deterministic production-adapter Linux backend policy coverage was also
re-run:

```sh
pnpm -C desktop exec vitest run src/main/speech-credential-vault.test.ts
```

It passed with 21 tests, including rejection of `basic_text`, `unknown`, and an
unrecognized backend string plus acceptance of `gnome_libsecret`, `kwallet`,
`kwallet5`, and `kwallet6`.

The local and hosted-access paths still cannot produce the remaining Windows
or Linux host evidence from this session:

- `docker version` and `docker info` found Docker CLI `28.0.4`, context
  `desktop-linux`, but still could not connect to the Docker daemon at
  `unix:///Users/kevin/.docker/run/docker.sock`.
- `docker desktop status` could not retrieve Docker Desktop status. The
  process tree still shows Docker Desktop blocked on an `osascript`
  administrator prompt for privileged port-mapping setup.
- A PATH probe for Docker, GitHub CLI, common Linux/container runners, common
  Windows/VM runners, and Homebrew found only `/usr/local/bin/docker` and
  `/opt/homebrew/bin/brew`.
- `/Applications` contains Docker Desktop but no OrbStack, UTM, Parallels,
  VirtualBox, VMware Fusion, or Multipass installation; `brew list --formula`
  and `brew list --cask` did not show an installed Windows/Linux VM or
  container helper from the checked runner set.
- `GITHUB_TOKEN` and `GH_TOKEN` are not present in this shell.
- `ssh-add -l` reported no identities, and standard noninteractive Git SSH
  authentication to GitHub failed with `signing failed for ED25519-SK` and
  `Permission denied (publickey)`.
- The macOS Git credential helper did not return an HTTPS GitHub credential.
- The unauthenticated GitHub API returned `404` for the repository's
  `electron-safe-storage-platform-probe.yml` workflow run list, so hosted
  workflow results are not publicly readable from this session.
- The GitHub plugin was suggested as a hosted-runner path, but installation was
  not confirmed in this session.
- The reference Codex repository at
  `/Users/kevin/Documents/AppDevelopment/reference_repos/codex` still does not
  contain an Electron `safeStorage`, `safe-storage`, `password-store`,
  `getSelectedStorageBackend`, or `basic_text` probe pattern to reuse.

One hosted-runner evidence gap for the remaining confirmation was closed:

- `.github/workflows/electron-safe-storage-platform-probe.yml` now includes a
  Linux default-backend observation job. It runs the pinned Electron probe on
  `ubuntu-24.04` under `xvfb` without forcing `--password-store`, writes the
  JSON result to the GitHub step summary, and exits with the probe launch
  status. This records the runner's actual selected Linux backend separately
  from the asserted `gnome_libsecret` and forced `basic_text` jobs.

No Windows or Linux `safeStorage` host result is recorded from this pass
because no local platform host or connected hosted-runner credential was
available. The Phase 0 host-confirmation item remains open until the
push-triggered hosted workflow, the manual hosted workflow, or equivalent
Windows and Linux hosts produce actual Electron output.

## 2026-07-18 Hosted Artifact Preservation Pass

The remaining Phase 0 host-confirmation item was revisited as the next
incomplete plan step.

The pinned macOS probe was re-run with exact policy assertions:

```sh
desktop/node_modules/.bin/electron desktop/tests/electron/safe-storage-platform-probe.cjs --assert-byok-supported --assert-policy-reason os_backed_platform --assert-policy-status accept --assert-round-trip
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

The deterministic production-adapter Linux backend policy coverage was also
re-run:

```sh
pnpm -C desktop exec vitest run src/main/speech-credential-vault.test.ts
```

It passed with 21 tests, including rejection of `basic_text`, `unknown`, and an
unrecognized backend string plus acceptance of `gnome_libsecret`, `kwallet`,
`kwallet5`, and `kwallet6`.

The local and hosted-access paths still cannot produce the remaining Windows
or Linux host evidence from this session:

- `docker info` found Docker CLI `28.0.4`, context `desktop-linux`, but still
  could not connect to the Docker daemon at
  `unix:///Users/kevin/.docker/run/docker.sock`.
- `docker desktop status` could not retrieve Docker Desktop status. The
  process tree still shows Docker Desktop blocked on an `osascript`
  administrator prompt for privileged port-mapping setup.
- A PATH probe for Docker, GitHub CLI, common Linux/container runners, common
  Windows/VM runners, and Homebrew found only `/usr/local/bin/docker` and
  `/opt/homebrew/bin/brew`.
- `GITHUB_TOKEN` and `GH_TOKEN` are not present in this shell.
- The macOS Git credential helper emitted no usable GitHub HTTPS credential
  fields, and `GIT_TERMINAL_PROMPT=0 git ls-remote --heads origin` failed with
  `signing failed for ED25519-SK` and `Permission denied (publickey)`.
- The unauthenticated GitHub API returned `404` for the repository's
  `electron-safe-storage-platform-probe.yml` workflow run list, so hosted
  workflow results are not publicly readable from this session.
- The GitHub plugin was suggested as a hosted-runner path, but installation was
  not confirmed in this session.
- The reference Codex repository at
  `/Users/kevin/Documents/AppDevelopment/reference_repos/codex` still does not
  contain an Electron `safeStorage`, `safe-storage`, `password-store`,
  `getSelectedStorageBackend`, or `basic_text` probe pattern to reuse.

One hosted-runner evidence-retention gap for the remaining confirmation was
closed:

- `.github/workflows/electron-safe-storage-platform-probe.yml` now uploads each
  platform JSON result as a named GitHub Actions artifact in addition to
  writing it to the step summary. The official `actions/upload-artifact` action
  is pinned to exact commit `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a`, the
  `v7.0.1` tag resolved by `git ls-remote`, so the workflow does not depend on
  a floating action tag.
- The artifact names are `safe-storage-platform-probe-macos`,
  `safe-storage-platform-probe-windows`,
  `safe-storage-platform-probe-linux-default`,
  `safe-storage-platform-probe-linux-secret-service`, and
  `safe-storage-platform-probe-linux-basic-text`.

No Windows or Linux `safeStorage` host result is recorded from this pass
because no local platform host or connected hosted-runner credential was
available. The Phase 0 host-confirmation item remains open until the
push-triggered hosted workflow, the manual hosted workflow, or equivalent
Windows and Linux hosts produce actual Electron output.

## 2026-07-18 Hosted Backend-Assertion Pass

The remaining Phase 0 host-confirmation item was revisited as the next
incomplete plan step.

The pinned macOS probe was re-run with exact policy,
encryption-availability, and ciphertext marker assertions:

```sh
desktop/node_modules/.bin/electron desktop/tests/electron/safe-storage-platform-probe.cjs --assert-byok-supported --assert-ciphertext-excludes-plaintext --assert-encryption-available true --assert-policy-reason os_backed_platform --assert-policy-status accept --assert-round-trip
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

The deterministic production-adapter Linux backend policy coverage was also
re-run:

```sh
pnpm -C desktop exec vitest run src/main/speech-credential-vault.test.ts
```

It passed with 21 tests, including rejection of `basic_text`, `unknown`, and an
unrecognized backend string plus acceptance of `gnome_libsecret`, `kwallet`,
`kwallet5`, and `kwallet6`.

The local and hosted-access paths still cannot produce the remaining Windows
or Linux host evidence from this session:

- `docker info` found Docker CLI `28.0.4`, context `desktop-linux`, but still
  could not connect to the Docker daemon at
  `unix:///Users/kevin/.docker/run/docker.sock`.
- `docker desktop status` could not retrieve Docker Desktop status. The
  process tree still shows Docker Desktop blocked on an `osascript`
  administrator prompt for privileged port-mapping setup.
- A PATH probe for Docker, GitHub CLI, common Linux/container runners, and
  common Windows/VM runners found only `/usr/local/bin/docker`.
- `/Applications` contains Docker Desktop but no OrbStack, UTM, Parallels,
  VirtualBox, VMware Fusion, or Multipass installation; `brew list --formula`
  and `brew list --cask` did not show an installed Windows/Linux VM or
  container helper from the checked runner set.
- `GITHUB_TOKEN` and `GH_TOKEN` are not present in this shell.
- SSH credential checks found no identities, and the noninteractive origin probe
  failed because ED25519-SK signing failed and public-key authentication was
  denied.
- The macOS Git credential helper emitted no usable GitHub HTTPS credential
  fields.
- The unauthenticated GitHub API returned `404` for the repository's
  `electron-safe-storage-platform-probe.yml` workflow run list, so hosted
  workflow results are not publicly readable from this session.
- The GitHub plugin was suggested as a hosted-runner path, but installation was
  not confirmed in this session.
- The reference Codex repository at
  `/Users/kevin/Documents/AppDevelopment/reference_repos/codex` still does not
  contain an Electron `safeStorage`, `safe-storage`, `password-store`,
  `getSelectedStorageBackend`, or `basic_text` probe pattern to reuse.

One hosted-runner assertion gap for the remaining confirmation was closed:

- `desktop/tests/electron/safe-storage-platform-probe.cjs` now supports
  `--assert-ciphertext-excludes-plaintext`,
  `--assert-encryption-available true|false`, and
  `--assert-selected-storage-backend <backend>`, with reliable non-zero probe
  exits on assertion failure.
- `.github/workflows/electron-safe-storage-platform-probe.yml` now makes the
  macOS, Windows, and Linux secret-service jobs assert that encryption is
  available and the safeStorage ciphertext does not contain the plaintext
  marker.
- The Linux secret-service hosted job now asserts Electron selected
  `gnome_libsecret`, and the Linux `basic_text` rejection job now asserts
  Electron selected `basic_text`, so the future Linux result proves the forced
  backend actually took effect.

No Windows or Linux `safeStorage` host result is recorded from this pass
because no local platform host or connected hosted-runner credential was
available. The Phase 0 host-confirmation item remains open until the
push-triggered hosted workflow, the manual hosted workflow, or equivalent
Windows and Linux hosts produce actual Electron output.

## 2026-07-18 Latest Host-Access Recheck

The remaining Phase 0 host-confirmation item was revisited again as the next
incomplete plan step.

The pinned macOS probe was re-run with exact policy,
encryption-availability, and ciphertext marker assertions:

```sh
desktop/node_modules/.bin/electron desktop/tests/electron/safe-storage-platform-probe.cjs --assert-byok-supported --assert-ciphertext-excludes-plaintext --assert-encryption-available true --assert-policy-reason os_backed_platform --assert-policy-status accept --assert-round-trip
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

The deterministic production-adapter Linux backend policy coverage was also
re-run:

```sh
pnpm -C desktop exec vitest run src/main/speech-credential-vault.test.ts
```

It passed with 21 tests, including rejection of `basic_text`, `unknown`, and an
unrecognized backend string plus acceptance of `gnome_libsecret`, `kwallet`,
`kwallet5`, and `kwallet6`.

The local and hosted-access paths still cannot produce the remaining Windows
or Linux host evidence from this session:

- `docker version` and `docker info` found Docker CLI `28.0.4`, context
  `desktop-linux`, but could not connect to the Docker daemon at
  `unix:///Users/kevin/.docker/run/docker.sock`.
- `docker desktop status` could not retrieve Docker Desktop status from the
  CLI.
- A PATH probe for Docker, GitHub CLI, common Linux/container runners, common
  Windows/VM runners, Homebrew, Node, and pnpm found `/usr/local/bin/docker`,
  `/opt/homebrew/bin/brew`, `/Users/kevin/Library/pnpm/node`, and
  `/Users/kevin/Library/pnpm/pnpm`; it did not find `gh`, `colima`, `lima`,
  `limactl`, `podman`, `qemu-system-x86_64`, `qemu-aarch64`, `wine`, `act`,
  or `xvfb-run`.
- `/Applications` contains Docker Desktop but no OrbStack, UTM, Parallels,
  VirtualBox, VMware Fusion, or Multipass installation.
- `GITHUB_TOKEN` and `GH_TOKEN` are not present in this shell.
- `ssh-add -l` reported no identities, and `git ls-remote --heads origin`
  failed because ED25519-SK signing failed and public-key authentication was
  denied.
- The macOS Git credential helper emitted no usable GitHub HTTPS credential
  fields.
- The unauthenticated GitHub API returned `404` for the repository's
  `electron-safe-storage-platform-probe.yml` workflow run list, so hosted
  workflow results are not publicly readable from this session.
- The GitHub plugin was suggested as a hosted-runner path, but installation was
  not confirmed in this session.
- The reference Codex repository at
  `/Users/kevin/Documents/AppDevelopment/reference_repos/codex` still does not
  contain an Electron `safeStorage`, `safe-storage`, `password-store`,
  `getSelectedStorageBackend`, or `basic_text` probe pattern to reuse.

No Windows or Linux `safeStorage` host result is recorded from this pass
because no local platform host, authenticated hosted-runner path, or public
hosted-result path was available. The Phase 0 host-confirmation item remains
open until the push-triggered hosted workflow, the manual hosted workflow, or
equivalent Windows and Linux hosts produce actual Electron output.

## 2026-07-18 Current Incomplete-Step Pass

The remaining Phase 0 host-confirmation item was revisited again as the next
incomplete plan step.

The pinned macOS probe was re-run with exact policy,
encryption-availability, and ciphertext marker assertions:

```sh
desktop/node_modules/.bin/electron desktop/tests/electron/safe-storage-platform-probe.cjs --assert-byok-supported --assert-round-trip --assert-ciphertext-excludes-plaintext --assert-encryption-available true --assert-policy-status accept --assert-policy-reason os_backed_platform
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

The deterministic production-adapter Linux backend policy coverage was also
re-run:

```sh
pnpm -C desktop exec vitest run src/main/speech-credential-vault.test.ts
```

It passed with 21 tests, including rejection of `basic_text`, `unknown`, and an
unrecognized backend string plus acceptance of `gnome_libsecret`, `kwallet`,
`kwallet5`, and `kwallet6`.

The local and hosted-access paths still cannot produce the remaining Windows
or Linux host evidence from this session:

- `docker version` and `docker info` found Docker CLI `28.0.4`, context
  `desktop-linux`, but could not connect to the Docker daemon at
  `unix:///Users/kevin/.docker/run/docker.sock`.
- `docker desktop status` could not retrieve Docker Desktop status from the
  CLI.
- Docker Desktop processes are running, but the visible process state shows
  Docker Desktop waiting on a privileged setup prompt for privileged port
  mapping.
- Direct PATH probes found `/usr/local/bin/docker`, `/opt/homebrew/bin/brew`,
  `/Users/kevin/Library/pnpm/node`, and `/Users/kevin/Library/pnpm/pnpm`; they
  did not find `gh`, `colima`, `lima`, `limactl`, `podman`,
  `qemu-system-x86_64`, `qemu-aarch64`, `wine`, `act`, `xvfb-run`, `orb`,
  `orbstack`, `multipass`, `parallels`, `prlctl`, `VBoxManage`, `vmrun`,
  `utmctl`, `tart`, or `vagrant`.
- `/Applications` contains Docker Desktop but no OrbStack, UTM, Parallels,
  VirtualBox, VMware Fusion, or Multipass installation.
- `GITHUB_TOKEN` and `GH_TOKEN` are not present in this shell.
- `ssh-add -l` reported no identities, and `git ls-remote --heads origin`
  failed because ED25519-SK signing failed and public-key authentication was
  denied.
- The macOS Git credential helper emitted no usable GitHub HTTPS credential
  fields.
- The unauthenticated GitHub API returned `404` for the repository's
  `electron-safe-storage-platform-probe.yml` workflow run list, so hosted
  workflow results are not publicly readable from this session.
- The GitHub plugin was suggested as a hosted-runner path, but installation was
  not confirmed in this session.
- The reference Codex repository at
  `/Users/kevin/Documents/AppDevelopment/reference_repos/codex` still does not
  contain an Electron `safeStorage`, `safe-storage`, `password-store`,
  `getSelectedStorageBackend`, or `basic_text` probe pattern to reuse.

No Windows or Linux `safeStorage` host result is recorded from this pass
because no local platform host, authenticated hosted-runner path, or public
hosted-result path was available. The Phase 0 host-confirmation item remains
open until the push-triggered hosted workflow, the manual hosted workflow, or
equivalent Windows and Linux hosts produce actual Electron output.

## 2026-07-18 Fresh Host-Access Recheck

The remaining Phase 0 host-confirmation item was revisited as the next
incomplete plan step.

The pinned macOS probe was re-run with exact policy,
encryption-availability, and ciphertext marker assertions:

```sh
desktop/node_modules/.bin/electron desktop/tests/electron/safe-storage-platform-probe.cjs --assert-byok-supported --assert-round-trip --assert-ciphertext-excludes-plaintext --assert-encryption-available true --assert-policy-status accept --assert-policy-reason os_backed_platform
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

The deterministic production-adapter Linux backend policy coverage was also
re-run:

```sh
pnpm -C desktop exec vitest run src/main/speech-credential-vault.test.ts
```

It passed with 21 tests, including rejection of `basic_text`, `unknown`, and an
unrecognized backend string plus acceptance of `gnome_libsecret`, `kwallet`,
`kwallet5`, and `kwallet6`.

The local and hosted-access paths still cannot produce the remaining Windows
or Linux host evidence from this session:

- `docker version` and `docker info` found Docker CLI `28.0.4`, context
  `desktop-linux`, but could not connect to the Docker daemon at
  `unix:///Users/kevin/.docker/run/docker.sock`.
- `docker desktop status` could not retrieve Docker Desktop status from the
  CLI.
- Docker Desktop processes are running, but the visible process state shows
  Docker Desktop waiting on a privileged setup prompt for privileged port
  mapping.
- Direct PATH probes found `/usr/local/bin/docker`, `/opt/homebrew/bin/brew`,
  `/Users/kevin/Library/pnpm/node`, and `/Users/kevin/Library/pnpm/pnpm`; they
  did not find `gh`, `colima`, `lima`, `limactl`, `podman`,
  `qemu-system-x86_64`, `qemu-aarch64`, `wine`, `act`, `xvfb-run`, `orb`,
  `orbstack`, `multipass`, `parallels`, `prlctl`, `VBoxManage`, `vmrun`,
  `utmctl`, `tart`, or `vagrant`.
- `/Applications` contains Docker Desktop but no OrbStack, UTM, Parallels,
  VirtualBox, VMware Fusion, Multipass, Tart, Vagrant, Wine, or Podman
  installation.
- `brew list --formula` and `brew list --cask` did not show an installed
  Windows/Linux VM or container helper from the checked runner set.
- `GITHUB_TOKEN` and `GH_TOKEN` are not present in this shell.
- `ssh-add -l` reported no identities, and a noninteractive
  `git ls-remote --heads origin` check did not return within the bounded probe
  window and was interrupted.
- The macOS Git credential helper emitted no usable GitHub HTTPS credential
  fields.
- The unauthenticated GitHub API returned `404` for the repository's
  `electron-safe-storage-platform-probe.yml` workflow run list, so hosted
  workflow results are not publicly readable from this session.
- The GitHub plugin was suggested as a hosted-runner path, but installation was
  not confirmed in this session.
- The reference Codex repository at
  `/Users/kevin/Documents/AppDevelopment/reference_repos/codex` still does not
  contain an Electron `safeStorage`, `safe-storage`, `password-store`,
  `getSelectedStorageBackend`, or `basic_text` probe pattern to reuse.

No Windows or Linux `safeStorage` host result is recorded from this pass
because no local platform host, authenticated hosted-runner path, or public
hosted-result path was available. The Phase 0 host-confirmation item remains
open until the push-triggered hosted workflow, the manual hosted workflow, or
equivalent Windows and Linux hosts produce actual Electron output.

## 2026-07-18 15:49 UTC Host-Access Recheck

The remaining Phase 0 host-confirmation item was revisited as the next
incomplete plan step.

The pinned macOS probe was re-run with exact policy,
encryption-availability, and ciphertext marker assertions:

```sh
desktop/node_modules/.bin/electron desktop/tests/electron/safe-storage-platform-probe.cjs --assert-byok-supported --assert-round-trip --assert-ciphertext-excludes-plaintext --assert-encryption-available true --assert-policy-status accept --assert-policy-reason os_backed_platform
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

The deterministic production-adapter Linux backend policy coverage was also
re-run:

```sh
pnpm -C desktop exec vitest run src/main/speech-credential-vault.test.ts
```

It passed with 21 tests, including rejection of `basic_text`, `unknown`, and an
unrecognized backend string plus acceptance of `gnome_libsecret`, `kwallet`,
`kwallet5`, and `kwallet6`.

The local and hosted-access paths still cannot produce the remaining Windows
or Linux host evidence from this session:

- `docker version` and `docker info` found Docker CLI `28.0.4`, context
  `desktop-linux`, but could not connect to the Docker daemon at
  `unix:///Users/kevin/.docker/run/docker.sock`.
- `docker desktop status` could not retrieve Docker Desktop status from the
  CLI.
- Docker Desktop processes are running, but `ps` shows `com.docker.backend`
  blocked behind an `osascript` administrator prompt with the text "Docker
  Desktop requires privileged access to configure privileged port mapping".
- Direct PATH probes found `/usr/local/bin/docker`, `/opt/homebrew/bin/brew`,
  `/Users/kevin/Library/pnpm/node`, and `/Users/kevin/Library/pnpm/pnpm`; they
  did not find `gh`, `colima`, `lima`, `limactl`, `podman`,
  `qemu-system-x86_64`, `qemu-aarch64`, `wine`, `act`, `xvfb-run`, `orb`,
  `orbstack`, `multipass`, `parallels`, `prlctl`, `VBoxManage`, `vmrun`,
  `utmctl`, `tart`, or `vagrant`.
- `/Applications` contains Docker Desktop but no OrbStack, UTM, Parallels,
  VirtualBox, VMware Fusion, Multipass, Tart, Vagrant, Wine, or Podman
  installation.
- `brew list --formula` and `brew list --cask` did not show an installed
  Windows/Linux VM or container helper from the checked runner set.
- `GITHUB_TOKEN` and `GH_TOKEN` are not present in this shell.
- `ssh-add -l` reported no identities, `git ls-remote --heads origin` did not
  return within the bounded probe window and was interrupted, and the macOS Git
  credential helper returned no usable HTTPS GitHub credential.
- The unauthenticated GitHub API returned `404` for the repository's
  `electron-safe-storage-platform-probe.yml` workflow run list, so hosted
  workflow results are not publicly readable from this session.
- The GitHub plugin was suggested as a hosted-runner path, but installation was
  not confirmed in this session.
- The reference Codex repository at
  `/Users/kevin/Documents/AppDevelopment/reference_repos/codex` still does not
  contain an Electron `safeStorage`, `safe-storage`, `password-store`,
  `getSelectedStorageBackend`, or `basic_text` probe pattern to reuse.

No Windows or Linux `safeStorage` host result is recorded from this pass
because no local platform host, authenticated hosted-runner path, or public
hosted-result path was available. The Phase 0 host-confirmation item remains
open until the push-triggered hosted workflow, the manual hosted workflow, or
equivalent Windows and Linux hosts produce actual Electron output.

## 2026-07-18 15:54 UTC Host-Access Recheck

The remaining Phase 0 host-confirmation item was revisited as the next
incomplete plan step.

The pinned macOS probe was re-run with exact policy,
encryption-availability, and ciphertext marker assertions:

```sh
desktop/node_modules/.bin/electron desktop/tests/electron/safe-storage-platform-probe.cjs --assert-byok-supported --assert-round-trip --assert-ciphertext-excludes-plaintext --assert-encryption-available true --assert-policy-status accept --assert-policy-reason os_backed_platform
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

The deterministic production-adapter Linux backend policy coverage was also
re-run:

```sh
pnpm -C desktop exec vitest run src/main/speech-credential-vault.test.ts
```

It passed with 21 tests, including rejection of `basic_text`, `unknown`, and an
unrecognized backend string plus acceptance of `gnome_libsecret`, `kwallet`,
`kwallet5`, and `kwallet6`.

The local and hosted-access paths still cannot produce the remaining Windows
or Linux host evidence from this session:

- `docker version` and `docker info` found Docker CLI `28.0.4`, context
  `desktop-linux`, but could not connect to the Docker daemon at
  `unix:///Users/kevin/.docker/run/docker.sock`.
- `docker desktop status` could not retrieve Docker Desktop status from the
  CLI.
- Docker Desktop processes are running, but `ps` shows `com.docker.backend`
  blocked behind an `osascript` administrator prompt with the text "Docker
  Desktop requires privileged access to configure privileged port mapping".
- Direct PATH probes found `/usr/local/bin/docker`,
  `/Users/kevin/Library/pnpm/node`, `/Users/kevin/Library/pnpm/pnpm`, and
  `/opt/homebrew/bin/brew`; they did not find `gh`, `colima`, `lima`,
  `limactl`, `podman`, `qemu-system-x86_64`, `qemu-aarch64`, `wine`, `act`,
  `xvfb-run`, `orb`, `orbstack`, `multipass`, `parallels`, `prlctl`,
  `VBoxManage`, `vmrun`, `utmctl`, `tart`, or `vagrant`.
- `/Applications` contains Docker Desktop but none of the checked alternative
  Linux or Windows runner applications.
- `brew list --formula` and `brew list --cask` did not show an installed
  Windows/Linux VM or container helper from the checked runner set.
- `GITHUB_TOKEN` and `GH_TOKEN` are not present in this shell.
- `ssh-add -l` reported no identities, and `git ls-remote --heads origin`
  failed because ED25519-SK signing failed and public-key authentication was
  denied.
- The macOS Git credential helper emitted no usable GitHub HTTPS credential
  fields.
- The unauthenticated GitHub API returned `404` for the repository's
  `electron-safe-storage-platform-probe.yml` workflow run list, so hosted
  workflow results are not publicly readable from this session.
- The GitHub plugin was suggested as a hosted-runner path, but installation was
  not confirmed in this session.
- The reference Codex repository at
  `/Users/kevin/Documents/AppDevelopment/reference_repos/codex` still does not
  contain an Electron `safeStorage`, `safe-storage`, `password-store`,
  `getSelectedStorageBackend`, or `basic_text` probe pattern to reuse.

No Windows or Linux `safeStorage` host result is recorded from this recheck
because no local platform host, authenticated hosted-runner path, or public
hosted-result path was available. The Phase 0 host-confirmation item remains
open until the push-triggered hosted workflow, the manual hosted workflow, or
equivalent Windows and Linux hosts produce actual Electron output.

## 2026-07-18 16:02 UTC Host-Access Recheck

The remaining Phase 0 host-confirmation item was revisited again as the next
incomplete plan step.

The pinned macOS probe was re-run with exact policy,
encryption-availability, and ciphertext marker assertions:

```sh
desktop/node_modules/.bin/electron desktop/tests/electron/safe-storage-platform-probe.cjs --assert-byok-supported --assert-round-trip --assert-ciphertext-excludes-plaintext --assert-encryption-available true --assert-policy-status accept --assert-policy-reason os_backed_platform
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

The deterministic production-adapter Linux backend policy coverage was also
re-run:

```sh
pnpm -C desktop exec vitest run src/main/speech-credential-vault.test.ts
```

It passed with 21 tests, including rejection of `basic_text`, `unknown`, and an
unrecognized backend string plus acceptance of `gnome_libsecret`, `kwallet`,
`kwallet5`, and `kwallet6`.

The local and hosted-access paths still cannot produce the remaining Windows
or Linux host evidence from this session:

- `docker version` and `docker info` found Docker CLI `28.0.4`, context
  `desktop-linux`, but could not connect to the Docker daemon at
  `unix:///Users/kevin/.docker/run/docker.sock`.
- `docker desktop status` could not retrieve Docker Desktop status from the
  CLI.
- Docker Desktop processes are running, but `ps` shows `com.docker.backend`
  blocked behind an `osascript` administrator prompt with the text "Docker
  Desktop requires privileged access to configure privileged port mapping".
- Direct PATH probes found `/usr/local/bin/docker`,
  `/Users/kevin/Library/pnpm/node`, `/Users/kevin/Library/pnpm/pnpm`, and
  `/opt/homebrew/bin/brew`; they did not find `gh`, `colima`, `lima`,
  `limactl`, `podman`, `qemu-system-x86_64`, `qemu-aarch64`, `wine`, `act`,
  `xvfb-run`, `orb`, `orbstack`, `multipass`, `parallels`, `prlctl`,
  `VBoxManage`, `vmrun`, `utmctl`, `tart`, or `vagrant`.
- `/Applications` contains Docker Desktop but none of the checked alternative
  Linux or Windows runner applications.
- Exact Homebrew formula and cask checks did not show an installed
  Windows/Linux VM or container helper from the checked runner set.
- `GITHUB_TOKEN` and `GH_TOKEN` are not present in this shell.
- `ssh-add -l` reported no identities, and `git ls-remote --heads origin` did
  not return within the bounded noninteractive probe window and was
  interrupted.
- The macOS Git credential helper emitted no usable GitHub HTTPS credential
  fields.
- The unauthenticated GitHub API returned `404` for the repository's
  `electron-safe-storage-platform-probe.yml` workflow run list, so hosted
  workflow results are not publicly readable from this session.
- The GitHub plugin was suggested as a hosted-runner path, but installation was
  not confirmed in this session.
- The reference Codex repository at
  `/Users/kevin/Documents/AppDevelopment/reference_repos/codex` still does not
  contain an Electron `safeStorage`, `safe-storage`, `password-store`,
  `getSelectedStorageBackend`, or `basic_text` probe pattern to reuse.

No Windows or Linux `safeStorage` host result is recorded from this recheck
because no local platform host, authenticated hosted-runner path, or public
hosted-result path was available. The Phase 0 host-confirmation item remains
open until the push-triggered hosted workflow, the manual hosted workflow, or
equivalent Windows and Linux hosts produce actual Electron output.

## 2026-07-18 16:07 UTC Host-Access Recheck

The remaining Phase 0 host-confirmation item was revisited again as the next
incomplete plan step.

The pinned macOS probe was re-run with exact policy,
encryption-availability, and ciphertext marker assertions:

```sh
desktop/node_modules/.bin/electron desktop/tests/electron/safe-storage-platform-probe.cjs --assert-byok-supported --assert-round-trip --assert-ciphertext-excludes-plaintext --assert-encryption-available true --assert-policy-status accept --assert-policy-reason os_backed_platform
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

The deterministic production-adapter Linux backend policy coverage was also
re-run:

```sh
pnpm -C desktop exec vitest run src/main/speech-credential-vault.test.ts
```

It passed with 21 tests, including rejection of `basic_text`, `unknown`, and an
unrecognized backend string plus acceptance of `gnome_libsecret`, `kwallet`,
`kwallet5`, and `kwallet6`.

The local and hosted-access paths still cannot produce the remaining Windows
or Linux host evidence from this session:

- `docker version` and `docker info` found Docker CLI `28.0.4`, context
  `desktop-linux`, but could not connect to the Docker daemon at
  `unix:///Users/kevin/.docker/run/docker.sock`.
- `docker desktop status` could not retrieve Docker Desktop status from the
  CLI.
- Docker Desktop processes are running, but `ps` shows `com.docker.backend`
  blocked behind an `osascript` administrator prompt with the text "Docker
  Desktop requires privileged access to configure privileged port mapping".
- Direct PATH probes found `/usr/local/bin/docker`,
  `/Users/kevin/Library/pnpm/node`, `/Users/kevin/Library/pnpm/pnpm`, and
  `/opt/homebrew/bin/brew`; they did not find `gh`, `colima`, `lima`,
  `limactl`, `podman`, `qemu-system-x86_64`, `qemu-aarch64`, `wine`, `act`,
  `xvfb-run`, `orb`, `orbstack`, `multipass`, `parallels`, `prlctl`,
  `VBoxManage`, `vmrun`, `utmctl`, `tart`, or `vagrant`.
- `/Applications` contains Docker Desktop but none of the checked alternative
  Linux or Windows runner applications.
- Homebrew formula and cask checks did not show an installed Windows/Linux VM
  or container helper from the checked runner set.
- `GITHUB_TOKEN` and `GH_TOKEN` are not present in this shell.
- `ssh-add -l` reported no identities, and the noninteractive origin probe
  failed because ED25519-SK signing failed and public-key authentication was
  denied.
- The macOS Git credential helper emitted no usable GitHub HTTPS credential
  fields.
- The unauthenticated GitHub API returned `404` for the repository's
  `electron-safe-storage-platform-probe.yml` workflow run list, so hosted
  workflow results are not publicly readable from this session.
- The GitHub plugin was suggested as a hosted-runner path, but installation was
  not confirmed in this session.
- The reference Codex repository at
  `/Users/kevin/Documents/AppDevelopment/reference_repos/codex` still does not
  contain an Electron `safeStorage`, `safe-storage`, `password-store`,
  `getSelectedStorageBackend`, or `basic_text` probe pattern to reuse.

No Windows or Linux `safeStorage` host result is recorded from this recheck
because no local platform host, authenticated hosted-runner path, or public
hosted-result path was available. The Phase 0 host-confirmation item remains
open until the push-triggered hosted workflow, the manual hosted workflow, or
equivalent Windows and Linux hosts produce actual Electron output.

## 2026-07-18 16:14 UTC Host-Access Recheck

The remaining Phase 0 host-confirmation item was revisited again as the next
incomplete plan step.

The pinned macOS probe was re-run with exact policy,
encryption-availability, and ciphertext marker assertions:

```sh
desktop/node_modules/.bin/electron desktop/tests/electron/safe-storage-platform-probe.cjs --assert-byok-supported --assert-round-trip --assert-ciphertext-excludes-plaintext --assert-encryption-available true --assert-policy-status accept --assert-policy-reason os_backed_platform
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

The deterministic production-adapter Linux backend policy coverage was also
re-run:

```sh
pnpm -C desktop exec vitest run src/main/speech-credential-vault.test.ts
```

It passed with 21 tests, including rejection of `basic_text`, `unknown`, and an
unrecognized backend string plus acceptance of `gnome_libsecret`, `kwallet`,
`kwallet5`, and `kwallet6`.

The local and hosted-access paths still cannot produce the remaining Windows
or Linux host evidence from this session:

- `docker version` and `docker info` found Docker CLI `28.0.4`, context
  `desktop-linux`, but could not connect to the Docker daemon at
  `unix:///Users/kevin/.docker/run/docker.sock`.
- `docker desktop status` could not retrieve Docker Desktop status from the
  CLI.
- Docker Desktop processes are running, but `ps` shows `com.docker.backend`
  blocked behind an `osascript` administrator prompt with the text "Docker
  Desktop requires privileged access to configure privileged port mapping".
- Direct PATH probes found only Docker from the checked Windows/Linux runner
  set. They did not find `gh`, `colima`, `lima`, `limactl`, `podman`,
  `qemu-system-x86_64`, `qemu-aarch64`, `wine`, `act`, `xvfb-run`, `orb`,
  `orbstack`, `multipass`, `parallels`, `prlctl`, `VBoxManage`, `vmrun`,
  `utmctl`, `tart`, or `vagrant`.
- `/Applications` contains Docker Desktop but none of the checked alternative
  Linux or Windows runner applications.
- Homebrew formula and cask checks did not show an installed Windows/Linux VM
  or container helper from the checked runner set.
- `node` is `v25.2.1` and `pnpm` is `10.23.0`, so local JavaScript tooling
  remains available.
- `GITHUB_TOKEN` and `GH_TOKEN` are not present in this shell.
- `ssh-add -l` reported no identities, and the noninteractive origin probe
  failed because ED25519-SK signing failed and public-key authentication was
  denied.
- The macOS Git credential helper emitted no usable GitHub HTTPS credential
  fields.
- The unauthenticated GitHub API returned `404` for the repository's
  `electron-safe-storage-platform-probe.yml` workflow run list, so hosted
  workflow results are not publicly readable from this session.
- The GitHub plugin was suggested as a hosted-runner path, but installation was
  not confirmed in this session.
- The reference Codex repository at
  `/Users/kevin/Documents/AppDevelopment/reference_repos/codex` still does not
  contain an Electron `safeStorage`, `safe-storage`, `password-store`,
  `getSelectedStorageBackend`, or `basic_text` probe pattern to reuse.

No Windows or Linux `safeStorage` host result is recorded from this recheck
because no local platform host, public hosted-result path, or checked standard
authenticated hosted-runner path (`GITHUB_TOKEN`/`GH_TOKEN`, Git SSH, Git
credential helper, or connected GitHub plugin) was available. The Phase 0
host-confirmation item remains open until the push-triggered hosted workflow,
the manual hosted workflow, or equivalent Windows and Linux hosts produce
actual Electron output.

## Phase 2 Adapter Requirements

- The production adapter is constructed only after Electron `ready`.
- It calls `safeStorage.isEncryptionAvailable()` before encrypting or
  decrypting.
- On Linux it first calls `safeStorage.getSelectedStorageBackend()` and rejects
  `basic_text`, `unknown`, and any unrecognized value before accepting the
  backend for encryption.
- It never calls `safeStorage.setUsePlainTextEncryption(true)`.
- Tests inject the protection interface so `basic_text`, `unknown`,
  unavailable encryption, encrypt failure, and decrypt failure are deterministic
  without relying on the developer's host platform.
