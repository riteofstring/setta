# <Title>

Date: <YYYY-MM-DD>
Area: <frontend|backend|fullstack>
Branch/Commit: <branch name + commit sha>
Related PR: <optional>

## Goal

<What performance problem are we trying to improve? DOM complexity? render time? JS runtime? memory?>

## Scenario

- Entry point (URL/route/screen):
- Steps to reproduce (keep deterministic):
- Data set / project used:
- Browser + OS:
- Notes (extensions, throttling, dev/prod build, etc):

## Before (baseline)

- Measurement method (DevTools panels used, settings):
- Key metrics:
- Observations:

## After

(Append this section after the refactor, using the same scenario + method.)

- Key metrics:
- Observations:

## Conclusion

- What improved:
- What regressed (if any) + why it is acceptable:
- Follow-ups:

## Raw Artifacts (local-only)

- `perf/artifacts/<...>` (ignored by git; include filenames/paths here for convenience)

## Automated Perf Tests

(Optional but preferred: link automated guardrails added/updated as part of the work.)

- Playwright spec(s):
- Vitest test(s) / bench(es):
- Budgets/assertions added:
