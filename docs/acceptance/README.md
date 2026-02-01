# Acceptance Testing Plan (Draft)

## Goal

Introduce a small, frontend-focused acceptance testing layer that captures visible behavior in human-readable specs. The intent is to reduce fragility by making high-level behavior easy to review and hard to accidentally regress.

## Scope (Initial)

- Frontend only (Playwright E2E).
- Opt-in via an environment flag to avoid impacting existing workflows.
- Start with a small set of critical flows (2-5).

## Proposed Approach

- Define a compact spec format (`Feature`, `Scenario`, `Given/When/Then/And`).
- Specs live under a dedicated `docs/acceptance/specs/` folder.
- A generator validates specs and materializes Playwright tests.
- Acceptance tests are gated by an environment flag (for example `SETTA_ACCEPTANCE=1`).
- Enforce review of specs with CODEOWNERS to prevent casual edits.

## Open Questions

- Do we want generated tests to be ephemeral or checked in?
- Should acceptance tests run in CI on a schedule, or only on demand?
- What flows are most valuable as the first acceptance suite?
