# frontend-react

Frontend React section fixture plugin.

- Purpose: prove plugin sections can be implemented with React components.
- Capabilities: `registerSectionKinds`.
- Section kind: `fixture-react-card`.

Rebuild frontend bundle:

```bash
pnpm -C frontend exec vite build --config vite.fixture-frontend-react.config.mjs
```

Manual smoke:

```bash
scripts/plugin-fixtures/link.sh frontend-react
```
