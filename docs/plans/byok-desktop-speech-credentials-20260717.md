# BYOK Desktop Speech Credential Plan

**Date:** 2026-07-17

**Status:** In progress — Phase 0 click-to-local-recording independence and
the `safeStorage` API/local macOS probe are recorded; remaining `safeStorage`
host confirmations are still open after the 2026-07-18 16:14 UTC host-access
recheck. The latest pass recorded in the safeStorage report re-ran the pinned
macOS probe with exact policy, encryption-availability, and
ciphertext-excludes-plaintext assertions and re-ran the deterministic vault
backend-policy test successfully. It confirmed Docker CLI and Homebrew are
installed, Node and pnpm remain available, Docker still cannot reach the
daemon, Docker Desktop status is not retrievable from the CLI, Docker Desktop
processes are waiting on a privileged setup prompt, no usable local
Windows/Linux runner is available, no checked standard hosted-result path
(`GITHUB_TOKEN`/`GH_TOKEN`, SSH-agent identity, usable macOS HTTPS GitHub
credential, authenticated SSH remote, public unauthenticated GitHub Actions
result path, or connected GitHub plugin) is available from this session, and
the reference Codex repo has no Electron
`safeStorage` probe pattern to reuse.
Earlier incomplete-step passes tightened the hosted probe workflow so accepted
platform jobs assert ciphertext marker exclusion while forced Linux jobs assert
the exact selected backend, added pinned official artifact uploads, a hosted
Linux default-backend observation job, `--no-sandbox` for Linux hosted-runner
Electron probes, relevant push-triggered hosted runs with step-summary JSON,
exact policy status/reason assertions, Linux backend-first policy
classification matching the production adapter, and deterministic rejection of
unrecognized Linux backend strings. Actual Windows/Linux host evidence remains
open until that workflow or equivalent hosts produce results.
Phase 1 desktop startup is complete:
API-key ownership has been removed from the Electron-spawned backend, provider
endpoint configuration is isolated from server-startup credentials, the explicit
`electron_vault | server_startup` credential-owner policy is declared, the
synchronized credential-aware OpenAI provider controller and service-level
credential validation/load/clear/status paths are in place, authenticated
bounded desktop credential HTTP endpoints are registered, `server_startup`
runtimes reject desktop credential management with a typed safe error, Go-owned
TypeScript backend contracts have been regenerated at protocol version 63, and
desktop behavior tests now assert that inherited `OPENAI_API_KEY` is not read.
Phase 2 is complete: Electron main now has the injected speech credential vault
abstraction, a production `safeStorage` protection adapter, strict versioned
ciphertext persistence, atomic replacement/removal, and typed corrupt-state
handling. The main-process speech credential coordinator is now in place with
explicit save/remove transaction recovery paths, ciphertext-only rollback
snapshots, lifecycle-driven startup/replacement restoration into the
authenticated local runtime, typed read/save/remove IPC operations and
credential-state push events, whole-operation recording redaction for
credential saves, and local-runtime-only coordinator routing that does not use
the selected active runtime. Phase 3 is complete: Settings → Voices now shows
the OpenAI voice connection card backed by the typed credential IPC state, with
save/verify, replace, disconnect, retry, secure-storage-unavailable, corrupt,
and failure presentations plus local-only/remote-runtime boundary copy and no
rendered saved-key fragment. The remaining local-desktop voice availability and
failure copy no longer tells users to configure voice through environment
variables, and unavailable local microphone controls now route to the Voices
credential card through typed Settings navigation. Voice catalog and
master/narrator selection controls remain usable while OpenAI voice is
disconnected, with renderer coverage for the not-configured provider state.
When a remote runtime is active, the Voices card now separately labels the Local
desktop credential and the active remote runtime's own voice status. Phase 4
is complete: the registered deterministic `global-speech-session` Electron
workflow now provisions the fake OpenAI speech key through Settings → Voices,
with `OPENAI_API_KEY` removed from the Electron child environment, production
renderer/preload/main/authenticated HTTP/provider/vault paths exercised,
restart restoration proven, credential endpoint recording redacted, and
artifact plus temporary app-data scans covering the fake long-lived and
ephemeral secret markers. The same workflow now covers initial setup, rejected
candidate preservation and rollback to the prior credential, successful
replacement, renderer reload, local-versus-remote runtime isolation,
app/backend restart restoration into a replacement local backend instance,
disconnect, and removed-after-restart persistence. The complete instant-voice
capture/routing/playback Phase 4 workflow now launches the local
Electron/backend process without `OPENAI_API_KEY`, saves the fake credential
through Settings → Voices, refreshes renderer capture capabilities from typed
credential events, exercises the immediate capture/routing/playback path using
the stored credential, and scans recordings plus temporary app data for fake
long-lived and ephemeral secret markers. The registered live OpenAI workflow
now resolves the test runner's Platform key outside the app process, launches
the Electron child without `OPENAI_API_KEY`, saves the key through Settings →
Voices, proves live Realtime transcription, restarts Electron/backend with the
same temporary app data, restores the credential from the vault, and proves a
second live Realtime transcription session. The finalized artifact privacy
scanner now runs after workflow shutdown on success and failure, covers
temporary app/workspace state before cleanup, supports root-specific marker
sets so runtime device tokens stay artifact-only, and is wired through the
deterministic global-speech, instant-voice Phase 4, and live OpenAI workflows.
The obsolete desktop credential-environment cleanup is complete: the
superseded Phase 0 environment-key baseline workflow was removed from the
active Electron manifest, remaining fake-provider Electron speech workflows
now provision through Settings → Voices with `OPENAI_API_KEY` stripped from the
child environment, the live runner documentation describes runner-side key
resolution without desktop env provisioning, README dogfood instructions now
make the unprefixed `./scripts/prod_record_desktop_session.sh --build`
production command canonical, and `setta serve` plus live test-runner
credential coverage remains intact.

