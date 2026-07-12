# Sprites Phase 1a Probe Evidence - 2026-07-13

## Scope

Evidence for Phase 1a of the Setta Cloud Platform plan. Covers re-establishing
Sprites access, characterizing and destroying a leftover probe Sprite, and both
the characterization and adversarial/constructive-boundary probe batteries run
against a clean disposable Sprite. Maps to the Phase 1a checklist in
`docs/plans/setta-cloud-platform-sprites-plan.md`.

Status: characterization and adversarial batteries complete; no stop-condition
fired (see Stop-condition assessment). Remaining Phase 1a work: the
cost-assumptions table, idle-pause/attached-idle timing, applied-egress-policy
bypass testing, unauthenticated-URL wake behavior, and confirming `warm` cost.

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
| Default user | `sprite` (uid 1001, gid 1001), nominally non-root but holds a broad ambient capability set (see finding 2) |
| Container runtime present | none in base image (podman and docker both absent); user namespaces work (`unshare -Ur`, cgroup v2) |
| Languages/tools (base image) | bash 5.3.9, git 2.53.0, curl 8.18.0, python 3.13.7, Rust 1.90.0, Java 25, GCC 15.2.0, jq 1.8.1 |
| Agent tooling (base image) | Claude Code 2.1.204, Codex CLI 0.143.0, Gemini 0.50.0; `$HOME` has `.claude`, `.codex`, `.cursor`, `.gemini` |
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

### 2. Isolation is effectively nonexistent by default (security stop-condition)

Confirmed on a fresh base-image Sprite (`setta-phase1a-20260713-char`), so these
are defaults, not artifacts of prior tinkering:

- The default `sprite` account (uid 1001) is nominally non-root but carries a
  **broad ambient Linux capability set** in its effective, permitted,
  inheritable, bounding, and ambient sets, with `no-new-privs=0`. Decoded
  `CapEff` = `cap_dac_override, cap_sys_admin, cap_setuid, cap_setgid,
  cap_chown, cap_fowner, cap_fsetid, cap_kill, cap_setpcap, cap_net_bind_service,
  cap_net_admin, cap_net_raw, cap_sys_chroot, cap_mknod, cap_audit_write,
  cap_setfcap`. With `cap_dac_override` the account read/wrote `/root`
  (mode `drwx------`, root-owned) directly — a live write to
  `/root/.setta_probe_write` succeeded. So the default workload account is
  **root-equivalent without even invoking sudo**; Unix user separation provides
  no boundary at all.
- The account also has **passwordless sudo** to a full root shell.
- The management socket `/.sprite/api.sock` is mode `srw-rw-rw-`
  (world-writable), so unprivileged workload code can at least *connect* to it.

Together these confirm settled boundary 13: the trusted Setta runtime cannot
rely on Unix users (or the absence of sudo) to isolate untrusted workload/agent
code inside one Sprite. A real internal boundary (dropped capabilities +
`no_new_privs` + seccomp, a user namespace, or a container) must be constructed
by Setta, not assumed. The adversarial pass answered the follow-on question: the
socket is not only reachable but **unauthenticated and actionable** from the
guest — a local process created a checkpoint through it with no credential (see
adversarial finding A1). It exposes services and checkpoints, not full-org
control, and does not leak the org token. A buildable inner boundary contains
this (finding A2), so it is a design task rather than a fundamental stop.

### 3. Default outbound egress is wide open (corrects an earlier note)

An earlier note here claimed raw-IP egress was blocked, based on a stale
`/tmp/probe.err` artifact on the leftover Sprite. The adversarial pass on a fresh
Sprite shows the opposite: with **no policy applied** (the default;
`/.sprite/policy` is empty), outbound is essentially open. Confirmed by live
output — raw public-IP HTTPS to `1.1.1.1`, DNS-over-HTTPS to `8.8.8.8`, a TCP
connect to port 25 of a mail IP, and ICMP `ping 1.1.1.1` all **succeeded**; only
RFC1918 private IPs (`10.0.0.1:443`) were refused (default microVM isolation, not
a Setta policy). The guest also holds `cap_net_raw`/`cap_net_admin`. So broad
outbound — including spam-capable SMTP and raw sockets — is the default, and
Setta must **apply** an egress policy and then re-test it for bypass; this is not
a property that comes for free. See adversarial finding 4.

