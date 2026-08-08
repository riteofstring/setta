# Setta Workspace

This branch is the blank-slate implementation home for `@setta/workspace`: a backend-neutral React library for a pannable, zoomable workbench with recursively nested sections and sortable host-defined items.

The package is private and locally installable while distribution, repository hosting, licensing, and release policy remain undecided.

## Repository layout

- `packages/workspace`: reusable package source and unit tests.
- `apps/playground`: backend-free development playground.
- `fixtures/consumer`: unrelated packed-package consumer template.
- `tests/e2e`: browser, accessibility, and visual checks.
- `docs/plans`: product and implementation plan.
- `docs/evidence`: source-linked behavioral evidence from the previous Setta implementation.
- `scripts`: Node-owned quality, packaging, and supply-chain tooling.

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

All direct dependencies are exact-pinned. pnpm enforces a strict seven-day release quarantine across the loaded lockfile, rejects trust downgrades and exotic transitive sources, and allows only reviewed lifecycle scripts. `corepack pnpm supply-chain:check` performs a frozen install, high/critical vulnerability audit, dependency-license allowlist check, and dependency inventory.

Temporary release-age exceptions live in `supply-chain-exceptions.json`. Each must identify one exact version, rationale, owner, and expiry; the dependency check fails for undocumented, missing, duplicate, or expired exceptions.

The first scaffold intentionally contains no XYFlow or dnd-kit dependency. Those enter only after the Phase 0 adapter and interaction-owner proofs described in the plan.