**Relationship to existing plans:** This plan changes credential ownership for
the Electron-spawned local runtime only. It preserves the capture, WebRTC,
routing, playback, and latency contracts in
`instant-voice-capture-20260717.md` and does not change the separately launched
runtime described in `remote-runtime-plan.md`.

## Intent

Setta Desktop users should launch the app normally and configure their own
OpenAI API key once inside Setta:

```text
./scripts/prod_record_desktop_session.sh --build
```

The desktop app must not require this launch contract:

```text
OPENAI_API_KEY=... ./scripts/prod_record_desktop_session.sh --build
```

The configured key belongs to the user, remains on that user's computer, and
authorizes direct OpenAI speech usage billed to that user's OpenAI Platform
account. Setta does not operate a speech proxy, hold a shared provider key, or
become a billing intermediary.

## Non-Negotiable Clean Break

The local desktop change is a hard cutover, not an incremental migration. Its
implementation must not contain backward compatibility, legacy support,
migrations, transitional adapters, deprecation periods, dual-read/write
behavior, old-field aliases, or silent fallbacks.

Concretely, the same change must:

- remove production `OPENAI_API_KEY` ingestion from the Electron-spawned
  `setta-backend`;
- delete the local-desktop environment-key behavior and replace its tests with
  assertions for the new boundary;
- never let the desktop detect, import, copy, prefer, or fall back to an
  inherited key;
- introduce only the new ciphertext schema and treat every other schema as an
  explicit error rather than migrating or reinterpreting it;
- remove obsolete desktop launch instructions and fixtures whose sole contract
  is environment-key ingestion instead of preserving them.

Test orchestration may obtain a real provider key outside the product process
and enter it through the production BYOK UI. That is test provisioning, not a
production compatibility path.

This clean break does not mean deleting unrelated supported behavior.
`setta serve` is a separate runtime-administration command, and test runners are
not installed-app credential sources. Their existing environment inputs remain
unless a separate plan intentionally changes them.

## Product Contract

1. A user opens **Settings → Voices**, pastes an OpenAI API key, and chooses
   **Save and verify**.
2. Setta verifies that the credential can create the exact supported Realtime
   transcription session before committing it.
3. Electron encrypts the credential with an OS-backed secret and persists only
   ciphertext under Electron `userData`.
4. The local Go runtime receives the plaintext over its authenticated loopback
   API, retains it in memory, and never persists or returns it.
5. Subsequent desktop launches restore the encrypted credential automatically;
   users do not reopen a shell, export an environment variable, or paste the
   key again.
6. Removing or replacing the credential takes effect without restarting Setta.
7. When no credential is configured, typed requests still work and every voice
   entry point offers a direct route to **Settings → Voices**. No user-facing
   message mentions `OPENAI_API_KEY`.
8. A configured credential never appears in generated contracts beyond a
   write-only request field, renderer/main/backend logs, recordings,
   screenshots, errors, crash diagnostics, command lines, environment dumps,
   persisted runtime state, or test artifacts.

## Scope Decision: Local Desktop First

The persisted BYOK credential is owned by one Electron installation and is
used only by that installation's local runtime.

- Electron must not automatically transmit the credential to a selected remote
  runtime. A paired runtime is user-owned but may still be compromised; runtime
  selection is not consent to disclose an OpenAI credential.
- `setta serve` is the CLI command that runs Setta's backend/runtime without an
  Electron window, normally on another user-owned machine. It prints a pairing
  URL and QR code and can bind through Tailscale. It is not involved when a
  user clicks the installed desktop app.
- Voice while the desktop is connected to that separately launched runtime is
  outside this plan. The desktop still owns microphone capture, but the paired
  runtime owns its speech configuration and provider calls.
- `setta serve` keeps its existing explicit runtime-administrator
  `OPENAI_API_KEY` input. That is a distinct supported command contract, not a
  fallback or legacy route for the installed desktop app.
