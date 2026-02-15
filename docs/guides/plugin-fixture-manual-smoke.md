# Plugin Fixture Manual Smoke Guide

Use this guide to manually verify plugin behavior with the same fixture plugins used by tests.

## Prerequisites

- Start Setta normally (`pnpm start` / `pnpm startr`) in this repo.
- Run commands from the repo root.

## Quick Start

```bash
scripts/plugin-fixtures/smoke.sh
```

The smoke script:

- removes previously linked fixture plugins,
- links a core fixture set,
- links scope-shadowing fixtures across `global`, `setta_files`, and `workspace`,
- runs `setta plugins rescan`.

## Core Commands

Link one fixture:

```bash
scripts/plugin-fixtures/link.sh frontend --scope workspace
```

Unlink one plugin:

```bash
scripts/plugin-fixtures/unlink.sh setta-fixture-frontend --scope workspace
```

Reset all linked fixture plugins:

```bash
scripts/plugin-fixtures/reset.sh
```

## Manual Checklist

1. Open Setta and go to `Overview > Plugins`.
2. Verify frontend fixture surfaces:
   - `setta-fixture-frontend` has an `Open Fixture Pane` action.
   - `setta-fixture-frontend-react` exposes section kind `React Fixture Card`.
   - `setta-fixture-frontend-topnav` shows a top-nav button `Fixture Nav`.
3. Verify backend restart semantics:
   - backend fixtures appear as `pending_restart` until backend restart.
   - `setta plugins restart-required` reports pending backend plugins.
4. Restart Setta and confirm backend fixtures become active.
5. Verify static/router fixture:
   - `GET /api/plugins/setta-fixture-backend-static-router/info`
   - `GET /plugin-static/setta-fixture-backend-static-router/fixture/hello.txt`
6. Verify scope precedence fixture:
   - run `setta plugins list`.
   - confirm `setta-fixture-scope-shadowing` resolves to `workspace` and shadows
     `setta_files`/`global` entries.
7. Verify frontend project-state read/subscription fixture behavior:
   - open `setta-fixture-frontend` pane.
   - confirm `active sections`, `project config`, and `project state updates`
     metrics populate.
   - trigger section selection changes and confirm `active sections` and
     `project state updates` change without refreshing the page.
8. Verify frontend command realtime + backend roundtrip:
   - run `Fixture Command` from command search or pane button.
   - confirm pane `last command` includes realtime emit count and backend status
     summary fields.
9. Verify backend fixture project-state read + listener emit routes:
   - `GET /api/plugins/setta-fixture-backend/project-state-summary?projectConfigId=<id>`
   - `POST /api/plugins/setta-fixture-backend/emit-listener` with JSON:
     `{"projectConfigId":"<id>","sectionId":"<section-id>","payload":"fixture-ping"}`
   - confirm responses return `200` with non-empty summary/emit metadata.

## Notes

- Install-time failure fixtures (`metadata-mismatch-id`, `metadata-mismatch-version`)
  are intended for automated install-path tests and should not be linked directly.
- Worker failure fixtures are intended for deterministic backend load-failure tests.
