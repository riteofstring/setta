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
by Setta, not assumed. Whether the API behind `api.sock` *authorizes*
destructive/management actions (checkpoint, policy, deletion, suspension) from
the guest is the sharpest remaining adversarial probe and is not yet answered;
socket reachability, however, is confirmed.

### 3. Raw-IP egress appears blocked (network policy, partial)

A prior probe artifact (`/tmp/probe.err`) shows `curl 1.1.1.1:443` returned
`curl (7) Could not connect`. Consistent with the documented raw-IP block, but
the full network matrix (private IP, alternate DNS, DNS-over-HTTPS, SMTP by IP,
pre-existing connections, raw sockets, and ordinary developer egress) is not yet
run.

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

## Phase 1a checklist status

- Fly written inquiry: deferred with recorded justification; pre-beta gate.
- Cost assumptions table + max cost/user + cutoff lag: not built; plan-tier
  input now captured (above).
- Create disposable Sprite + record versions: done. Clean disposable
  `setta-phase1a-20260713-char` created (`--skip-console`, label
  `setta-phase1a`); versions recorded above.
- Capability/permission matrix (characterization): done for the ordinary and
  sudo/root actors — the default account is already broadly capability-root (see
  finding 2). `sprite-env` services create/list/get/delete verified. Still
  pending (adversarial): guest-reachability/authorization of the management
  socket, URL auth, Ports, Proxy, exec, policy, and deletion endpoints.
- Two root models (characterization): namespace/cgroup primitives verified
  (`unshare -Ur`, cgroup v2); no container runtime ships in the base image.
  Proving a constrained boundary cannot reach the management socket or protected
  state is pending (adversarial).
- Non-destructive hard-cost cutoff under hostile Task/TTY/connection/process:
  not run (adversarial).
- Network/privilege policy matrix from outside: partial (raw-IP block observed;
  one benign HTTPS GET to a normal host succeeded). Full matrix pending
  (adversarial).
- Unauthenticated URL wake behavior; Proxy API as gateway without exposing org
  token: not run.
- Attached-idle behavior (event stream, idle TTY, preview): not run; idle-pause
  timing still needs a dedicated leave-it-alone measurement.
- Checkpoint create/inspect/restore: done. Restore rolled back the overlay
  filesystem and killed a running process (whole-Sprite reset). The
  representative SQLite/repo-write variant and the "restored code cannot override
  a newer credential epoch" check remain for later phases.
- Destroy disposable + verify: mechanism validated on the leftover Sprite
  (`sprite destroy --force`; `GET /v1/sprites` then returned an empty list).

## Cleanup

- Leftover Sprite `setta-phase1a-20260713-a1`
  (`sprite-4c6f1c96-6f03-4430-a2e1-92b3e344d119`) destroyed with
  `sprite destroy --force`; `GET /v1/sprites` confirmed `running: 0`, empty
  `sprites` list.
- Disposable `setta-phase1a-20260713-char`
  (`sprite-e7da3c35-d1ea-49ae-a4e2-92f5fa807317`) created for the
  characterization run. The harness left no test service, checkpoint, or process
  behind. Lifecycle is operator-controlled; it will be destroyed once the
  adversarial battery is either run or declined.

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