- The Electron-spawned `setta-backend` stops reading `OPENAI_API_KEY`. There is
  no environment-to-vault import and no environment fallback in that process.
- When a separately launched runtime is active, the Voices panel must
  distinguish **Local desktop credential** from **Active runtime voice status**
  instead of implying that the desktop key applies remotely.
- Browser/PWA secret persistence is out of scope. Do not put a long-lived API
  key in `localStorage`, IndexedDB, a service worker cache, or runtime layout
  state.

The runtime must enforce a permanent credential-ownership policy:
`electron_vault` for the Electron local backend and `server_startup` for
`setta serve`. This is domain modeling for two current products, not a
transitional compatibility layer. `server_startup` rejects desktop
vault-management operations.

## Current State

The current implementation already has the correct provider transport shape:

- `internal/speech/environment.go` reads `OPENAI_API_KEY` at process startup
  and clears it from the inherited environment.
- `internal/speech/openai_client_transcription.go` uses the long-lived key to
  mint a ten-minute, transcription-only Realtime client secret.
- `desktop/src/renderer/src/features/global-speech/realtime-transcription-transport.ts`
  sends microphone audio directly to OpenAI over WebRTC using that short-lived
  secret.
- `internal/speech/openai_client_synthesis.go` keeps synthesis behind the Go
  provider boundary.
- `desktop/src/main/speech-ipc.ts` redacts transcription secrets and synthesis
  audio from IPC recordings.
- `desktop/src/main/session-recorder.ts` already recognizes `apiKey`,
  `clientSecret`, and authorization fields as sensitive, but the new credential
  channels still need whole-operation redaction and artifact-level proof.

The missing pieces are durable OS-backed credential protection, a mutable
in-memory provider, credential-management contracts, and a user-facing setup
flow.

## Target Architecture

### Credential setup

```text
Settings → Voices password field
  -> typed, fully redacted Electron IPC
  -> Electron main credential coordinator
  -> authenticated local-runtime validation endpoint
  -> OpenAI Realtime client-secret endpoint (secret discarded)
  -> Electron safeStorage encryption
  -> atomic ciphertext write under Electron userData
  -> authenticated local-runtime in-memory load endpoint
```

### Normal app startup

```text
Electron app ready
  -> local runtime starts and authenticates
  -> Electron reads ciphertext
  -> safeStorage decrypts in main-process memory
  -> local runtime loads credential into memory
  -> main-process plaintext reference is released
  -> voice capabilities become configured
```

Startup restoration must not make a provider network request. Offline launch
still restores the credential; the next real speech operation owns provider
availability errors.

### Normal transcription

```text
renderer microphone capture
  -> local runtime creates scoped client secret
  -> renderer connects directly to OpenAI WebRTC
  -> transcript returns directly to renderer
```

The long-lived key never enters the renderer's transcription transport. The
existing buffered-microphone contract continues to hide provider setup latency
without prewarming billable sessions.

## Credential Storage

### Electron main owns persistence

Add a focused main-process store, for example
`desktop/src/main/speech-credential-vault.ts`, with an injected protection
interface and a production adapter backed by Electron `safeStorage`.

The production adapter must:

- be constructed only after Electron's `ready` event;
- require `safeStorage.isEncryptionAvailable()`;
- reject Linux `basic_text` and `unknown` backends rather than silently storing
  reversibly protected plaintext;
- use macOS Keychain, Windows OS-backed encryption, or a supported Linux secret
  service through Electron's selected backend;
- never call `safeStorage.setUsePlainTextEncryption(true)`;
- encrypt before touching the filesystem;
- store the encrypted bytes as base64 in one versioned JSON document;
- create the parent directory and temporary file with mode `0600` where modes
  are supported;
- atomically rename the temporary file into place;
- treat an unreadable file, unsupported schema, invalid base64, or decryption
  failure as a typed **corrupt** state; and
- never silently delete, replace, or reinterpret corrupt credential data.

The first persisted schema should contain only:

```text
schema_version
provider = "openai"
ciphertext_base64
```

Do not persist plaintext, an API-key prefix/suffix, validation responses,
ephemeral client secrets, provider error bodies, or a duplicate copy in the Go
app-data directory. The UI needs only **Configured**, not a masked fragment of
the key.

### Plaintext lifetime

JavaScript and Go strings cannot be reliably zeroed, so the design must
minimize references rather than promise impossible memory erasure:

- keep the submitted value only in the password input state and main-process
  operation scope;
- clear renderer input state after success, removal, or component unmount;
- do not retain the value in a Zustand store, React context, module global,
  event payload, retry closure, or diagnostic object;
- do not cache decrypted plaintext in Electron main after it has been loaded
  into the local runtime; and
- let the Go provider own the one necessary long-lived in-memory copy until
  replacement, removal, or runtime shutdown.

