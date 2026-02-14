# Section Types Data Authoring Performance Report (2026-02-14)

## Scope
- Text block master font size controls and markdown/plaintext scaling.
- Text param date/time normalization and formatting paths.
- List/group default child type configuration and incrementer flow.
- Callable section "allow unquoted string args" configuration toggle.

## Environment
- Worktree: `section-types-data-authoring`
- Frontend dev server: `http://127.0.0.1:3097`
- Backend dev server: `http://127.0.0.1:8097`
- Chrome DevTools MCP trace capture with no CPU/network throttling.

## Automated Performance Tests
Command:
```bash
pnpm -C frontend exec vitest run src/utils/sectionTypesDataAuthoring.performance.test.ts
```

Result:
- `2 passed`
- Guardrails exercised:
  - 40k date/time normalize+format iterations under 1400ms budget.
  - 200k text typography scale derivations under 700ms budget.

## DevTools Trace
Trace artifact:
- `perf/artifacts/2026-02-14-section-types-data-authoring-cdp-trace.json`

Captured interaction window:
- Text block master font slider adjustments.
- List-root default-child dropdown updates.
- Callable string-args toggle interaction.

Top insight from DevTools:
- `ForcedReflow` detected.
- Reported total reflow time: `56ms`.
- Notable frame: `eq` in `chunk-MB4RGFJ3.js` reported at `81ms` (includes layout-triggering work within the trace window).

Other trace summary data:
- CLS: `0.00`
- Insight set: `NO_NAVIGATION`

## Notes
- The measured forced reflow is bounded to interactive configuration updates and did not block completion of the tested flows.
- Existing automated perf tests now cover core utility hot paths introduced by this feature set.
