# frontend-errors

Intentional frontend runtime failure fixture.

- Purpose: deterministic `PLUGIN_FRONTEND_REGISTRATION_INVALID` coverage.
- Capability: `registerPane`.
- IDE behavior: frontend module load fails due duplicate pane registration.
- Share/App behavior: same deterministic registration failure path.

Manual smoke:

```bash
scripts/plugin-fixtures/link.sh frontend-errors
```