## Go Speech Provider Lifecycle

### Separate endpoint configuration from credentials

Split the former combined speech client configuration responsibilities:

- provider endpoint/test transport configuration owns base URL, guarded E2E
  base URL authorization, HTTP client, and timeout;
- desktop credential configuration does not own an initial API key; and
- `runtime.Config` declares the exhaustive credential owner
  `electron_vault | server_startup`.

`cmd/setta-backend` selects `electron_vault` and starts with no provider.
`cmd/setta serve` selects `server_startup`, retains its current explicit
environment-provided initial key, and rejects credential validation, load, and
clear requests with a specific typed error. Only the Electron-spawned command
stops reading `OPENAI_API_KEY`.

Refactor `internal/speech` so `Service` depends on a credential-aware OpenAI
provider controller rather than an immutable client containing the startup
key. The controller must:

- synchronize update/read/clear operations without data races;
- expose configuration status without exposing the key;
- construct and validate a candidate client before swapping it in;
- validate a submitted candidate by creating the exact supported
  transcription client secret with the authenticated device safety identifier,
  then discard that secret without returning it;
- snapshot the current client at the start of synthesis or session creation so
  an in-flight request has deterministic behavior during replacement;
- make replacement affect subsequent operations atomically;
- make clear reject subsequent operations as `speech_not_configured`;
- retain no history of prior credentials; and
- release its credential reference on runtime shutdown.

Do not mutate the existing generated OpenAI provider contracts by hand. The
validation call must reuse the existing owner-defined supported transcription
session contract.

## Backend HTTP Contracts

Add owner-defined Go request/response types and register their endpoints in
`internal/httpapi/endpoints.go`; regenerate `desktop/src/generated/backend.ts`.
Names may be adjusted during implementation, but the semantic operations are:

1. **Validate desktop speech credential**
   - Request: `{ apiKey }`.
   - Authenticated local-runtime device required.
   - Provider request required; does not mutate active configuration.
   - Response contains provider and `valid`, never a credential or client
     secret.
2. **Load desktop speech credential**
   - Request: `{ apiKey }`.
   - Performs strict local validation only and atomically installs the client.
   - Used after a successful save and for secure startup restoration.
   - Response is the resulting `SpeechCapabilities` or a dedicated non-secret
     credential status.
3. **Clear desktop speech credential**
   - Empty request.
   - Clears the in-memory client for subsequent operations.
   - Response is the resulting non-secret status.

All three endpoints must:

- use the existing small speech request-body limit;
- reject unknown JSON fields and malformed/whitespace/control-character keys;
- require the normal bearer-authenticated runtime device;
- reject runtimes whose credential owner is not `electron_vault`;
- return classified safe errors without provider response bodies;
- never include the submitted key in formatting, wrapping, or validation
  messages; and
- be represented once in the HTTP endpoint registry, not in a separate
  generator list.

`ReadSpeechCapabilities` remains the product capability source. It reports
`configured` only when the runtime has an active in-memory provider client.
The OpenAI model and voice catalog remain available while unconfigured so the
Voices UI can still render its selections.

## Electron Main and IPC

Add main-owned speech credential operations to the typed speech IPC contract:

- `readCredentialSettings`;
- `saveCredential` with a write-only API-key request;
- `removeCredential`; and
- a push event for credential-state changes caused by save, remove, local
  backend reconnection, vault failure, or runtime replacement.

Use a TypeScript discriminated union owned by Electron main for UI state:

```text
loading
not_configured
configured
secure_storage_unavailable
corrupt
failed
```

Each branch carries only the fields it needs. No branch contains the key,
ciphertext, client secret, provider response body, or arbitrary caught object.
Switches must be exhaustive with a `never` assertion.

The coordinator must retain the local runtime identity/client independently of
the currently selected runtime. Credential save/remove must never accidentally
target `requireBackendClient()` when a remote runtime is active.

### Save and replace transaction

1. Reject empty or structurally invalid input in main without logging it.
2. Ask the local runtime to validate the candidate against OpenAI without
   changing the active provider.
3. Encrypt and atomically persist the candidate, retaining the prior ciphertext
   only within the operation for rollback.
4. Load the candidate into the local runtime.
5. Publish `configured` and clear the renderer input.
6. If persistence or load fails, restore both prior ciphertext and prior
   in-memory provider state. If rollback itself fails, report a specific
   inconsistent-state error and leave the vault's actual readable state as the
   authoritative state on the next startup.

Do not catch validation, persistence, and runtime failures in one broad block;
each step owns its specific recovery path.

### Remove transaction

1. Atomically remove the persisted ciphertext first.
2. Clear the local runtime's in-memory provider.
3. Publish `not_configured`.

If the runtime clear fails after durable removal, report that the current
runtime may retain the credential until it exits; the next backend start must
remain unconfigured because no ciphertext exists. Do not recreate deleted
ciphertext as a silent rollback.

