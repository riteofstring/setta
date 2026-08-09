# Phase 6 Detachable-Section Evidence

> Supervisor correction resolved (2026-08-09): one stable renderer portal target now moves between
> the dock and pop-out document. Focused browser coverage proves the same renderer-owned input node
> and local React state survive detach and redock. An independent Phase 6 re-audit remains required.

## Result and scope

The detachable-section implementation preserves both window lifecycle and renderer identity. A
registered section can opt into a same-origin detached window through the public React surface
without changing `WorkspaceDocument`, renderer payload ownership, or controlled/uncontrolled
document identity. The docked frame retains measured geometry and explicit focus/redock controls.
The one live renderer subtree receives live data, appearance, and read-only props while its stable
portal target is adopted between the owner and pop-out documents without remounting.

This record covers only the tightly coupled detachable-section items. Later Phase 6 evidence owns
adapter-driven copy and paste and each independently evaluated follow-on capability.

## Public and ownership boundary

| Boundary              | Implemented contract                                                                                                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Renderer opt-in       | `SectionDefinition.detachable` defaults to `false` under strict registry validation.                                                                                                                                                 |
| Host integration      | `WorkspaceDetachmentProvider` owns transient same-origin sessions and exposes strict validation, initial-bounds, window-change, and head-contribution callbacks.                                                                     |
| Canonical state       | The renderer remains on the one live React/document path; no pop-out field enters `WorkspaceDocument`, history, serialization, or core exports.                                                                                      |
| Host preferences      | Actual open/close bounds are reported to the host for separate preference persistence.                                                                                                                                               |
| Pop-out document      | The package installs charset/viewport metadata, title, accessible heading, package styles, and resolved theme tokens. The host may portal explicit renderer metadata or styles into the head; arbitrary stylesheets are not scraped. |
| Recovery              | Popup blocking and host rejection leave content docked with specific feedback. Button redock, window close, reload, opener loss, minimize, deletion, and provider unmount clean up the session predictably.                          |
| Geometry and movement | A measured placeholder preserves the frame footprint. Direct move, resize, grouping, ungrouping, and containment changes that include a detached section require redocking first; cross-window dragging is absent.                   |

The unrelated packed-consumer fixture imports the provider, type contracts, opt-in definition, and
head contribution only from declared package exports. The backend-free playground demonstrates
window bounds reporting, explicit renderer head CSS/metadata, an allowed note, and a deterministic
host-policy rejection.

## Interaction and accessibility evidence

The focused Chromium workflow proves a direct native-button gesture, same-origin live opener,
package and host head metadata, title and dark-theme propagation, placeholder geometry, movement
and resize guards, keyboard-visible native controls, heading focus in the new window, focus-restoring
redock, stable renderer-owned input identity and local state in both directions, minimize and delete
cleanup, manual window closure, reload, opener loss, popup blocking, and host rejection. Axe scans
pass independently in the owner workbench and detached window. Original-resolution dark placeholder
and pop-out baselines were inspected, and the pre-existing presentation baseline was updated for the
new selected-section action.

The in-app browser connection reported no available browser surface on 2026-08-09. Repository and
loop policy prohibit seeking a GUI, extension, or background browser service, so this unavailable
external verification is recorded once as a release-evidence gate rather than treated as an
implementation blocker.

CDP visual check: not run (no connected in-app browser surface; original-resolution Playwright
Chromium placeholder, pop-out, and affected presentation baselines were inspected).

## Verification boundary

- Focused detachment contract, registry, selection-action, and React rendering unit tests pass.
- The six-workflow `workspace-section-detachment.spec.ts` Chromium selector passes with its two
  reviewed baselines and owner/pop-out Axe scans.
- The directly affected runtime mode-switch ownership selector passes after stabilizing the empty
  no-provider detachment subscription; the affected presentation workflow passes with its reviewed
  baseline.
- The original implementation changed-file quality passed for 33 project files: repository and dependency boundaries,
  formatting, lint and complexity, file lengths, strict types, dead-code analysis, all 394 unit
  tests, six boundary tests, plan-loop automation, package/playground builds, the exact tarball
  allowlist, documentation links, and generated public-API report. The unrelated packed-consumer
  install, frozen-lockfile confirmation, build, and runtime smoke also pass.
- The supervisor-correction changed-file gate selected nine project files and passed repository
  boundaries across 368 files, policy for four manifests, formatting, lint and complexity, file
  lengths, strict types, dead-code analysis, 517 unit tests across 49 files, six boundary tests, and
  plan-loop automation. The terminal yielded after automation began; an exit-zero traced automation
  diagnostic and direct package/playground build, exact tarball, and public-API report checks
  recovered the unreported tail without repeating the already-green checks.
- No manifest, lockfile, external dependency, trust policy, or exception changed. The current
  network-backed Phase 5 supply-chain gate is not duplicated for this routine source batch;
  deterministic dependency policy remains part of changed-file quality.
