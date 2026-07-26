# Developer Hosted Runtime Provisioning — 2026-07-27

**Status:** Proposed

## Decision

Add a temporary developer provisioning surface to the existing desktop Runtime
section.

The developer can provision one Setta-managed hosted runtime, watch its real
progress, see when Setta is connected, use it for normal conversation work, and
destroy it from the same place.

The Runtime section is temporary. The provisioning, installation, pairing,
accounting, and cleanup boundaries must be reusable by the Setta 4 Director.
The renderer must not provision Sprites directly.

## Why this is needed

The provider lifecycle works, but there is no safe user path into it:

- the live lifecycle gate can create, exercise, and destroy a real Sprite;
- the control plane can durably reconcile provider creation and deletion;
- the signed runtime installer and private pairing flow exist;
- the desktop can pair and switch runtimes;
- the desktop hosted-access client can receive push-based progress;
- budget enforcement and scheduled deletion exist;
- the Runtime section currently accepts only a pairing URL;
- the current provisioning operation stops at a configured Sprite and does not
  mean that Setta is installed, paired, healthy, and usable;
- the production-shaped hosted Electron workflow uses fixtures rather than a
  real Sprite.

Without a single owned workflow, a developer must manually coordinate these
parts and can mistake “Sprite created” for “Setta connected” or leave a
billable resource behind.

## User outcome

With developer hosted access enabled:

1. Open the Runtime section.
2. Click **Provision hosted runtime**.
3. Watch named progress:
   - Preparing
   - Provisioning
   - Installing Setta
   - Pairing
   - Connecting
   - Connected
4. Open a hosted test workspace.
5. Start a conversation and receive streamed output.
6. Close and reopen the desktop app without losing the runtime or conversation.
7. Click **Destroy hosted runtime**.
8. See **Removed** only after the provider confirms absence.

The ordinary manual pairing form remains available for non-managed runtimes.

## Meaning of “Connected”

The UI may show **Connected** only when all of these are true:

- the control plane owns the expected managed identity;
- the Sprite exists with the authorized resource shape and URL policy;
- the signed Setta release is installed;
- the runtime health and identity checks pass;
- the desktop has a valid revocable device credential;
- the runtime is registered in the desktop runtime registry;
- the active runtime connection state is `connected`;
- the desired and observed releases match.

Provider creation alone is **Provisioning**, never **Connected**.

A green indicator always means the definition above. Do not use green for a
Sprite that merely exists, is warm, or can be reached by the provider API.

## Scope

### Included

- one developer-owned hosted runtime;
- one fixed resource policy;
- one fixed developer spending ceiling;
- signed Setta runtime build and installation;
- runtime health and identity verification;
- private desktop pairing without showing or copying a pairing URL;
- a safe hosted test workspace;
- real Codex ChatGPT login performed against the active hosted runtime;
- push-based provisioning and connection progress;
- durable deletion requests and verified provider absence;
- restart recovery;
- explicit final provider inventory;
- production-path Electron and live-provider verification.

### Not included

- the Setta 4 Director UI;
- a customer cloud setup wizard;
- provider, region, machine-size, or resource controls;
- multiple hosted runtimes;
- team or multi-user access;
- phone UI;
- private repository credential transfer;
- silently copying local Codex credentials into a Sprite;
- keeping backward-compatible experimental provisioning paths;
- the cold-soak or full measurement campaign.

## Architecture

```text
Runtime section
  -> generated desktop command/progress contract
  -> Electron main hosted-runtime controller
  -> control-plane admin boundary
  -> durable ensure/install/pair/delete operations
  -> Sprites provider + signed runtime installer

Control-plane progress
  -> SSE over the private admin boundary
  -> Electron main
  -> preload event bridge
  -> runtime store
  -> visible Runtime row
```

The renderer never receives `SPRITE_TOKEN`, a provider endpoint, a raw runtime
credential, or a pairing URL.

The control plane remains the owner of provider mutations, retry, fencing,
budget cutoff, and deletion. The Electron main process owns desktop runtime
registration and secure credential storage.

### Likely ownership map

- `internal/controlplane/`
  - durable ensure, install, pair, health, budget, progress, and delete state;
- `internal/runtimeinstall/`
  - provider-neutral signed release installation and rollback;
- `internal/runtimepair/`
  - private runtime bootstrap and device pairing;
- `internal/sprites/`
  - provider operations and Sprites-local workload leases;
- `cmd/setta-control-plane/`
  - trusted developer controller and private admin entry points;
