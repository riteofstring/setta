# Setta Workspace

This branch is the blank-slate implementation home for `@setta/workspace`: a backend-neutral React library for a pannable, zoomable workbench with recursively nested sections and sortable host-defined items.

The package is private and locally installable while distribution, repository hosting, licensing, and release policy remain undecided.

## Repository layout

- `packages/workspace`: reusable package source and unit tests.
- `apps/playground`: backend-free development playground.
- `fixtures/consumer`: unrelated packed-package consumer template.
- `tests/e2e`: browser, accessibility, and visual checks.
- `perf`: append-only focused performance evidence.
- `docs/plans`: product and implementation plan.
- `docs/evidence`: source-linked behavioral evidence from the previous Setta implementation.
- `scripts`: Node-owned quality, packaging, and supply-chain tooling.

The [tooling carryover inventory](docs/evidence/tooling-carryover-inventory.md) maps every retained policy to its new-tree owner and records the application/runtime tooling that is intentionally excluded. `corepack pnpm check:boundaries` enforces that tree and import boundary.

The optional long-running plan executor lives under `scripts/automation/codex-loop`. It runs fresh Codex or Claude Code implementer agents, requests a second-agent review at phase boundaries, requires clean committed batches, and finishes only after a separate whole-plan audit. It deliberately bypasses CLI permission prompts, so use it only for unattended repository-local execution after reviewing its README.

## Setup

Use Node `24.18.1`, Corepack `0.35.0`, and the exact pnpm version declared in `package.json`. Install the exact Corepack prerequisite once if it is not already available; Corepack is also pinned as a development dependency so repository commands do not drift after the initial install.

```text
npm install --global corepack@0.35.0
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm quality:all
corepack pnpm dev
```

Run `corepack pnpm exec playwright install chromium` once before the browser suite on a new machine.

## Supply-chain policy

All direct dependencies are exact-pinned. pnpm enforces a strict seven-day release quarantine
across the loaded lockfile, rejects trust downgrades and exotic transitive sources, and currently
allows no dependency lifecycle scripts. `corepack pnpm supply-chain:check` performs a frozen
install, high/critical vulnerability audit, dependency-license allowlist check, and dependency
inventory.

Temporary release-age exceptions live in `supply-chain-exceptions.json`. Each must identify one exact version, rationale, owner, and expiry; the dependency check fails for undocumented, missing, duplicate, or expired exceptions.

Phase 0 exact-pinned upstream XYFlow and dnd-kit behind package-owned testing adapters. The selected
root-node/recursive-DOM representation, shared geometry index, interaction kernel, non-DnD/browser
characterization, and completed Phase 0 gate audit are recorded under `docs/evidence` without
exposing upstream contracts publicly. Phase 1 now includes the serializable document, React
state/controller boundary, upstream canvas shell, runtime gesture policy, coalesced viewport
publication, host-content interaction boundaries, production frame measurement, and
geometry-backed focus, fit, and spatial next/previous navigation. It also includes independent
grid visibility and snapping, all three grid patterns, shared two-axis spacing, and scoped
light/dark/system semantic theme tokens. It now also includes the default accessible toolbar, typed
host controls and overlay placements, and a side-configurable minimap that projects root sections,
centers pointer-selected points or roots, and pans through the canonical viewport lifecycle. The complete
gesture matrix, independent host pan/wheel arbitration, exact viewport restoration, and
mount/observer/listener/subscription cleanup close the Phase 1 implementation, which is ready for
Phase 2. The restarted Phase 1 audit and repository-actionable corrections are complete; interactive
in-app CDP review remains recorded as an external release gate. Phase 2 has begun with the strict
section-definition registry and the first package-owned root frame that renders unrelated host
components with accessible naming, scoped appearance/read-only context, and automatic viewport
gesture isolation. Root frames now also provide native pointer and keyboard movement handles backed
by a transient XYFlow projection, one canonical `section-move` callback, shared grid snapping,
position-and-size lock enforcement, and transient active-root lift. Package-owned selection now
adds native pressed controls, Shift modifier selection, configurable partial/full Shift-marquee,
select-all and clear shortcuts, measured selection-root outlines, controller selection methods, and
single-commit top-level block movement with relative-offset preservation and locked-block rejection.
The frame now also owns trimmed, asynchronously validated inline title editing plus resettable,
frame-scoped accent/tag and chrome controls. These presentation affordances enforce live capability
policy before opening and commit one canonical title or presentation change through the public
controller. Selected frames now also expose semantic lock/unlock and minimize/expand controls with
live capability gating, focus restoration, compact minimized chrome, and controlled-host
reconciliation through the same canonical controller boundary. Registry metadata now also drives a
built-in searchable creation picker, pointer-based context creation, and deterministic visible smart
placement; a strict host factory continues to own section IDs and payload data while the public
controller commits one canonical `section-create` change and the new frame receives package
selection and focus. Selected roots now expose logical inline-end, block-end, and corner resize
controls that mirror in RTL, honor registered axes and size constraints at every canvas zoom, share
grid snapping with movement, and publish one canonical `section-resize` change on completion.
Keyboard arrows provide the same constrained resizing path. Double-click, Enter, or Space returns
supported axes to content sizing, while the next manual resize promotes measured content dimensions
back to fixed sizing without publishing live observer measurements.
Phase 2 now also exposes generic external drops through a strict host validator and final callback.
The shared geometry index supplies workbench coordinates, deepest eligible container candidates,
and orientation-aware insertion indices; accessible valid/invalid feedback remains transient,
structure capabilities gate the handoff, and host content can opt out without importing adapter
markers or file semantics.
Normalized multi-selection now also drives a ready-made pointer and keyboard action menu for batch
lock, unlock, subtree deletion, and explicit persistent root stacking. The four public stacking
commands preserve selected order, map nested selections to top-level ancestors, publish one
canonical change, and remain separate from transient selection lift.
The same menu now completes top-level grouping through a strict host group factory and registered
container kind, then ungroups direct children into deterministic non-overlapping root positions.
Both paths preserve canonical sibling order, publish one structural change, update selection only
after controlled-host acceptance, and restore keyboard focus to the resulting visible structure.
