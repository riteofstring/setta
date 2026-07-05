# BYO Cloud One-Click Runtime Plan

**Date:** 2026-07-05 (revised 2026-07-06)
**Status:** Plan of record. This is the single source of truth for the
remote-runtime and BYO-cloud runtime direction. It supersedes
the earlier remote-runtime plan and BYO runtime architecture report. If another
document contradicts this one, this one wins.

**History:** This plan promotes the original remote-runtime plan into the
one-click BYO-cloud direction. The accepted amendment to the original BYO
compute policy is narrow: Setta still never holds cloud credentials, never
calls provider APIs from Setta-operated infrastructure, and never operates
compute, but it may execute allowlisted provider CLI actions locally on the
user's machine, under the user's own identity, after explicit approval. The
provisioned pairing design uses a seeded attestation secret and HMAC
challenge-response, not Tailscale auth-key consumption metadata.

**Current implementation baseline (2026-07-06):** Some remote-runtime pieces
already exist in-tree (`cmd/setta serve|pair|devices`, runtime auth/pairing
storage, `/runtime/info`, protocol versioning, desktop runtime registry, the
web/PWA adapter, and checksum-based release artifacts). This plan describes
the remaining one-click/bootstrap/provisioning work, not a from-zero rewrite.

## Intent

Setta should make bring-your-own cloud setup feel as close to one-click as is
reasonable while keeping the core promise:

```text
Users bring compute and credentials.
Setta brings the product.
Setta never holds cloud credentials, never bills for compute, and never
operates infrastructure. Any provider action Setta executes runs on the
user's own machine, under the user's own identity, after explicit approval.
```

The target experience is not "Setta Cloud." It is:

```text
Describe the machine you need (or just describe the work).
Approve one resolution card: image, instance type, region, disk, cost, derived
constraints, and the exact secret-free command Setta will run.
Wait a few minutes.
The runtime appears in Setta, already paired. Your phone can reach it too.
```

The user still owns the provider account, bill, credentials, tailnet, machine,
and teardown. Setta owns the runtime protocol, pairing flow, installer,
diagnostics, and guided automation.

## Settled Decisions

Do not relitigate these without updating this plan.

1. **All backend work is Go.** The existing `setta-backend`
   (`internal/runtime`, `internal/httpapi`) is the runtime. The old
   Python/Fly `setta-saas` repo is a parked prototype; lessons only, no code
   reuse.
2. **BYO compute only.** No managed runtimes, no Setta billing, no Setta-held
   cloud credentials, no Setta-operated provider API calls, and no
   relay/tunnel service. Local allowlisted provider CLI execution under the
   user's own identity is permitted after explicit approval; Setta-operated
   infrastructure never performs provider actions.
3. **Tailscale is the only v1 remote access method.** Not SSH forwarding, not
   public HTTPS, not LAN. Tailscale gives encryption, identity, NAT traversal,
   MagicDNS, and phone reachability. SSH is install-only. Other transports are
   deferred until the product is proven.
4. **The runtime serves HTTP behind Tailscale.** Tailscale is the transport
   security boundary. App-level auth still exists because tailnets can be
   shared, devices can be lost, and mobile/web clients need revocable sessions.
5. **One runtime = one human.** No multi-user runtimes. No cross-runtime
   history sync; state lives on the runtime that produced it.
6. **One auth code path.** The local Electron-spawned backend is just a
   pre-paired device using a bootstrap token. No "local skips auth" branch.
7. **Mobile mirrors the desktop.** The phone shows the same project through the
   same pane layout, adapted to a phone viewport. It is not a reduced companion
   app with a curated feature subset. First implementation is a PWA served by
   the runtime over `tailscale serve`; native mobile is deferred unless the PWA
   proves insufficient.
8. **Notifications matter.** "Agent finished", "agent needs approval", and
   "agent responded" push notifications are core product behavior, not polish.

**Assumed prerequisite: a Tailscale account.** v1 explicitly targets users
willing to have one (our first users are technical). Tailscale is the one
dependency that buys encryption, identity, NAT traversal, discovery
(MagicDNS), browser-valid certs for the phone PWA (`ts.net`), and the mobile
app — all maintained by someone else. Users who reject third-party accounts
can point the same runtime HTTP clients at a self-hosted Headscale control
server, but that is an advanced/manual path: Tailscale OAuth key minting and
`ts.net` browser-valid certificates are not assumed there, so mobile PWA
readiness requires user-managed trusted HTTPS. We document it; it is not the
v1 happy path.