- `cmd/generate-contracts/`
  - generated TypeScript contracts and value sets;
- `desktop/src/main/`
  - private control-plane client, secure credential storage, and registry
    activation;
- `desktop/src/preload/` and `desktop/src/shared/`
  - narrow typed command and progress bridge;
- `desktop/src/renderer/src/stores/runtime-store.ts`
  - merged provisioning and connection projection;
- `desktop/src/renderer/src/components/runtime-picker.tsx`
  - temporary developer Runtime-section controls and status;
- `desktop/tests/electron/`
  - production-path deterministic and live workflows.

## Contract changes

Go owns the contracts and status values. Regenerate TypeScript after changing
them. Do not add hardcoded TypeScript mirrors.

Add an internal developer-hosted-runtime operation contract with:

- stable operation ID;
- runtime registry ID after pairing;
- operation kind: ensure or destroy;
- phase;
- retryability;
- stable reason code;
- occurred-at timestamp;
- last-connected timestamp when available;
- enforced budget in USD micros;
- reported covered usage in USD micros when available;
- scheduled deletion time;
- terminal outcome.

Required phases:

- `preparing`
- `provisioning`
- `installing`
- `pairing`
- `connecting`
- `connected`
- `retrying`
- `needs_attention`
- `destroying`
- `removed`

Do not infer phases from error text or provider strings. Use exhaustive Go
values, generated TypeScript unions, `satisfies` mappings, and `never`
assertions.

The existing product-facing `EnsureHostedAccessIntent` must stay free of
provider and runtime management fields. The developer status contract is an
internal diagnostics surface and must not be reused as the Setta 4 customer
contract.

## Provisioning workflow

### 1. Preflight

Before any provider mutation:

- require the explicit developer feature flag;
- verify that the hosted release contains the supported Codex CLI;
- never read or copy the developer's local Codex credential store;
- resolve the Sprites credential in the trusted controller process;
- prove the provider inventory contains no conflicting Setta developer
  runtime;
- create or reopen the durable control-plane state;
- create a stable developer user and operation ID;
- install the fixed budget policy;
- schedule deletion before exposing the runtime as usable;
- build and locally verify the Linux runtime release and verifier;
- reject uncommitted generated contract drift;
- reject a budget that cannot cover the configured cutoff reserve and exposure.

Developer defaults:

- one active hosted runtime;
- 30-minute session;
- $1.00 covered usage ceiling;
- hard developer maximum of $5.00;
- fixed current resource policy;
- 1024 MiB minimum free-disk guard.

The UI does not expose editable resource, provider, or region fields.

### 2. Ensure provider runtime

Use the existing durable control-plane ensure operation:

- derive the managed identity from the developer user;
- inspect before create;
- adopt an already-created matching runtime after ambiguous success;
- create only when absent;
- configure authenticated URL access;
- verify labels, identity, resource policy, and URL policy;
- emit push progress for queued, reconciling, retrying, failed, and
  provisioned states.

Provider inspection failure must not remove deletion authority over a known
run-owned runtime.

### 3. Install Setta

Deepen the control-plane ensure pipeline so success does not stop at provider
creation.

Reuse the provider-neutral signed installation code currently exercised by the
hosted measurement path:

- upload and verify the release verifier;
- verify the signed release locally and remotely;
- install into the protected persistent layout;
- seed runtime identity and storage policy;
- configure workload accounting and renewable workload leases;
- create or update the Setta runtime Service;
- wait for bounded health checks;
- verify runtime identity and desired release;
- roll back a failed update when an authorized prior release exists.

Installation failure leaves the operation retryable or terminal with a stable
reason code. It does not report the runtime as connected.

### 4. Pair the desktop

After health succeeds:

- mint a single-use pairing/bootstrap credential in the trusted boundary;
- pair with the hosted runtime without exposing the pairing URL to the
  renderer, logs, recordings, or clipboard;
- store the resulting device credential through the existing Electron secure
  credential store;
- add the hosted runtime to the existing runtime registry;
- switch to it;
- verify that the registry reports `connected`;
- revoke or expire unused bootstrap material.

Do not copy the local Codex credential store into the Sprite.

### 5. Codex login

Once the hosted runtime is active, the existing Codex account UI must operate
against that runtime.

The developer signs in using the normal ChatGPT authorization flow. The test
must prove:

- `OPENAI_API_KEY` is unset;
- the credential is created inside the hosted runtime through the supported
  Codex login flow;
- the credential is not returned through the renderer contract or written to
  control-plane logs;
