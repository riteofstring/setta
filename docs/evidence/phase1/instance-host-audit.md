Reviewed range: 753dcf4d40d1a27b940fe31d2b81f9db570dab71..a06f48b45e70a42069d69d966ac35215bb6d671f

## Repository contract

Nothing to report.

## Requested outcome

Nothing to report.

## Verification

- TypeScript boundary check: `pnpm --filter @setta/workspace exec tsc -p tsconfig.json --noEmit`
- Exact focused test-file batches covering every changed store/registry family, affected interaction/component boundaries, and the playground passed.
- Changed-scope planner: `code-policy test --changed` — passed `workspace-focused` and `playground-focused`.
- Static audit covered host-keyed mutable owners, removed singleton/default-host paths, host-scoped document IDs, and document-level event ownership. No live probes were run.