### 4. No container runtime in the base image, but namespace primitives work

Neither podman nor docker is present on a fresh base image (the podman 5.7.0
seen earlier was installed during the prior manual session, not shipped). The
kernel primitives a rootless runtime needs are present, though: `unshare -Ur id`
succeeds and reports root inside a new user namespace, `/proc/self/cgroup` is
cgroup v2 (`0::/`), and the account already holds `cap_sys_admin`. So the
rootless-container arm of the root-model comparison is feasible but requires
Setta to install and configure the runtime (e.g. podman) itself.

### 5. Checkpoint restore is a whole-Sprite reset (filesystem + processes)

Driven through the in-Sprite `sprite-env checkpoints` CLI: created a checkpoint,
modified a marker file under `/home/sprite`, then restored. The marker rolled
back to its pre-checkpoint content (overlay filesystem rollback confirmed), and
a `sleep` process that was running before the restore was **gone afterward** —
restore restarts the environment and does not preserve running processes or
in-memory state. Checkpoint metadata is readable via the management API
(`GET /v1/sprites/<name>/checkpoints/<id>`); the in-Sprite `checkpoints get`
returned 404. This supports settled boundary 18 (restore is a whole-runtime
rollback, not a per-project undo) and flags that any session/queue/transcript
state must be reconstructible after a restore.

## Adversarial findings

Run via `scripts/sprites/phase1a_adversarial.sh` (delegated Codex, high effort)
against `setta-phase1a-20260713-char`. Reversible probes only; all artifacts
cleaned up.

### A1. The management socket is unauthenticated and actionable from the guest

From the default guest, `curl --unix-socket /.sprite/api.sock http://sprite/...`
successfully performed local management actions with no credential: `GET
/v1/services`, `GET /v1/checkpoints`, and a `POST /v1/checkpoint` that **created
checkpoint `v1`** (then deleted for cleanup). `/v1/sprites` and `/v1/policy`
returned 404 over the socket, so the local socket exposes a subset (services and
checkpoints), not full-org control — the org token is not exposed. But any local
process can create checkpoints and read/manage services with no authentication.
This is the concrete confirmation behind finding 2: untrusted in-Sprite code can
drive part of the management surface.

### A2. A buildable inner boundary exists — this is a design task, not a stop

No single off-the-shelf model was sufficient, but a composed one is:

- **Capability drop + `no_new_privs`** (`setpriv`, uid 65534, all caps dropped):
  `CapEff=0`, sudo blocked, `/root` write denied, yet HTTPS and a C compile still
  worked. **But `/.sprite/api.sock` stayed reachable** (a filesystem path, not
  gated by capabilities) and still returned data.
- **Mount namespace masking `/.sprite`**: the socket became
  `No such file or directory` / "Could not connect", while ordinary Python/HTTPS
  still worked and `/root` write failed — but namespace-root retained broad caps,
  so masking alone is also insufficient.
- **Podman rootless**: installed but `podman run` failed on `/dev/net/tun` and
  `/dev/fuse` permission errors — not usable as-is on this image.

Composing the working pieces — **unprivileged uid + `no_new_privs` + empty
capability sets + a mount namespace that masks `/.sprite/api.sock` and other
trusted-runtime paths** — removes capability-root, sudo escalation, DAC override,
and socket reachability while preserving developer ergonomics. So the default
isolation gap (finding 2) is a required **boundary-design task for the launcher
that starts untrusted workloads**, not a fundamental stop-condition. Do not rely
on podman rootless as the boundary on this image.

### A3. A non-destructive hard-cost cutoff exists (defuses a stop-condition)

`POST /v1/sprites/<name>/suspend` returned `ok` and moved status from `running`
to `warm` at the first poll, ~1s later, with no `sprite destroy`. So the control
plane can stop active compute quickly without deleting the Sprite — the plan's
"can't stop billable compute without destroying user data" stop-condition does
not hold. Caveat: suspend lands in `warm`, not `cold`; whether `warm` still bills
resident memory (versus a storage-only paused state) is a Phase 1c measurement.

