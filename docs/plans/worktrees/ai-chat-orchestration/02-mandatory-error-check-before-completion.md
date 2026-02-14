# Mandatory Error Check Before Completion

## Goal
Enforce a non-negotiable assistant rule: verify for errors before claiming task completion.

## Scope
- In scope: system prompt policy, completion gating logic, user-facing failure messaging.
- Out of scope: replacing agent-specific reasoning internals.

## Plan
1. Define explicit policy text and insert into relevant system prompt/config.
2. Add completion gate requiring error-check step outcome before success response.
3. Standardize response when checks fail or are incomplete.
4. Log/checkpoint verification results for traceability.

## Acceptance Criteria
- Assistant completion responses are blocked unless required error check passes.
- Failure to verify produces explicit feedback instead of false completion.

## Verification
- Add unit tests for completion gating behavior.
- Add integration test for success vs blocked completion paths.
- Validate prompt injection of rule in runtime config.
