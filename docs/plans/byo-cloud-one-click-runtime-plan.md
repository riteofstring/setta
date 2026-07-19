# BYO Cloud One-Click Runtime Plan

**Date:** 2026-07-05 (revised 2026-07-05, rev 2)
**Status:** Proposal. This extends the remote-runtime direction, but does not
supersede `remote-runtime-plan.md` until accepted as the plan of record. This
revision is fully consistent with plan-of-record decision #3 (Tailscale is the
only remote access method; SSH is used for installation only). On acceptance,
fold the deltas into `remote-runtime-plan.md` (or re-point it here) so there
is exactly one live plan.

**Rev 2 changes:** (1) Tailscale OAuth key-minting is now the default path —
the per-runtime auth-key paste is gone from the happy path. (2) The
credential line moved from "Setta never calls a provider API" to "Setta never
*holds* provider credentials": an opportunistic local-CLI execution layer
runs provider commands on the user's machine, with the user's own
credentials, after per-command approval. Declarative links/paste remain as
the no-CLI fallback. (3) The shape catalog becomes a fallback/hint; live
resolution via the user's CLI is preferred. (4) An explicit mobile-readiness
track: phone testing depends only on the bootstrap contract, not on any
wizard or provisioning phase.

## Intent

Setta should make bring-your-own cloud setup feel as close to one-click as is
reasonable while keeping the core promise:

```text
Users bring compute and credentials.
Setta brings the product.
Setta never holds cloud credentials, never bills for compute, and never
operates infrastructure. Anything Setta executes runs on the user's own
machine, under the user's own identity, after explicit approval.
```

The target experience is not "Setta Cloud." It is:

```text
Describe the machine you need (or just describe the work).
Approve one resolution card: instance type, region, cost, and the exact
command Setta will run.
Wait a few minutes.
The runtime appears in Setta, already paired. Your phone can reach it too.
```

The user still owns the provider account, bill, credentials, tailnet, machine,
and teardown. Setta owns the runtime protocol, pairing flow, installer,
diagnostics, and guided automation.

**Assumed prerequisite: a Tailscale account.** v1 explicitly targets users
willing to have one (our first users are technical). Tailscale is the one
dependency that buys encryption, identity, NAT traversal, discovery
(MagicDNS), browser-valid certs for the phone PWA (`ts.net`), and the mobile
app — all maintained by someone else. Users who reject third-party accounts
can point the same clients at a self-hosted Headscale control server; Setta's
code is identical and we document it, nothing more.

**Honest click count.** Per runtime, the happy path (provider CLI present +
Tailscale OAuth configured) is: one sentence of intent (or "same as last
time"), then one approval of the resolution card. Nothing is pasted, nothing
is transcribed, no browser context-switch. One-time setup (once ever, not per
runtime): Tailscale account + the desktop joining the tailnet + a guided
Tailscale OAuth client for key minting + whatever provider CLI login the user
already has. Without a provider CLI, the per-runtime flow degrades gracefully
to the declarative fallback: quick-create link or console paste — the rev-1
flow, unchanged.

## Product Goals

1. **One decision, one approval.** On the happy path the user makes one
   choice (intent or shape) and gives one approval (the resolution card that
   shows the exact command to be run). Defaults remembered from the previous
   runtime; "same as last time" is a single click.
2. **Zero-copy-paste pairing and keys.** The user never transcribes a pairing
   URL, an IP, or a Tailscale auth key on the happy path. Setta mints
   per-runtime keys via a one-time Tailscale OAuth client; the desktop
   discovers the new runtime over the tailnet (MagicDNS) and completes
   pairing with a token it already holds.
3. **Machine shape by intent, resolved against live data.** The user can pick
   a concrete size or just describe the work ("cheap box for agents",
   "fine-tune a 7B model"). When the provider CLI is present, Setta/AI
   resolves intent against the provider's *live* instance-type listings (and
   real prices where the CLI returns them, e.g. Hetzner); the static catalog
   is only a hint and no-CLI fallback. The resolution — shape, concrete
   instance type, cost, region — is always shown for approval before anything
   runs. AI never picks silently.
