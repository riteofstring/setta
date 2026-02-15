# Required Error Check Before Completion

## Goal
Enforce a non-negotiable assistant rule for build/create flows: verify for errors before claiming task completion.

## Scope
- In scope: system prompt policy text, completion gating logic, and user-facing messaging when checks are missing or failing.
- Out of scope: replacing agent-specific reasoning internals.

## Plan
1. Define policy language that explicitly applies to section creation, project scaffolding, and similar "done" claims.
2. Inject policy into runtime prompt/config path used by chat orchestration.
3. Add completion gating so assistant "done" responses require a recorded verification outcome.
4. Standardize fallback responses when error checks are skipped, incomplete, or failing.

## Acceptance Criteria
- Assistant completion responses for scoped flows are blocked unless required checks are reported as passed.
- Missing/failed checks produce explicit feedback instead of a false completion claim.

## Verification
- Add unit tests for completion gating behavior.
- Add integration tests covering passing, failing, and skipped-check completion paths.
- Validate runtime prompt/config includes the non-negotiable rule.
