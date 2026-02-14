# frontend-react

Frontend React + TypeScript section fixture plugin.

- Purpose: prove plugin sections can be implemented with React components in `tsx`.
- Capabilities: `registerSectionKinds`.
- Section kind: `fixture-react-card`.

Rebuild frontend bundle:

```bash
pnpm -C frontend exec vite build --config ../tests/fixtures/plugins/frontend-react/frontend/vite.config.mjs
```

Manual smoke:

```bash
scripts/plugin-fixtures/link.sh frontend-react
```
