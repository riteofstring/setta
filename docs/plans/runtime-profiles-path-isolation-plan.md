# Runtime Profiles + Explicit State Path Plan

## Summary

Setta should support running multiple installations (for example, development and built) against the same code workspace without state collisions.

The long-term solution is to make runtime identity explicit via profiles and explicit path overrides, while keeping the default experience unchanged.

Default behavior must remain:

1. User types `setta`.
2. Setta works as it does today, with no required setup.

## Problem

Today, the development and built installations can collide because both derive state/config from shared defaults.

Important current constraints:

1. Local `<workspace>/setta_files` takes precedence when present.
2. Runtime path resolution enforces canonical naming:
   - `setta_home` must end with `.setta` or `.setta-development`.
   - `setta_files_root` must include `setta_files` or `setta_files_dev`.
3. Existing dev scripts (`start.sh`, `reset.sh`, `ai.sh`) are not profile-aware.

Result: running dev and built Setta in one worktree is hard to isolate cleanly.

## Goals

1. Allow multiple Setta identities to coexist in one workspace.
2. Make state roots explicit and deterministic.
3. Keep `setta` (no flags) working exactly as now.
4. Make `start.sh`, `reset.sh`, and `ai.sh` profile-aware.
5. Enforce canonical root naming consistently across CLI, scripts, and docs.

## Non-Goals

1. Backward compatibility shims for removed/legacy config keys.
2. Data migration tooling.
3. Supporting old path resolution behavior when it conflicts with explicit overrides.

## Product Decision

Treat runtime identity as a first-class profile with explicit roots:

1. `workspace_root`
2. `setta_home`
3. `setta_files_root`
4. `runtime_root`
5. optional namespace values (for example auth cookie suffix)

`--setta-files-location` (`auto|local|global`) stays as a convenience mode for default users, but explicit `--setta-files-root` is the primary isolation primitive.
Explicit path overrides must still satisfy canonical naming constraints.

## CLI Contract

Add top-level CLI options:

1. `--profile <name>`
2. `--setta-home <path>`
3. `--setta-files-root <path>`
4. `--runtime-root <path>`
5. existing `--workspace` remains
6. existing `--setta-files-location` remains

### Precedence

Precedence for path resolution should be:

1. explicit flags
2. selected profile values
3. environment variables
4. defaults

When `--setta-files-root` is set:

1. it is authoritative
2. `--setta-files-location` is ignored or rejected (prefer explicit CLI error to avoid ambiguity)
3. local `<workspace>/setta_files` must not override it
4. the resolved path must include `setta_files` or `setta_files_dev`

## Default Behavior (Must Preserve)

With no new flags and no profile selection:

1. `setta` behaves exactly as now.
2. `workspace_root` defaults to current directory.
3. existing local/global/auto behavior remains.
4. runtime root defaults to `<resolved_setta_files_root>/runtime`.

This keeps the mainstream user path unchanged.

## Example Usage For This Repo Workflow

Single workspace, two isolated identities:

Development install:

```bash
./start.sh --profile dev
./reset.sh --profile dev
./ai.sh --profile dev
```

Built install:

```bash
source ./activate_built_setta.sh
setta --profile built --workspace "$PWD" --port 61010 --no-open
```

Equivalent explicit form:

```bash
setta \
  --workspace "$PWD" \
  --setta-home "$PWD/profiles/built/.setta" \
  --setta-files-root "$PWD/profiles/built/setta_files" \
  --runtime-root "$PWD/profiles/built/setta_files/runtime_built"
```

## Profile Storage Model

Store profiles under resolved `setta_home`:

1. `<setta_home>/profiles/<name>.json`

Suggested JSON schema:

```json
{
  "name": "dev",
  "workspaceRoot": "/abs/path/to/workspace",
  "settaHome": "/abs/path/to/profiles/dev/.setta-development",
  "settaFilesRoot": "/abs/path/to/profiles/dev/setta_files_dev",
  "runtimeRoot": "/abs/path/to/profiles/dev/setta_files_dev/runtime",
  "settaFilesLocation": "auto",
  "authCookieName": "setta_auth_dev"
}
```

Notes:

1. `settaFilesRoot` and `settaFilesLocation` are mutually exclusive in effective resolution.
2. Profiles are optional. Missing profile means use defaults.

## Implementation Plan

### Phase 0: Spec Lock

1. Lock CLI names and precedence rules.
2. Decide conflict behavior for `setta-files-root` + `setta-files-location` (recommended: error).
3. Decide whether profile values are partial (recommended: yes, partial overrides).

### Phase 1: Core Path Resolver Refactor

Target files:

1. `backend/setta/utils/paths.py`
2. `backend/setta/utils/env_vars.py`
3. `backend/setta/start.py`

Work:

1. Extend resolver inputs with explicit `setta_files_root` and `setta_home`.
2. Remove local-root implicit override when explicit root is supplied.
3. Keep old behavior when explicit root is absent.
4. Add a single canonical `ResolvedPaths` result consumed everywhere.
5. Thread the resolved paths through startup and command contexts.

