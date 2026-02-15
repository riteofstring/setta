# Review 6 (main...HEAD)

## Findings

1. **Medium: status rows can be incorrectly reused when runtime payload digest is missing/blank**
- **Example:** `frontend/src/plugins/runtime.ts:2174`, `frontend/src/plugins/runtime.ts:2180`
- **What’s wrong:** `canReusePluginStatusEntry(...)` now trusts only `runtimePayloadDigestSha256`. `getPluginStatusRuntimePayloadDigest(...)` converts a missing/blank digest to `""`, so two distinct status payloads with missing digests are treated as equal and can reuse stale objects.
- **Proposed fix:** Keep digest-only reuse, but make missing/invalid digest a hard non-reuse path:
  - Return `string | null` from `getPluginStatusRuntimePayloadDigest(...)`.
  - In `canReusePluginStatusEntry(...)`, if either digest is `null`, return `false` (or throw in dev) instead of comparing `""`.
- **UX before:** In a contract-break scenario, Plugins pane can show stale capability/registration/error state.
- **UX after:** Plugins pane always refreshes status correctly when digest is absent/invalid.
- **DX before:** Backend/frontend digest contract violations are silently masked.
- **DX after:** Contract violations are explicit and easier to diagnose.

2. **Low: redacted config path now does unnecessary schema JSON parsing**
- **Example:** `backend/setta/plugins/manager.py:960`, `backend/setta/plugins/manager.py:6028`
- **What’s wrong:** `_build_redacted_config_descriptor(...)` now calls `_build_config_schema_descriptor(...)`, which reads/parses schema JSON even though redacted mode only needs `hasSchema: bool`.
- **Proposed fix:** Add a fast `has_schema` path/cache for redacted mode (existence check only), and keep full JSON parsing only for non-redacted descriptors.
- **UX before:** Extra cold-path I/O/JSON parse work on runtime reads in non-IDE modes.
- **UX after:** Faster first runtime payload generation in share/app/deployment scenarios.
- **DX before:** Harder to reason about why redacted path does full schema parsing.
- **DX after:** Clear separation between “schema existence” vs “schema payload” responsibilities.

## Merge Recommendation

No blocker-level defects found in this diff. I would merge after fixing Finding 1; Finding 2 is a safe optimization that can be merged now or in a follow-up.