### A4. Egress must be actively policed (see finding 3)

The two-sided network test confirmed ordinary dev egress works (GitHub clone,
`pip download`, GitHub API) and that the default has no abuse containment (raw
IP, DoH-by-IP, SMTP:25, ICMP all open; only RFC1918 blocked). The next network
step is to **apply** a Sprites egress policy through the management API and
re-run this matrix to test for bypass; the default-open baseline is now
established.

## Composed launcher boundary — validated

Prototyped and proven via `scripts/sprites/phase1a_launcher_boundary.sh`
(delegated Codex, high effort), then independently re-run by the reviewer with
identical results. The launcher runs an arbitrary workload inside a composed
boundary; trusted code uses `sudo` only to set up the namespace/mounts, then
drops all privilege before `exec`-ing the workload:

1. `sudo -n unshare --mount --pid --fork --mount-proc` (new mount + PID namespace)
2. make mounts private; mount empty tmpfs over `/.sprite` and `/.pilot`
3. `cd` to the workload workdir
4. `setpriv --reuid 65534 --regid 65534 --clear-groups --no-new-privs
   --inh-caps=-all --ambient-caps=-all --bounding-set=-all`
5. `env -i` with a normal PATH, then `exec` the workload

**Containment — all passed** (verified live): inside the boundary
`uid=65534(nobody)`, `CapEff/CapPrm/CapInh/CapBnd/CapAmb = 0`, `NoNewPrivs: 1`,
`/.sprite/api.sock` is absent and the socket `curl` fails, `sudo` is blocked by
no-new-privs, a root-owned setuid helper could not re-escalate
(`euid=65534`), `/root` and `/etc` writes are denied, and the trusted state
(`~/.sprites`, `.codex`, `.claude`, `.config`, real `/.sprite`) is unreadable.

**Ergonomics — all passed**: workdir read/write, a Python script, a C
compile+run, a GitHub clone over HTTPS, `pip download`, and an HTTPS GET all
worked inside the boundary.

**Service entrypoint — passed**: the same launcher ran as a `sprite-env` Service
(uid 65534, zero caps, no-new-privs, masked socket), so Setta can launch
untrusted workloads this way, not just interactively.

So the isolation gap is closed by a reusable launcher built from stock
primitives — no custom sandbox framework. Remaining hardening before
productization (Phase 2+): a seccomp profile, cgroup CPU/memory/PID limits, a
network namespace/policy mode, baking pip/tooling into the runtime image instead
of per-run install, and regression tests for socket masking, caps, no-new-privs,
setuid, and the Service entrypoint.

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

## Cost assumptions table (Phase 1a)

These are **assumptions**, to be replaced by Phase 1c measurements. Rate card:
CPU $0.07/CPU-hour, memory $0.04375/GB-hour, hot storage $0.50/GB-month, cold
storage $0.02/GB-month; metering minima 6.25% CPU + 0.25 GB memory per active
second (a ~$0.0153/hour active floor).

Stated assumptions (each is a measurement gap for Phase 1c):
- Sprite shape while active is not yet measured; model assumes billing scales
  with actual CPU/RAM used above the floor.
- Per-user workspace: 20 GB.
- Whether `warm` bills resident memory is unconfirmed (suspend lands in `warm`).
- Hot→cold storage migration timing is unmeasured; "blended" storage below
  assumes mostly-cold at rest with brief hot windows.

Three cases, monthly (730 hours):

| Case | CPU/RAM assumption | Compute/mo | Storage/mo | Total/mo |
| --- | --- | ---: | ---: | ---: |
| Retained but cold | none (not active) | $0 | 20 GB cold = $0.40 | **~$0.40** |
| Attached-idle, suspended promptly | floor only, ~1s to suspend | ~$0 | ~$0.40 | **~$0.40–1** |
| Attached-idle, left active 4 h/day | ~0.06 CPU + ~1 GB | ~$5.8 | ~$0.40 | **~$6** |
| Attached-idle, forgotten 24/7 (no suspend) | floor 24/7 | ~$11.2 | ~$0.40 | **~$11–35** |
| Active agent, light (2 h/day, 1 vCPU, 2 GB) | 60 h active | ~$9.5 | ~$2 blended | **~$11–12** |
| Active agent, heavy (4 h/day, 2 vCPU, 4 GB) | 120 h active | ~$38 | ~$2–10 | **~$40–48** |