### Startup and reconnection

- Restore after the local runtime has authenticated, not by placing the key in
  the child environment, command arguments, stdout bootstrap event, or a
  temporary plaintext file.
- Re-run restoration when a replacement local backend instance becomes online.
- Drive restoration from runtime lifecycle events. Do not poll.
- Do not block the entire Setta window on provider restoration; expose an
  explicit loading state and keep typed interaction available.
- A selected remote runtime must not receive the local credential during
  startup or runtime switching.

## Settings and First-Use UX

Extend the existing **Voices** subtab rather than adding a second credential
screen under Developer or Codex Account.

The top card should be **OpenAI voice connection** and include:

- status: **Not connected**, **Connected**, **Secure storage unavailable**, or
  the specific recoverable failure;
- a password input labeled **OpenAI API key** only while adding or replacing;
- **Save and verify**, **Replace**, and **Disconnect** actions as applicable;
- a link opened through the existing external-URL boundary to OpenAI's API-key
  page;
- concise copy that API usage is billed by OpenAI separately from ChatGPT; and
- an explicit note that the credential applies to **Local** and is not sent to
  remote runtimes.

Input requirements:

- `type="password"`;
- disable spellcheck and autocomplete suitable for credential entry;
- never render the saved value, including a masked replica;
- disable duplicate submissions while validation/save is active; and
- preserve an entered candidate after a recoverable validation failure so the
  user can correct it, but clear it after success or navigation away.

The existing master/narrator voice selectors remain independent of credential
state. A user may choose voices before connecting OpenAI; actual capture and
playback remain unavailable until configured.

Replace the current message:

```text
Voice needs OPENAI_API_KEY on the runtime. Typed requests still work.
```

with product language such as:

```text
Voice is not connected. Add your OpenAI API key in Settings → Voices.
```

Every unavailable microphone control must provide an accessible setup action
that opens the existing Settings surface on the Voices subtab and focuses the
credential card. Implement this through typed application navigation state,
not DOM queries or a synthetic click.

When a remote runtime is active, show that runtime's capability status
separately. Do not offer to apply the local key to it and do not claim the local
credential will make remote voice work.

## Recording, Logging, and Privacy

Credential privacy is a release-blocking contract, not an incidental sanitizer
feature.

- Add the save/replace credential IPC channel to the whole-operation sensitive
  channel map. Redact start arguments and failure payloads regardless of
  `SETTA_RECORD_INCLUDE_PAYLOADS`.
- Keep `apiKey` in the generic sensitive-key set as defense in depth.
- Ensure backend HTTP recording reports only method, URL, body type/length, and
  status for credential endpoints.
- Add endpoint-aware redaction before any future recorder is allowed to inspect
  JSON request strings.
- Never interpolate candidate keys into Go/TypeScript errors, assertions,
  test names, process output, React error state, or provider diagnostics.
- Screenshots may show only an empty or browser-masked password control.
- Backend readiness and shutdown logs must remain credential-free.
- The credential validation endpoint must discard the temporary Realtime client
  secret and must not return it to main or renderer.

The deterministic and live workflows must scan the complete finalized artifact
tree, temporary Electron user-data tree, local runtime app-data tree, process
logs, and test summaries for unique markers representing:

- the submitted long-lived API key;
- the replaced/removed prior API key; and
- every ephemeral transcription client secret observed by the fake/live
  orchestration layer.

The ciphertext file is expected to remain. Tests must prove it does not contain
the plaintext marker and that it decrypts only through the credential-vault
adapter.

## Desktop Environment Clean Cutover

Remove `OPENAI_API_KEY` loading from `cmd/setta-backend`. Do not automatically
import an inherited key into secure storage, prefer an environment value over
the saved value, retain a session-only fallback, or emit a deprecation warning.
Remove all user-facing documentation suggesting an environment-prefixed
desktop launch.

Refactor the current combined speech environment loader so
`cmd/setta-backend` receives only the guarded fake-provider base URL used by
production-path E2E tests. This test-only base-URL control must not gain a
credential field or be usable as an alternate installed-app credential source.
Keep `setta serve`'s environment parsing in its server-startup boundary; the
desktop must not call through that path.

## Test Credential Provisioning

Preserve the tests and their meaningful coverage. Change only how a desktop
application under test receives its credential:

- Preserve `instant-voice-capture-live-openai-credentials.mjs` and its unit
  tests. The Node test runner may continue resolving `OPENAI_API_KEY` from its
  own environment or the ignored repository-root `.env`.
- Preserve the registered live OpenAI workflow. After resolving the key, the
  runner must remove it from the Electron/backend child environment and enter
  it through Settings → Voices using the production renderer/preload/main/HTTP
  path.