**Honest click count.** Per runtime, the happy path (provider CLI present +
Tailscale OAuth configured) is: one sentence of intent (or "same as last
time"), then one approval of the resolution card. Nothing is pasted, nothing
is transcribed, no browser context-switch. One-time setup (once ever, not per
runtime): Tailscale account + the desktop joining the tailnet + tailnet
admin/owner setup for `tag:setta-runtime` and an `auth_keys` OAuth client +
whatever provider CLI login the user already has. The guided setup must detect
non-admin users early and route them to manual auth-key paste with honest copy;
for admins it must show the exact Tailscale ACL/tagOwners and runtime-isolation
policy snippets, validate tag ownership by attempting and then revoking a
scoped test key, validate that runtime-tagged nodes are not granted broad
outbound tailnet access, and explain policy errors specifically. Manual
auth-key paste remains a legitimate path for users who prefer one paste per
runtime over storing an OAuth client secret. Without a provider CLI, the
per-runtime flow degrades gracefully to the declarative fallback: quick-create
link or console paste — the rev-1 flow, unchanged.

## Product Goals

1. **One decision, one approval.** On the happy path the user makes one
   choice (intent or shape) and gives one approval (the resolution card that
   shows the exact secret-free command to be run). Defaults remembered from
   the previous runtime; "same as last time" is a single click.
2. **Zero-copy-paste pairing and keys.** The user never transcribes a pairing
   URL, an IP, or a Tailscale auth key on the happy path. Setta mints
   per-runtime keys via a one-time Tailscale OAuth client; the desktop
   discovers the new runtime over the tailnet (MagicDNS) and completes
   pairing with a token it already holds.
3. **Machine shape by intent, resolved against live data.** The user can pick
   a concrete size or just describe the work ("cheap box for agents",
   "fine-tune a 7B model"). AI may translate intent into typed constraints
   and explain tradeoffs, but deterministic resolver code selects only from
   typed provider CLI results (and real prices where the CLI returns them,
   e.g. Hetzner). The static catalog is only a hint and no-CLI fallback. The
   resolution — image, concrete instance type, region, disk size, cost, and
   the derived constraints behind the choice — is always shown for approval
   before anything runs. AI never picks silently.
4. **Provider-flexible.** One universal execution layer (the user's own CLI)
   plus a universal cloud-init payload, a declarative link/paste fallback,
   and an SSH-install path — together covering the useful majority of
   provider paths without pretending every cloud behaves the same
   (see "Provider Compatibility").
5. **Phone works out of the box on the Tailscale happy path.** The bootstrap
   enables `tailscale serve` with ts.net certs so the plan-of-record Phase 2
   PWA (and Web Push) works the moment the runtime pairs — no extra cert or
   endpoint work. The phone path depends only on the bootstrap contract,
   never on the wizard or execution layer (see "Mobile Readiness").
6. **Low maintenance for Setta.** Prefer the user's own CLI, provider-native
   templates, OpenTofu, official provider plugins, cloud-init, and
   Tailscale-maintained tooling over bespoke Setta networking, provisioning
   SDKs, or hand-maintained mapping tables. Setta ships templates, a small
   typed-action execution layer, and reviewable provider command manifests —
   not a provider abstraction.
7. **AI-drivable, for real.** Every setup step has structured commands,
   machine-readable status, and specific errors. The AI can *execute* the
   boring parts (key minting, VM creation via the local CLI, watching,
   pairing) — not just render documents — while surfacing every mutating
   action for explicit approval.
8. **No Setta-held cloud credentials.** Provider credentials live where the
   user already keeps them: their local CLI config, keychain, browser, or
   console. Setta never stores, proxies, or transmits them. Everything Setta
   executes runs locally under the user's ambient identity and is auditable
   in the provider's own logs (e.g. CloudTrail).
9. **No Setta-operated infrastructure.** No relay, no rendezvous service, no
   Setta-operated DNS, no server-side execution of anything. Discovery and
   reachability ride the user's tailnet; execution rides the user's machine.

## Non-Goals

- Setta-managed runtimes.
- Setta billing for compute.
- Setta storing or transmitting cloud credentials, long-lived or otherwise.
- Setta-owned relays, tunnels, or DNS.
- Server-side or Setta-hosted execution of provider actions. Local execution
  with the user's own CLI and per-command approval is in scope; anything that
  runs outside the user's machine is not.
- A provider SDK abstraction layer. Setta shells out to the user's CLI with
  rendered templates; it does not link provider SDKs or maintain API
  bindings.
- Live pricing *infrastructure*. Where the user's CLI returns prices, show
  them; otherwise show approximate cost classes with a link to the provider's
  pricing page. Setta never calls pricing APIs itself.
- A universal cloud inventory dashboard. Runtime liveness is read from the
  tailnet and `/runtime/info`, never from provider APIs.
- A general Terraform/OpenTofu product.
- Provider-specific lifecycle management beyond bootstrap, teardown
  (executable when the CLI is present, links/instructions otherwise), and
  tailnet-based status.
- Multi-user runtimes.
- Cross-runtime history sync.
- Remote file-explorer or IDE parity.
- Store-submitted WebView wrapper apps.
- TLS termination inside the runtime; HTTPS for mobile comes from
  `tailscale serve` in v1.
- Alternative transports in v1. SSH-as-transport, Nostr-based discovery
  (nostr-vpn-style beacons), and a native mobile shell were evaluated and
  deliberately deferred — see "Deferred Ideas."

## Live Demo Findings to Preserve

The first AWS-over-Tailscale live demo on 2026-07-03/04 proved the core
runtime path and produced a few still-relevant requirements:

- Runtime/desktop compatibility needs more than a protocol integer.
  `/runtime/info` should expose build or feature identity so the desktop can
  surface "runtime older than this app — update it" instead of failing
  silently when behavior differs across builds.
- Self-update through Setta works. The installer and runtime restart were run
  through Setta's own terminal API, which supports the later AI-guided setup
  session design.
- Multi-device terminal dimensions need a policy before mobile is considered
  polished. Two clients attaching the same pane at different sizes currently
  imply resize churn. Candidate policies: size-to-smallest-attached,
  per-client virtual views, or last-attach-wins with a full repaint.

## Machine Shapes

A small provider-neutral catalog remains the shared vocabulary between "what
the user needs" and "what each provider calls it" — but it is a *hint and
fallback*, not the source of truth. The catalog covers the whole bootable
machine contract, not just CPU/RAM/GPU:

```text
shape         guide                        example mappings
dev-small     2 vCPU / 4–8 GB              aws t3.medium · gcp e2-medium · hetzner cx22
dev-standard  4 vCPU / 16 GB               aws t3.xlarge · gcp e2-standard-4 · hetzner cpx31
dev-large     8+ vCPU / 32 GB              aws t3.2xlarge · gcp e2-standard-8 · hetzner cpx51
gpu-small     entry GPU (T4/A4000 class)   aws g4dn.xlarge · gcp g2-standard-4 · paperspace A4000
gpu-large     serious GPU (A100/H100)      aws p4d/p5 · gcp a2/a3 · lambda/runpod via SSH path

default OS    Ubuntu LTS with cloud-init, systemd, apt, and Tailscale support
disk floor    64 GB for dev shapes, 128+ GB for GPU shapes unless overridden
```

Rules:

- **Live resolution first.** When the provider CLI is present, deterministic
  resolver code queries live listings (`aws ec2 describe-instance-types`,
  `hcloud server-type list`, `gcloud compute machine-types list`, ...) for
  current generations, regional availability, and real prices where the CLI
  provides them. The static table is consulted only as a starting hint and as
  the no-CLI fallback. This keeps Setta out of the business of maintaining
  instance-type mappings that rot.
- **Intent mapping:** the wizard accepts free text; AI converts it into typed
  constraints (CPU, RAM, GPU class, budget preference, workload note) and may
  explain tradeoffs. The concrete instance type + region + cost must come
  from typed live candidates or the fallback catalog and must be shown for
  approval. AI never picks silently and, in fallback mode, never invents
  instance types outside the catalog.
- Cost display: real numbers when the CLI returns them; otherwise an
  approximate class (e.g. "~$0.17/hr class") with a link to the provider's
  pricing page.
- **Image resolution is first-class.** Recipes must specify how to choose a
  current image instead of pinning rot-prone IDs in prose: AWS uses public SSM
  parameters for the latest supported Ubuntu LTS AMI per region; Hetzner uses a
  stable image alias; GCP uses image families; other providers must document an
  equivalent deterministic selector or fall back to explicit user choice.
  Resolvers select from trusted deterministic image sources and show the
  bootstrap assumptions they rely on (Linux, cloud-init/user-data support,
  systemd or declared no-systemd path, known package manager). Do not claim the
  CLI metadata proves cloud-init support unless that provider actually exposes
  such a field.
- **Region and disk are typed inputs.** Region selection considers the user's
  preference, provider availability, observed quota/capacity errors, and cost
  when available. Disk size is part of the typed action and approval card, with
  shape defaults that the user can override.
- **Same as last time re-resolves.** Previous choices are preferences, not
  cached facts. Prices, capacity, image IDs/families, and regional availability
  are resolved again and the card highlights material changes.
- The fallback catalog is data (a versioned JSON/YAML file), not code, so
  correcting a mapping is a data change.
- Escape hatch: the user can always type an exact instance type; Setta passes
  it through unvalidated with a "your responsibility" note.

## Provider Compatibility

Tiers now describe *execution paths*, decreasing automation. The goal is
broad useful coverage with honest caveats, not a universal provider fiction:

```text
Tier 1 — Local CLI execution (the happy path)
  Any provider whose CLI the user has installed and authenticated:
  aws, gcloud, hcloud, doctl, az, ... Setta renders the payload, builds an
  allowlisted argv for the typed action, shows the exact secret-free command,
  and runs it locally on approval. Detection is a cheap read-only probe (`aws sts
  get-caller-identity`, `hcloud context active`, `gcloud config list`, ...).

Tier 2 — Declarative fallback (no CLI)
  a. AWS quick-create link (pre-filled CloudFormation console for non-secret
     fields only; secrets are pasted into NoEcho parameters).
  b. Universal cloud-init paste for any provider whose VMs accept user data:
     GCP, Hetzner, DigitalOcean, Azure, Oracle, Scaleway, Vultr, ...
     The wizard shows provider-specific paste instructions (documentation,
     not code).

Tier 3 — SSH installer (existing or SSH-only machines)
  Paperspace, Lambda Labs, and other GPU hosts that expose SSH but not
  user data; plus any machine the user already has (home server, GPU
  workstation).
```

Caveats to be honest about:

- Container-based GPU clouds (Runpod, Vast) give SSH into containers that
  often lack systemd *and* often lack `/dev/net/tun`. The installer needs a
  no-systemd fallback (supervise `setta serve` with a restart wrapper) and a
  `tailscaled --tun=userspace-networking` fallback, or Tier 3 quietly fails
  on exactly the GPU hosts people want. Tier 3 with an asterisk.
- Tier 1 depends on the user's CLI being installed and logged in. Setta
  detects this and offers the provider's official install/login instructions;
  it does not manage CLI installation itself.
- CLI flags drift. Setta surfaces command errors verbatim (plus the rendered
  command) so the user or AI can adapt; there is no abstraction layer to
  keep in sync.
- Tailscale OAuth-created auth keys require tag setup in the user's tailnet.
  The guided setup must validate the chosen tag and fail specifically when
  the OAuth client cannot mint keys for it. Manual auth-key paste remains the
  fallback for users who do not want to touch ACL/tag ownership yet.

## Provider Drift Strategy

Do not try to perfectly anticipate every cloud provider. That becomes a
rotting provider abstraction. The durable product promise is narrower and
stronger:

```text
Given any SSH-reachable or cloud-init-capable Linux machine, Setta can install,
join the tailnet, pair, verify, and run.
```

Cloud provisioning is a convenience layer above that baseline. If a provider
CLI flag changes, the provider recipe may break, but the runtime bootstrap,
SSH installer, cloud-init payload, pairing flow, tailnet discovery, and doctor
checks should remain valid.

Capability tiers:

1. **Universal SSH installer:** the fallback with the least provider
   maintenance. If the user gives Setta `user@host`, Setta can install the
   runtime, join Tailscale, pair, and verify. This covers existing VMs, home
   machines, SSH-only GPU boxes, and providers with unusual APIs.
2. **Universal cloud-init payload:** the preferred generic provisioning
   payload. Most clouds accept user data; Setta renders one provider-neutral
   bootstrap and the provider-specific step is only how that payload reaches a
   VM.
3. **Verified provider recipes:** thin, reviewed recipes for common providers
   and paths: AWS CloudFormation quick-create, AWS CLI, Hetzner `hcloud`,
   DigitalOcean `doctl`, GCP `gcloud`, etc. Recipes should be small enough to
   delete or replace when they drift.
4. **AI adaptation assistant:** when no verified recipe exists, or when a
   verified recipe fails, AI can read provider errors/docs and draft either
   typed parameter changes inside an existing manifest command shape or a local
   recipe-manifest patch for the user to review. It cannot introduce a new
   binary, subcommand, shell shape, file-input kind, or provider action at
   approval time. Genuinely new command shapes require a checked-in manifest
   change and normal local review before execution.

Recipe maintenance rules:

- Keep provider-specific code thin and data-heavy: command manifests,
  templates, docs links, last-verified timestamps, and known caveats.
- Prefer official provider CLIs/templates over SDK integrations.
- Query live CLI data when available instead of maintaining static instance
  mappings.
- Show "last verified" and provider CLI version when presenting a recipe.
- Surface provider CLI output verbatim on failure, plus the typed action that
  produced it.
- Offer an exact-instance-type/advanced override for technical users, but
  still route execution through the same approval and invariant checks.
- Treat provider CLI output, provider docs, and web pages as untrusted input to
  the AI. Error text can explain a failure; it cannot expand the executor's
  authority.
- Treat provider account metadata as user data. Before sending probe output to
  an AI model, the UI must disclose the categories included (for example
  account/profile labels, region lists, quota/capacity errors, and provider
  CLI versions) and redact secrets. Approval cards are built from typed
  resolver output, not free-form model text.
- Let AI propose recipe changes as a local draft; do not let AI mutate the
  checked-in recipe set, execute outside the allowlist, or bypass review.

The UX language should be honest:

```text
I know verified setup paths for AWS, Hetzner, DigitalOcean, and GCP.
For other providers, I can use generic cloud-init or SSH install.
If a provider CLI changed, I can show the failed command and help adapt it.
```

## The Near-Frictionless UX (golden path)

One-time, ever:

```text
0a. Have a Tailscale account; Setta detects the desktop's tailnet membership
    (local `tailscale status`) and guides the join if missing. Tailscale CLI
    discovery is part of this setup: macOS App Store, standalone macOS,
    Windows, and Linux installs expose the binary differently, so Setta must
    probe known locations and show a concrete install/path fix instead of
    assuming `tailscale` is on PATH.
0b. Guided creation of a Tailscale OAuth client (scope: auth_keys). Setta
    deep-links to the console page, explains the two fields to copy, and
    stores the client secret in the OS keychain. This removes the
    per-runtime auth-key paste forever. (Fallback: skip this and paste a key
    per runtime, rev-1 style.)
0c. (Usually already true) Provider CLI installed and logged in. Setta
    probes read-only and shows status; if absent, Tier 2 fallback applies.
```

Per runtime:

```text
1. In Setta: "New runtime → On my cloud."
2. Describe or pick the machine. Free text ("cheap box to run agents on this
   repo") or explicit provider/shape/region — or "same as last time."
3. Approve the resolution card. One card shows: provider, image, instance
   type, region, disk, cost (live if available), derived constraints, idle
   auto-stop setting when offered, and the exact secret-free command Setta will
   run. One click.
4. Setta executes, locally:
   - mints a one-off, preauthorized, tagged, short-expiry Tailscale auth key
     via the OAuth client;
   - renders the cloud-init payload with the seeded pairing hash and
     attestation secret;
   - runs the provider CLI command (e.g. `hcloud server create
     --user-data-from-file ...`, `aws cloudformation create-stack ...`) under
     the user's ambient credentials;
   - records non-secret creation facts, input digests, Tailscale key metadata,
     pending pairing token material and attestation state in the OS keychain,
     and derived teardown argv alongside the runtime entry.
5. Wait. Setta watches the tailnet for the runtime's MagicDNS name (handling
   Tailscale's `name-2` dedup suffix), verifies the node tag, runs an HMAC
   attestation challenge against the candidate runtime, polls /runtime/info,
   and completes pairing automatically with the pre-shared token. Progress:
   "waiting for VM/provider" → "joined tailnet" → "installing" → "paired",
   each with a timeout and state-specific failure page, with a doctor report at
   the end.
6. Done. The runtime appears in Setta, paired. On the phone: install the
   Tailscale app (one-time), then use "Pair another device" on the already
   paired desktop. Desktop asks the runtime over its authenticated connection
   to mint a phone pairing URL/QR. After scanning, the phone opens
   `https://<runtime>.<tailnet>.ts.net/#pair=<token>` — the PWA and Web Push
   work because the bootstrap already ran `tailscale serve` with ts.net certs,
   and the token stays in the URL fragment rather than being sent in HTTP logs.
```

Friction audit of the happy path: decisions = one sentence of intent (or one
"same as last time" click) + one resolution-card approval. Zero pastes, zero
transcription, zero browser context-switches, no SSH by hand. Target: under
5 minutes from intent to paired runtime on a fast-booting provider.

Fallback audit (no CLI, no OAuth client): identical to rev 1 — key paste +
quick-create link or console paste — still under 10 minutes, still no SSH and
no pairing-URL transcription.

## Pairing for Provisioned Runtimes

This is the linchpin of "one-click." Today, pairing works by a human carrying
a runtime-minted `setta://pair?...` URL from the runtime's stdout to the
desktop. That works for interactive setup but fails on a headless cloud VM —
without this section, the happy path would be "SSH in and read the URL."

Invert the handshake:

1. **Desktop pre-mints the pairing secret.** Before rendering the payload,
   Setta Desktop generates a 256-bit pairing token and keeps the plaintext
   locally. Only the SHA-256 hash goes into the payload
   (`pairing_token_hash`). The pairing store already persists tokens hashed,
   so the runtime seeds its store with the hash directly — the plaintext never
   leaves the desktop, and a user-data/instance-metadata leak reveals nothing
   usable.
2. **Desktop pre-mints an attestation secret.** Before rendering the payload,
   Setta Desktop also generates a separate high-entropy secret
   (`provision_attestation_key`) and stores the plaintext only in the OS
   keychain. The secret goes into user data so the intended VM can prove it saw
   the bootstrap payload, but the runtime never returns it. During watch, the
   desktop sends a fresh nonce to the candidate runtime's unauthenticated setup
   attestation endpoint and requires `HMAC-SHA256(attestation_key, nonce ||
   runtime_id || provision_id || node_fingerprint)` before it releases the
   pairing token. This is the security boundary for "is this the VM I just
   provisioned?" and it works identically for OAuth-minted and manually pasted
   Tailscale auth keys.
3. **Desktop pre-mints a provision identity for correlation only.** Before
   rendering the payload, Setta Desktop also generates a high-entropy,
   non-secret `provision_id` and embeds it in user data. The runtime stores it
   for setup reports and authenticated diagnostics. It is not a credential and
   is not a security boundary: if exposed before pairing, another tailnet node
   could echo it. Use it only to disambiguate concurrent Setta provisions and
   to make logs intelligible.
4. **Runtime comes up findable.** The bootstrap joins the tailnet with
   `runtime_name` as the machine hostname; MagicDNS gives the desktop a
   predictable address with no provider API. The desktop watch tolerates
   Tailscale's dedup renaming (`name` → `name-2`) rather than polling a name
   that will never appear.
5. **Desktop discovers, verifies, and completes.** The desktop reads local
   `tailscale status --json` and candidate node metadata, then requires all of
   these before releasing the plaintext pairing token:
   - the responding Tailscale node has the expected `tag:setta-runtime` tag;
   - the candidate runtime passes the HMAC attestation challenge for the
     pending provision;
   - the runtime answers `/runtime/info` with the expected runtime protocol
     range and, when available, an authenticated or setup-report-visible
     `provision_id` matching the pending record.

   If the expected MagicDNS name is squatted, the squatter lacks either the
   expected tag or the attestation secret. If someone reads user data before the
   VM joins, they can answer the attestation challenge and should be treated as
   having compromised the bootstrap payload; this is no worse than stealing the
   Tailscale auth key carried in the same user data. If someone consumes the
   single-use Tailscale key without the attestation secret, the real VM's join
   fails or the candidate fails attestation, producing a fail-safe denial of
   service rather than pairing to an imposter. Existing single-use and expiry
   semantics apply unchanged.

Required runtime changes:

- A "pre-provisioned pairing token" mode in the pairing store: accept a
  seeded hash + expiry instead of self-minting at startup.
- A "pre-provisioned identity" mode: accept a seeded `provision_id`, include it
  in setup reports and authenticated diagnostics for troubleshooting, but do
  not rely on unauthenticated echo as the security check.
- A setup-attestation endpoint: unauthenticated, nonce-based, HMAC-only,
  rate-limited globally, and available only until the first successful pairing
  or until the provisioning TTL expires. It must never reveal the attestation
  secret and must bind the response to the expected runtime/provision identity.
- A longer TTL for provisioning-mode tokens (e.g. 60 minutes — validate
  against real first-boot times). Interactive pairing stays at 10 minutes.
- Desktop watch support for Tailscale tag verification and setup attestation.
  `provision_id` can still help choose among concurrent candidates after the
  Tailscale and attestation checks pass.
- Key lifecycle handling: revoke minted auth keys on failed, canceled, or
  abandoned provisions when they have not been consumed, and record non-secret
  key and node facts in the pending creation record.
- Tests for hostile/wrong tailnet nodes answering with the expected
  `runtime_name`, including MagicDNS squatters that can read another runtime's
  unauthenticated info; the desktop must not send the plaintext pairing token
  unless tag and attestation checks pass.
- Recovery when provisioning TTL expires after the VM is otherwise healthy:
  show a failure page that offers SSH installer re-pairing or an explicitly
  supported `tailscale ssh` re-seeding path, instead of leaving an unpairable
  billing VM. If `tailscale ssh` is a supported recovery option, bootstrap must
  enable it and setup must validate the required Tailscale SSH ACLs; otherwise
  do not advertise that recovery path.

The interactive `setta pair` URL flow remains as-is for the SSH-installer
path (the launcher reads the URL directly from the session) and as manual
fallback.

## Security Posture

The provisioned runtime is private by default:

- bind Setta to the tailnet address (existing `--tailnet` behavior); never
  public `0.0.0.0`.
- run `tailscale serve` in the bootstrap so the runtime gets a ts.net
  certificate — required for the phone PWA's secure context and Web Push.
- keep the runtime HTTP API authenticated with device tokens; unauthenticated
  surface stays exactly `/health`, `/runtime/info`, `/pairing/complete`, and
  the bounded setup-attestation endpoint during the provisioning TTL.
- single-use pairing tokens with short expiry; pre-provisioned tokens seeded
  as hashes only.
- Tailscale auth keys: minted per runtime via the OAuth client as one-off,
  preauthorized, tagged, short-expiry keys — Setta minting them guarantees the
  recommended shape instead of hoping the user checked the right boxes. The key
  that necessarily travels in user data is sensitive until first consumption;
  the attestation secret carried beside it is the runtime identity proof.
  Manual-paste fallback gets the same recommendations via deep link +
  validation, and it gets the same attestation guarantee because attestation is
  independent of how the Tailscale auth key was created. Ephemeral auth keys
  are allowed only for runtimes that will be deleted rather than stopped; an
  ephemeral node that goes offline is removed from the tailnet and cannot be
  restarted as the same runtime.
- Tailscale OAuth client secret: stored in the OS keychain, scoped to
  `auth_keys` only, never written to disk in plaintext, never sent anywhere
  but the Tailscale API from the user's machine.
- Tailscale OAuth blast radius: the stored client secret is more powerful than
  a single pasted auth key because it can mint future auth keys for its
  allowed tags. Treat it as a durable credential. The guided setup must
  restrict the OAuth client to `tag:setta-runtime` only, validate that tag
  ownership works by minting and revoking a scoped test key, and validate
  tailnet ACLs that isolate runtime-tagged nodes: user devices may reach the
  runtime service, but runtime-tagged nodes must not receive broad outbound
  access to the user's laptop, NAS, or other tailnet nodes. Users who do not
  want this durable credential can stay on the manual per-runtime auth-key
  paste fallback without being treated as degraded.
- Desktop runtime credentials: durable device tokens are more valuable than a
  short-lived provisioning token. Introducing keychain support for provisioning
  secrets must also migrate runtime device tokens out of plaintext
  `known-runtimes.json`; the JSON registry should retain non-secret metadata
  and keychain references only. On platforms where Electron `safeStorage` or
  the selected secret backend degrades to plaintext, the app must surface that
  explicitly and document the tradeoff.
- run as a non-root service user.
- systemd unit with explicit environment and working directory, ordered after
  tailscaled (`After=tailscaled.service` plus a bounded retry loop, or a
  wait-for-tailnet mode in serve — the tailnet bind fails if the IP is not up
  yet).
- install only signed, checksummed, version-pinned releases (never
  "latest"). Checksums fetched from the same origin as the archive give
  integrity, not authenticity; minisign signing is a Phase 1C requirement once
  cloud-init on other people's VMs pipes our installer into `sh`. The rendered
  cloud-init must also pin the installer script digest or embed the verified
  installer body directly, so the script that performs signature checks is
  itself authenticated.
- avoid storing cloud provider credentials on the runtime.
- open no public inbound ports.
- teardown must address the tailnet device lifecycle. Because the OAuth client
  is scoped to `auth_keys`, Setta may not be able to delete devices from the
  tailnet; use ephemeral keys only for delete-only liveness models, and
  otherwise surface stale Tailscale device removal as an explicit teardown
  checklist item or require an additional user-approved scope only if product
  requirements justify it later.
- Declarative fallbacks must not leak secrets into durable provider/browser
  history. AWS quick-create links never pre-fill the Tailscale auth key or any
  pairing/attestation secret; the user pastes secrets into the provider form,
  and CloudFormation parameters that carry secrets must be marked `NoEcho`.

Local execution layer rules (new in rev 2, tightened in revs 3 and 4):

- **Typed actions, not AI-emitted commands.** AI/template code requests
  typed actions (`probe_identity`, `resolve_machine_types`, `create_runtime`,
  `delete_runtime`). It never emits shell text or arbitrary argv for
  execution. The executor owns command construction.
- **Read-only probes are allowlisted.** Specific detection and resolution
  commands (`sts get-caller-identity`, `hcloud context active`, bounded
  instance-type listing, etc.) run without prompting. "Read-only" does not
  mean arbitrary provider inventory browsing.
- **Mutations require approval.** Any command that creates, modifies, or
  deletes a provider resource is shown verbatim for the secret-free argv:
  selected account or profile, region, rendered user-data digest, tags, and
  expected resource name. It runs only on explicit approval. Auth keys,
  pairing token material, cloud-init contents, and provider credentials are
  never embedded in argv or approval records.
- **Allowlisted command shapes are a v1 contract.** The execution layer runs
  only command shapes admitted by a checked-in, reviewable manifest from the
  start. The manifest can describe provider-specific binaries, subcommands,
  required flags, allowed flags, blocked flags, allowed file inputs, required
  tags/labels, and which typed action it implements.
- **Hardcoded executor invariants still win.** The manifest cannot make
  Setta a general command runner: no shell execution, no pipes, no redirects,
  no command substitution, no ambient environment expansion, no unconstrained
  file reads, no provider credential copying, and no network/server-side
  execution. If a rendered argv violates executor invariants, it fails
  before approval.
- **Sensitive inputs are file-scoped and digest-tracked.** Rendered user data
  and minted Tailscale auth keys are written only to short-lived files with
  restrictive permissions when a provider CLI requires file input. Approval
  cards and runtime records show file purpose, byte size, and digest, never
  secret contents. Temporary files are deleted after the provider command
  exits.
- **Create and delete approvals are separate.** The runtime creation
  resolution card satisfies the approval requirement for `up` when it shows
  the full execution plan. `down` is destructive and always requires its own
  confirmation at teardown time.
- **Partial creates have a record before mutation.** Before a mutating
  provider command runs, Setta writes a pending creation record containing the
  provider, account/profile when available, region, expected resource name,
  tags, redacted argv, input digests, Tailscale key metadata, and a reference
  to the plaintext provisioning pairing token stored in the OS keychain.
  Success updates it with concrete resource IDs and consumed key/node facts;
  failure keeps enough non-secret facts for diagnosis and manual cleanup.
  Desktop restart resumes the watch from this pending record; it does not
  strand a booting VM with an unrecoverable token.
- **Creates are resumable before retry.** Before creating, Setta performs the
  narrow read-only probe each provider supports for the expected resource name
  or stack name. If a pending record exists, Setta resumes/adopts/diagnoses it
  instead of blindly creating another billing VM. Where provider-native
  idempotency tokens or stack names exist, recipes must use them.
- **User identity, user audit trail.** Everything executes under the user's
  ambient CLI credentials on the user's machine, so provider-side audit logs
  (CloudTrail etc.) attribute actions to the user, not to Setta.
- **Setta stores redacted commands and facts, not credentials.** The runtime
  entry records the redacted create argv, the creation facts needed for
  teardown (provider, account/profile when available, region,
  stack/server/resource IDs, tags), input digests, and the derived teardown
  argv for reproducibility. It never records tokens, keys, cloud-init
  contents, provider credentials, or arbitrary provider inventory output.
  Teardown is derived from the creation record, not regenerated from AI
  intent.

Cloud-specific resources should be tagged/labeled:

```text
setta:runtime = true
setta:runtime_name = <name>
setta:created_by = user
```

This enables teardown and cost inspection without Setta owning the cloud
account.

## Forgotten Runtime and Billing Visibility

Because Setta deliberately avoids provider inventory polling, the runtime list
must carry enough local facts to prevent the worst one-click-create failure:
a forgotten VM that keeps billing after Setta can no longer reach it.

Runtime entries created through Setta should show:

- provider, account/profile when known, region, resource IDs, created-at time,
  and last reachable time.
- an unreachable-age warning: "created via Setta on <date>, unreachable for
  N days — it may still be billing."
- the stored teardown action or provider-console cleanup link/instructions.
- a doctor action that distinguishes "runtime process down" from "machine may
  still exist but is not reachable over the tailnet."

This does not require provider status polling. It only requires local creation
records and honest UI copy. Creation records are non-secret, so Setta should
also write a redacted copy to the runtime setup report once the runtime is
paired. The local registry remains the primary UX source, but durable provider
tags are the ground truth after reinstall/laptop loss; docs must include a
provider-specific "find and delete everything tagged `setta:runtime`" console
recipe for each verified provider.

## Mobile Readiness

Phone testing is a near-term priority and must not be blocked behind the
wizard, shapes, OAuth, or execution-layer work. On the Tailscale happy path,
the phone path depends on exactly four things, all in the bootstrap and
pairing contracts:

1. The runtime is on the tailnet and the phone runs the Tailscale app
   (one-time install, user's tailnet).
2. `tailscale serve` is running on the runtime, HTTPS is enabled for the
   tailnet, and
   `https://<runtime>.<tailnet>.ts.net` serves with a browser-valid ts.net
   certificate (secure context → PWA install + Web Push).
3. The runtime is paired, so the phone hits an authenticated, working API.
4. The paired desktop can request a new pairing URL/QR for another device over
   its authenticated runtime session.

Consequences:

- **Mobile testing can start before any provisioning UX exists.** A
  hand-set-up runtime (or the Phase 2 SSH path) with `tailscale serve`
  enabled is sufficient. Do not wait for Phases 3–4.
- The bootstrap's `tailscale serve` step and the serve-config it writes are
  the only runtime-side mobile dependencies; they ship in Phase 1A and are
  identical across all tiers and execution paths.
- Nothing in the rev-2/rev-3 execution layer touches the phone path — it
  only changes how the VM gets created. Mobile risk from this revision: none.
- Add a `setta doctor` check for serve status + cert validity so "phone
  can't reach it" failures are diagnosable from the desktop.
- Add a "Pair another device" desktop action before claiming mobile readiness:
  the desktop calls the authenticated runtime API to mint a short-lived phone
  pairing URL and renders the QR for the phone. The URL is an HTTPS
  `ts.net` URL with the pairing token in the fragment, for example
  `https://<runtime>.<tailnet>.ts.net/#pair=<token>`, because phones cannot
  rely on the desktop-only `setta://pair` custom scheme. The runtime must know
  or derive its own `ts.net` FQDN, and both desktop and web pairing validators
  must accept this contract. Cloud-init stdout pairing URLs are not a viable
  phone UX.
- Headscale/self-hosted control servers are outside this mobile happy path
  unless the user supplies a browser-trusted HTTPS endpoint. The runtime HTTP
  client model can still work, but `ts.net` certificate automation does not.

## AI-Drivable Provisioning Commands

A small provisioning CLI surface that emits structured JSON. Two layers:
declarative rendering (always available) and local execution (available when
the provider CLI is present; every mutation gated on approval):

```sh
# Declarative (render-only, always available)
setta provision shapes --json                       # fallback catalog + mappings
setta provision render-cloudinit --shape dev-standard --json
setta provision render-link --provider aws --shape dev-standard --json
                                                    # quick-create + delete-stack URLs
setta provision doctor-inputs --json

# Detection + live resolution (read-only, no approval needed)
setta provision detect --json                       # which CLIs present + authed
setta provision resolve --intent "cheap agent box" --json
                                                    # live instance types/prices via
                                                    # the user's CLI when available

# Execution (local, user's CLI, approval-gated per mutation)
setta provision up --provider hetzner --shape dev-standard --json
                                                    # mint TS key (OAuth), render
                                                    # cloud-init, run create command
setta provision down --runtime-name <name> --json   # run the derived teardown argv
setta provision watch --runtime-name <name> --json  # tailnet watch + auto-pair
# Optional lifecycle actions; required before any auto-stop product surface.
setta provision stop --runtime-name <name> --json
setta provision start --runtime-name <name> --json
```

Deliberately absent: a provider SDK, a `plan` engine, server-side execution,
arbitrary command execution, and ongoing provider inventory monitoring.
Execution is a thin typed-action wrapper around the user's own CLI — provider
API drift surfaces as the provider's own error text, not as a Setta
abstraction bug. Runtime status is "has the runtime joined the tailnet and is
`/runtime/info` answering," which `watch` covers. During the bounded
provisioning watch window only, Setta may run allowlisted read-only provider
probes against the specific resource or stack it just created, so failures like
CloudFormation rollback, quota errors, missing default VPCs, or capacity
errors can surface the provider's verbatim reason instead of timing out blind.

Rules:

- Commands are idempotent where possible.
- `up` resumes a pending record before it creates. A retry that cannot prove
  the previous create failed must stop with "adopt, inspect, or rename" choices
  instead of issuing another create.
- Errors include a stable code, human message, the verbatim provider CLI
  output when relevant, and next suggested action.
- Progress states have per-state timeouts and diagnoses. "Waiting for
  VM/provider" points to provider events/capacity/quota; "joined tailnet but
  runtime not answering" points to cloud-init/setup logs and the setup report;
  "paired but doctor failed" points to the specific failed doctor check.
- Resolution cards show the AI-derived typed constraints (budget ceiling,
  workload note, GPU/no-GPU choice, region preference, disk floor) next to the
  resolved provider facts. The user approves a decision, not a mystery.
- Resolution cards include an expandable, secret-redacted cloud-init preview;
  the digest remains the audit anchor but is not the only human-facing detail.
- Idle auto-stop is not a v1 default. It may be offered only after the
  execution layer has typed `start_runtime` and `stop_runtime` actions for the
  provider, an explicit idle definition, a warning channel such as Web Push,
  and provider-aware billing copy. Stopping is not deletion: Hetzner and
  DigitalOcean stopped servers still bill like running servers, AWS stopped
  instances still bill for attached storage, and ephemeral Tailscale keys are
  incompatible with stopped runtimes that need to rejoin later. Until those
  constraints are implemented, the product should offer "still running" /
  "delete this runtime" reminders instead of auto-stop.
- Resolution cards pre-warn for common provider first-run failures where the
  provider error is known to be cryptic, especially AWS vCPU/GPU quota limits.
  The command still runs only after approval and the raw provider output still
  appears on failure.
- AWS resolution includes network placement as typed data: VPC, subnet, and
  security group defaults where available, plus a pre-warning for accounts
  without a default VPC. The executor must not rely on an unstated default VPC
  assumption.
- Commands never improvise security-critical defaults.
- AI may supply intent constraints and prose explanations; typed resolver and
  executor code choose concrete candidates and build argv. If the resolver
  cannot prove a candidate came from live CLI data or the fallback catalog, it
  asks the user for an exact instance type.
- Mutating commands are built from typed actions and checked against the
  allowlist manifest plus executor invariants immediately before approval.
- `up` never runs a mutating provider command without explicit approval; in
  AI-orchestrated flows the approval is the human clicking the resolution
  card, surfaced through the normal permission flow.
- `down` always asks again at teardown time because it deletes resources.

Example error shape:

```json
{
  "ok": false,
  "code": "provider_cli_not_authenticated",
  "message": "The hcloud CLI is installed but has no active context.",
  "providerOutput": "hcloud: no active context set",
  "nextActions": [
    {
      "kind": "manual_command",
      "label": "Log in to Hetzner Cloud",
      "command": "hcloud context create setta"
    },
    {
      "kind": "fallback",
      "label": "Continue without the CLI (console paste)",
      "action": "render_cloudinit"
    }
  ]
}
```

## Runtime Bootstrap Responsibilities

The bootstrap should:

1. Create a non-root `setta` user.
2. Install OS prerequisites and Tailscale via the official install flow.
3. Join the tailnet with `runtime_name` as the machine hostname (falling back
   to `--tun=userspace-networking` where `/dev/net/tun` is unavailable).
4. Write an early setup status marker/report before each subsequent step so a
   joined-but-not-serving machine is diagnosable over `tailscale ssh` where
   available.
5. Install the Setta runtime binary from a signed, checksummed,
   version-pinned release.
6. Seed the pairing store with the pre-provisioned token hash and expiry.
7. Start `setta serve --tailnet` under systemd (ordered after tailscaled;
   no-systemd supervision fallback for container hosts) and run
   `tailscale serve` for ts.net certs.
8. Persist a small setup report on disk.
9. Run `setta doctor --json` (including the serve/cert mobile check).
10. Print a pairing URL (redundant on the provisioned path, needed by the
   SSH-installer path, harmless everywhere).

The bootstrap should not:

- install arbitrary language stacks unless explicitly selected.
- mutate user repositories.
- copy developer credentials or source-control credentials silently.
- open public firewall ports.
- install provider CLIs on the runtime.
- write auth keys, pairing token plaintext, or cloud-init secrets into the
  setup report, service environment, shell history, or runtime registry.

## Source Control Access

Runtime setup and runtime transport are not the same problem as repository
credentials. A Tailscale-connected runtime can be perfectly reachable while
`git pull` still fails because GitHub sees no SSH identity on that box.

v1 should support two explicit source-control modes:

1. **Interactive/YubiKey mode:** the user connects with SSH agent forwarding
   from the machine that holds the YubiKey/private key. The private key stays
   local; the runtime only receives a temporary agent socket for that SSH
   session. This is ideal for manual terminal work, but not sufficient for
   phone-only sessions, background agents, or systemd services that need to
   pull without the laptop session attached.
2. **Autonomous runtime mode:** the runtime has a repo-scoped GitHub deploy
   key. Default to read-only; require explicit approval for write access.
   Store the private key only on the runtime, label it with the runtime name,
   and record enough metadata for teardown/revocation. Do not copy personal
   developer keys or GitHub tokens onto the runtime.

Diagnostics land before automation:

- `setta doctor --json` checks the current workspace's git root, `origin`
  remote, `SSH_AUTH_SOCK`, `ssh-add -l`, and `ssh -T git@github.com` when the
  remote is a GitHub SSH URL. It should report whether the current shell can
  use a forwarded YubiKey/agent and whether GitHub accepts it.
- If the remote uses GitHub HTTPS, doctor warns that SSH/YubiKey forwarding
  will not affect `git pull` until the remote is changed or HTTPS credentials
  are configured.
- If GitHub SSH auth fails, doctor should recommend exactly one of:
  reconnect with agent forwarding for interactive work, or add a repo-scoped
  deploy key for unattended pulls.

Future guided automation:

- "Use my local YubiKey for this SSH setup session" should launch/connect
  with agent forwarding and then verify it with doctor.
- "Let this runtime pull this repo without me present" should generate a
  dedicated key on the runtime and guide adding it as a GitHub deploy key via
  the user's local `gh` auth or browser. Setta may run local `gh` commands on
  the user's machine after approval; it must not ask the runtime to hold broad
  GitHub credentials.
- Runtime teardown should surface deploy-key revocation as a checklist item
  or an executable local `gh` action when the key was created through Setta.

## Setta Desktop Implementation Plan

### Phase 1A: Mobile Runtime Foundation

Do this first on a hand-provisioned VM. It proves the runtime/mobile contract
without any cloud wizard or provider automation.

- Add `setta doctor --json` for runtime capability checks, including
  Tailscale status, `tailscale serve` status, ts.net cert validity, agent CLI
  PATH/auth checks, source-control SSH/GitHub checks, and the setup report
  location.
- Extend `/runtime/info` beyond protocol version with build or feature
  identity so desktop/runtime skew is diagnosed explicitly.
- Add the supported service install shape for a normal Linux VM: non-root
  service user, systemd unit, explicit working directory/environment,
  bounded wait for tailnet availability, and no public inbound ports.
- Make the runtime-served PWA reachable through `tailscale serve` on an
  official Tailscale tailnet with HTTPS enabled.
- Add the authenticated runtime API and desktop UI for "Pair another device"
  so the desktop can display a QR/pairing URL for the phone.
- Keep the existing interactive pairing flow (`setta pair` URL/QR) for this
  slice; seeded provisioning is not required yet.

Deliverable:

```text
On a manually prepared Linux VM already joined to Tailscale, Setta runs as a
service, doctor reports runtime/mobile readiness, and the phone PWA works via
https://<runtime>.<tailnet>.ts.net after normal pairing.
```

### Phase 1B: Seeded Pairing + Tailnet Watch

This is the smallest slice that makes headless provisioning feel one-click.

- Add the pre-provisioned pairing token mode (seeded hash + provisioning TTL)
  to the pairing store.
- Add pre-provisioned `provision_id` for setup correlation and a seeded
  attestation secret for identity proof, plus desktop verification of
  Tailscale `tag:setta-runtime` and HMAC attestation before sending the
  plaintext pairing token.
- Add desktop-side tailnet discovery + auto-pair (`setta provision watch` /
  Desktop equivalent) with the progress states from the UX walkthrough and
  dedup-suffix tolerance.
- Store pending pairing token plaintext in the OS keychain and resume watch
  after desktop restart. Add the same secret-storage abstraction for durable
  runtime device tokens before introducing new keychain-only provisioning
  secrets.
- Add tests for seeded pairing, provisioning TTL, watch progress, and
  MagicDNS dedup handling, including wrong-node/name-squatter cases and
  readable-`/runtime/info` echo attacks that must not receive the plaintext
  token, plus attestation replay/expiry failures.

Deliverable:

```text
A hand-provisioned runtime with a seeded pairing hash pairs automatically
when it joins the tailnet. No user reads a pairing URL from the VM.
```

### Phase 1C: Cloud-Init Bootstrap + Release Authenticity

Only after 1A/1B are solid, make it reproducible through generic user data.

- Add `setta provision render-cloudinit --json` and the cloud-init template
  (deterministic image contract, disk floor, pinned release,
  pinned/verified installer script, early tailnet join with hostname, systemd
  unit, seeded pairing + `provision_id`, `tailscale serve`,
  userspace-networking and no-systemd fallbacks).
- Add minisign signing to the release pipeline and verification to the
  installer. Checksums alone are not enough once cloud-init runs the
  installer on other people's VMs.
- Add tests for cloud-init rendering, shell fragment escaping, secret
  redaction, and signed-release verification.

Deliverable:

```text
User can paste generated cloud-init into one verified Tier 2 provider and the
runtime pairs automatically when it joins the tailnet. The phone PWA remains
reachable at the ts.net URL after pairing.
```

### Phase 2: Existing Machine SSH Launch (install-only)

- Add `setta remote add ssh://user@host`: connect once, run installer,
  install Tailscale, install the service unit (with no-systemd and
  userspace-networking fallbacks for container hosts), start service, read
  pairing URL, pair, disconnect. Transport thereafter is Tailscale — SSH is
  used for installation only, consistent with the plan of record.
- In Desktop: "Add runtime → Existing machine over SSH."
- Preserve a transcript of setup steps for troubleshooting.

Deliverable:

```text
User can point Setta at any SSH-reachable machine (including Tier 3 GPU
hosts) and end with a paired, Tailscale-connected, phone-reachable runtime.
This is also the fastest route to a real mobile test box.
```

### Phase 3: Tailscale OAuth Key Minting + Shapes/Wizard

Product decision: this phase is part of the one-click runtime direction, not a
"maybe never" cleanup phase. The demand gate remains only for scope: ship the
smallest resolver/wizard that removes auth-key paste and shape/image/region
guesswork before adding local provider mutation execution.

- Guided one-time OAuth client setup (deep link, ACL/tagOwners snippet,
  non-admin detection, two fields, keychain storage, tag validation);
  per-runtime auth-key minting with the recommended settings. Manual key paste
  remains as fallback.
- Ship the fallback shape catalog (data file) with mappings for AWS, GCP,
  Hetzner, DigitalOcean, Paperspace, including image selectors, disk defaults,
  and region preferences.
- `setta provision detect --json` (CLI presence/auth probes) and
  `setta provision resolve --json` (live instance-type/image/region/price
  resolution via the user's CLI when present; catalog otherwise). AI provides
  typed intent constraints and explanations; resolver code chooses concrete
  candidates.
- Desktop wizard: intent text box or explicit pickers; deterministic
  resolution shown for approval; provider-specific paste instructions for
  the Tier 2 fallback. If no AI agent is configured or credentials are stale,
  the same flow degrades to explicit pickers and deterministic resolver output.

Deliverable:

```text
"Cheap box for agents" becomes an approved resolution card — concrete
instance type, region, live cost when available — in under a minute, with no
Tailscale key paste.
```

### Phase 4: Local Execution Layer + AWS Quick-Create Fallback

Demand gate: build this only after Phase 3 is justified and users still want
Setta to run provider CLIs on their behalf. This phase carries the most
security and maintenance risk; it buys the smallest UX delta over a working
cloud-init/quick-create fallback.

- `setta provision up` / `down`: approval-gated execution of typed
  provisioning actions through the user's own CLI, constrained by the
  reviewable allowlist manifest and hardcoded executor invariants; teardown
  facts and derived teardown argv stored with the runtime entry at creation
  time.
- Wire the wizard's resolution card to `up` (Tier 1 happy path) with the
  Phase 1B tailnet watch for setup status; during the bounded watch window,
  allow read-only provider probes against the specific created resource/stack
  so the failure page can show CloudFormation rollback, quota, network
  placement, or capacity reasons when the provider exposes them. Runtime
  liveness still comes from the tailnet and `/runtime/info`.
- Require a separate destructive confirmation for `down`.
- Publish the minimal CloudFormation template and
  `setta provision render-link --provider aws` (quick-create + delete-stack
  links) as the polished no-CLI fallback. Quick-create links must not pre-fill
  secrets; secret parameters in the template are `NoEcho`.
- Add typed AWS network placement inputs/resolution for VPC, subnet, and
  security group. Accounts without a default VPC should be diagnosed before
  or immediately after approval with a clear next action.
- Do not ship idle auto-stop in this phase unless typed start/stop actions,
  provider-aware billing copy, restart behavior, warning notifications, and
  non-ephemeral key constraints are implemented together.

Deliverable:

```text
With a logged-in provider CLI: one intent sentence + one approval → paired
runtime, executable teardown stored. Without one: the rev-1 declarative flow,
unchanged.
```

### Phase 5: OpenTofu/Terraform Kit (docs-tier)

- Create `infra/modules/setta-runtime-cloudinit`.
- Examples for AWS, GCP, Hetzner, DigitalOcean, generic cloud-init, using
  official provider plugins and Tailscale-maintained modules where practical.
- Docs distinguish the supported core module from best-effort examples.

Deliverable:

```text
Technical users can provision repeatably without Setta-specific cloud code.
```

## Success Metrics

Early target:

- Happy path (CLI + OAuth configured): intent → paired runtime in under 5
  minutes with exactly one decision and one approval.
- Fallback path (no CLI): signed-in provider account → paired runtime in
  under 10 minutes.
- No manual SSH, no pairing-URL/IP copy-paste, and (happy path) no auth-key
  paste.
- Phone PWA reachable (ts.net cert working) immediately after pairing, with
  no additional setup on the runtime — verified by a `setta doctor` check.
- Mobile testing underway using a Phase 1A/2 runtime, before Phases 3–4 land.
- Runtime setup failures produce a useful `setta doctor --json` report;
  provider-side failures surface verbatim CLI output.
- Teardown stored as an executable command (Tier 1) or link/instructions
  (fallback) alongside creation.

Longer-term target:

- Existing machine SSH setup under 3 minutes.
- Generic cloud-init verified on at least five Tier 2 providers.
- Live resolution covers the top request patterns; the static catalog and
  exact-instance-type escape hatch are rarely needed.
- Tailscale-specific code in Setta stays small and mostly delegates to
  official tooling.
- Execution-layer code stays a thin typed-action wrapper; provider-specific
  executable surface area stays in reviewed manifests/builders and the
  fallback catalog.

## Resolved Questions

1. **Transport?** Tailscale only, per plan-of-record decision #3. Assume a
   Tailscale account for the happy path. Document Headscale for self-hosters,
   but treat it as advanced/manual because Tailscale OAuth key minting and
   `ts.net` HTTPS are not assumed there. SSH is install-only.
2. **nostr-vpn?** Not adopted — early-stage as a transport, and it does not
   solve the PWA certificate requirement. Its discovery idea is parked in
   "Deferred Ideas."
3. **CloudFormation-first or OpenTofu-first for AWS's no-CLI fallback?**
   CloudFormation; a quick-create link is just a URL, AWS owns execution and
   audit, zero local tooling. OpenTofu users are served by Phase 5. (With
   the rev-2/rev-3 execution model, the AWS happy path is the user's own
   `aws` CLI; the quick-create link is the fallback.)
4. **Minimum teardown story for v1?** Executable derived teardown command on
   the CLI path; generated delete-stack link (AWS) and teardown instructions
   elsewhere, produced at creation time, plus `setta:` resource tags.
5. **How much provider status does Setta read back?** Liveness comes from
   the tailnet and `/runtime/info`, never from ongoing provider polling. During
   the bounded provisioning watch window, read-only CLI probes against the
   specific resource or stack Setta just created are allowed so setup failures
   can show provider-native reasons instead of blind timeouts.
6. **Cloud Shell?** Deferred; Tiers 1–2 cover GCP meanwhile.
7. **Machine type selection?** Live resolution via the user's CLI where
   present, provider-neutral fallback catalog otherwise; AI maps intent to
   typed constraints and explanations, deterministic resolver code chooses
   concrete candidates, every resolution is shown for approval, and users keep
   an exact-type escape hatch.
8. **Tailscale OAuth vs pasted auth keys?** OAuth client is the default,
   set up once with in-app guidance; pasted keys are the fallback. (Was open
   question #2 in rev 1.)
9. **May Setta execute provider actions?** Locally, with the user's own CLI
   and credentials, behind per-command approval and an allowlist: yes. Held
   credentials, Setta-hosted execution, server-side provider API calls, or SDK
   integration: never. This is the accepted amendment to the original remote
   runtime BYO-compute policy.
10. **Allowlist format for the execution layer?** A checked-in, reviewable
    data manifest from v1, backed by hardcoded executor invariants. Templates
    and AI request typed actions; only the executor builds argv. The manifest
    cannot authorize general shell execution.
11. **Does the resolution card satisfy per-command approval?** For `up`, yes
    when it shows the exact account/profile, region, shape, cost,
    secret-free argv, tags, and user-data digest. For `down`, no: teardown is
    destructive and requires a separate confirmation at execution time.
12. **Default serve port?** 7345.
13. **Install distribution?** GitHub releases with `SHA256SUMS` covering
    archives and extracted binaries. Minisign release signing remains required
    before cloud-init pipes the installer into other people's VMs.
14. **Whether `/health` should be auth-gated?** `/health` stays
    unauthenticated alongside `/runtime/info`, `/pairing/complete`, and the
    provisioning-only setup-attestation endpoint. Revisit only if the unauth
    surface grows.
15. **PWA device token storage?** `localStorage` is acceptable for the PoC
    because the PWA serves only bundled Setta assets. Revisit if third-party
    content ever renders in the web app.

## Open Questions

1. Publish provider templates from the main repo or a separate
   `setta-infra-examples` repo?
2. Should the initial runtime image install only Setta, or also common agent
   CLIs (Codex, etc.) when explicitly requested?
3. Provisioning-mode pairing TTL: 60 minutes proposed; validate against real
   first-boot times on small instances, and verify the SSH/`tailscale ssh`
   re-seed recovery path on an expired but reachable VM.
4. Which Tier 2 providers get verified paste instructions at launch vs
   docs-only?
5. Which provider CLIs get first-class detection + command builders/manifest
   entries at launch? Proposed: aws, hcloud, gcloud, doctl; az and others as
   data-only additions.
6. What is the v1 Tailscale tag name and ACL isolation policy for
   runtime-tagged nodes? Proposed: `tag:setta-runtime`, validated during setup
   with tag ownership and "no broad outbound tailnet access from runtimes"
   checks.
7. What exact runtime-registry schema stores pending creation records,
   redacted argv, input digests, Tailscale key/node facts, attestation state,
   keychain references, and teardown facts?
8. What exact desktop secret backend is acceptable per platform for OAuth
   secrets, provisioning pairing tokens, attestation keys, and durable runtime
   device tokens? What warning is shown when the platform backend degrades to
   plaintext-equivalent storage?
9. Which providers get v1 start/stop lifecycle actions, if any, and what
   provider-specific billing warnings are required before idle reminders or
   auto-stop can ship?

## Deferred Ideas (with revisit triggers)

Evaluated seriously, deliberately not in v1:

- **SSH as persistent transport** (desktop-managed tunnels; accountless
  desktop path). Revisit if real users demonstrably churn on Tailscale
  onboarding — a measured trigger, not a vibe. The pairing design is
  transport-agnostic, so this slots in later without rework.
- **Nostr discovery beacon** (encrypted runtime-location events on public
  relays, keys derived from the provisioning secret). Only needed if the
  Tailscale dependency is removed; MagicDNS covers discovery today. Keep the
  design notes; build nothing.
- **nostr-vpn as transport.** Watch the project mature; it would slot in as
  an additive transport. Does not solve PWA certs.
- **Native mobile shell with in-app tunnel + localhost WebView.** Solves the
  secure-context requirement without Tailscale, but costs app-store
  distribution and loses free iOS Web Push. Plan of record is PWA-first;
  revisit only if the PWA proves insufficient.
- **GCP Cloud Shell launcher.** Lowest value-per-maintenance path; Tiers 1–2
  cover GCP.
- **Managing provider CLI install/login inside Setta.** Detection and
  deep-linked instructions only in v1; owning credential setup flows is a
  support burden with little upside for technical users.
- **Desktop device-manager UI.** The CLI is enough for the first runtime
  slices; add UI when revocation and multi-device workflows show real demand.
- **Embedded Tailscale via tsnet.** Revisit after the Tailscale-app prerequisite
  becomes a measured source of user churn.
- **Web client for laptops without the app.** Decide runtime-served versus
  hosted only after the phone PWA path is proven.

## Recommendation

Build Phase 1A first (doctor + service shape + `tailscale serve` on a
hand-provisioned VM) to unblock mobile testing. Then build Phase 1B (seeded
pairing + tailnet watch), then Phase 1C (cloud-init + signing), then the SSH
installer, then OAuth key minting + shapes/wizard, then the local execution
layer with the AWS quick-create fallback.

Do not build a provider SDK abstraction, do not run anything server-side, do
not invent transports. The durable product surface is:

```text
runtime installer + doctor + service bootstrap + seeded pairing + tailnet
discovery + cloud-init renderer + signed releases + typed live shape
resolution over the user's CLI + thin approval-gated execution wrapper +
local runtime registry
```

Everything else — quick-create links, OpenTofu examples, paste instructions,
the fallback catalog — is an adapter, link generator, or document that can
evolve without changing the runtime model.