Cost levers this exposes:
1. **Aggressive suspend on disconnect** (the measured ~1s non-destructive cutoff)
   keeps attached-idle near cold cost instead of the $11–35 range — this is the
   single most important control.
2. **Hot→cold storage migration**: hot is 25× cold ($0.50 vs $0.02/GB-month), so
   20 GB left hot is ~$10/month by itself.
3. **RAM footprint during active hours dominates compute** ($0.04375/GB-hour).
4. The per-user **hard budget must trigger suspend** (non-destructive) before
   overspend.

Proposed thresholds — **NEEDS YOUR CONFIRMATION** (business calls):
- **Maximum acceptable provider cost per beta user: ~$25/month.** Covers a
  moderately active user; heavier usage is throttled/suspended by the hard
  budget. Should map to a chosen plan tier's per-user allocation rather than raw
  usage.
- **Maximum cutoff-enforcement lag: ≤ 60 seconds** from control-plane decision to
  compute actually stopping. The measured `suspend` (~1s) clears this easily;
  set the budget so the cap triggers suspend well before overspend.

Plan-tier implication: a bounded beta must budget a monthly plan fee (not just
usage) whose concurrent-active count covers expected simultaneous users and whose
included CPU/RAM/storage credits cover N users at the per-user envelope above; the
no-plan 10-concurrent cap is too small for anything but the earliest internal
ring.

## Cost positioning (best-fit, not cheapest)

On headline CPU rate, Sprites ($0.07/CPU-hour) is not the cheapest sandbox
provider (E2B and Daytona ~$0.05/vCPU-hour; Modal ~$0.024). Its advantage is
idle-to-zero with a persistent filesystem plus hardware-isolated microVMs,
checkpoints, and wake-on-URL — a better fit for a mostly-idle per-user cloud
computer than a pure price race. Container-based rivals (e.g. Daytona) trade
away the per-Sprite isolation the security model needs. Always-on raw VMs are
cheaper per core but do not scale to zero.

## Characterization harness

The non-adversarial probes were run through a committed, reusable harness,
`scripts/sprites/phase1a_characterize.sh` (authored via delegated Codex, medium
effort). It requires `--sprite <name>`, refuses to call `sprite create`/`sprite
destroy`, cleans up everything it creates via an EXIT trap, and writes a
structured Markdown report to `--out`. It was run against
`setta-phase1a-20260713-char`; the full per-probe command log is retained in the
run's results file. The harness covers probe A (capability/permission matrix),
B (`sprite-env` services lifecycle), C (checkpoint create/restore rollback),
D (podman/namespaces/cgroups + one benign HTTPS check), and E (base-image
inventory).

## Adversarial harness

The adversarial + constructive-boundary probes were run through
`scripts/sprites/phase1a_adversarial.sh` (delegated Codex, high effort). Same
conventions as the characterization harness (requires `--sprite`, refuses
create/destroy via an explicit lifecycle guard, EXIT-trap cleanup, `--out`);
reversible probes only. Both harnesses pass `bash -n` and
`./scripts/shellcheck.sh`.

## Stop-condition assessment

- **Isolation gap: NOT a stop-condition — boundary now validated.** The default
  account is capability-root and the management socket is unauthenticated from
  the guest (findings 2, A1), but a composed inner boundary (unprivileged uid +
  `no_new_privs` + empty caps + mount-namespace masking of `/.sprite`) contains
  all of it while preserving dev ergonomics, and works as a Service entrypoint —
  built and verified as a reusable launcher (see Composed launcher boundary).
- **Non-destructive hard-cost cutoff: EXISTS.** `POST .../suspend` stops active
  compute in ~1s without deletion (A3). Corresponding stop-condition does not
  hold, pending a `warm`-cost measurement.
- **Network containment: validated.** Default egress is open (findings 3, A4),
  but an applied host-enforced domain egress policy contains every abuse vector,
  preserves dev egress, and cannot be bypassed or removed by capability-root
  guest code (see Egress policy — validated). One operational rule: apply the
  policy before untrusted code runs (pre-existing connections survive a later
  tightening).

No Phase 1a stop-condition fired. The core architectural risk resolves into
concrete build tasks.

## Egress policy — validated

Tested via `scripts/sprites/phase1a_egress_policy.sh` (delegated Codex, high
effort) and independently re-verified by the reviewer. Sprites enforces a
DNS-domain egress allow/deny policy through the management API
(`GET/POST /v1/sprites/{name}/policy/network`, body
`{"rules":[{"action":"allow|deny","domain":"..."}]}`; default is `{"rules":[]}`
= allow-all). Applying an allowlist + `{"action":"deny","domain":"*"}`:

- **Contains abuse:** raw public IP (`1.1.1.1`), RFC1918 (`10.0.0.1`),
  DoH-by-IP (`8.8.8.8`), SMTP TCP:25, and ICMP were all blocked.
- **Preserves dev egress:** `git clone`, `pip download`, and HTTPS to allowed
  hosts (github, pypi) still worked.
- **Unbypassable from the guest:** the capability-root default account could not
  modify or remove the policy — `/.sprite/policy` is a read-only filesystem, the
  local socket policy routes 404, and even `sudo` + `cap_net_raw` could not ping
  a denied IP. Enforcement is provider/host-side, not mutable Sprite-local state.
- **Caveat:** a TCP flow opened *before* the policy is applied survives the
  tightening. So Setta must apply the policy at provisioning, before any user or
  agent code runs, and use suspend/restart to cut active hostile sessions.

Reviewer re-verification (independent): under a deny-most policy, `1.1.1.1`
returned "Could not connect", `github.com` returned 200, a guest write to
`/.sprite/policy` returned "Read-only file system", and the policy reverted
cleanly to `{"rules":[]}`.

## Access path and lifecycle (URL wake, Proxy, attached-idle)

Tested via `scripts/sprites/phase1a_url_idle.sh` (delegated Codex, high effort).

- **Unauthenticated URL wake.** In the default `auth: sprite` URL mode, an
  unauthenticated external request returns `HTTP 302` to Sprites auth and does
  **not** wake compute — status stays `warm`/`cold` (reviewer-verified: 302 and
  status stayed `warm`). In `auth: public` mode, an unauthenticated request to a
  live routable HTTP service **does** wake compute to `running`. Implication:
  keep runtime URLs in `auth: sprite`; a `public` URL is a wake-on-request cost/
  abuse vector that needs rate controls before use.
- **Proxy API as a client gateway: not directly usable.** The Proxy transport is
  `WSS /v1/sprites/{name}/proxy`; an authenticated upgrade reaches `101 Switching
  Protocols`, an unauthenticated one gets `401`. There is **no scoped/non-org
  Proxy credential** — direct use requires a Sprites org Bearer token, which must
  never reach a client (plan rule 6). So client access needs a backend gateway
  that holds the org token (the Candidate-B direction for the Phase 3 access-path
  decision), not a direct client-to-Proxy path.
- **Attached-idle keeps compute active; disconnect is fast.** An idle TTY, an
  open SSE/event stream, and a held preview HTTP client each keep the Sprite
  `running` with no Task. Deliberate disconnect drops it to `warm` within ~6s.
  Combined with the ~1s `suspend` cutoff (A3), idle cost is controllable by
  disconnecting/suspending promptly — the dominant cost lever from the
  cost-assumptions table.

## Phase 1a checklist status

- Fly written inquiry: deferred with recorded justification; pre-beta gate.
- Cost assumptions table + max cost/user + cutoff lag: not built; plan-tier and
  measured `suspend` cutoff latency (~1s) now available as inputs.
- Create disposable Sprite + record versions: done (`setta-phase1a-20260713-char`).
- Capability/permission matrix: done. Default account is capability-root;
  management socket is unauthenticated/actionable from the guest for services and
  checkpoints (A1). Guest-reachability of URL auth, Ports, Proxy, and deletion
  over the socket: `/v1/sprites` and `/v1/policy` returned 404 over the socket
  (not guest-reachable there); a full external-vs-socket endpoint map is still
  worth completing in Phase 1b.