- Preserve deterministic Electron workflow scenarios that currently inject a
  fake provider key through `extraEnv.OPENAI_API_KEY`. Rewrite their setup to
  save the same fake key through the production BYOK path; do not delete or
  weaken their assertions.
- Preserve `setta serve` environment-configuration and privacy tests because
  that command is outside the desktop cutover.
- Preserve Codex live tests that explicitly unset `OPENAI_API_KEY`; ChatGPT auth
  remains independent from OpenAI Platform speech credentials.
- Replace only tests whose asserted product contract is that the
  Electron-spawned backend reads or clears `OPENAI_API_KEY`. Their replacement
  must assert that inherited values are ignored and cannot configure voice.

The live speech test harness may read `OPENAI_API_KEY` from the test runner's
environment or ignored repository `.env`, but it must:

1. keep that resolution in the Node orchestration process;
2. remove the key from the Electron/backend child environment;
3. enter it through the production Voices UI and typed IPC path;
4. restart Electron and the local backend using the same temporary app data;
5. prove the restored credential works without reinjection; and
6. finalize and scan artifacts after all processes and writers have stopped.

This gives the test runner noninteractive provisioning without keeping
environment-based desktop product behavior.

## Implementation Phases

### Phase 0 — Baseline and contract lock

- [x] Record the current no-key, configured-key, transcription, synthesis,
      restart, and remote-runtime behavior through existing workflows.
      Recorded in
      `docs/reports/byok-desktop-speech-credentials-phase0-baseline-20260718.md`.
- [x] Add unique privacy markers to the fake provider and confirm the current
      artifact scanner's coverage boundaries.
- [x] Record the pinned Electron `safeStorage` API contract and local macOS
      probe. Recorded in
      `docs/reports/byok-desktop-speech-safe-storage-20260718.md`.
- [ ] Confirm `safeStorage` behavior on remaining supported desktop platforms,
      including the actual Linux backend and the failure presented for
      `basic_text`. Attempts and rechecks are recorded in
      `docs/reports/byok-desktop-speech-safe-storage-20260718.md`. The
      2026-07-18 16:14 UTC host-access recheck re-ran the macOS probe with
      exact policy, encryption-availability, and ciphertext-excludes-plaintext
      assertions plus deterministic vault backend-policy coverage successfully,
      then reconfirmed Docker is blocked by Docker Desktop's privileged setup
      prompt and no local Windows/Linux runner, public hosted-result path, or
      checked standard authenticated hosted-result path is available from this
      session. Previous passes added the hosted workflow,
      step-summary JSON, pinned artifact uploads, a Linux default-backend
      observation job, Linux `--no-sandbox`, exact policy status/reason
      assertions, stricter hosted ciphertext/backend assertions, and production
      rejection of unrecognized Linux backend strings. Actual Windows and Linux
      host evidence remains the only open part of this item.
- [x] Freeze the invariant that click-to-local-recording remains independent of
      credential validation and runtime restoration latency. Recorded in
      `docs/reports/byok-desktop-speech-credentials-phase0-baseline-20260718.md`.

### Phase 1 — Mutable Go provider and generated contracts

- [x] Remove initial API-key ownership from the local desktop command and
      provider configuration. `cmd/setta-backend` now loads only endpoint/test
      transport settings, while `setta serve` keeps its explicit startup
      credential in a separate server-startup field.
- [x] Add the exhaustive `electron_vault | server_startup` credential-owner
      policy.
- [x] Add the synchronized credential-aware OpenAI provider controller.
- [x] Add validation, load, and clear service methods and classified errors.
- [x] Register authenticated, bounded HTTP endpoints in the endpoint registry.
- [x] Reject desktop management operations in `server_startup`.
- [x] Regenerate Go-owned TypeScript backend contracts before cleanup.
- [x] Remove API-key environment loading from `cmd/setta-backend`, isolate the
      server-startup loader, and replace only the desktop behavior tests.

### Phase 2 — Electron secure storage and lifecycle

- [x] Implement the injected credential-vault abstraction and `safeStorage`
      production adapter.
- [x] Implement versioned ciphertext persistence, strict decoding, atomic
      replacement, removal, and corrupt-state handling.
- [x] Add the main-process credential coordinator and explicit transaction
      recovery paths.
- [x] Restore into the authenticated local runtime at startup/replacement using
      runtime lifecycle events.
- [x] Add typed IPC operations/events and whole-channel recording redaction.
- [x] Prove the coordinator never targets the active remote runtime.

### Phase 3 — Voices UX and first-use routing

- [x] Add the OpenAI voice connection card to Settings → Voices.
- [x] Add save/verify, replace, disconnect, secure-storage-unavailable, corrupt,
      and retry presentations.
- [x] Replace environment-variable language throughout local-desktop voice
      availability and failure surfaces.
- [x] Route unavailable microphone actions to the Voices credential card.
- [x] Keep voice catalog/selection configuration usable while disconnected.
- [x] Add explicit local-versus-active-remote status copy.

