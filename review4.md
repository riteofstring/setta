# Review 4 (main...HEAD)

## Findings

1. **Low: redacted runtime config path still does unnecessary schema JSON parsing**
- **Example:** `backend/setta/plugins/manager.py:960`, `backend/setta/plugins/manager.py:6028`
- **What’s wrong:** `_build_redacted_config_descriptor(...)` only needs `hasSchema`, but it calls `_build_config_schema_descriptor(...)`, which resolves and JSON-parses the schema file on cold path.
- **Proposed fix:** Split a `has_schema_only` path (existence check + cache) from full schema payload parsing. Keep full JSON parsing only for non-redacted IDE config descriptors.
- **UX before:** Slightly slower first `/plugins/runtime` response in non-IDE modes when many plugins have schemas.
- **UX after:** Faster first runtime payload in share/app flows with unchanged behavior.
- **DX before:** Harder to reason about redacted path cost because “presence check” and “full parse” are coupled.
- **DX after:** Clear separation of responsibilities and easier perf profiling.

2. **Low: status-entry reuse can mask malformed digest contracts by collapsing missing digests to `""`**
- **Example:** `frontend/src/plugins/runtime.ts:2151`, `frontend/src/plugins/runtime.ts:2180`
- **What’s wrong:** `canReusePluginStatusEntry(...)` relies on `runtimePayloadDigestSha256`; `getPluginStatusRuntimePayloadDigest(...)` converts missing/blank digest to empty string. If two bad payloads both arrive without valid digest, the entry can be reused even when runtime payload fields changed.
- **Proposed fix:** Return `string | null` from `getPluginStatusRuntimePayloadDigest(...)`; if either side is `null`, do not reuse (or throw in dev). Keep digest-fast-path for valid digests.
- **UX before:** In contract-break scenarios, Plugins pane can show stale capability/registration/error state.
- **UX after:** Contract-break scenarios fail safe by forcing fresh status object updates.
- **DX before:** Digest contract violations are silently tolerated and harder to diagnose.
- **DX after:** Digest violations become explicit and easier to debug.

## Backward-Compatibility Shims

No unnecessary backward-compatibility shims found in the branch diff against `main`; legacy plugin read routes and unlink paths appear removed as intended.

## Merge Recommendation

Changes are coherent and largely aligned with prior cumulative fixes. I do **not** see a blocker-level reason to avoid merging. Both findings above are safe follow-up cleanups.