4. **Provider-flexible.** One universal execution layer (the user's own CLI)
   plus a universal cloud-init payload, a declarative link/paste fallback,
   and an SSH-install path — together covering effectively every provider
   (see "Provider Compatibility").
5. **Phone works out of the box.** The bootstrap enables `tailscale serve`
   with ts.net certs so the plan-of-record Phase 2 PWA (and Web Push) works
   the moment the runtime pairs — no extra cert or endpoint work. The phone
   path depends only on the bootstrap contract, never on the wizard or
   execution layer (see "Mobile Readiness").
6. **Low maintenance for Setta.** Prefer the user's own CLI, provider-native
   templates, OpenTofu, official provider plugins, cloud-init, and
   Tailscale-maintained tooling over bespoke Setta networking, provisioning
   SDKs, or hand-maintained mapping tables. Setta ships templates and a thin
   generic "run this command with approval" layer — not a provider
   abstraction.
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
   DNS, no server-side execution of anything. Discovery and reachability ride
   the user's tailnet; execution rides the user's machine.

## Non-Goals

- Setta-managed runtimes.
- Setta billing for compute.
- Setta storing or transmitting cloud credentials, long-lived or otherwise.
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
- Alternative transports in v1. SSH-as-transport, Nostr-based discovery
  (nostr-vpn-style beacons), and a native mobile shell were evaluated and
  deliberately deferred — see "Deferred Ideas."

## Machine Shapes

A small provider-neutral catalog remains the shared vocabulary between "what
the user needs" and "what each provider calls it" — but it is a *hint and
fallback*, not the source of truth:

```text
shape         guide                        example mappings
dev-small     2 vCPU / 4–8 GB              aws t3.medium · gcp e2-medium · hetzner cx22
dev-standard  4 vCPU / 16 GB               aws t3.xlarge · gcp e2-standard-4 · hetzner cpx31
dev-large     8+ vCPU / 32 GB              aws t3.2xlarge · gcp e2-standard-8 · hetzner cpx51
gpu-small     entry GPU (T4/A4000 class)   aws g4dn.xlarge · gcp g2-standard-4 · paperspace A4000
gpu-large     serious GPU (A100/H100)      aws p4d/p5 · gcp a2/a3 · lambda/runpod via SSH path
```

Rules:

- **Live resolution first.** When the provider CLI is present, intent/shape
  is resolved against live listings (`aws ec2 describe-instance-types`,
  `hcloud server-type list`, `gcloud compute machine-types list`, ...) —
  current generations, actual regional availability, and real prices where
  the CLI provides them. The static table is consulted only as a starting
  hint and as the no-CLI fallback. This keeps Setta out of the business of
  maintaining instance-type mappings that rot.
- **Intent mapping:** the wizard accepts free text; AI resolves it to a
  concrete instance type + region + cost and must show its resolution for
  approval. AI never picks silently and, in fallback mode, never invents
  instance types outside the catalog.
- Cost display: real numbers when the CLI returns them; otherwise an
  approximate class (e.g. "~$0.17/hr class") with a link to the provider's
  pricing page.
- The fallback catalog is data (a versioned JSON/YAML file), not code, so
  correcting a mapping is a data change.
- Escape hatch: the user can always type an exact instance type; Setta passes
  it through unvalidated with a "your responsibility" note.

## Provider Compatibility

Tiers now describe *execution paths*, decreasing automation, together
covering effectively everything:

```text
Tier 1 — Local CLI execution (the happy path)
  Any provider whose CLI the user has installed and authenticated:
  aws, gcloud, hcloud, doctl, az, ... Setta renders the payload, shows the
  exact command, and runs it locally on approval. Detection is a cheap
  read-only probe (`aws sts get-caller-identity`, `hcloud context active`,
  `gcloud config list`, ...).

Tier 2 — Declarative fallback (no CLI)
  a. AWS quick-create link (pre-filled CloudFormation console).
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

## The Near-Frictionless UX (golden path)

One-time, ever:

```text
0a. Have a Tailscale account; Setta detects the desktop's tailnet membership
    (local `tailscale status`) and guides the join if missing.
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
3. Approve the resolution card. One card shows: provider, instance type,
   region, cost (live if available), and the exact command Setta will run.
   One click.
4. Setta executes, locally:
   - mints a one-off, preauthorized, tagged, short-expiry Tailscale auth key
     via the OAuth client;
   - renders the cloud-init payload with the seeded pairing hash;
   - runs the provider CLI command (e.g. `hcloud server create --user-data
     ...`, `aws cloudformation create-stack ...`) under the user's ambient
     credentials;
   - records the matching teardown command alongside the runtime entry.
5. Wait. Setta watches the tailnet for the runtime's MagicDNS name (handling
   Tailscale's `name-2` dedup suffix), sees it join, polls /runtime/info,
   and completes pairing automatically with the pre-shared token. Progress:
   "waiting for VM" → "joined tailnet" → "installing" → "paired", with a
   doctor report at the end.
6. Done. The runtime appears in Setta, paired. On the phone: install the
   Tailscale app (one-time), open https://<runtime>.<tailnet>.ts.net — the
   PWA and Web Push work immediately because the bootstrap already ran
   `tailscale serve` with ts.net certs.
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
2. **Runtime comes up findable.** The bootstrap joins the tailnet with
   `runtime_name` as the machine hostname; MagicDNS gives the desktop a
   predictable address with no provider API. The desktop watch tolerates
   Tailscale's dedup renaming (`name` → `name-2`) rather than polling a name
   that will never appear.
3. **Desktop discovers and completes.** The desktop reads local
   `tailscale status --json`, polls
   `http://<runtime_name>:<port>/runtime/info` (already unauthenticated)
   until it answers, then calls `POST /pairing/complete` with the plaintext
   token. Existing single-use and expiry semantics apply unchanged.

Required runtime changes:

- A "pre-provisioned pairing token" mode in the pairing store: accept a
  seeded hash + expiry instead of self-minting at startup.
- A longer TTL for provisioning-mode tokens (e.g. 60 minutes — validate
  against real first-boot times). Interactive pairing stays at 10 minutes.

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
  surface stays exactly `/health`, `/runtime/info`, `/pairing/complete`.
- single-use pairing tokens with short expiry; pre-provisioned tokens seeded
  as hashes only.
- Tailscale auth keys: minted per runtime via the OAuth client as one-off,
  preauthorized, tagged, short-expiry (ephemeral optional) — Setta minting
  them guarantees the recommended shape instead of hoping the user checked
  the right boxes. The key that necessarily travels in user data is useless
  after first join. Manual-paste fallback gets the same recommendations via
  deep link + validation.
- Tailscale OAuth client secret: stored in the OS keychain, scoped to
  `auth_keys` only, never written to disk in plaintext, never sent anywhere
  but the Tailscale API from the user's machine.
- run as a non-root service user.
- systemd unit with explicit environment and working directory, ordered after
  tailscaled (`After=tailscaled.service` plus a bounded retry loop, or a
  wait-for-tailnet mode in serve — the tailnet bind fails if the IP is not up
  yet).
- install only signed, checksummed, version-pinned releases (never
  "latest"). Checksums fetched from the same origin as the archive give
  integrity, not authenticity; minisign signing is a Phase 1 requirement once
  cloud-init on other people's VMs pipes our installer into `sh`.
- avoid storing cloud provider credentials on the runtime.
- open no public inbound ports.

Local execution layer rules (new in rev 2):

- **Read-only probes are free; mutations require approval.** Detection
  commands (`sts get-caller-identity`, `context active`, list/describe
  verbs) run without prompting. Any command that creates, modifies, or
  deletes a provider resource is shown verbatim — full argv, rendered
  user-data digest — and runs only on explicit approval.
- **Allowlisted command shapes.** The execution layer runs only commands
  matching a small allowlist of shapes (create-stack / server create /
  instances create / delete-stack / server delete, plus read-only verbs). It
  is not a general shell.
- **User identity, user audit trail.** Everything executes under the user's
  ambient CLI credentials on the user's machine, so provider-side audit logs
  (CloudTrail etc.) attribute actions to the user, not to Setta.
- **Setta stores commands, not credentials.** The runtime entry records the
  rendered create and teardown commands for reproducibility; it never records
  tokens, keys, or credentials.

Cloud-specific resources should be tagged/labeled:

```text
setta:runtime = true
setta:runtime_name = <name>
setta:created_by = user
```

This enables teardown and cost inspection without Setta owning the cloud
account.

## Mobile Readiness

Phone testing is a near-term priority and must not be blocked behind the
wizard, shapes, OAuth, or execution-layer work. The phone path depends on
exactly three things, all in the bootstrap contract:

1. The runtime is on the tailnet and the phone runs the Tailscale app
   (one-time install, user's tailnet).
2. `tailscale serve` is running on the runtime, so
   `https://<runtime>.<tailnet>.ts.net` serves with a browser-valid ts.net
   certificate (secure context → PWA install + Web Push).
3. The runtime is paired, so the phone hits an authenticated, working API.

Consequences:

- **Mobile testing can start before any provisioning UX exists.** A
  hand-set-up runtime (or the Phase 2 SSH path) with `tailscale serve`
  enabled is sufficient. Do not wait for Phases 3–4.
- The bootstrap's `tailscale serve` step and the serve-config it writes are
  the only runtime-side mobile dependencies; they ship in Phase 1 and are
  identical across all tiers and execution paths.
- Nothing in the rev-2 execution layer touches the phone path — it only
  changes how the VM gets created. Mobile risk from this revision: none.
- Add a `setta doctor` check for serve status + cert validity so "phone
  can't reach it" failures are diagnosable from the desktop.

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
setta provision down --runtime-name <name> --json   # run the stored teardown command
setta provision watch --runtime-name <name> --json  # tailnet watch + auto-pair
```

Deliberately absent: a provider SDK, a `plan` engine, server-side execution,
and provider `status` polling. Execution is a thin, allowlisted wrapper
around the user's own CLI — provider API drift surfaces as the provider's own
error text, not as a Setta abstraction bug. "Status" is "has the runtime
joined the tailnet and is `/runtime/info` answering," which `watch` covers.

Rules:

- Commands are idempotent where possible.
- Errors include a stable code, human message, the verbatim provider CLI
  output when relevant, and next suggested action.
- Commands never improvise security-critical defaults.
- `up`/`down` never run a mutating provider command without explicit
  approval; in AI-orchestrated flows the approval is the human clicking the
  resolution card, surfaced through the normal permission flow.

Example error shape:

```json
{
  "ok": false,
  "code": "provider_cli_not_authenticated",
  "message": "The hcloud CLI is installed but has no active context.",
  "providerOutput": "hcloud: no active context set",
  "nextActions": [
    {
      "kind": "run_command",
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
3. Install the Setta runtime binary from a signed, checksummed,
   version-pinned release.
4. Join the tailnet with `runtime_name` as the machine hostname (falling back
   to `--tun=userspace-networking` where `/dev/net/tun` is unavailable).
5. Seed the pairing store with the pre-provisioned token hash and expiry.
6. Start `setta serve --tailnet` under systemd (ordered after tailscaled;
   no-systemd supervision fallback for container hosts) and run
   `tailscale serve` for ts.net certs.
7. Persist a small setup report on disk.
8. Run `setta doctor --json` (including the serve/cert mobile check).
9. Print a pairing URL (redundant on the provisioned path, needed by the
   SSH-installer path, harmless everywhere).

The bootstrap should not:

- install arbitrary language stacks unless explicitly selected.
- mutate user repositories.
- copy developer credentials silently.
- open public firewall ports.
- install provider CLIs on the runtime.

## Setta Desktop Implementation Plan

### Phase 1: Bootstrap Contract (mobile-ready foundation)

Bigger than it looks: `setta doctor`, the systemd unit, the cloud-init
renderer, pre-provisioned pairing mode, tailnet watch, and release signing
are all net-new. Sequence the signing pipeline last within the phase and
dogfood the seeded-pairing + watch slice early (it can be exercised on a
hand-provisioned VM before signing lands).

- Add `setta doctor --json` for runtime capability checks, including
  `tailscale serve` status and ts.net cert validity (the mobile check).
- Add the pre-provisioned pairing token mode (seeded hash + provisioning TTL)
  to the pairing store.
- Add `setta provision render-cloudinit --json` and the cloud-init template
  (pinned release, systemd unit, tailnet join with hostname, seeded pairing,
  `tailscale serve`, userspace-networking and no-systemd fallbacks).
- Add desktop-side tailnet discovery + auto-pair (`setta provision watch` /
  Desktop equivalent) with the progress states from the UX walkthrough and
  dedup-suffix tolerance.
- Add minisign signing to the release pipeline and verification to the
  installer.
- Add tests for cloud-init rendering, shell fragment escaping, and seeded
  pairing.

Deliverable:

```text
User can paste generated cloud-init into any Tier 2 provider and the runtime
pairs automatically when it joins the tailnet. The phone PWA is reachable at
https://<runtime>.<tailnet>.ts.net the moment pairing completes. Mobile
testing can begin here.
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

- Guided one-time OAuth client setup (deep link, two fields, keychain
  storage); per-runtime auth-key minting with the recommended settings.
  Manual key paste remains as fallback.
- Ship the fallback shape catalog (data file) with mappings for AWS, GCP,
  Hetzner, DigitalOcean, Paperspace.
- `setta provision detect --json` (CLI presence/auth probes) and
  `setta provision resolve --json` (live instance-type/price resolution via
  the user's CLI when present; catalog otherwise).
- Desktop wizard: intent text box or explicit pickers; AI resolution shown
  for approval; provider-specific paste instructions for the Tier 2
  fallback.

Deliverable:

```text
"Cheap box for agents" becomes an approved resolution card — concrete
instance type, region, live cost when available — in under a minute, with no
Tailscale key paste.
```

### Phase 4: Local Execution Layer + AWS Quick-Create Fallback

- `setta provision up` / `down`: allowlisted, approval-gated execution of the
  rendered create/teardown commands through the user's own CLI; teardown
  command stored with the runtime entry at creation time.
- Wire the wizard's resolution card to `up` (Tier 1 happy path) with the
  Phase 1 tailnet watch for setup status; failure page explains where to
  find provider-side events and runtime logs, with verbatim CLI output.
- Publish the minimal CloudFormation template and
  `setta provision render-link --provider aws` (quick-create + delete-stack
  links) as the polished no-CLI fallback.

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
- Mobile testing underway using a Phase 1/2 runtime, before Phases 3–4 land.
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
- Execution-layer code stays a thin generic wrapper; no provider-specific
  logic beyond command templates and the fallback catalog.

## Resolved Questions

1. **Transport?** Tailscale only, per plan-of-record decision #3. Assume a
   Tailscale account; document Headscale for self-hosters. SSH is
   install-only.
2. **nostr-vpn?** Not adopted — early-stage as a transport, and it does not
   solve the PWA certificate requirement. Its discovery idea is parked in
   "Deferred Ideas."
3. **CloudFormation-first or OpenTofu-first for AWS's no-CLI fallback?**
   CloudFormation; a quick-create link is just a URL, AWS owns execution and
   audit, zero local tooling. OpenTofu users are served by Phase 5. (With
   the rev-2 execution layer, the AWS happy path is the user's own `aws` CLI;
   the quick-create link is the fallback.)
4. **Minimum teardown story for v1?** Executable stored teardown command on
   the CLI path; generated delete-stack link (AWS) and teardown instructions
   elsewhere, produced at creation time, plus `setta:` resource tags.
5. **How much provider status does Setta read back?** Liveness comes from
   the tailnet and `/runtime/info`, never from provider polling. (Read-only
   CLI probes at provision time are detection, not status monitoring.)
6. **Cloud Shell?** Deferred; Tiers 1–2 cover GCP meanwhile.
7. **Machine type selection?** Live resolution via the user's CLI where
   present, provider-neutral fallback catalog otherwise; AI intent mapping
   with mandatory shown-for-approval resolution; exact-type escape hatch.
8. **Tailscale OAuth vs pasted auth keys?** OAuth client is the default,
   set up once with in-app guidance; pasted keys are the fallback. (Was open
   question #2 in rev 1.)
9. **May Setta execute provider actions?** Locally, with the user's own CLI
   and credentials, behind per-command approval and an allowlist: yes. Held
   credentials, server-side execution, or SDK integration: never. (Revises
   rev-1 goal #8.)

## Open Questions

1. Publish provider templates from the main repo or a separate
   `setta-infra-examples` repo?
2. Should the initial runtime image install only Setta, or also common agent
   CLIs (Codex, etc.) when explicitly requested?
3. Provisioning-mode pairing TTL: 60 minutes proposed; validate against real
   first-boot times on small instances.
4. Which Tier 2 providers get verified paste instructions at launch vs
   docs-only?
5. Which provider CLIs get first-class detection + command templates at
   launch? Proposed: aws, hcloud, gcloud, doctl; az and others as data-only
   additions.
6. Allowlist format for the execution layer: hardcoded shapes in v1, or a
   reviewable data file from the start?
7. Does the resolution card's approval satisfy the per-command approval
   requirement on its own, or should headless/AI-orchestrated flows require
   a second confirmation for `down` (destructive)?

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

## Recommendation

Build Phase 1 first (seeded pairing + tailnet watch + cloud-init + doctor +
signing — together they make every later path actually one-click, and they
alone unblock mobile testing), then the SSH installer, then OAuth key
minting + shapes/wizard, then the local execution layer with the AWS
quick-create fallback.

Do not build a provider SDK abstraction, do not run anything server-side, do
not invent transports. The durable product surface is:

```text
runtime installer + cloud-init renderer + seeded pairing + tailnet discovery
+ live shape resolution (user's CLI) + thin approval-gated execution wrapper
+ doctor + local runtime registry
```

Everything else — quick-create links, OpenTofu examples, paste instructions,
the fallback catalog — is an adapter, link generator, or document that can
evolve without changing the runtime model.
