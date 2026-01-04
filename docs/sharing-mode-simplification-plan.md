# Sharing Mode Simplification Plan

This plan focuses on reducing the size and surface area of sharing mode changes
without removing functionality. It preserves the current behavior, but aims to
concentrate share-specific logic in fewer files, reduce repetitive guard code,
and eliminate cross-module coupling that causes large diffs.

## Goals
- Keep sharing mode feature-complete.
- Reduce the number of files that must change for share behavior changes.
- Make share policy enforcement more consistent and less repetitive.
- Keep listener endpoint generation stable as routes evolve.
- Improve readability and maintainability without adding new runtime risk.

## Non-goals
- Changing user-visible behavior.
- Removing policy checks or session isolation guarantees.
- Reverting existing tests or coverage.

## Why the diff is huge
Sharing mode touches nearly every runtime layer (server startup, routers,
project manager, websockets, terminals, artifacts, MCP/LLM, frontend routing)
and adds broad test coverage. Many endpoints now include share policy and
session handling, which multiplies changes across the router surface.

## Simplification Ideas (Core)

### 1) Centralize share policy gating with a decorator / route metadata
**Problem**: `enforce_share_policy_guard` is called repeatedly in the
project_manager router, and policy gates are scattered across multiple routers.
This is repetitive and fragile.

**Approach**:
- Introduce a small decorator, e.g. `@share_guard(SharePolicyGuard.param)` that
  runs before the endpoint handler, using runtime context + manager to resolve
  section ids when needed.
- For endpoints where `SharePolicyGuard` needs the request payload, the
  decorator can read it from the validated request model argument.
- Use route-level decorators in routers like `project_manager`, `artifact`,
  `terminals`, `llm`, and `ai`.

**Outcome**:
- Guarding rules move into a consistent, reusable layer.
- Less duplication and fewer per-endpoint policy lines.
- Easier to review and update policy behavior.

### 2) Shrink share vs IDE branching with a share-focused router module
**Problem**: Most routers now contain `if share_mode` branches and share
exception behavior. This contributes to the diff size and makes it harder to
reason about which endpoints behave differently in share mode.

**Approach**:
- Keep existing routers but extract share-only behaviors into helper modules,
  e.g. `share/route_helpers.py` and `share/route_guards.py`.
- Where feasible, introduce a dedicated share router that exposes only share
  endpoints (for example, share session bootstrap + share-specific websockets)
  and relies on shared helper functions for shared behaviors.
- Keep IDE-only routers guarded by `require_ide_mode` at the router level.

**Outcome**:
- Fewer `if share_mode` branches inside core routers.
- Share-specific path handling and policy checks live in a smaller namespace.

## Additional Simplification (Optional)

### 3) Unify session-scoped manager construction in one place
**Problem**: `ProjectManagerSwitcher` builds per-session managers and sets up
scoped senders, artifacts, json sources, and code files inline.

**Approach**:
- Move session manager construction to a factory in
  `share/session_manager_factory.py`.
- Keep `ProjectManagerSwitcher` as a thin dispatcher.

**Outcome**:
- The core switcher becomes simpler and focuses on routing.
- Share session construction logic is isolated and easier to test.

### 4) Clarify share policy defaults
**Problem**: If `share_policy.json` is missing or empty, defaults are permissive.
This is not strictly a simplification, but it makes behavior less predictable
and increases risk.

**Approach**:
- Fail closed (reject share boot without a policy), or
- Use a more restrictive default policy in share mode.

**Outcome**:
- Behavior is explicit and consistent; fewer ambiguous edge cases.

## Phased Execution Plan

### Phase 0: Baseline and safety net
- Ensure listener endpoint generation is validated by a test that asserts all
  expected endpoints are present in `generated_listener_endpoints.py`.
- Capture baseline behavior with a focused manual test:
  - Create a deployment, open two share sessions, verify isolation.
  - Verify policy gating is enforced for param changes, layout, and run.

### Phase 1: Share policy decorator
- Implement `@share_guard(...)` decorator.
- Replace repeated `enforce_share_policy_guard` calls in
  `backend/setta/routers/project_manager.py`.
- Use the decorator in other routers where it meaningfully reduces boilerplate.

### Phase 2: Share router / helper extraction
- Extract share-only path guards and helpers into `share/` modules to reduce
  branching in core routers.
- Where feasible, create a `share_router` for share-only endpoints and keep IDE
  routers guarded by `require_ide_mode` at router init.

### Phase 3: Session manager factory (optional)
- Move session manager construction to a dedicated helper/factory module.
- Update `ProjectManagerSwitcher` to call the factory.

## Risks and Mitigations
- Risk: Listener endpoint generation can drift as routes change.
  Mitigation: Add a unit test that asserts the generated listener API includes
  a representative set of endpoints.

- Risk: Share policy decorator might miss section-id resolution edge cases.
  Mitigation: Keep `policy_guards.resolve_section_ids` as the single source of
  truth, and reuse it in the decorator.

## Acceptance Criteria
- Share functionality remains feature-complete with existing tests passing.
- Listener endpoint generation produces the full endpoint list.
- `project_manager.py` no longer has repeated policy guard calls at the top of
  each route.
- Share mode branching is visibly reduced in router files.

## Notes
- This plan does not require new behavior; it reorganizes existing logic to
  reduce churn and simplify future changes.
