# Frontend/Backend Duplication Audit

## Scope

- Reviewed handwritten logic in `frontend/src`, backend runtime owners in `internal/`, and related backend package/sidecar code under `backend/setta/` when it participated in the same frontend-facing contract.
- Focused on duplicated parsers, normalizers, policy matrices, and state-reconciliation logic rather than generated DTOs, generated routes, or simple UI-only formatting.
- Marked duplication as justified when the frontend needed immediate UX/runtime behavior, the backend stayed authoritative, and a generated/shared source of truth or shared fixture contract kept behavior aligned.
- Marked duplication as unjustified when the frontend reimplemented backend-owned rules by hand without a shared contract, especially when the copies already drifted.

## Reviewed And Excluded

- Name validation is duplicated, but the duplication is justified. The frontend validator in `frontend/src/utils/nameValidation.ts:62` mirrors backend validation owned by `internal/projectstate/name_validation.go:73`, and the shared behavior is pinned by `tests/fixtures/name_validation_cases.json` through `frontend/src/utils/nameValidation.test.ts:91`. This is deliberate UX preflight backed by a shared contract.
- Managed chat stream reconciliation is duplicated, but the duplication is justified. The frontend reducer in `frontend/src/state/actions/chatStreamState.ts:151`, the Go runtime reconciler in `internal/managedchat/stream_message_reconciliation.go:1`, and the Python SDK helper in `backend/setta/llm/chat_toolkit/section_sync.py:50` are all pinned to the same fixture contract through `frontend/src/state/actions/aiChatStreamingContract.test.ts:70`, `internal/managedchat/live_runtime_contract_test.go:30`, and `tests/llm/test_chat_toolkit_section_sync_contract.py:83`.
- Generated route/constants/defaults are not handwritten duplication. `frontend/src/utils/transportRouteConstants.ts:1` already consumes generated route helpers, and `frontend/src/utils/deploymentPolicies.ts:1` reuses generated policy factories instead of re-stating backend defaults.

## Unjustified Duplications

### 1. Plugin install source spec parsing and validation

Frontend copy:

- `frontend/src/components/Panes/Overview/Plugins/PluginsPane.helpers.ts:200` `validateInstallSourceSpec`

Backend owner:

- `internal/plugins/source_specs.go:23` `ParseSourceSpec`
- `internal/plugins/source_specs.go:112` `parseGitHubSourceSpec`
- `internal/plugins/source_specs.go:147` `parsePyPISourceSpec`
- `internal/plugins/source_specs.go:188` `normalizePackageName`

Why this is duplicated:

- Both sides parse the same install grammar for `github:` and `pypi:` source specs before plugin install/update flows.

Why this duplication is not justified:

- Source spec syntax is a backend-owned install contract, not presentation-only behavior.
- The frontend copy is not a lightweight empty-field check. It is a second handwritten parser with its own acceptance rules.
- There is no shared fixture or generated contract keeping the frontend parser aligned with the backend parser.

Observed drift:

- The frontend only recognizes lowercase prefixes through `startsWith("github:")` and `startsWith("pypi:")`. The backend lowercases the scheme first in `ParseSourceSpec`, so `GitHub:owner/repo` is rejected by the UI but accepted by the backend.
- The frontend accepts any non-empty `pypi:` payload. `pypi:bad/name` and `pypi:pkg==` both pass frontend validation, but the backend rejects them through `splitPyPISpec` and `normalizePackageName`.
- The backend normalizes package names into canonical source keys. Backend tests expect stored values like `pypi:setta_fixture_frontend==0.1.0` in `internal/plugins/service_test.go:557`, while the frontend has no equivalent normalization behavior.

Assessment:

- Unjustified duplication with confirmed semantic drift.

Recommended direction:

- Make the backend parser the only owner of source-spec grammar.
- If the UI needs pre-submit feedback, generate the validation rules from the backend parser contract or add a lightweight validation endpoint.
- Keep any frontend-only checks cosmetic, not grammatical.

### 2. Server-mode boundary policy and endpoint-origin routing matrix

Frontend copy:

- `frontend/src/utils/serverModeBoundaryPolicy.ts:41` `MODE_BOUNDARY_POLICY`
- `frontend/src/utils/serverModeBoundaryPolicy.ts:62` `ENDPOINT_ORIGIN_POLICY`
- `frontend/src/utils/serverModeBoundaryPolicy.ts:114` `resolveEndpointOriginForMode`

Primary consumers:

- `frontend/src/utils/transportUrlCore.ts`
- `frontend/src/utils/endpointUtils.ts`
- `frontend/src/components/Pages/router.tsx`

Backend owner:

- `internal/modes/policy.go:23` mode policy
- `internal/httpapi/workspace_launch_routes.go:144` workspace-launch route registration
- `internal/httpapi/launcher_home_routes.go:136` launcher-home route registration
- `frontend/src/utils/transportRouteConstants.ts:1` already shows that route identities themselves are generated from backend bindings

Why this is duplicated:

- The frontend keeps a handwritten matrix for mode capabilities, which origin a route should use, and which launch routes are blocked or launcher-scoped.

Why this duplication is not justified:

- Mode accessibility and route ownership are determined by backend route registration and backend mode guards.
- The frontend does need routing metadata, but that metadata is still backend-owned and should come from the same binding pipeline that already generates route constants and endpoint wrappers.
- The repo already treats this file as a special exception in `internal/frontendbindings/validation_test.go:1660` and `internal/frontendbindings/validation_test.go:2108`, which means backend route changes require a second manual TypeScript policy update.

Current state:

- I did not prove a concrete user-visible mismatch in the current tree.
- This is still unjustified duplication because the route-origin/mode matrix exists as a second handwritten policy surface with no generated/shared source of truth.
- The local tests in `frontend/src/utils/serverModeBoundaryPolicy.test.ts:20` and `frontend/src/utils/requestTransport.test.ts:9` only verify the frontend table, not parity with backend route registration.

Assessment:

- Unjustified duplication, currently more of a structural drift-risk than a confirmed live bug.

Recommended direction:

- Add backend-owned route metadata for origin scope and mode requirements to the frontend bindings.
- Remove the manual TS allowlist once the binding layer can emit route-origin policy alongside the existing generated route constants.

### 3. Origin normalization, launcher handoff, and return-url validation

Frontend copies:

- `frontend/src/utils/origin.ts:3` `normalizeOrigin`
- `frontend/src/utils/launcherOrigin.ts:11` `isLauncherOriginAllowed`
- `frontend/src/utils/launcherOrigin.ts:96` `appendLauncherOriginToBootstrapUrlFragment`
- `frontend/src/utils/launcherBootstrapUrl.ts:4` `resolveLauncherBootstrapUrl`
- `frontend/src/utils/workspaceLaunchNavigation.ts:10` `resolveWorkspaceLaunchReturnUrl`
- `frontend/src/utils/workspaceLaunchNavigation.ts:38` `resolveWorkspaceLaunchBackNavigation`

Backend owner:

- `internal/frontendorigins/service.go:82` `NormalizeOrigin`
- `internal/frontendorigins/service.go:184` `IsReturnOriginAllowed`
- `internal/frontendorigins/service.go:199` `MintLauncherOriginHandoffProof`
- `internal/frontendorigins/service.go:213` `ValidateLauncherOriginHandoffProof`
- `internal/frontendorigins/service.go:225` `AppendLauncherOriginHandoffToBootstrapURL`
- `internal/frontendorigins/browser_access.go:25` `IsAllowedOriginForRequest`
- `internal/workspacelaunch/intents.go:250` `validateAndNormalizeReturnURL`
- `internal/httpapi/httpapi.go:190` `bootstrapConsumeHandler`

Why this is duplicated:

- Both sides normalize origins, decide whether a launcher origin is acceptable, attach launcher-origin handoff data to bootstrap URLs, and vet return URLs used in workspace-launch flows.

Why this duplication is not justified:

- These are security-sensitive trust and navigation rules.
- The backend already owns canonical origin validation, proof minting/verification, trusted-origin storage, and return-origin admission.
- The frontend copies are not just display helpers. They actively rewrite URLs and make trust decisions with different rules.

Observed drift:

- The frontend explicitly accepts schemeless host values by prepending `http://`. `frontend/src/utils/origin.test.ts:5` expects `normalizeOrigin("127.0.0.1:54321")` to return `http://127.0.0.1:54321`. Backend `NormalizeOrigin` in `internal/frontendorigins/service.go:82` requires an absolute `http(s)` origin and fails closed otherwise.
- The frontend returns `url.origin` without rejecting credentials in `frontend/src/utils/origin.ts:28`. Backend `NormalizeOrigin` explicitly rejects credentials at `internal/frontendorigins/service.go:97`.
- The frontend bootstrap helper appends only `lo` when it is missing in `frontend/src/utils/launcherOrigin.ts:96`. Backend `AppendLauncherOriginHandoffToBootstrapURL` requires both `lo` and a non-empty signed `lop` proof in `internal/frontendorigins/service.go:225`, and `bootstrapConsumeHandler` only trusts a launcher origin after verifying that proof in `internal/httpapi/httpapi.go:236`.
- The frontend return-URL helper only checks `http/https` in `frontend/src/utils/workspaceLaunchNavigation.ts:10`. Backend `validateAndNormalizeReturnURL` additionally rejects credentials, requires an origin, normalizes it, and checks it against the request/trusted-origin store in `internal/workspacelaunch/intents.go:250`.
- The frontend back-navigation helper uses a local allowlist of `currentOrigin`, backend origin, and launcher origin in `frontend/src/utils/workspaceLaunchNavigation.ts:45`. Backend origin admission is session-scoped and trust-store based in `internal/frontendorigins/service.go:184` and `internal/frontendorigins/browser_access.go:25`.

Assessment:

- Unjustified duplication with confirmed semantic drift in a security-sensitive area.

Recommended direction:

- Have the backend mint and return fully formed bootstrap URLs, or return structured bootstrap payloads that already contain the canonical launcher handoff data.
- Stop re-deriving origin trust rules in the frontend. Keep only minimal client-side parsing needed for navigation ergonomics.
- If client-side validation still needs to exist, derive it from backend-owned metadata rather than maintaining a second trust model in TypeScript.

### 4. Tool-name normalization for Claude/OpenCode/MCP tool calls

Frontend copy:

- `frontend/src/utils/claudeTools.ts:49` `normalizeToolName`

Backend owners:

- `internal/mcpx/namespacing.go:23` `NormalizeToolName`
- `internal/externalagents/claude_executor.go:1031` `normalizeClaudeToolName`
- `backend/setta/agentic/external_adapters/sidecars/claude_sdk_runner.py:105` `normalize_tool_name`

Why this is duplicated:

- These layers all receive raw tool names from external agent payloads and normalize them into Setta-facing tool identifiers for approval UI, tool rendering, event processing, and runtime dispatch.

Why this duplication is not justified:

- Canonical tool naming is protocol/runtime logic, not frontend-owned presentation logic.
- There are now three handwritten normalizers with no shared contract test and different rule sets.

Observed drift:

- The frontend strips the `mcp__` prefix and maps a non-MCP bare `question` to `AskUserQuestion`, but otherwise returns the trimmed raw name in `frontend/src/utils/claudeTools.ts:49`.
- The Go canonical normalizer also repairs the single-prefix form `setta_tool` into `setta__tool` in `internal/mcpx/namespacing.go:31`. The frontend does not do that.
- The Python Claude sidecar only maps `question` to `AskUserQuestion` and otherwise returns the trimmed raw input in `backend/setta/agentic/external_adapters/sidecars/claude_sdk_runner.py:105`. It does not strip `mcp__` and does not repair the `setta_` single-prefix form.
- Result: the same raw tool name can normalize one way in the UI, another way in Go executor logic, and a third way in the Python sidecar.

Assessment:

- Unjustified duplication with confirmed semantic drift.

Recommended direction:

- Normalize tool names once in the backend before they reach the UI whenever possible.
- If historical/raw payloads still require client normalization, generate the exact same rule set from backend-owned code or bindings instead of maintaining a separate frontend helper.

## Bottom Line

- I found four unjustified frontend/backend duplications.
- Three already have concrete semantic drift: plugin source-spec parsing, origin/handoff/return-url validation, and tool-name normalization.
- One is currently a structural duplication without a proven user-visible mismatch today: the server-mode boundary/origin routing matrix.
