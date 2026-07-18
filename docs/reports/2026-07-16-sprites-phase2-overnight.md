# Sprites Phase 2 Overnight Progress (offline)

Date: 2026-07-16 (00:30–06:15 UTC)
Status: All work offline and uncommitted; no live provider calls except the
non-waking soak `observe`. Lead-reviewed against plan rules 13/19/23-27 with
formatter and tests re-run independently after every task.

## Completed (six delegated tasks, each reviewed)

1. **Runtime release install loop** — `internal/runtimeinstall`: signed
   artifact (minisign over SHA256SUMS) → verify before trust → install to
   protected persistent layout → service start → `/health` verify → rollback
   on failure. Offline fake-provider tests; double-gated live harness (not
   run). Ported from `3fecc3c6c`/`34fd96152`.
2. **Runtime identity + setup attestation** — `internal/runtimecapability`,
   `internal/runtimesetup`, `/runtime/info` and `/setup/attestation`
   endpoints. HMAC-SHA256 with `subtle.ConstantTimeCompare`, nonce replay
   rejection, bounded seed TTL, 0700/0600 protected paths, no token
   authority. Ported from `e9bf0e1ac`/`12ff0999d`. Also fixed the
   TMPDIR-length Unix-socket fragility in `workload_lease_test.go`.
3. **Provider-neutral origins + capability diagnostics** — config-driven
   `AllowedHTTPSOrigins`/`AllowedRequestHosts` (exact match, specific-origin
   echo, https only); typed `/runtime/info.diagnostics` (settaRelease,
   codex.binary, codex.authentication, workloadLease, policy, diskSpace,
   protectedState) with ok/failing/unavailable/unknown statuses and no
   secret material. Audit found no provider-coupled origin assumptions.
4. **Service identity (rule-13 gap)** — `ServiceSpec.RunAs` in the
   provider-neutral contract; Sprites adapter maps it via a documented
   `setpriv --reuid/--regid --clear-groups` wrapper (pinned SDK has no
   native field) and unwraps it on observation. Install loop runs the
   runtime as the trusted identity; layout validation rejects
   trusted==workload. The Phase 1a capability-drop launcher remains the
   real workload sandbox boundary.
5. **Deterministic lifecycle test battery** — bootstrap/attest/replay,
   mismatched identity → rollback, same-boot restart, simulated warm wake,
   simulated confirmed-cold wake (disk survives, memory does not),
   post-restore stale-seed rejection, origin/host matrix. Test-only.
   Credential-epoch and grant-revocation scenarios deferred until the
   bounded credential issuer exists.
6. **Provider conformance suite (rule 27)** —
   `internal/runtimeprovider/conformance` with named typed checks
   (create_identity_roundtrip, filesystem persistence, warm preservation,
   service_restart_detection, checkpoint_restore_rollback,
   workload_lease_lifecycle, destroy_verified_absence); shared fake provider
   in `internal/runtimeprovider/runtimetest`; Sprites live harness delegates
   behavioral assertions, keeps live-only concerns, skip behavior proven.

## Incidents

- One Codex wrapper was killed mid-task; the broker job was cancelled and
  resumed in-thread from on-disk state per the documented recovery. No work
  lost.
- The soak `observe` failed once because it compiles `internal/sprites`
  mid-refactor; recovered after the task landed. Not a provider issue.

## Soak status (non-waking observations only)

48h cohort still individually reported `cold` at every observation through
06:08 UTC (~36.5h idle; org 0/0/1). Wake due 17:37 UTC 2026-07-16 —
owner-gated. 12h/24h results remain behaviorally warm (see interim report).

## Open items for the owner

- 48h `verify-due` + `cleanup` after 17:37 UTC, then the final soak report.
- Decision memo sign-off: `docs/plans/sprites-cold-gate-decision-memo.md`
  (draft recommends Option A).
- Credential issuer / access-grant model (authority decisions), desktop
  credential storage (desktop/ has unrelated uncommitted work), session/
  transcript persistence port (chat internals dirty).
- Setup seeds: nonce-replay protected but not whole-seed single-use —
  decide with the credential issuer.
- Live-run checklist for the install loop: base image lacks `minisign`;
  `setpriv` availability assumed (util-linux); ask Fly about a native
  service run-as field.
- Source commit of Phase 1b + Phase 2 work after the 48h wake and scoped
  quality gates.