### Phase 4 — Production workflows, live provider, and cleanup

- [x] Add a deterministic Electron BYOK workflow through production
      renderer/preload/main/HTTP/provider/store paths. The registered
      `global-speech-session` workflow now opens a temporary workspace, saves
      the fake OpenAI key through Settings → Voices, validates through the
      provider fixture, persists through the Electron vault, loads the local
      runtime, restarts without `OPENAI_API_KEY`, restores from the vault, and
      scans finalized artifacts plus temporary app data for fake long-lived and
      ephemeral secret markers.
- [x] Cover initial setup, rejected candidate, successful replacement, removal,
      app/backend restart, renderer reload, runtime switch, and local-runtime
      replacement. Covered by
      `.recordings/global-speech-session/20260718T120316456Z`.
- [x] Re-run the complete instant-voice capture/routing/playback workflow with a
      stored fake credential. Covered by
      `.recordings/instant-voice-capture-phase4-workflow/20260718T121814066Z`;
      the workflow now removes `OPENAI_API_KEY` from the Electron child
      environment, saves the fake key through Settings → Voices before capture,
      refreshes renderer capture capabilities after credential-state events,
      and scans finalized recordings plus temporary app data for the fake
      long-lived and ephemeral secret markers.
- [x] Update the live OpenAI workflow to provision only through the production
      UI and prove restart restoration. Covered by
      `.recordings/instant-voice-capture-phase0-live-openai/20260718T123649740Z`;
      the workflow resolves the Platform key in the Node runner, strips
      `OPENAI_API_KEY` from both Electron/backend launches, saves through
      Settings → Voices, and repeats live Realtime transcription after an
      Electron/backend restart using the restored vault credential.
- [x] Scan finalized artifacts and temporary state for old/new/ephemeral secret
      markers on success and failure. The shared workflow finalizer now scans
      artifacts plus temporary state after Electron/backend shutdown and before
      fixture cleanup, redacts failure summaries, and supports root-specific
      marker sets for runtime device tokens. Covered by
      `.recordings/byok-privacy-finalized-global-speech-session-rerun-20260718`
      and
      `.recordings/byok-privacy-finalized-instant-voice-phase4-rerun-20260718`.
- [x] Remove obsolete desktop credential-environment fixtures whose sole
      contract is child-process ingestion, plus the corresponding desktop
      documentation references, without deleting test-runner or `setta serve`
      coverage. The superseded `instant-voice-capture-phase0-baseline`
      workflow was removed from the active Electron manifest and test tree.
      The remaining fake-provider Electron speech workflows now unset
      `OPENAI_API_KEY` in the Electron child environment and save the fake
      credential through Settings → Voices; `setta serve` remote-runtime
      coverage and the live OpenAI test-runner credential resolver remain.
      Verified with `topic-conversation-speech-arbitration`
      (`.recordings/topic-conversation-speech-arbitration/20260718T131252643Z`),
      `topic-conversation-pane-projection`
      (`.recordings/topic-conversation-pane-projection/20260718T131328662Z`),
      `topic-conversation-crash-recovery`
      (`.recordings/topic-conversation-crash-recovery/20260718T131421291Z`),
      and `easy-button-presentation-recovery-phase0`
      (`.recordings/easy-button-presentation-recovery-phase0/20260718T131440289Z`).
- [x] Update README dogfood instructions so the unprefixed production command is
      canonical. `README.md` now names
      `./scripts/prod_record_desktop_session.sh --build` for production desktop
      dogfood recordings and routes OpenAI voice setup through Settings → Voices
      instead of shell-provided speech credentials.

## Focused Verification

During implementation, run the narrowest checks first.

### Go

- Provider-controller tests: configure, validate, reject, replace, clear,
  concurrent read/update, in-flight snapshot semantics, shutdown, and safe
  errors.
- HTTP tests: authentication, request limits, unknown fields,
  `electron_vault`/`server_startup` policies, no-key responses, and no secret
  in responses/errors.
- Command tests: `setta-backend` ignores inherited `OPENAI_API_KEY` and starts
  unconfigured; `setta serve` retains its existing explicit startup contract
  and rejects desktop credential management.
- Runtime privacy tests: config, readiness, logs, validation failure, and
  shutdown never disclose candidate or active keys.

Use the pinned Go toolchain for every Go command:

```sh
./scripts/go.sh test ./internal/speech ./internal/httpapi ./internal/runtime ./cmd/setta-backend ./cmd/setta
```

### Electron main/preload/renderer

- Vault tests: missing, round-trip, replace, remove, corrupt schema/base64,
  decrypt failure, unavailable encryption, Linux `basic_text`, file-permission
  behavior, and atomic write failure.
- Coordinator tests: validation ordering, rollback, removal ordering,
  reconnection restoration, duplicate submission, and remote-runtime isolation.