Acceptance criteria:

1. Explicit `setta_files_root` always wins.
2. Default no-flag behavior remains unchanged.
3. Relative paths are normalized deterministically.

### Phase 2: Profile Loader + CLI Integration

Target files:

1. `backend/setta/utils/user_config.py`
2. new module `backend/setta/utils/profile_config.py`
3. `backend/setta/start.py`

Work:

1. Add profile load/resolve helpers.
2. Add `--profile` and new path flags at root CLI group.
3. Apply precedence: flags > profile > env > defaults.
4. Surface explicit validation errors for conflicting inputs.

Acceptance criteria:

1. `--profile dev` resolves profile values.
2. flags override profile values.
3. unknown profile errors clearly.

### Phase 3: Canonical `setta_files` Path Integration

Target files:

1. `backend/setta/project_state/watch_code.py`
2. `backend/setta/api/listener.py`
3. `backend/setta/ssh_common.py`
4. any other call sites from repo search

Work:

1. Replace ad-hoc `"setta_files"` path assumptions with resolved path references from the central resolver.
2. Update session-root inference to use configured runtime root when available.
3. Keep behavior equivalent for default users.

Acceptance criteria:

1. non-default state root works with watcher/session discovery when canonical naming rules are satisfied.
2. default behavior remains identical.

### Phase 4: Dev Script Support (`start.sh`, `reset.sh`, `ai.sh`)

Target files:

1. `scripts/run-dev-instance.sh`
2. `scripts/ai.sh`
3. `frontend/backendStart.sh`
4. `start.sh`
5. `reset.sh`
6. `ai.sh`
7. `frontend/package.json` reset path logic

Work:

1. Accept and forward profile/path options to backend startup.
2. Add env passthrough variables for scripts where direct CLI arg piping is awkward.
3. Make reset behavior profile-aware.
4. Ensure reset deletes resolved setta files root for active profile, not hardcoded `setta_files`.

Acceptance criteria:

1. `./start.sh --profile dev` and `setta --profile dev` resolve same paths.
2. `./reset.sh --profile dev` only resets dev profile state.
3. `./ai.sh --profile dev` works with isolated state and logs.

### Phase 5: Built Install Scripts Alignment

Target files:

1. `install_built_setta.sh`
2. `activate_built_setta.sh`

Work:

1. Optionally add profile helper output for built/dev split.
2. Document how to run built profile in current workspace.

Acceptance criteria:

1. built workflow requires no manual path juggling.
2. built and dev roots remain isolated by profile.

### Phase 6: Documentation

Target files:

1. `README.md` (when content is restored/populated)
2. `docs/guides/*` (dev workflow and verification checklists)
3. `docs/plans/*` references to path assumptions where needed

Work:

1. Add profile quick-start and examples.
2. Document defaults and precedence.
3. Document explicit statement: default remains `setta` with no flags.

## Testing Impact and Plan

This change directly affects path resolution and test fixtures.

### Backend Tests

Add/expand tests in:

1. `tests/start/*`
2. `tests/utils/*` (new path/profile resolver tests)
3. any tests using `temporary_setta_paths`

Required coverage:

1. precedence matrix (flags/profile/env/default)
2. explicit root overrides local `setta_files` directory
3. default behavior parity test (`setta` no flags)
4. profile load errors and conflict errors
5. runtime sessions/logs/secrets path derivation correctness

### Frontend + Script Tests

Add coverage for script wiring:

1. `start.sh/reset.sh/ai.sh` option forwarding
2. profile-aware reset target
3. backendStart argument construction

If shell unit tests are not present, add lightweight integration tests via subprocess assertions in Python tests under `tests/start`.

### E2E / Playwright

Add one end-to-end scenario:

1. same workspace
2. dev profile running
3. built profile running
4. verify state isolation (different projects/chats/settings visible per profile)

### Regression Focus

1. ensure no change for users typing only `setta`
2. ensure current tests that assume local `setta_files` still pass under default mode
3. update tests that use non-canonical roots so they follow enforced canonical naming

## Risk Areas and Mitigations

1. Risk: subtle default behavior drift.
Mitigation: dedicated parity tests asserting current default path outcomes.

2. Risk: script flag plumbing inconsistencies.
Mitigation: one canonical environment/arg contract documented and tested.

3. Risk: inconsistent canonical-name enforcement across call paths.
Mitigation: resolver-level validation tests plus script/CLI integration tests for canonical path handling.

4. Risk: developer confusion during transition.
Mitigation: add explicit profile examples for common workflows.

## Rollout

1. Land resolver + CLI flags first.
2. Land script integration next.
3. Land docs + E2E verification.
4. Keep default command path unchanged throughout.

## Completion Criteria

All of the following must be true:

1. `setta` (no flags) still behaves exactly as before.
2. `start.sh/reset.sh/ai.sh --profile <name>` work end-to-end.
3. built and dev installations can run concurrently in one workspace with isolated state.
4. runtime-critical path resolution enforces canonical `setta_files` / `setta_files_dev` naming consistently.
5. updated automated tests cover precedence, isolation, and default parity.
