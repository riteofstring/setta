# Sprites Phase 1a Probe Evidence - 2026-07-13

## Scope

Evidence captured while re-establishing Sprites access and characterizing a
leftover probe Sprite from an earlier manual session. This records what is
already known before the structured Phase 1a probe battery runs. It maps to the
Phase 1a checklist in
`docs/plans/setta-cloud-platform-sprites-plan.md`.

Status: partial. Version recording and several incidental observations are done;
the systematic capability/permission matrix, root-model, network, cost-cutoff,
attached-idle, and checkpoint probes are not yet run.

## Access re-established

- CLI `sprite` (singular) reinstalled via `curl -fsSL https://sprites.dev/install.sh | sh`
  to `~/.local/bin`. It was absent from PATH; the `~/.sprites/` config/token
  already existed from earlier use.
- Authenticated interactively (`sprite org auth`, browser Fly.io login) as
  `setta-dev@proton.me`, org `setta-100`, endpoint `https://api.sprites.dev`.
- For non-interactive/scripted probes, an org-scoped token
  (`org/token-id/secret`) from `sprites.dev/account` is set via
  `sprite auth setup --token ...` or `SPRITES_TOKEN`. The org token is a secret;
  it stays on the operator machine and never ships to a client (plan rule 6).

## Environment and version record

Captured from the leftover Sprite `setta-phase1a-20260713-a1` before destroying
it.

| Item | Value |
| --- | --- |
| Sprite CLI version | `v0.0.1-rc45` |
| In-Sprite environment version (`/.sprite/version.txt`) | `0.0.1-rc45` |
| Management API | `https://api.sprites.dev`, paths under `/v1/...` |
| Base image | Ubuntu 26.04 LTS ("Resolute Raccoon") |
| Kernel | `6.12.91-fly`, x86-64 |
| Default user | `sprite` (uid 1001, gid 1001), non-root |
| Container runtime present | podman 5.7.0 (docker absent) |
| Languages | node v22.20.0, python 3.13.7, git 2.53.0, bash 5.3.9 |
| Filesystem | 99 GB overlay (`overlay` on `/`), 324 MB used at rest |
| In-Sprite mgmt CLI | `sprite-env` (services, checkpoints) under `/.sprite/bin` |
| Entrypoint | `/.pilot/tini -- "$@"` |
| Org active/warm limits (no plan) | 10 concurrent-active, 10 warm |

The management API returns per-Sprite metadata without waking compute, e.g.
`GET /v1/sprites` and `GET /v1/sprites/<name>` return `status`, `url`,
`labels`, `url_settings`, `created_at`, `last_running_at`, and org-level
`running`/`warm`/`cold` counts plus `running_limit`/`warm_limit`.

## Findings

### 1. Idle-to-zero is trivially defeated (cost concern)

The leftover Sprite ran ~7 hours in `status: running` at load average 0.00 with
zero users. Its keepalive was `tail -f /dev/null` (PID 2 under tini). The
Sprite's own docs (`/.sprite/llm.txt`) claim "when idle, sprites pause
automatically," yet a no-output foreground process kept it billing compute the
entire time. This is direct, early support for the hard-budget-cutoff gate: a
forgotten or hostile trivial process defeats automatic idle-to-zero. Whether
idle-pause fires at all under a genuinely quiescent Sprite still needs a clean
measurement (create fresh, leave untouched, watch for the pause transition).

### 2. Isolation is weak out of the box (security stop-condition)

- The default `sprite` account has **passwordless sudo**
  (`sudo -n true` succeeded; `~/.sudo_as_admin_successful` present).
- The management socket `/.sprite/api.sock` is mode `srw-rw-rw-`
  (world-writable), so unprivileged workload code can at least *connect* to it.

Together these mean the default account has a wide blast radius. Whether the API
behind `api.sock` authorizes destructive/management actions (checkpoint, policy,
deletion, suspension) when called by the guest user is the sharpest Phase 1a
adversarial probe and is not yet answered. Reachability of the socket, however,
is already confirmed.

### 3. Raw-IP egress appears blocked (network policy, partial)

A prior probe artifact (`/tmp/probe.err`) shows `curl 1.1.1.1:443` returned
`curl (7) Could not connect`. Consistent with the documented raw-IP block, but
the full network matrix (private IP, alternate DNS, DNS-over-HTTPS, SMTP by IP,
pre-existing connections, raw sockets, and ordinary developer egress) is not yet
run.

### 4. Container path is podman, not docker

podman 5.7.0 is preinstalled; docker is absent. The rootless-container arm of
the root-model comparison should target podman.

## Commercial-model evidence (supports deferring the Fly inquiry)

Public evidence indicates the customer-per-Sprite model is supported in
practice, so the formal written inquiry to Fly can be deferred to a pre-beta
gate rather than blocking Phase 1a:

- Fly community thread "One sprite for each SaaS customer": Fly staff stated
  "Forking Sprites is one of the most popular requests," with more to come.
