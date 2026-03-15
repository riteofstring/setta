# Section Shell Phase S3 Checkpoint 9

Date: 2026-03-17
Branch: `frontend-performance-11`
Worktree: `setta.frontend-performance-11`
Phase: `Phase S3`
Checkpoint: `9`
Branch/Commit: `frontend-performance-11` @ `5d0341321`

## Change Summary

This checkpoint isolates standalone chat routes from unrelated project-structure churn in the shared standalone route shell.

Code changes:

- Updated `frontend/src/components/Pages/Project/StandaloneProjectSurfacePage.tsx`.
- Updated `frontend/src/components/Pages/Project/StandaloneProjectSurfacePage.test.tsx`.

Structural intent:

- move project-chat-only owner, error, title, and same-tab navigation wiring behind a dedicated chat-route child
- keep the shared standalone route parent limited to load state, target resolution, the outer shell choice, and non-chat title handling
- stop standalone project-chat routes from re-entering when unrelated section or window-space dictionaries change

Implementation detail:

- `StandaloneProjectSurfacePage.tsx` now splits route ownership into:
  - `StandaloneProjectChatRouteSurface`
  - `StandaloneNonChatRouteSurface`
- the chat child now owns:
  - `agentRuns`-backed history lookup
  - thread-title resolution
  - owner-key and error-state scoping
  - same-tab `setProjectChatId(...)` navigation
  - `chat_not_found` and `llm_disallowed` shells for chat routes
  - chat-route document-title updates
- the non-chat child now owns the remaining section/window-space authority reads and managed-chat gating
- the final cleanup narrows the non-chat child to the only rendered target kinds:
  - `section`
  - `window_space`

## Automated Verification

Focused Vitest coverage:

```bash
pnpm -C frontend exec vitest run \
  src/components/Pages/Project/StandaloneProjectSurfacePage.test.tsx \
  src/components/Pages/Project/StandaloneWindowSpaceSurface.test.tsx \
  src/components/ChatWindowing/ProjectChatWindowSurface.test.tsx \
  src/components/Section/Container/SectionWindowSurface.test.tsx
```

Result:

- `4` files passed
- `54` tests passed

New focused guardrails:

- `StandaloneProjectSurfacePage.test.tsx` now proves standalone project-chat thread routes stay stable when unrelated project-structure dictionaries churn:
  - `projectConfig.windowSpaces`
  - `projectConfig.sectionVariantMap`
  - `sections`
  - `sectionVariants`
  - `sectionImpls`
- the same file still keeps the direct-thread route behavior covered:
  - same-tab chat navigation remains authoritative
  - thread-not-found routing stays scoped by owner key
  - `llm_disallowed` recovery remains scoped by owner key and project config

Representative Playwright coverage:

```bash
./scripts/run-playwright-e2e.sh \
  frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts \
  --grep "same-tab standalone project chat navigation keeps llm_disallowed state scoped to the owning project config"
```

Result:

- `1 passed` in the same-tab standalone chat ownership canary

## Chrome DevTools Standalone Chat Route Structure Trace

Representative pages:

- untouched `main`: `http://127.0.0.1:3087/dark_swimming/chat/shared-thread`
- worktree: `http://127.0.0.1:3011/tide_pike/chat/shared-thread`

Representative control:

- standalone direct thread route `/{project}/chat/shared-thread`
- viewport `1400 x 900`

Replay method:

- verify both branches show the same visible standalone chat route shell:
  - `Start a new thread`
  - the same provenance warning
  - the same composer controls
- start a DevTools `Performance` trace
- mark the replay boundary at the standalone chat route
- clone only the unrelated project-structure dictionaries in live `useProjectState.setState(...)`:
  - `projectConfig.windowSpaces`
  - `projectConfig.sectionVariantMap`
  - `sections`
  - `sectionVariants`
  - `sectionImpls`
- wait two RAFs
- compare the marked `+100ms` route window on each trace

Why this replay was used:

- this checkpoint is about route-shell subscription breadth above the accepted standalone window-space and route-history seams
- cloning those exact dictionaries is the smallest deterministic update that should hit the old parent selector set without changing any visible chat-route content
- the replay avoids introducing new chat activity, thread hydration, or layout differences that would blur the route-shell read

Live CDP standalone-chat validation:

- both branches kept the same visible route shell after the replay:
  - `Start a new thread`
  - the provenance warning remained visible
  - the composer stayed mounted
- both branches stayed on the same route shape after the replay:
  - worktree: `/tide_pike/chat/shared-thread`
  - untouched `main`: `/dark_swimming/chat/shared-thread`
- both branches kept the same viewport:
  - `1400 x 900`
- both branches kept the same post-replay document-title shape:
  - worktree: `tide_pike · Chat shared-t`
  - untouched `main`: `dark_swimming · Chat shared-t`

Accepted visual artifacts:

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint9/main-standalone-chat-structure-after.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint9/worktree-standalone-chat-structure-after.png`

Accepted trace artifacts:

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint9/main-standalone-chat-structure-trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint9/worktree-standalone-chat-structure-trace.json`

Accepted marked `+100ms` trace-overlap totals from the standalone chat structure pair, in milliseconds:

| Branch | `FunctionCall` | `UpdateLayoutTree` | `Layout` | `Paint` | `RunTask` | `EventDispatch` | `TimerFire` | `FireAnimationFrame` | `Commit` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `main` | `19.369` | `0.000` | `0.000` | `0.000` | `28.969` | `0.000` | `0.000` | `0.151` | `0.128` |
| worktree | `0.000` | `0.000` | `0.000` | `0.000` | `3.049` | `0.000` | `0.000` | `0.000` | `0.000` |

DevTools summary:

- `CLS 0.00` on both accepted traces

Trace-note:

- the worktree raw trace was saved successfully, but DevTools returned an `IO.read` stop error on that run; the saved JSON still contains the full marked `+100ms` window used for the accepted comparison

Interpretation:

- the worktree is materially better on:
  - `FunctionCall`
  - `RunTask`
  - `Commit`
- both branches stayed flat on:
  - `UpdateLayoutTree`
  - `Layout`
  - `Paint`
  - `EventDispatch`
  - `TimerFire`
- `FireAnimationFrame` is small on `main` and drops to `0.000` on the worktree in the marked window
- this is acceptable because:
  - the touched seam is specifically about keeping standalone chat routes out of unrelated project-structure churn above the lower accepted standalone seams
  - the new focused guardrail directly proves the route-level invalidation boundary
  - the representative standalone chat-route structure replay removes nearly all scripting cost from the marked worktree window without introducing new layout work

## Conclusion

- `Phase S3` checkpoint 9 is accepted.
- `StandaloneProjectSurfacePage.tsx` now keeps standalone project-chat route ownership inside a dedicated chat-route child instead of letting the shared parent shell subscribe to unrelated section/window-space structures.
- the representative standalone chat-route structure replay strongly favors the worktree on the scripting buckets that matter, and the stronger evidence is the new focused route invalidation coverage.
- `Phase S3` is not complete. The next serious step should be a fresh boundary read above `StandaloneProjectSurfacePage.tsx` to decide whether any meaningful standalone-route shell seam still remains or whether `Phase S3` is structurally exhausted.

## Raw Artifacts (local-only)

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint9/main-standalone-chat-structure-after.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint9/worktree-standalone-chat-structure-after.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint9/main-standalone-chat-structure-trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint9/worktree-standalone-chat-structure-trace.json`