- logout and runtime destruction remove the hosted credential with the
  runtime.

### 6. Hosted test workspace

The first version creates a new non-sensitive test workspace inside the hosted
runtime. It does not attempt to reinterpret a desktop path as a remote path.

The workspace must be visibly labeled **Hosted test workspace**.

Transferring the current developer repository is a separate follow-up. That
follow-up must define explicit exclusions, secret scanning, dirty-worktree
handling, size limits, cancellation, and conflict behavior before it can send
local files to a Sprite. Private Git credentials are out of scope for this
plan.

## Runtime section UI

### Runtime row

For the managed hosted runtime, show:

- display name: **Hosted developer runtime**;
- a persistent status label, not only a color dot;
- a green dot only for **Connected**;
- last connected time;
- automatic deletion time;
- enforced budget;
- reported usage when authoritative accounting data exists;
- a short stable failure explanation when attention is needed.

If usage has not been reported, show **Usage pending**. Do not fabricate a
local estimate from elapsed wall time.

### Actions

When no managed hosted runtime exists:

- **Provision hosted runtime**

While work is in progress:

- **Cancel provisioning** when cancellation is still safe;
- **Destroy hosted runtime** once a provider resource may exist.

When connected:

- **Switch to hosted runtime**
- **Switch to local runtime**
- **Destroy hosted runtime**

For a managed hosted runtime, the current **Close** action is not sufficient.
It only removes a desktop registry entry and could hide a billable Sprite.
Replace it with:

- **Disconnect from this app** only when an operator explicitly needs it; and
- **Destroy hosted runtime** as the normal destructive action.

Destruction requires confirmation that states the runtime filesystem and
hosted Codex login will be deleted.

### Status behavior

Do not label a disconnected runtime **Paused** unless the control plane has an
authoritative provider activity observation. Client disconnection,
unreachability, warm suspension, and cold state are different conditions.

Use:

- **Connecting** while establishing the desktop runtime connection;
- **Reconnecting** after a previously connected runtime becomes temporarily
  unreachable;
- **Needs attention** for terminal provisioning, credential, health, or budget
  failures;
- **Destroying** until provider absence is verified;
- **Removed** only after verification.

## Cost and cleanup safety

### Budget

Install the budget policy before provisioning. The controller rejects any
ensure request without:

- a covered usage ceiling;
- a safety reserve;
- a maximum cutoff lag;
- a bounded cutoff exposure;
- renewable workload accounting.

The UI shows the enforced budget and authoritative reported usage. Budget
cutoff suspends new agent work and reports a typed reason.

### Automatic deletion

Schedule deletion durably before the desktop reports **Connected**.

The deletion controller must:

- survive desktop and control-plane process restart;
- stop useful workload through lease expiry even if the desktop disconnects;
- retry provider deletion with fencing;
- verify provider absence;
- retain a visible **Cleanup pending** state until absence is proved.

A laptop-local timer is not sufficient. If the durable control plane is not
hosted independently for the developer flow, the plan may claim automatic
compute cutoff but must not claim automatic deletion while the laptop is off.
That limitation must remain visible in the UI until an independently running
controller owns expiration.

### Reconciliation

On controller and desktop startup:

- reopen unfinished ensure and deletion operations;
- inventory only Setta-managed developer runtimes owned by this environment;
- adopt matching run-owned resources;
- surface unknown or mismatched resources for operator action;
- never destroy an unowned Sprite;
- retry scheduled or interrupted deletion;
- require an empty final inventory after explicit destruction.

## Failure behavior

| Failure                      | Visible result              | Required action                                      |
| ---------------------------- | --------------------------- | ---------------------------------------------------- |
| Provider unavailable         | Retrying                    | Bounded control-plane retry                          |
| Provider identity mismatch   | Needs attention             | Stop; do not adopt or mutate                         |
| Release verification failure | Needs attention             | Do not install or connect                            |
| Health check failure         | Retrying or Needs attention | Bounded retry or rollback                            |
| Pairing failure              | Needs attention             | Revoke partial credential; keep deletion available   |
| Desktop disconnect           | Reconnecting                | Runtime work follows workload lease policy           |
| Budget cutoff                | Needs attention             | Stop new work; preserve data; keep destroy available |
| Deletion retry               | Cleanup pending             | Continue durable retry                               |
| Provider confirms absence    | Removed                     | Remove registry entry and local secret               |

Errors shown in the UI come from stable typed reason codes with explicit copy.
Do not pass through raw provider responses or credentials.

## Implementation slices

