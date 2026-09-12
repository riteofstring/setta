# Phase 0 — experimental-branch donor comparison (no adoption)

Phase 0 item 6: compare relevant `workspace-blank-slate` donors against the main owners **without
adopting them**. Branch tip inspected read-only at `0f0562293`; its merge base with `main` is the
reference commit `043d3b2e9`, and the branch's own characterization fixture
(`packages/workspace/tests/fixtures/interaction-evidence.ts`, `SOURCE_SNAPSHOT = 043d3b2e9…`)
records per-domain source/symbol mappings against that same snapshot. No donor code was copied;
this document only records correspondence and suitability. Donor acceptance stays governed by the
plan's donor policy (characterize main first, focused parity tests, small reviewable commits) and
the standing rejection of the branch's React chrome, CSS, toolbar, resize presentation, playground,
and handle-only pointer interaction.

## 1. Donors with a direct main-side owner

| Donor (branch path under `packages/workspace/src/internal/`)                             | Main owner (under `frontend/src/`)                                                                                    | Notes                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `collision-characterization.ts` (277 lines, pure)                                        | `forks/dnd-kit/adapter/collision.ts`, `adapter/collisionCompare.ts`, `useDropType.ts`                                 | Self-described close port of the fork collision kernel at `043d3b2e9`: candidate pick, trigger distance, previous-target ×1.1 stickiness, ±10 px past-midpoint hysteresis. Tests: `tests/interaction-collision.test.ts` against recorded evidence.                                                                                                                                  |
| `interaction-geometry.ts` (159 lines, zero imports)                                      | `forks/dnd-kit/adapter/zoom.ts`, `dragRectBounds.ts`, `DragOperationShapeSync.tsx`                                    | Zoom-normalized deltas, screen↔workspace points, rect union.                                                                                                                                                                                                                                                                                                                        |
| `section-move-planning.ts` (556 lines, pure)                                             | `forks/dnd-kit/useMoveSectionPlans.ts`, `useMoveSection.ts`, `state/actions/sections/sectionSelection.ts`             | Sort/free plans, cross-depth moves, cycle prevention, no-op detection. Main's planners are already pure.                                                                                                                                                                                                                                                                            |
| `sorting-preview.ts` (216 lines, pure)                                                   | `forks/dnd-kit/adapter/sorting.ts`, `sortingOverState.ts`                                                             | Orientation-aware midpoint insertion producing transform-only previews.                                                                                                                                                                                                                                                                                                             |
| `workspace-section-move-collision.ts` + `workspace-section-move-regions.ts` (pure)       | fork collision + region derivation in `useDropType.ts`                                                                | Ordered vs freeform placement targets with tracker state; includes an RTL logical-midpoint hysteresis test main does not have.                                                                                                                                                                                                                                                      |
| `selection-planning.ts`, `workspace-selection.ts`, `workspace-selection-store.ts` (pure) | `state/actions/activeSectionPolicy.ts`, `activeSections.ts`, `activeSectionController.ts`, `state/activeSectionUI.ts` | Main's selection policy (`resolveActiveSectionChange`) is already a pure module; donors add block normalization and a framework-free store.                                                                                                                                                                                                                                         |
| `workspace-history.ts` (356 lines, pure)                                                 | `state/actions/undo.ts` (server-authoritative undo/redo routes)                                                       | **Behavioral divergence risk**: main has no client-side history stack — undo is a backend round trip. A standalone package needs client history, but adopting this donor changes the observable model and therefore needs explicit developer sign-off per the plan's stop conditions. Main's `utils/workspaceHistory.ts` is navigation history, not undo — name collision to avoid. |
| Grouping/stacking/sizing/locking/minimizing/placement/naming/grid/gesture behaviors      | `components/Section/**`, `state/actions/**` per `NON_DND_FIXTURE_EVIDENCE`                                            | Characterized on the branch as tests (`tests/non-dnd-evidence.test.ts`), not ported modules.                                                                                                                                                                                                                                                                                        |

## 2. Donors with no main analogue

These do not correspond to any main behavior (searched main for culling/virtualization/spatial
index: zero hits) and therefore cannot enter a parity slice; they are candidates only for later
phases where a standalone gap is proven:

- `workspace-document-contract.ts` / `workspace-document.ts` / `workspace-document-validation.ts` /
  `document-commands.ts` — greenfield serializable document schema (v2) with a pure command
  reducer. Main's model is the Zustand `SingleConfig` + generated types + backend persistence.
  Relevant later as _shape inspiration_ for the package's controlled document, but the parity
  slice must derive its document from main's observed structural state, not from this schema.
- `geometry-index.ts` (+ `workspace-geometry-service.ts` DOM adapter) — spatial index with
  subscriptions; main reads geometry ad hoc from xyflow node internals and section refs.
- `workspace-viewport-culling.tsx` — IntersectionObserver culling; main renders all nodes.

## 3. Tooling already harvested vs. not yet present

Already on `workspace-extraction` (same or evolved): `quality.mjs`, `check-dependencies.mjs`,
`check-file-lengths.mjs`, `report-*.mjs`, `scripts/lib/{files,process}.mjs`, the codex-loop runner,
`eslint.config.js`, `knip.json`, `.prettierrc.json`, `dependency-license-policy.json`,
`supply-chain-exceptions.json`; the branch's `audit-supply-chain.mjs` is superseded by this
branch's `check-supply-chain.mjs` + `supply-chain-policy.json` + `check-release-age.mjs` +
`check-lockfile-sync.mjs`.

On the branch but not here — potential future donors when their phase needs them (Phase 2 pack/
consumer proof; later perf phases):

- `scripts/verify-package.mjs` + `scripts/lib/package-artifact.mjs` + `scripts/lib/tar.mjs`
  (pnpm pack + expected-file-list assertion; dependency-free tar reader)
- `scripts/verify-consumer.mjs` + `fixtures/consumer/**` (packed-artifact install into an unrelated
  Vite app, served and driven by Playwright)
- `scripts/check-boundaries.mjs` (+ node:test) — repo-shape allowlist
- `scripts/build-package.mjs`, `scripts/generate-api-report.mjs`,
  `scripts/generate-dependency-inventory.mjs`, `scripts/capture-visual-evidence.mjs`
- perf harnesses: `measure-geometry-index.mjs`, `measure-milestone-performance.mjs`,
  `profile-culling.mjs`, `profile-interaction.mjs` + `lib/interaction-probe.mjs`,
  `lib/playground-server.mjs`
- test/build config: `playwright.config.ts`, `vitest.config.ts`, `tsconfig.base.json`, `patches/`

Nothing in this list is adopted by this document; each arrives, if at all, through the donor policy
in its owning phase.
