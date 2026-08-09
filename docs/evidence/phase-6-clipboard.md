# Phase 6 Clipboard Evidence

## Result and scope

The second repository-actionable Phase 6 batch is implemented. `@setta/workspace` now owns
selection copy shortcuts, normalized subtree extraction, versioned MIME framing, hostile-input
validation, relative block placement, and one-entry paste history. Hosts retain ownership of ID
allocation, payload and domain-reference cloning, authorization, and controlled acceptance through
one explicit adapter. Clipboard support remains opt-in and does not change `WorkspaceDocument`.

This record covers the tightly coupled adapter-driven copy-and-paste items. The independently
evaluated Phase 6 follow-ons remain incomplete and repository-actionable, beginning with the
optional hierarchical outline navigator.

## Public and ownership boundary

| Boundary              | Implemented contract                                                                                                                                                                                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package surface       | `Workspace` accepts an optional `clipboardAdapter`; its controller exposes asynchronous `copySelection()` and `paste()` results. The core export exposes the adapter contracts, version and MIME constants, and the JSON-only adapter factory without exposing internal modules.                                          |
| Clipboard framing     | Copy serializes normalized selected roots, every descendant exactly once, measured root geometry, and root-relative offsets into a strict version-1, MIME-tagged JSON frame.                                                                                                                                              |
| Host cloning          | `cloneSections` receives the complete source subtree. The host allocates every destination ID, validates or clones payloads and domain references, and may reject the whole request as invalid, unauthorized, or unsupported. Missing, duplicate, colliding, unknown, or partial mappings are rejected.                   |
| Playground adapter    | The backend-free playground uses the documented text-clipboard adapter, explicit per-kind payload validation, deterministic unique IDs, and `structuredClone`. It does not claim that arbitrary renderer payloads are cloneable.                                                                                          |
| Placement and history | Paste prefers the last meaningful canvas point, then current selection, then the visible viewport; preserves root-block offsets; avoids existing destination siblings; honors enabled snap spacing; resolves ordered or freeform nested placement; and applies the complete subtree as one `section-paste` history entry. |
| Controlled ownership  | A controlled host receives the same complete document change and may accept it normally. If the returned document does not contain the exact pasted subtree, the package leaves selection unchanged and announces that the host did not accept the paste.                                                                 |
| Capability changes    | Paste requires `editStructure` before clipboard work and checks it again after an asynchronous host clone. Copy remains a non-mutating export of the current selection.                                                                                                                                                   |
| Consumer boundary     | The unrelated packed-consumer fixture supplies an in-memory adapter and imports every clipboard contract only through declared package exports.                                                                                                                                                                           |

## Validation and atomicity evidence

Clipboard contents are untrusted. Parsing rejects an absent or wrong MIME type, unsupported schema
version, unexpected or accessor-backed fields, malformed geometry, invalid section sizes or
presentation, unknown kinds, invalid containment, and host-invalid payload data before a renderer
can mount. The extracted subtree is validated as a temporary document both before framing and after
ID remapping. Host cloning must return one valid destination for every source section, so
authorization, data-validation, duplicate-ID, collision, unsupported-data, and partial-clone
failures insert nothing.

Read, write, clone, capability, and format failures produce specific action results and polite live
announcements. A busy guard prevents overlapping asynchronous clipboard actions. Copy and paste
shortcuts are installed only when an adapter exists, use Control or Meta according to platform
conventions, and do not replace native clipboard behavior inside inputs, textareas, selects,
editable content, or interactive renderer controls. Successful paste selects the new roots and
moves focus to the first pasted section control.

## Interaction and accessibility evidence

The focused Chromium workflow proves a two-root copy and paste with preserved offsets, visible
selection, focus movement, one undo and redo step, persisted reload, unsupported-version rejection,
host payload rejection before renderer mount, native copy inside a host input, 320 CSS-pixel reflow,
and independent Axe scans. The original-resolution pasted-block baseline was inspected after its
target was moved to a visible blank canvas area.

The in-app browser connection had already reported no available browser surface on 2026-08-09.
Repository and loop policy prohibit seeking a GUI, extension, or background browser service, so the
existing unavailable external-verification release gate was not retried and is not an implementation
blocker.

CDP visual check: not run (no connected in-app browser surface; the original-resolution Playwright
Chromium clipboard baseline was inspected).

## Verification boundary

- The focused clipboard, React contract, state, and history unit selector passes: 64 tests across
  four files.
- Package, playground, and repository strict TypeScript checks pass.
- The three-workflow `workspace-clipboard.spec.ts` Chromium selector passes with its reviewed
  baseline, hostile-input checks, native-input isolation, reflow assertion, and Axe scans.
- Changed-file quality passes for 28 project files: repository and dependency boundaries,
  formatting, lint and complexity, file lengths, strict types, dead-code analysis, all 404 unit
  tests, six boundary tests, plan-loop automation, package and playground builds, the exact tarball
  allowlist, and the generated public-API report. The unrelated packed-consumer install,
  frozen-lockfile confirmation, build, and runtime smoke also pass.
- No manifest, lockfile, external dependency, trust policy, or exception changed. The current
  network-backed Phase 5 supply-chain gate is not duplicated for this routine source batch;
  deterministic dependency policy remains part of changed-file quality.
