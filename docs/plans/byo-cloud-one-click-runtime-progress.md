# BYO Cloud One-Click Runtime Progress

**Plan:** [BYO Cloud One-Click Runtime Plan](./byo-cloud-one-click-runtime-plan.md)
**Initialized:** 2026-07-06
**Current phase:** Phase 1A: Mobile Runtime Foundation
**Overall status:** Tracking initialized; no phase item is marked complete by
this tracker yet.

## Tracking Rules

- The plan remains the source-of-truth contract. This file tracks execution
  state, verification, blockers, and phase completion.
- The active phase is the earliest phase with an unchecked required item unless
  the plan is explicitly updated.
- Mark an item `[x]` only after fresh code inspection and focused verification
  show it is complete.
- Update this file in the same commit as implementation work that completes,
  reopens, or materially changes a tracked item.
- Keep notes compact. Do not use this file as a session diary.
- Verification notes must name the exact command, E2E workflow, manual runtime
  check, or narrow reason a check was not run.

## Phase Summary

| Phase | Status | Completion gate |
| --- | --- | --- |
| Phase 1A: Mobile Runtime Foundation | In progress | Manually prepared Linux VM runs Setta as a service; doctor reports runtime/mobile readiness; phone PWA works through the `ts.net` URL after normal pairing. |
| Phase 1B: Seeded Pairing + Tailnet Watch | Not started | Hand-provisioned runtime with a seeded pairing hash pairs automatically after joining the tailnet. |
| Phase 1C: Cloud-Init Bootstrap + Release Authenticity | Not started | Generated cloud-init works on one verified Tier 2 provider, pairs automatically, and preserves the phone PWA path. |
| Phase 2: Existing Machine SSH Launch | Not started | User can point Setta at an SSH-reachable machine and end with a paired, Tailscale-connected, phone-reachable runtime. |
| Phase 3: Tailscale OAuth Key Minting + Shapes/Wizard | Not started | "Cheap box for agents" resolves to an approval card with concrete instance type, region, and cost when available, with no Tailscale key paste. |
| Phase 4: Local Execution Layer + AWS Quick-Create Fallback | Not started | CLI happy path provisions and pairs a runtime from one intent sentence plus one approval; no-CLI fallback remains declarative. |
| Phase 5: OpenTofu/Terraform Kit | Not started | Technical users can provision repeatably without Setta-specific cloud code. |

## Phase 1A: Mobile Runtime Foundation

Deliverable gate:

```text
On a manually prepared Linux VM already joined to Tailscale, Setta runs as a
service, doctor reports runtime/mobile readiness, and the phone PWA works via
https://<runtime>.<tailnet>.ts.net after normal pairing.
```

Checklist:

- [ ] Add `setta doctor --json` for runtime capability checks, including
  Tailscale status, `tailscale serve` status, ts.net cert validity, agent CLI
  PATH/auth checks, source-control SSH/GitHub checks, and setup report
  location.
  Verification: pending.
- [ ] Extend `/runtime/info` beyond protocol version with build or feature
  identity so desktop/runtime skew is diagnosed explicitly.
  Verification: pending.
- [ ] Add the supported service install shape for a normal Linux VM: non-root
  service user, systemd unit, explicit working directory/environment, bounded
  wait for tailnet availability, and no public inbound ports.
  Verification: pending.
- [ ] Make the runtime-served PWA reachable through `tailscale serve` on an
  official Tailscale tailnet with HTTPS enabled.
  Verification: pending.
- [ ] Add the authenticated runtime API and desktop UI for "Pair another
  device" so the desktop can display a QR/pairing URL for the phone.
  Verification: pending.
- [ ] Preserve the existing interactive pairing flow (`setta pair` URL/QR) for
  this slice.
  Verification: pending.

## Later Phase Backlog

These items are intentionally not active until every earlier phase item is
complete or explicitly reopened by a plan update.

### Phase 1B: Seeded Pairing + Tailnet Watch

- [ ] Add pre-provisioned pairing token mode with seeded hash and provisioning
  TTL.
- [ ] Add `provision_id`, seeded attestation secret, desktop Tailscale tag
  verification, and HMAC attestation before releasing the plaintext pairing
  token.
- [ ] Add desktop-side tailnet discovery and auto-pair with watch progress
  states and MagicDNS dedup-suffix tolerance.
- [ ] Store pending pairing token plaintext in the OS keychain and resume watch
  after desktop restart; introduce the same secret-storage abstraction for
  durable runtime device tokens.
- [ ] Add tests for seeded pairing, provisioning TTL, watch progress, MagicDNS
  dedup handling, wrong-node/name-squatter cases, readable-`/runtime/info` echo
  attacks, and attestation replay/expiry failures.

### Phase 1C: Cloud-Init Bootstrap + Release Authenticity

- [ ] Add `setta provision render-cloudinit --json` and the cloud-init
  template.
- [ ] Add minisign signing to the release pipeline and installer verification.
- [ ] Add tests for cloud-init rendering, shell fragment escaping, secret
  redaction, and signed-release verification.

### Phase 2: Existing Machine SSH Launch

- [ ] Add `setta remote add ssh://user@host` for install-only SSH setup.
- [ ] Add Desktop "Add runtime -> Existing machine over SSH."
- [ ] Preserve a setup transcript for troubleshooting.

### Phase 3: Tailscale OAuth Key Minting + Shapes/Wizard

- [ ] Add guided one-time Tailscale OAuth client setup with tag validation,
  keychain storage, per-runtime auth-key minting, and manual-key fallback.
- [ ] Ship the fallback shape catalog data file.
- [ ] Add `setta provision detect --json` and
  `setta provision resolve --json`.
- [ ] Add the desktop wizard with intent input, explicit pickers,
  deterministic approval card, and Tier 2 fallback instructions.

### Phase 4: Local Execution Layer + AWS Quick-Create Fallback

- [ ] Add approval-gated `setta provision up` and `down` through typed actions,
  allowlist manifests, executor invariants, and stored teardown facts.
- [ ] Wire the wizard approval card to `up` and Phase 1B watch status.
- [ ] Require a separate destructive confirmation for `down`.
- [ ] Publish the minimal AWS CloudFormation template and
  `setta provision render-link --provider aws`.
- [ ] Add typed AWS VPC, subnet, and security group placement resolution.
- [ ] Do not ship idle auto-stop unless all plan-required lifecycle,
  notification, billing-copy, restart, and Tailscale-key constraints are met.

### Phase 5: OpenTofu/Terraform Kit

- [ ] Create `infra/modules/setta-runtime-cloudinit`.
- [ ] Add AWS, GCP, Hetzner, DigitalOcean, and generic cloud-init examples.
- [ ] Document the boundary between the supported core module and best-effort
  examples.

## Automation Entry Point

Use the plan loop with this tracker when running automated implementation
iterations:

```sh
./scripts/automation/codex-loop/run-codex-plan-loop.sh \
  --plan docs/plans/byo-cloud-one-click-runtime-plan.md \
  --tracking-file docs/plans/byo-cloud-one-click-runtime-progress.md \
  --sentinel 'CODEX_LOOP_STOP: BYO_CLOUD_ONE_CLICK_RUNTIME_COMPLETE' \
  --name byo-cloud-one-click-runtime
```

The loop's generated `checklist.md` and `architecture-audit.md` are active
working state. This file is the durable phase tracker that should be committed
with implementation changes.
