# Section Shell Phase S3 Checkpoint 8

Date: 2026-03-17
Branch: `frontend-performance-11`
Worktree: `setta.frontend-performance-11`
Phase: `Phase S3`
Checkpoint: `8`
Branch/Commit: `frontend-performance-11` @ `ec9d9a88c`

## Change Summary

This checkpoint isolates standalone section and window-space routes from unrelated project-chat history churn.

Code changes:

- Updated `frontend/src/components/Pages/Project/StandaloneProjectSurfacePage.tsx`.
- Updated `frontend/src/components/Pages/Project/StandaloneProjectSurfacePage.test.tsx`.

Structural intent:

- keep project-chat history ownership in `StandaloneProjectSurfacePage.tsx` only for the route branch that actually needs it
- stop standalone `window_space` and `section` routes from re-entering when unrelated project-chat history changes
- preserve standalone thread-route behavior so direct project-chat pages still recompute titles and history labels when `agentRuns` updates

Implementation detail:

- `StandaloneProjectSurfacePage.tsx` now uses a stable `null` sentinel for non-thread `agentRuns` selection so the shared route shell does not subscribe to unrelated AI history churn outside `project_chat_thread`
- `projectChatHistoryEntries` now short-circuits to `[]` unless `target.kind === "project_chat_thread"`
- `StandaloneProjectSurfacePage.test.tsx` now uses a real Zustand-backed `useAIStore` mock so selector equality matches production behavior
- the route test harness now records `SectionWindowSurface` and `StandaloneWindowSpaceSurface` render counts while leaving unrelated project-surface global listeners stubbed out

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
- `53` tests passed

New focused guardrails:

- `StandaloneProjectSurfacePage.test.tsx` now proves standalone routes stay stable when unrelated `agentRuns` churn:
  - `/windowspace/...`
  - `/section/...`
- the same file also proves standalone thread routes still recompute project-chat history after `agentRuns` updates

Representative Playwright coverage:

```bash
./scripts/run-playwright-e2e.sh \
  frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts \
  --grep "keeps standalone project surfaces isolated from workspace selection and windowing state"
```

Result:

- `1 passed` in the standalone/window-state isolation canary

## Chrome DevTools Standalone Route Agent-History Trace

Representative pages:

- untouched `main`: `http://127.0.0.1:3087/dark_swimming`
- worktree: `http://127.0.0.1:3011/tide_pike`

Representative control:

- standalone route `/{project}/windowspace/perf_focus_space`
- one saved standalone window-space window:
  - `S0 Dict`

Replay method:

- inject the same saved standalone window-space config into live project state on untouched `main` and the worktree with:
  - one `S0 Dict` section window
  - identical normalized bounds `{ x: 0.12, y: 0.12, width: 0.55, height: 0.55 }`
- verify both branches render the same standalone route content and frame geometry
- start a DevTools `Performance` trace
- mark the replay boundary with:
  - `performance.mark("s3-standalone-agent-runs-start")`
- inject one unrelated unscoped project-chat run with:
  - `createAgentRun({ id: "perf-run-unrelated", inputs: { runType: "external_agent", chatId: "perf-unrelated-chat", projectConfigId } })`
- wait two RAFs
- mark the post-update boundary with:
  - `performance.mark("s3-standalone-agent-runs-after-raf")`
- stop the trace and compare the target renderer from `s3-standalone-agent-runs-start` through `+100ms`

Why this replay was used:

- this checkpoint is about route-shell invalidation above `StandaloneWindowSpaceSurface`, not focus, resize, or window hydration
- the saved standalone `S0 Dict` route keeps the lower standalone window-space seam live without introducing project-chat child subscriptions
- the unrelated unscoped project-chat run is the smallest deterministic update that should hit `main` but stay out of the worktree after the route-history gate

Live CDP standalone-route read:

- both branches kept the same standalone route content:
  - `S0 Dict`
  - `ARGS`
  - filter value `gamma`
  - visible `beta` and `gamma` rows
- both branches kept the same standalone frame geometry:
  - frame `x 168`
  - frame `y 108`
  - frame `width 770`
  - frame `height 495`
  - surface `width 1400`
  - surface `height 900`
- both branches kept the same document title after the replay:
  - worktree: `tide_pike · Perf Focus Space`
  - untouched `main`: `dark_swimming · Perf Focus Space`

Accepted visual artifacts:

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint8/main-standalone-agent-runs.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint8/worktree-standalone-agent-runs.png`

Accepted trace artifacts:

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint8/main-standalone-agent-runs-trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint8/worktree-standalone-agent-runs-trace.json`

Accepted marked target-renderer totals from the agent-history pair, in milliseconds:

| Branch | `FunctionCall` | `UpdateLayoutTree` | `Layout` | `Paint` | `RunTask` | `EventDispatch` | `TimerFire` | `FireAnimationFrame` | `Commit` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `main` | `7.950` | `0.000` | `0.000` | `0.000` | `2.415` | `0.000` | `0.000` | `0.186` | `0.094` |
| worktree | `0.066` | `0.000` | `0.000` | `0.000` | `2.403` | `0.000` | `0.000` | `0.282` | `0.075` |

DevTools summary:

- `CLS 0.00` on both accepted traces

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
- `FireAnimationFrame` is slightly higher on the worktree, but the absolute difference is tiny compared with the scripting reduction
- this is acceptable because:
  - the touched seam is specifically about keeping non-thread standalone routes out of unrelated project-chat history churn
  - the new focused guardrails directly prove the route-level invalidation boundary
  - the representative standalone route trace removes almost all scripting cost from the marked worktree window without introducing any new layout work

## Conclusion

- `Phase S3` checkpoint 8 is accepted.
- `StandaloneProjectSurfacePage.tsx` now keeps project-chat history ownership inside the thread route branch instead of making every standalone route subscribe to `agentRuns`.
- the representative standalone route replay now favors the worktree on the only meaningful scripting buckets in the marked window, and the stronger evidence is the new focused route-level invalidation coverage.
- `Phase S3` is not complete. The next serious step should stay above this seam and target the remaining project-chat-only owner/error shell ownership in `StandaloneProjectSurfacePage.tsx`, not reopen the accepted lower standalone window-space seam unless a later trace proves it necessary.

## Raw Artifacts (local-only)

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint8/main-standalone-agent-runs.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint8/worktree-standalone-agent-runs.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint8/main-standalone-agent-runs-trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s3-checkpoint8/worktree-standalone-agent-runs-trace.json`