- Two root models: characterized and resolved. The constrained-account model is
  viable as a validated composed launcher (see Composed launcher boundary);
  podman rootless is broken on this image.
- Cost-assumptions table: built (retained-cold, attached-idle, active-agent) with
  proposed max-cost-per-user (~$25/mo) and max cutoff lag (<=60s) pending
  confirmation. See Cost assumptions table.
- Non-destructive hard-cost cutoff under hostile keepalive: done — `suspend`
  works in ~1s (A3).
- Network/privilege policy matrix: done. Default-open baseline established
  (3, A4); an applied host-enforced domain egress policy contains abuse,
  preserves dev egress, and is unbypassable by capability-root guest code (see
  Egress policy — validated). Caveat: apply before untrusted code runs.
- Unauthenticated URL wake behavior; Proxy API as gateway without exposing org
  token: done. `auth: sprite` blocks unauth wake (302, stays warm); `auth:
  public` + service wakes on unauth request. Proxy (`WSS .../proxy`) needs an org
  Bearer token with no scoped client credential, so a backend gateway is required
  (Access path and lifecycle).
- Attached-idle behavior (event stream, idle TTY, preview): done. TTY, SSE, and
  preview each keep compute `running`; deliberate disconnect drops to `warm` in
  ~6s (plus the ~1s explicit `suspend`).
- Checkpoint create/inspect/restore: done (whole-Sprite reset). SQLite/repo-write
  variant and the credential-epoch override check remain for later phases.
- Destroy disposable + verify: mechanism validated on the leftover Sprite, and
  the characterization/adversarial disposable destroyed after both runs (below).

## Cleanup

- Leftover Sprite `setta-phase1a-20260713-a1`
  (`sprite-4c6f1c96-6f03-4430-a2e1-92b3e344d119`) destroyed with
  `sprite destroy --force`; `GET /v1/sprites` confirmed an empty list.
- Disposable `setta-phase1a-20260713-char`
  (`sprite-e7da3c35-d1ea-49ae-a4e2-92f5fa807317`) served the characterization and
  adversarial runs, then was destroyed and verified absent.
- Disposable `setta-phase1a-20260713-bnd`
  (`sprite-89c5596b-46e2-4449-84ce-69fd59ec7401`) served the launcher-boundary
  prototype and its independent re-run; the harness self-cleaned (purged its
  temporary `python3-pip`, deleted the test Service) and the Sprite was destroyed
  and verified absent.
- Disposable `setta-phase1a-20260713-net` served the egress-policy and
  URL/Proxy/attached-idle runs (both harnesses reverted policy/URL-auth and
  cleaned up), then was destroyed and verified absent. The org has no remaining
  Sprites.

## Phase 1a exit assessment

All Phase 1a exit criteria are met, and no stop-condition fired:

- **One useful root/workload boundary chosen and validated** — the composed
  launcher (Composed launcher boundary).
- **Non-destructive hard-cost cutoff proven** — `suspend` in ~1s (A3).
- **Network boundary validated** — host-enforced domain egress policy,
  unbypassable by guest (Egress policy — validated).
- **Checkpoint restore characterized** as a whole-Sprite reset (finding 5); its
  "cannot become authoritative over a credential epoch" enforcement is a Phase 2
  control-plane task, not a Sprites capability gap.

The only open Phase 1a item is a business decision, not a technical gate: your
confirmation of the two cost thresholds and whether `warm` bills resident memory.

## Next steps

1. **You:** confirm the two cost thresholds (max cost/user ~$25/mo, max cutoff
   lag <=60s) and, for the cost model, whether `warm` bills resident memory; then
   pick the beta plan tier.
2. **Phase 1b:** pin the Sprites Go SDK and build the minimum typed lifecycle
   adapter (create/inspect/exec/service/policy/checkpoint/restore/destroy) over
   the proven mechanisms.
3. **Phase 1b/2:** harden the validated launcher (seccomp, cgroup CPU/mem/PID
   limits, network namespace), fold `suspend` into the control-plane hard-budget
   design, and keep runtime URLs in `auth: sprite` with a backend Proxy gateway
   holding the org token (the Phase 3 access-path direction).
