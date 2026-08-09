# Phase 6 Final Gate Re-audit

## Result

All repository-actionable Phase 6 work is complete after an independent re-audit of the corrected
settled tree through `471217b795453ca0205f18b97091d0ca3332a7b1`. The earlier expanded-range
[Phase 6 gate audit](phase-6-gate-audit.md) remains the historical audit of the complete capability
range through `3d8f062a2ad5d5c12d9256beada8dc342f2a6fc81`; this record independently accepts the two
subsequent supervisor corrections and the directly affected mixed-parent browser proof. No Phase 7,
distribution, publication, or domain-specific work is included.

The re-audit reviewed the complete detached-renderer correction, its frame and provider lifecycle,
the playground proof renderer, the retained browser workflows, the removed nested-freeform metadata
test, and the later mixed-parent test stabilization. It also rechecked the plan, the historical
audit findings, the Phase 6 capability evidence index, declared ownership boundaries, and every
repository status. No remaining source correction or repository-actionable Phase 6 item was found.

## Correction acceptance

| Correction                      | Accepted evidence                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Detached renderer identity      | One renderer component remains mounted through one stable portal target. Detach adopts that target into the same-origin pop-out, and every redock or window-loss path returns it to the dock before closing the window or reconciling detached state. Live renderer props, local React state, and the exact renderer-owned input node survive both moves. |
| Detached lifecycle              | Popup rejection leaves the dock untouched. Explicit redock, minimize, deletion, window close, reload, opener loss, and provider cleanup settle one session, preserve measured placeholder ownership while open, propagate the current title/theme/head contribution, and retain specific focus and live feedback behavior.                                |
| Production representation proof | The tautological `nested-freeform-representation.test.ts` metadata restatement is absent. The retained browser proof exercises the selected recursive-DOM owner through real XYFlow wrapper containment, one store/viewport, recursive movement, native scrolling, focus, accessibility, reflow, and visual output.                                       |
| Mixed-parent browser proof      | Preview capture and canonical completion now use separate deliberate gestures. Cancellation proves ownership returns to `none` and both source parents remain unchanged; the second gesture proves the same destination preview, one atomic change, focus restoration, announcements, and Axe.                                                            |

## Settled boundary

- The Phase 6 document contract remains schema version 2 with explicit ordered/freeform child
  positioning and no compatibility reader, migration, legacy alias, or dual path.
- Detachment state, clipboard adapters, outline and pane state, viewport presets, connections, and
  culling remain optional React or host-owned capabilities outside `WorkspaceDocument`.
- Section and item movement retain one canonical command boundary, normalized selection roots,
  exact source ownership, deterministic destination placement, and at most one committed change.
- Package exports remain declared, private, backend-free, and free of source-path, application,
  upstream-store, or runtime dependencies.
- No manifest, lockfile, dependency exception, trust policy, publication setting, or public
  declaration changed in the correction or re-audit range.

## Verification boundary

- Exact Node 24.18.1, repository-local Corepack 0.35.0, and pnpm 11.19.0 ran the executable checks.
  The system Corepack 0.17.0 repeated its already-recorded Node 24 dynamic-import bootstrap failure
  before pnpm or a test started; that launcher was not retried.
- Focused Vitest coverage passed 53 detachment-contract, registry, selection-action, and static
  React tests across four files.
- The exact Chromium selectors
  `workspace-section-detachment.spec.ts` and `workspace-recursive-mixed-parent.spec.ts` passed all
  seven workflows. They cover renderer-local state and DOM identity, placeholder and pop-out
  screenshots, owner and pop-out Axe scans, popup and host rejection, minimize and deletion,
  title/theme/head propagation, explicit and involuntary redock, opener loss, mixed-parent preview
  cancellation, one atomic completion, announcements, and focus restoration.
- The correction commit already passed changed-file repository boundaries, dependency policy,
  formatting, lint and complexity, file lengths, strict types, dead-code analysis, the deterministic
  test and build chain, exact tarball inspection, documentation links, and declaration generation.
  This final evidence batch passes the repository changed-file quality gate recorded in the closing
  commit.
- No dependency input changed, so the already-green network-backed release-age, trust, license,
  inventory, and vulnerability evidence was not duplicated.

## Retained release gates

The historical `consumer:check` terminal-result loss remains recorded once in the earlier gate
audit. The correction changed no package declaration or dependency input, and its deterministic
build and exact-tarball checks are green, so repository policy does not authorize duplicating that
broad packed-consumer invocation merely to recover a lost orchestration tail.

The standing connected in-app-browser surface remains unavailable. Repository and loop policy
prohibit seeking a GUI, extension, background service, credential, or remote session. The exact
self-contained Playwright Chromium selectors and matching retained baselines are the available
final-tree visual evidence.

CDP visual check: not run (standing unavailable in-app-browser release gate; the directly affected
Playwright Chromium workflows and retained screenshot baselines pass).