- Recorder tests: save arguments and failures are wholly redacted even with
  payload recording enabled.
- Preload/IPC tests: generated request decoding, state union decoding, and no
  credential in returned objects.
- Renderer tests: every state, keyboard/focus behavior, password handling,
  unavailable-voice setup navigation, and local/remote copy.

### Required deterministic Electron workflow

The workflow must use temporary app data and a scripted provider but exercise
the production Electron/main/preload/renderer/HTTP/store paths. It must prove:

1. Launch without a credential succeeds and typed interaction works.
2. The user opens Voices, submits a marker key, and provider validation occurs.
3. The saved plaintext is absent from recordings and both app-data trees.
4. Transcription streams through the existing WebRTC path and submits the exact
   completed transcript.
5. Narrator/master synthesis works through the configured in-memory provider.
6. Queueing, steering, cancellation/failure, playback arbitration, and queued
   work preservation remain correct where voice input participates.
7. Renderer reload preserves state without re-entering the key.
8. Full Electron/backend restart with the same temporary app data restores the
   key and repeats transcription and synthesis.
9. A rejected replacement leaves the prior credential working and persisted.
10. Successful replacement removes all active references to the prior key.
11. Disconnect clears the runtime immediately and stays cleared after restart.
12. Switching to a remote runtime does not transmit or apply the local key.

### Required live-provider checks

- Run the live OpenAI speech workflow with ChatGPT/API test concerns kept
  separate: the orchestration process may source the user's Platform key, but
  the app must receive it only through the production BYOK UI.
- Exercise live Realtime transcription and synthesis before and after a full
  app/backend restart.
- Run the live Codex workflow when ChatGPT auth is available because this change
  crosses runtime/provider and topic-conversation speech paths. Keep
  `OPENAI_API_KEY` out of the live Codex child environment. If ChatGPT auth is
  unavailable, report the narrow skip and do not treat deterministic coverage
  as live Codex evidence.

## Final Gates

Because implementation changes generated contracts, provider lifecycle,
desktop persistence, IPC, renderer behavior, and production workflows, the
final implementation change requires the broad gates:

```sh
./scripts/format.sh
./check_quality.sh --all
./scripts/check_supply_chain.sh
```

Run `./scripts/check_supply_chain.sh` even if no dependency is added because the
final change is broad and release-like. If implementation adds a direct
dependency despite `safeStorage` already being available through Electron, pin
it exactly and update lockfiles only through `./update_dependencies.sh`.

## Acceptance Criteria

The plan is complete only when all of the following are true:

- `./scripts/prod_record_desktop_session.sh --build` launches a local desktop
  whose previously saved BYOK credential enables voice without shell state.
- A first-time user can connect OpenAI entirely inside Settings → Voices.
- The local desktop backend does not read `OPENAI_API_KEY` and cannot silently
  import it.
- `setta serve` remains a separate, unchanged runtime-administration surface;
  its credential never becomes a fallback for the desktop.
- The stored file contains ciphertext only and insecure Linux plaintext
  protection is rejected.
- The Go runtime holds the active key only in memory and never returns or
  persists it.
- Provider validation happens before a new credential replaces a working one.
- Replacement, removal, restart, reload, offline launch, corruption, and
  secure-storage-unavailable behavior are deterministic and specifically
  surfaced.
- No local credential is sent to a remote runtime.
- No installed-desktop surface or desktop launch instruction mentions
  environment-variable setup.
- Existing immediate capture, exact transcript submission, queue/steer routing,
  cancellation, narration, voice assignment, and playback arbitration behavior
  remains intact.
- Deterministic and live workflows prove that long-lived and ephemeral secrets
  are absent from finalized artifacts and persisted plaintext state.
- Generated outputs are regenerated from their Go owners and are never edited
  manually.

## Explicit Non-Goals

- A Setta account, Setta-hosted speech proxy, shared Setta OpenAI key, or Setta
  speech billing.
- Reusing or extracting Codex ChatGPT authentication or a Codex API-key login.
- Automatically importing an existing `OPENAI_API_KEY` into secure storage.
- Sending the desktop credential to remote runtimes.
- Changing how `setta serve` administrators configure speech.
- Browser/PWA persistence of long-lived provider credentials.
- On-device transcription or synthesis.
- Additional speech providers or a generic provider-plugin framework.
- Usage dashboards, OpenAI billing controls, or API-key creation inside Setta.
- Any local-desktop backward compatibility, legacy support, migrations,
  transitional code, deprecation paths, dual reads/writes, old aliases, or
  silent fallbacks.

## Outcome

The resulting product boundary is:

```text
Users bring their OpenAI account and pay OpenAI directly.
Setta stores the user's credential locally with OS-backed protection.
The local runtime uses it only in memory to provide the existing voice UX.
Setta never requires an environment-prefixed desktop launch and never becomes
a speech middleman.
```
