# Rewrite Archive

This directory holds the historical rewrite build-out material that used to sit
at the top of `docs/plans/go-backend-rewrite/`.

Start with `../CURRENT.md` before reading anything here.

## What Lives Here

- `phase-*.md`
  - historical slice plans, closeouts, reranks, inventories, and hardening
    notes
- `spike-*.md`
  - exploratory research notes that informed the rewrite

## How To Use It

- Use the archive when you need rationale for an existing boundary.
- Use it when you need subsystem-specific implementation history.
- Use it when you need to reconstruct why a rerank or closeout decision was
  made.
- Do not treat archived docs as the default source of truth for current repo
  state.

## Current-First Rule

If an archived doc disagrees with the current repo state:

1. `CURRENT.md` wins for active scope.
2. `caller-backed-backend-surface-checklist.md` wins for active caller-backed
   feature/parity status.
3. `backend-capability-coverage-checklist.md` wins for broader ownership
   status.
4. The code and tests win over both when they differ from old planning text.
