# Phase 2 — packed unrelated consumer (item 6)

Date: 2026-08-11. Command: `pnpm run consumer:check` (`scripts/verify-packed-consumer.mjs`).
Result: pass — "Packed unrelated consumer installed and built from public exports only."

## What the proof covers

The checked-in fixture `fixtures/packed-consumer` is an unrelated React application: its only
dependencies are `react 19.1.1`, `react-dom 19.1.1`, and `@setta/workspace` through a
`file:` tarball placeholder, with `typescript`/`vite` as its build tooling. It has no Tailwind,
no PostCSS, no workspace link, and no access to package source or Setta application code. It

- imports only the package's public entry points (`@setta/workspace` and
  `@setta/workspace/styles.css`) plus its own relative files — mechanically asserted by the
  verify script before anything builds, which encodes the exit-gate condition that the packed
  consumer contains no forbidden main imports;
- registers its own section kind (`note`) with an application-owned renderer, header icon, and
  default size — the icon path is exercised here deliberately, because the playground registers
  no icon and keeps the gg-menu fallback;
- loads a document shaped like the accepted slice (one root leaf, one root group with a nested
  leaf) with opaque `data`, registers the document-change callback, and hosts
  `WorkspaceCanvas`, `WorkspaceControls`, and `WorkspaceTooltip` in plain-CSS host chrome.

The verify script builds and packs the package (`pnpm pack` of the private manifest), asserts
the tarball carries only the compiled surface (the new manifest `files` allowlist: `dist`, the
tailwind preset, the two fork LICENSE files, README, manifest — no `src/`, no build
configuration), materializes the fixture into a temporary directory against the tarball's
absolute path, installs it with the same strict pnpm supply-chain settings as the repository
root (the fixture's own `pnpm-workspace.yaml`), and runs the fixture's `tsc -p tsconfig.json`
plus `vite build`. The built output must contain the scoped stylesheet marker
(`.setta-workspace`) and the packed runtime (the section-kind registry's error-string survives
minification). The 2026-08-11 run transformed 216 modules and emitted the bundle plus a
28.6 kB stylesheet asset.

`pnpm run consumer:check --keep` retains the installed consumer and prints its path so the
developer can `pnpm run preview` the built app for the Phase 2 exit-gate confirmation that
parity is unchanged. Automated checks prove installation, typechecking, and bundling only;
visual acceptance stays a developer gate.

## Donor consideration (item 7)

The experimental branch's unrelated-consumer check was the one donor closing a proven
standalone gap (this item). Its **mechanism** was adopted and reimplemented: a checked-in
fixture with a `file:__SETTA_WORKSPACE_TARBALL__` placeholder, materialized into a temporary
directory against a freshly packed tarball, installed under strict pnpm settings, then built
(`workspace-blank-slate`: `fixtures/consumer`, `scripts/verify-consumer.mjs`,
`scripts/lib/package-artifact.mjs`). Its **content** was not adopted: the donor consumer
drives the experimental branch's own public API and chrome (Workspace/panes/outline/
detachment), which the donor policy forbids importing. Two mechanism pieces were deliberately
dropped: the Playwright browser drive (a new heavyweight dependency; live rendering evidence
belongs to the developer gate through Chrome DevTools) and the donor's exact expected-file
tarball manifest (replaced by required-entry plus no-source-leak assertions against the
manifest `files` allowlist, which does not need updating for every new module).

The remaining donor candidates named by the plan (serializable document experiments, geometry
index, culling, collision/hysteresis planners, history, selection algorithms) target behaviors
outside the accepted Phase 2 slice — they close no standalone gap in this phase and stay
unadopted. They remain individually considerable when a later phase proves the gap they close.

## Boundary observation for the Phase 5 API ratification

Registered content renderers currently place themselves in the section grid with the shipped
`section-full-no-title` stylesheet utility (the playground and this fixture both do). That
leans on a compiled class name as de-facto API, which the plan forbids ratifying as public
customization surface — the Phase 5 ratification should either wrap registered content in a
package-owned placed container or expose an explicit content-slot contract.
