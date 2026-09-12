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

## Supervised acceptance closeout

After the original phase audit, the supervisor found that the checked-in packed-consumer fixture
still exercised the removed singleton API and that generated per-test hosts lacked explicit
teardown. Commit `475fc0a1bdc469191bf5a94767f2bdef768b32b1` closes both gaps without adding a
default host, compatibility path, or transitional API.

A separate Terra/max reviewer inspected exactly
`a06f48b45e70a42069d69d966ac35215bb6d671f..475fc0a1bdc469191bf5a94767f2bdef768b32b1`
and reported no findings. It confirmed that the unrelated consumer creates one host, passes it to
every registration and action, loads through the host, mounts through `WorkspaceProvider`, and has
no removed singleton references. It also confirmed explicit disposal in all 90 generated test-host
setups and safe teardown ordering.

Closeout verification:

- `code-policy 0.7.1 test --changed` — `workspace-focused` and `playground-focused` passed.
- `pnpm --filter @setta/workspace exec tsc -p tsconfig.json --noEmit` — passed.
- Four representative lifecycle/isolation files — 97 tests passed.
- Independent closeout review's six representative suites — 67 tests passed.
- `pnpm --filter @setta/playground run build` — passed.
- `pnpm run consumer:check` — the package built, packed, installed, and the unrelated public-API
  consumer built successfully.
