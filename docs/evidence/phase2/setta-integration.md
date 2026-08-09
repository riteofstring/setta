# Phase 2 — temporary Setta integration worktree (items 5 and 8)

Date: 2026-08-11. Proves that the Setta application at the recorded reference commit installs
the locally packed `@setta/workspace` artifact and renders the accepted Phase 1 slice from it,
using only the tarball's public exports and compiled stylesheet.

## Worktree and artifact identity

- Temporary integration worktree: `../setta-workspace-integration`, detached HEAD at the
  recorded reference commit `043d3b2e9` (`git worktree add --detach`). The frozen reference
  `../setta-main` was verified clean at `043d3b2e9` before and after the proof (0 modified
  files) and was never used for integration edits.
- Packed artifact: `setta-workspace-0.0.0.tgz`, sha256
  `886f96eba7c90a30ad32a7f6d9ffd30188a1e960dcb6c73a8145bb2e11c0f115`, produced by
  `pnpm --filter @setta/workspace build` + `pnpm pack` from this repository and copied into
  the worktree's `frontend/`.

## Adapter (proof code, preserved as `setta-integration/adapter.patch`)

The complete adapter is the minimal consumption surface, all inside `frontend/`:

- `package.json`: one added dependency, `"@setta/workspace": "file:./setta-workspace-0.0.0.tgz"`.
- `vite.config.ts`: a second rollup input, `workspace-integration.html`, so the reference's own
  production build compiles the proof entry alongside the full application entry.
- `workspace-integration.html` + `workspace-integration/main.tsx` + `integration.css`: a
  standalone entry that registers the playground's leaf kind (no icon — the accepted gg-menu
  fallback; registered default size 200 x 122), loads the accepted slice document (idle,
  locked, and style-colored root leaves plus the root group with a nested leaf), wires the
  document-change callback readout, and composes canvas, toolbar, and tooltip with plain-CSS
  host chrome. Imports are exactly `react`, `react-dom/client`, `@setta/workspace`,
  `@setta/workspace/styles.css`, and its own CSS — no Setta application module.
- `workspace-integration/tsconfig.json`: bundler-resolution compilation for the adapter. The
  application's own `moduleResolution: "node"` cannot read an `exports`-only manifest, so the
  packed types are invisible to the app's legacy resolution — recorded for the Phase 5 API
  ratification (whether the package should also carry top-level `main`/`types`).
- `workspace-integration/render-proof.mjs`: serves the built `dist/` and drives the entry in
  headless Chromium (the reference's own pinned Playwright; browsers already cached locally).
  It stands in for `vite preview` because preview's SPA fallback serves `index.html` bytes for
  every HTML path; for live inspection use the dev server (`pnpm exec vite`) and open
  `/workspace-integration.html`.

The `pnpm install --no-frozen-lockfile` run (pnpm 10.23.0) added only the `file:` entry to the
worktree's `frontend/pnpm-lock.yaml` (105 insertions, regenerated mechanically — not part of
the patch). The reference's `.npmrc` (legacy peers, 7-day release age) and its blocked
build-script posture were left as found. The reference Vite config aliases `zustand`,
`lodash`, and `react-icons/hi2` to the application's own copies; all three are pinned by the
reference at exactly the package's versions (5.0.8 / 4.18.1 / 5.3.0), so the aliases cannot
substitute different code into the packed runtime.

## Verification

1. Adapter typecheck under the reference's own TypeScript 5.8.3: pass.
2. Reference production build (`pnpm build` = `vite build --base=/static/`) compiling the full
   Setta application and the integration entry in one module graph: pass (~10.4 s).
3. Built-output assertions: `dist/workspace-integration.html` emitted; the
   `workspaceIntegration` script asset contains the packed runtime (`registerSectionKinds`);
   the stylesheet asset contains the scoped-base marker (`.setta-workspace`) and the host
   content-placement rule (`.section-full-no-title`).
4. Headless render proof at the Phase 1 side-by-side viewport (1492 x 696 CSS px, DPR 2): all
   five slice sections and the toolbar render, the idle leaf's outer box measures exactly the
   accepted 202 x 124, and no page errors occur. Screenshots:
   `setta-integration/integration-dark.png`, `setta-integration/integration-light.png`.

Boot-time note: the readout reports one document change at load. That is the initial node
measurement layout write (a package-initiated canonical commit under the callback contract);
the playground reports the same and the load itself does not notify.

## Regression caught and fixed by the render proof

The first render placed every section body in the title cell, overlapping the header —
visibly diverging from the accepted Phase 1 crop. Cause: the section grid placement classes
(`.section-full-no-title` and siblings) were declared in `@layer utilities`, and the Phase 2
compiled-stylesheet build tree-shakes layered rules against package source alone — no package
source uses the placement vocabulary because it is the host content seam, so the compiled
`dist/styles.css` shipped without it. Phase 1 never saw this (the playground compiled package
source provisionally), and the packed-consumer check is build-level, so the drop was invisible
until this first browser render of a compiled-artifact consumer. Fix in the package: the
placement vocabulary moved out of the Tailwind layer into plain CSS in
`src/styles/workspace.css` (the reference ships all of these rules at runtime), frozen by a
new `check-package-boundary --built` stylesheet marker. `pnpm run consumer:check` reran green
on the fixed artifact.

## Retention and removal (item 8)

The worktree stays in place for the developer's Phase 2 exit-gate inspection. After the
developer confirms the gate, remove it with:

```sh
git worktree remove --force ../setta-workspace-integration
```

(`--force` because the adapter is deliberately uncommitted proof code.) The adapter is fully
reproducible afterward: recreate the worktree detached at `043d3b2e9`, apply
`setta-integration/adapter.patch`, copy a freshly packed tarball to
`frontend/setta-workspace-0.0.0.tgz`, and run `pnpm install --no-frozen-lockfile`.