- Fly staff clarified the operating model: an org with no plan is capped at 10
  concurrent active Sprites; paid plans raise concurrency and add usage credits;
  billing covers CPU, RAM, and storage only; plans do not impose hard resource
  ceilings (overage at standard rates).
- A published plan ladder ($20 Adventurer through $2,000 Mythic, plus custom
  Guild) is structured around one org running many Sprites.

Still unanswered publicly, and therefore retained as pre-beta inquiry items:
explicit permission to run untrusted end-customer code per Sprite, abuse-
escalation process, data-handling/encryption commitments, and billing-data
granularity/latency.

## Cost baseline correction

The plan's Pre-Code Cost Baseline models only raw usage rates
($0.07/CPU-hour, $0.04375/GB-hour, $0.000683/GB-hour hot,
$0.000027/GB-hour cold). It omits the **subscription plan layer**, which
materially changes per-user economics:

| Plan | Price/mo | Concurrent active | Warm | CPU-hrs | RAM-hrs | Storage |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| (no plan) | $0 | 10 | 10 | usage | usage | usage |
| Adventurer | $20 | 20 | 20 | 450 | 1800 | 50 GB-mo |
| Veteran | $50 | 50 | 50 | 800 | 3200 | 100 GB-mo |
| Hero | $100 | 100 | 100 | 1200 | 4800 | 150 GB-mo |
| Champion | $200 | 200 | 200 | 1800 | 7200 | 225 GB-mo |
| Legend | $500 | 500 | 500 | 3200 | 12500 | 400 GB-mo |
| Epic | $1000 | 1000 | 1000 | 4800 | 18750 | 600 GB-mo |
| Mythic | $2000 | 2000 | 2000 | 7200 | 28000 | 900 GB-mo |

Implications for the Phase 1a assumptions table (still to be built):

- The no-plan 10-concurrent-active cap alone would limit a beta to 10
  simultaneously-awake users; the beta package must assume a paid plan.
- Included CPU/RAM/storage credits change the marginal cost per user, so
  "maximum acceptable provider cost per beta user" must be computed against a
  chosen plan tier, not raw rates.
- Plans are self-service through Epic; Mythic/Guild require contacting
  billing@fly.io.

## Cost positioning (best-fit, not cheapest)

On headline CPU rate, Sprites ($0.07/CPU-hour) is not the cheapest sandbox
provider (E2B and Daytona ~$0.05/vCPU-hour; Modal ~$0.024). Its advantage is
idle-to-zero with a persistent filesystem plus hardware-isolated microVMs,
checkpoints, and wake-on-URL — a better fit for a mostly-idle per-user cloud
computer than a pure price race. Container-based rivals (e.g. Daytona) trade
away the per-Sprite isolation the security model needs. Always-on raw VMs are
cheaper per core but do not scale to zero.

## Phase 1a checklist status

- Fly written inquiry: deferred with recorded justification; pre-beta gate.
- Cost assumptions table + max cost/user + cutoff lag: not built; plan-tier
  input now captured (above).
- Create disposable Sprite + record versions: versions recorded; a clean
  version-stamped disposable for the official run is pending.
- Capability/permission matrix; Tasks/Services/checkpoint/protected-files/
  management-socket endpoints; guest-reachability of URL auth/Ports/Proxy/exec/
  policy/deletion: not run (podman present, sudo, socket mode observed only).
- Two root models (sudo apt, podman, rootless, cgroups, namespaces, bind
  mounts, cold wake); prove root workload cannot reach mgmt socket/state: not
  run.
- Non-destructive hard-cost cutoff under hostile Task/TTY/connection/process:
  not run.
- Network/privilege policy matrix from outside: partial (raw-IP block observed).
- Unauthenticated URL wake behavior; Proxy API as gateway without exposing org
  token: not run.
- Attached-idle behavior (event stream, idle TTY, preview): not run
  (idle-not-pausing observation noted).
- Checkpoint during SQLite/repo writes, inspect without restore, restore: not
  run (checkpoint mechanism mapped: `sprite checkpoint create/list/info`,
  `sprite restore`).
- Destroy disposable + verify: mechanism validated on the leftover Sprite
  (`sprite destroy --force`; `GET /v1/sprites` then returned an empty list).

## Cleanup

Leftover Sprite `setta-phase1a-20260713-a1`
(`sprite-4c6f1c96-6f03-4430-a2e1-92b3e344d119`) destroyed with
`sprite destroy --force`; `GET /v1/sprites` confirmed `running: 0`, empty
`sprites` list. Org has no remaining Sprites and is not billing compute.

## Next steps

1. Build the cost-assumptions table (retained-cold, attached-idle, active-agent)
   against a chosen plan tier; record max provider cost per beta user and max
   cutoff-enforcement lag.
2. Create one clean, version-stamped disposable Sprite for the official run.
3. Run the characterization probe battery (capability/permission matrix, podman/
   rootless container path, checkpoint create/inspect/restore persistence,
   idle-pause timing) via delegated Codex probe scripts.
4. On explicit go-ahead, run the adversarial battery (management-socket
   authorization from the guest, network-policy bypass, hard-cost cutoff under
   hostile load).
