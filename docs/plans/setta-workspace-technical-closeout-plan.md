# Setta Workspace Technical Closeout Plan

## Purpose and status

This plan contains the remaining repository maintenance and extraction-closeout work that does not
change the workspace UX:

- [ ] Resolve the pending `nanoid@3.3.17` vulnerability.
- [ ] Cut over temporary local checks to the new shared Code Policy capabilities.
- [ ] Split the three remaining over-limit parity owners and remove their expiring exceptions.
- [ ] Run the final package and extraction audit.

It is intentionally separate from `setta-workspace-extraction-plan.md`, which is the UX plan used by
the plan-implementation loop. Do not run both plans concurrently in the same worktree: the
file-length work can overlap canvas, drag-and-drop, and stylesheet files changed by UX milestones.

## 1. Resolve the pending vulnerability

The final accepted-output gate is waiting on high-severity advisory
`GHSA-2v37-7h3g-55p8`, introduced by `postcss -> nanoid@3.3.17`. The patched 3.x release,
`nanoid@3.3.18`, was published at `2026-08-07 16:41:05 UTC` and becomes eligible under the
repository's seven-day release-age policy after `2026-08-14 16:41:05 UTC`.

After that time:

1. refresh the lockfile through the normal dependency resolver so the transitive dependency is
   `nanoid@3.3.18`;
2. do not add an override, advisory ignore, release-age exception, trust downgrade, or broader
   dependency update;
3. confirm dependency policy, release age, vulnerability scanning, lock synchronization, and a
   frozen install all pass;
4. run the all-files static gate and exact packed-consumer proof on the stable tree; and
5. record the successful closeout in accepted evidence.

If a different dependency change becomes necessary, stop and present the exact graph and policy
impact before expanding the update.

## 2. Cut over to expanded shared Code Policy support

The current adoption retains local providers because the pinned shared policy could not yet express
all generic contracts. Once the separately implemented shared-policy work is reviewed and
available:

1. update the `.code-policy` pin intentionally;
2. migrate `.code-policy.json` to the new shared declarations;
3. prove each shared replacement against the existing local provider before deleting it;
4. remove local wrappers and workarounds whose complete behavior is now shared; and
5. leave one enforcement owner for every rule—never a permanent old/new dual path.

Expected replacement candidates include generic portions of:

- exact workspace dependency and package-manager policy;
- frozen lockfile synchronization;
- transitive release-age checks;
- SPDX dependency-license checks;
- standard component-suite orchestration;
- package-boundary and packed-consumer contracts; and
- fixture and ESLint workarounds made unnecessary by first-class shared support.

Retain only Setta-specific assertions that shared policy cannot infer, including the compiled
stylesheet contract, exact package public-import boundary, workspace-specific consumer assertions,
and the real browser performance profile. If shared policy does not fully cover an existing rule,
keep that narrow rule and document the remaining gap instead of weakening enforcement.

The cutover is complete only when strict policy diagnosis, all-file static checks, focused tests,
supply-chain checks, package builds, the packed consumer, and the browser profile all exercise the
new ownership model successfully.

## 3. Remove expiring file-length debt

Three parity-owner exceptions expire on `2026-08-20`:

- `packages/workspace/src/canvas/ZoomPane.tsx`;
- `packages/workspace/src/dnd/useDropType.ts`; and
- `packages/workspace/src/styles/workspace.css`.

Split each owner along existing responsibilities without changing observable behavior.

- Preserve event ownership and interaction-burst state lifecycles when splitting `ZoomPane.tsx`.
- Preserve collision detection, hysteresis, and drop-intent semantics when splitting
  `useDropType.ts`.
- Preserve selector order, specificity, package scoping, and the single compiled CSS artifact when
  splitting `workspace.css`.

Run focused behavior checks after each split and remove its exception in the same batch. Do not
silently extend an exception. If a safe split cannot be completed before expiry, stop with the
specific risk and request an explicit short-lived renewal.

## 4. Final package and extraction audit

After sections 1–3 are green, audit the repository as one distributable package. Confirm that:

- the distribution contains compiled ESM, declarations, source maps, and one scoped stylesheet;
- the package and packed unrelated consumer require neither Tailwind nor Setta configuration;
- React and React DOM remain host-provided peers and other direct dependencies remain exact-pinned;
- no application store, generated backend client, backend concept, private selector, Tailwind class
  name, XYFlow internal, or dnd-kit store has entered the public API;
- canonical mutations validate before one atomic publication and one change notification;
- accepted drag, resize, pan, wheel, selection, nesting, and browser-gesture behavior remains
  unchanged after the file splits;
- the frozen reference worktree remains unchanged at commit `043d3b2e9`; and
- no temporary policy adapter or obsolete exception remains.

Fix findings in narrow batches and rerun only directly affected checks before the final authorized
gate.

## Verification

Use the pinned `check_policy.sh` entry point and the shared policy's authorization rules.

At minimum, completion requires:

- `./check_policy.sh doctor --strict`;
- all-file static policy checks;
- changed-module tests for refactored parity owners;
- offline and online supply-chain checks;
- package and playground production builds;
- the exact packed unrelated-consumer proof;
- the production browser performance profile; and
- the authorized complete ordinary gate on the stable tree.

Use `./check_policy.sh test-levels --base <trusted-base>` before broad verification and obtain any
authorization required by the shared policy. Do not substitute a passing technical check for the
already accepted UX baselines.

## Stop conditions

Stop and return to the developer when:

- the patched dependency still fails release-age, trust, license, or vulnerability policy;
- shared policy would weaken or duplicate an existing repository rule;
- a parity-owner split changes observable interaction or styling;
- an exception cannot be removed safely before expiry;
- closeout requires editing the frozen reference; or
- the necessary verification requires authority not already granted.

## Completion criteria

This plan is complete when:

- the patched dependency passes without an exception or override;
- shared and repository-specific policy have one clear owner per rule;
- all three file-length exceptions are removed without UX regressions;
- the package, packed consumer, supply chain, browser profile, and authorized final gate pass; and
- the final audit finds no application/backend leakage or temporary closeout machinery.