### Slice 1 — Full ensure operation

- Move the reusable runtime preparation composition out of the measurement-only
  command boundary.
- Make the control-plane ensure operation include signed install and health.
- Add durable phases for install and pairing.
- Preserve retry, fencing, restart replay, and cleanup authority.

Exit: a control-plane operation reaches ready only for a healthy installed
Setta runtime.

### Slice 2 — Developer controller

- Add the explicit developer-only entry point.
- Resolve credentials in the trusted process.
- Create durable state outside the repository.
- Install budget and expiration policy.
- Expose ensure, progress, destroy, and inventory over the private boundary.
- Support restart and interrupted cleanup.

Exit: one command can provision and destroy without manual provider commands.

### Slice 3 — Desktop connection

- Add generated contracts and typed IPC.
- Store hosted runtime credentials securely.
- Add and activate the runtime registry entry.
- Make connection state and provisioning state converge deterministically.
- Keep manual pairing separate.

Exit: the desktop automatically reaches `connected` without showing a pairing
URL.

### Slice 4 — Runtime section

- Add **Provision hosted runtime**.
- Show persistent phase text and accessible status indicators.
- Show budget, authoritative usage, last connection, and deletion time.
- Add explicit destroy and cleanup-pending states.
- Prevent registry-only close from hiding a managed runtime.

Exit: the developer can always answer “Am I connected?” and “Is anything still
billing?” from the Runtime section.

### Slice 5 — Hosted Codex and workspace

- Create the hosted test workspace.
- Run ChatGPT login against the hosted runtime.
- Submit a conversation.
- Verify streaming, queueing, steering, cancellation, completion, failure, and
  reload.
- Verify work can finish under a valid lease after the desktop disconnects.

Exit: the developer can use a real hosted Setta conversation.

### Slice 6 — Cleanup and recovery

- Destroy from the Runtime section.
- Verify provider absence before removing local state.
- Test app exit during provisioning, install, pairing, conversation, and
  deletion.
- Test control-plane restart and stale-operation recovery.
- Test budget cutoff and expiration.
- Add a final independent provider inventory assertion.

Exit: no tested path silently strands a billable runtime.

## Verification

During implementation, run the narrowest package and component checks first.

Required final gates:

1. `./scripts/format.sh`
2. `./check_quality.sh --all`
3. `./scripts/check_supply_chain.sh` when manifests, lockfiles, release
   tooling, or dependency configuration change
4. focused control-plane ensure/install/pair/delete tests
5. focused desktop runtime-store and Runtime-section tests
6. deterministic production-path Electron workflow covering:
   - app launch;
   - provision request;
   - push progress;
   - signed install and health;
   - automatic pairing;
   - connected indicator;
   - workspace creation;
   - streamed conversation;
   - queueing and steering;
   - cancellation and failure;
   - reload and restart;
   - budget cutoff;
   - destruction;
   - final provider absence
7. live Codex Go and Electron gates with ChatGPT auth and
   `OPENAI_API_KEY` unset
8. one explicitly authorized live Sprite run with a declared spending ceiling
9. independent `sprite list` verification after the live run

The deterministic Electron workflow must use the real
Electron/main/preload/renderer/HTTP/store paths. A component-only or fake
renderer test is not sufficient.

## Live acceptance test

The plan is complete when a developer can:

1. start from an empty Sprite inventory;
2. click **Provision hosted runtime**;
3. watch every phase without opening a terminal;
4. see **Connected** only after signed install, pairing, health, and registry
   connection succeed;
5. sign into Codex with ChatGPT auth on the hosted runtime;
6. create and use the hosted test workspace;
7. stream a real response;
8. reload the desktop app and reconnect;
9. switch between local and hosted runtimes;
10. click **Destroy hosted runtime**;
11. see **Removed** only after provider absence is verified;
12. confirm `sprite list` is empty;
13. confirm actual covered usage stayed below the declared ceiling.

## Setta 4 handoff

Setta 4 removes the Runtime sidebar and does not expose infrastructure choices.

Keep and reuse:

- ensure/install/pair/delete operations;
- progress and reason codes;
- secure device credentials;
- budget and accounting enforcement;
- expiration and reconciliation;
- connected/needs-attention semantics.

Replace:

- **Provision hosted runtime** with a Director-issued hosted-access intent;
- the Runtime row with Director progress and a small account/settings
  diagnostics surface;
- explicit runtime switching with automatic placement.

No provider-facing field from the temporary developer UI becomes part of the
ordinary Setta 4 client contract.
