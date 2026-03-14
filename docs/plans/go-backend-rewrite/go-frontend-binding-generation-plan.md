# Go Frontend Binding Generation Plan

## Purpose

This doc covers Go-owned frontend binding generation when work touches
frontend-facing Go HTTP/websocket contracts. Use it for that boundary, not as
the default driver for unrelated rewrite work.

The goal here is to move frontend-facing Go HTTP/websocket contracts onto a
Go-owned source of truth using a real Go-to-TypeScript conversion pipeline,
not handwritten TypeScript emitters, and to sever frontend ties to
Python-generated backend bindings.

## Why This Slice Is Open Now

- The broad-coverage checklist now records frontend backend-contract binding
  generation as a shared Go-to-TypeScript boundary with canonical Go-generated
  outputs, but this slice remains open because widened boundary coverage and
  parity verification still need the same Go-owned source of truth.
- The rewrite started from a Python pattern for this problem, but the active
  repo workflow now uses the Go-owned generator directly for the canonical
  frontend route/type/endpoint outputs.
- The remaining work is widening that explicit Go boundary and keeping the
  converter/manifests/compile checks authoritative, not reopening handwritten
  TypeScript emission or mixed-source Python drift.

## Working Decision

Use explicit Go contract types plus explicit endpoint specs, then convert those
Go definitions into TypeScript in a reusable generator pipeline.

The generator architecture should be fail-closed and boundary-owned:

- for each frontend-facing Go endpoint, maintain one explicit Go-owned
  boundary declaration that names the route, method, request type, and
  response type
- generate TypeScript from those boundary declarations rather than from
  handwritten TypeScript fragments
- if a runtime type does not convert cleanly, add or reshape a dedicated Go
  boundary DTO instead of teaching the frontend to depend on internal runtime
  structs
- if a type still cannot be represented by the current converter, stop and add
  a converter rule or a dedicated boundary type; do not silently fall back to
  `null`, empty names, or manual TS drift

The transition goal is not a long-lived mixed Go/Python frontend binding
state. During the rewrite, prefer cutting over frontend imports and generated
artifacts to Go ownership even if the overall app is temporarily not in a
working state.

This slice does not permit:

- handwritten TS wrappers added one route at a time
- handwritten TS request/response type definitions added one route at a time
- per-route string-builder emission as the primary generator architecture
- preserving Python-generated frontend contract outputs as a parallel steady
  state just to keep partial coexistence working

Steady-state disallowed patterns:

- empty Go marker structs paired with large handwritten raw TypeScript blobs as
  the normal way to express a route contract
- endpoint specs that omit response typing and therefore default generated
  wrappers to `null` when the real handler returns JSON
- converter helpers that silently degrade unsupported shapes instead of failing
  generation

If a Go runtime type is not suitable for stable frontend generation, introduce
a dedicated Go contract type for the frontend boundary and convert that type.

## Generator Shape

The Go-side generator should mirror the roles of the historical Python
generators it replaced:

- route constants generation
  - source of truth: Go route constants under `internal/httpapi` and
    `internal/wsapi`
- endpoint wrapper generation
  - source of truth: explicit Go endpoint specs including method, route, and
    request/response types
- type generation
  - source of truth: explicit Go contract types converted into TypeScript

Preferred ownership shape:

- route constants remain defined in `internal/httpapi` and `internal/wsapi`
- frontend boundary DTOs live in a dedicated Go contract package or contract
  section whose only job is frontend transport shape
- endpoint specs point at those DTOs and route constants
- the generator reads those endpoint specs and DTOs to emit routes, endpoint
  wrappers, and TypeScript type declarations

This means the frontend contract source of truth should be:

- not the handler implementation body
- not internal runtime structs with extra semantics the frontend does not need
- not raw TS embedded beside placeholder Go types

If a route needs custom shaping for the frontend boundary, make that shaping
explicit in Go.

## Architecture Rule

The general rule for Go-to-TypeScript conversion in this repo is:

- one Go-owned boundary contract per frontend-facing endpoint
- one converter pipeline for those contracts
- zero long-lived handwritten TS escape hatches in the steady state

Practical implications:

- every endpoint wrapper should be generated from a spec that explicitly names
  request and response contracts, even for trivial `{ ok: true }` payloads
- every generated route wrapper should be traceable to a Go route constant and
  a Go contract type
- every non-trivial frontend boundary type should exist as a deliberate Go DTO
  rather than as an accidental reflection of backend runtime internals
- raw TS should be treated as a temporary bootstrap mechanism only when the
  converter cannot yet express a bounded slice; any such escape hatch should be
  documented as debt to remove, not as the desired architecture

## Converter Rule

The converter should stay small, explicit, and predictable.

- prefer a narrow set of supported Go shapes with explicit conversion rules
- prefer adding named boundary DTOs over widening reflection magic
- fail generation on unsupported or ambiguous shapes
- do not silently generate placeholder output for unnamed, unsupported, or
  partially specified types
- keep enum handling, map handling, optionality, and discriminated-union
  handling explicit and reviewable

Expected outputs:

- canonical frontend generated contract files
  - `frontend/src/utils/generatedRoutes.ts` where applicable
  - `frontend/src/utils/generatedTypes.ts`
  - `frontend/src/utils/generatedEndpoints.ts`

Temporary bootstrap outputs such as `generatedGo*` are allowed only while
proving the converter or landing a bounded cutover slice. They are not the
target architecture and should be deleted as soon as the canonical generated
files are Go-owned.

Current status:

- the production generator now emits the canonical frontend contract files
  without raw declarations, raw marker types, or `FactoryTS` helper bodies in
  `internal/frontendbindings`
- the production generator now also owns the frontend `C` constant surface and
  UI editor tab compatibility payloads through structured declarations in
  `internal/frontendbindings`, so `frontend/src/utils/c.ts` is only a thin
  re-export and `frontend/src/utils/constants.ts` no longer imports backend
  JSON directly
- the old Python frontend contract generators are no longer part of the active
  repo workflow; canonical route/type/endpoint outputs come from
  `cmd/setta-gen-frontend-bindings` plus `internal/frontendbindings`
- the repo now exposes a direct Go-owned regeneration path for those canonical
  frontend contract files through
  `pnpm -C frontend generate-go-frontend-bindings` /
  `frontend/generation/generate_go_frontend_bindings.sh`; the broader
  `pnpm generate` workflow still exists for mixed Python + frontend
  regeneration, but the Go-owned route/type/endpoint outputs no longer need
  to stay hidden inside that larger script
- the validation suite now compiles generated bindings against the real
  frontend support boundary they import in production (`endpointUtils`,
  `c_addresses`, `serverModeBoundaryPolicy`, and related utility imports) in
  an isolated temp project rather than proving them only against a pure local
  stub harness
- the validation suite now also checks that the checked-in canonical frontend
  files under `frontend/src/utils/` match the canonical Go-owned generator
  output after the repo's Prettier formatting step, so stale generated
  bindings fail in Go tests instead of drifting until a manual regeneration
  pass or later frontend diff
- the validation suite now also checks that every bare Go HTTP route name
  listed in `internal/httpapi/route_names.go` is represented somewhere in
  `CurrentRouteGroups()`, so route-inventory widening cannot silently drift
  past the binding source of truth
- the validation suite now also checks that every Go root route constant in
  `internal/httpapi` whose path lives under `"/__setta__/"` is represented
  somewhere in `CurrentRouteGroups()`, so bootstrap/tool root-route widening
  cannot silently drift past the binding source of truth
- the validation suite now also checks that every Go websocket route constant
  declared in `internal/wsapi/routes.go` is represented somewhere in
  `CurrentRouteGroups()`, so websocket route widening cannot silently drift
  past the binding source of truth
- the validation suite now also checks that every converted Go HTTP route's
  registered GET/POST method set in `internal/httpapi` matches the
  `CurrentEndpoints()` inventory, so handler-method drift cannot silently
  leave generated endpoint wrappers on the wrong verb
- the validation suite now also snapshots the current endpoint-contract
  inventory in a golden manifest, including request, response, and path-param
  DTO ownership, so wrapper-contract widening or reshaping becomes an explicit
  reviewed diff instead of only surfacing through broader generated-endpoint
  churn
- the validation suite now also snapshots the current route-group inventory in
  a golden manifest, so route-group widening or reshaping becomes an explicit
  reviewed diff instead of only surfacing through missing-route failures
- the validation suite now also snapshots the current additional-declaration
  inventory in a focused golden manifest, so support-declaration widening stays
  reviewable without diffing the full generated types output
- the validation suite now also snapshots the current additional type-root
  inventory in a focused golden manifest, so manual converter-root widening is
  explicit before it shows up as broader generated-types churn
- the validation suite now also checks that the only generated frontend
  contract files under `frontend/src` are `generatedRoutes.ts`,
  `generatedTypes.ts`, and `generatedEndpoints.ts`, so shadow outputs such as
  `generatedGo*` cannot quietly return; remaining work here is about widening
  coverage and verification, not preserving a parallel
  Python-generated frontend contract surface
- the validation suite now also checks that non-test frontend source files do
  not re-import Python-owned contract artifacts such as
  `backend/setta/...` paths or
  `ui_settings/section_ui_editor_tab_compatibility.json`, so the canonical
  Go-owned frontend contract boundary stays cut over
- the validation suite now also checks that `frontend/src/utils/c.ts`
  remains only a thin `generatedTypes` re-export, so active `C` callers
  cannot silently reintroduce a handwritten contract side surface
- the validation suite now also checks that direct `get` / `post` /
  `getBinary` helper imports stay confined to `generatedEndpoints.ts` plus
  the remaining intentional dynamic Setta API button helper in
  `frontend/src/components/Section/Layouts/settaApiAction.ts`; that action
  still allows arbitrary custom route strings in addition to preset routes,
  so it is not yet representable as a fail-closed generated endpoint wrapper
  without changing product behavior
- `generatedRoutes.ts` now also emits canonical websocket route helpers for
  `/ws/frontend`, `/ws/listeners/{listenerID}`, and
  `/ws/terminals/{projectID}/{sectionID}`, so active websocket callers no
  longer need direct `replaceAddressParams` or raw `GoWebsocketRoutes`
  imports in non-test frontend code
- `generatedRoutes.ts` now also emits canonical root route helpers for the
  Go-owned bootstrap/tool root paths, so active callers no longer need raw
  `RouteEnum.BOOTSTRAP_PAGE` access in non-test frontend code
- the generated route inventory now also carries explicit route-only plugin
  asset and `plugin-static` root patterns from `internal/httpapi`, so the
  Go-owned plugin frontend asset-serving paths no longer remain only as
  hardcoded root-route strings outside the binding source of truth
- `generatedRoutes.ts` now also emits canonical API-prefix helpers, so support
  code no longer needs raw route-prefix constant imports for backend/launcher
  base-address construction
- `generatedRoutes.ts` now also emits canonical HTTP route helpers for the
  current Go-owned route surface, including zero-path-param support helpers
  plus path-param routes such as deployment reads and binary/file downloads
  plus plugin backend dispatch, so active callers no longer need raw
  `RouteEnum...replace(...)` interpolation or handwritten
  `/api/plugins/{pluginId}...` path concatenation in non-test frontend code
- `generatedEndpoints.ts` now also calls those canonical HTTP route helpers
  instead of importing the broad `GoHTTPRoutes` constant bag directly, so the
  endpoint wrapper layer shares the same helper-owned boundary as runtime
  callers
- the remaining intentional dynamic Setta API button path now flows through
  `frontend/src/components/Section/Layouts/settaApiAction.ts`, with focused
  `settaApiAction` helper coverage plus `MetaControlArea` coverage proving
  route trimming, custom route passthrough, and preset-body merge behavior
  over that low-level `post()` boundary, so the explicit exception stays
  documented and behavior-backed rather than becoming an untested fallback
  seam
- support-layer frontend routing now uses generated Go route helpers for the
  API prefix, launcher-origin policy map, and fixed Setta API presets, so
  non-test runtime code no longer imports the broad legacy `RouteEnum` surface
- the validation suite now also checks that direct websocket route-builder
  imports do not reappear in non-test frontend sources
- the validation suite now also checks that direct generated route-constant
  imports do not appear in non-test frontend sources; active callers should
  use generated helpers instead of importing broad route-constant bags
- the validation suite now also checks that non-test frontend runtime source
  does not import the legacy `RouteEnum`; callers should use narrower Go route
  groups/helpers or a documented explicit boundary instead
- the validation suite now also checks that non-test frontend sources do not
  manually interpolate generated `RouteEnum` paths with `.replace(...)`;
  callers should use generated route helpers or a documented explicit
  boundary instead
- the validation suite now also checks that non-test frontend sources do not
  manually concatenate `/api/plugins/{pluginId}...` backend dispatch paths;
  callers should use the generated plugin backend route helper instead
- the validation suite now also snapshots the current explicit frontend
  direct-transport exception inventory in a focused golden manifest, so the
  remaining nongenerated runtime helper seams stay reviewable as the
  converted surface widens without duplicating the separately-verified
  canonical generated binding boundary
- the validation suite now also rejects raw backend/base URL construction in
  non-test frontend runtime source, so callers must go through the shared
  `endpointUtils` helper boundary instead of reintroducing direct
  `C_ADDRESSES` transport assembly
- the workspace-launch bootstrap URL and trusted return-origin policy now also
  flow through shared launcher/workspace-navigation helpers, and the
  validation suite confines direct `C_ADDRESSES.BACKEND_ORIGIN` /
  `C_ADDRESSES.LAUNCHER_ORIGIN` usage to those boundary utilities plus
  `endpointUtils`, so component code does not reintroduce ad hoc
  backend/launcher origin handling
- plugin asset/backend/listener transport now also flows through a shared
  `frontend/src/plugins/transport.ts` helper, so plugin runtime callers no
  longer import low-level `endpointUtils` builders directly
- the validation suite now also checks that direct `plugins/transport`
  imports stay confined to the current plugin runtime and listener-endpoint
  callers, so the narrowed plugin transport wrapper does not quietly widen
  into a general runtime helper surface
- backend-origin URL and websocket construction now also flows through
  `frontend/src/utils/backendOriginTransport.ts`, so plugin/realtime/terminal
  callers no longer import those low-level `endpointUtils` builders directly
- backend-origin bootstrap/frontend/listener/terminal route shaping now also
  flows through that same `backendOriginTransport` boundary, so realtime and
  terminal runtime callers no longer import `GoRootRouteHelpers` or
  `GoWebsocketRouteHelpers` directly
- the validation suite now also checks that direct
  `backendOriginTransport` imports stay confined to the current plugin,
  realtime, and terminal boundary callers, so those narrowed websocket/origin
  seams cannot silently widen back into ad hoc runtime utility usage
- app binary-download and plugin backend-fetch route shaping now also flows
  through `frontend/src/utils/backendTransport.ts`, with
  `frontend/src/components/App/appTransport.ts` and
  `frontend/src/plugins/transport.ts` reduced to boundary re-export/adjacent
  helpers instead of importing `GoHTTPRouteHelpers` directly
- the validation suite now also checks that direct `appTransport` imports stay
  confined to the current app runtime caller, so the narrowed app download
  wrapper remains a real boundary instead of turning back into a broad helper
  surface
- Setta API preset route selection now also flows through that same
  `backendTransport` boundary, so `frontend/src/utils/settaApiPresets.ts`
  no longer imports `GoHTTPRouteHelpers` directly
- the validation suite now also checks that direct `backendTransport` imports
  stay confined to the current app, plugin, and Setta API preset boundary
  callers, so narrowed fetch/download/preset seams cannot silently widen into
  broader runtime helper usage
- server-mode origin-policy route selection now also flows through
  `frontend/src/utils/transportRouteConstants.ts`, so
  `frontend/src/utils/serverModeBoundaryPolicy.ts` no longer imports
  `GoHTTPRouteHelpers` or `GoRootRouteHelpers` directly
- the validation suite now also checks that direct
  `serverModeBoundaryPolicy` imports stay confined to `transportUrlCore`,
  `endpointUtils`, `router.tsx`, and `serverModeCapabilities.ts`, so the
  narrowed server-mode route/origin policy seam cannot silently widen into ad
  hoc runtime callers
- the validation suite now also checks that direct `c_addresses` imports stay
  confined to `transportUrlCore`, `launcherBootstrapUrl`, and
  `workspaceLaunchNavigation`, so backend/launcher base-address reads remain
  inside explicit transport/navigation boundaries instead of widening through
  runtime callers
- the validation suite now also checks that direct `launcherBootstrapUrl`
  imports stay confined to the current launcher/workspace-launch pages, that
  direct `workspaceLaunchNavigation` imports stay confined to the workspace
  launch page, and that direct `serverModeCapabilities` imports stay confined
  to the current launcher home and workspace-switcher callers, so those
  support-layer server-mode/launcher seams cannot quietly widen
- the remaining direct generated-route helper bag now lives in the focused
  `frontend/src/utils/transportRouteConstants.ts` boundary, which feeds
  `backendOriginTransport`, `backendTransport`, `c_addresses`, and
  `serverModeBoundaryPolicy` instead of allowing those utilities to import
  `generatedRoutes` directly
- the validation suite now also checks that direct
  `transportRouteConstants` imports stay inside those explicit boundary
  utilities, so narrowed runtime callers cannot silently bypass the transport
  helper seams and widen helper-bag reachability ad hoc
- shared backend URL construction for narrowed app/plugin transport callers now
  also flows through `frontend/src/utils/backendTransport.ts`, so those
  wrappers no longer import `endpointUtils` directly
- shared backend/backend-origin URL assembly now also flows through
  `frontend/src/utils/transportUrlCore.ts`, so `endpointUtils` is reduced to
  URL/origin policy helpers plus error parsing instead of remaining the URL
  source of truth for narrowed runtime wrappers
- the validation suite now also checks that direct `transportUrlCore` imports
  stay confined to `endpointUtils`, `requestTransport`, `backendTransport`,
  and `backendOriginTransport`, so narrowed backend/backend-origin URL
  assembly cannot silently widen back into ad hoc runtime callers
- shared HTTP request verbs now also flow through
  `frontend/src/utils/requestTransport.ts`, so `generatedEndpoints.ts` and the
  intentional dynamic Setta API helper boundary no longer import
  `endpointUtils` directly
- `generatedEndpoints.ts` remains the canonical generated request-helper
  boundary and is separately locked by exact generation/parity tests
- the remaining explicit nongenerated runtime request-helper exception is now
  only the intentional dynamic Setta API helper boundary in
  `frontend/src/components/Section/Layouts/settaApiAction.ts`, through
  `requestTransport`
- direct `generatedRoutes` helper-bag imports now stay confined to
  `generatedEndpoints.ts` plus the focused
  `frontend/src/utils/transportRouteConstants.ts` boundary instead of widening
  ad hoc through runtime callers
- the validation suite now also checks that those direct generated-route helper
  imports stay inside that explicit boundary and snapshots the remaining
  nongenerated route/transport/support-boundary import inventory in the
  focused frontend boundary exception manifest, so helper-boundary widening
  becomes a reviewed diff instead of silent runtime drift
- the validation suite now also rejects namespace/default imports plus
  export-all / namespace re-exports plus dynamic-import / `require()` access
  to narrowed boundary modules such as `generatedRoutes`, `requestTransport`,
  `transportRouteConstants`, `backendTransport`, `backendOriginTransport`,
  `appTransport`, `c_addresses`, `launcherBootstrapUrl`,
  `workspaceLaunchNavigation`, `serverModeCapabilities`,
  `serverModeBoundaryPolicy`, `transportUrlCore`, and `plugins/transport`, so
  caller-specific boundary checks cannot be bypassed through broad module
  imports, dynamic loads, or re-export seams
- the validation suite now also checks that the checked-in
  `generatedRoutes.ts`, `generatedTypes.ts`, and `generatedEndpoints.ts`
  files exactly match the current Go frontend binding generation pipeline
  output, so generation drift fails fast instead of depending on manual
  regeneration
- widening the converted surface should use structured declarations,
  converter-rule additions, or explicit Go boundary DTOs rather than
  reintroducing inline TypeScript escape hatches

## Initial Slice

Start by proving the converter pipeline on a small but real Go-owned surface:

- current Go websocket route constants
- current Go status/meta route constants
- the status/meta endpoint cluster and its request/response contract types

This is intentionally small enough to validate the generator architecture
before widening it across more caller-backed Go routes.

Current landed wedge:

- `frontend/src/utils/generatedRoutes.ts`
- current websocket route constants
- current status/meta route constants
- current settings route constants
- current project-shell route constants
- current project-state layout/presence/structure-selection route constants
- current latest-project-state hydration, code editing/formatting,
  callable/section-presentation toggle, codegen-target, chat-settings, and
  watch-code route constants
- current child-section helper route constants
- current section-variant delete helper route constants
- current param-impl/value/config, code-object naming/display,
  python-codegen prefix/suffix, and attached-terminal helper route constants
- current clipboard copy/paste route constants
- current group-orientation and section-data helper route constants
- current draw-area append helper route constant
- current chart metadata helper route constants
- current text-block and docstring helper route constants
- current AI helper read route constants, including single-item
  agent-profile / prompt-template / external-agent-config /
  engine-config / agent-run reads
- current engine-config and managed agent-execution mutation route constants,
  including engine-config create/delete plus managed agent-run and run-chain
  start/stop
- current section param-filter, meta-control-title, and group-overflow route
  constants
- current section param column-width route constants
- current top-level section creation, view-mode lifecycle, and section-rename
  route constants
- current code file binding route constants
- current browser section metadata route constants
- current file-browser create/read/write/download/transfer route constants
- current binary payload and bounded artifact route constants
- current git read route constants
- current LSP completion and diagnostics-mute route constants
- current workspace-launch route constants
- current deployment/share current-session, state/project-config, and
  publish/list/latest/version route constants
- current launcher-home route constants
- current launcher-management route constants
- current plugin-management route constants
- `frontend/src/utils/generatedTypes.ts`
  - current status/meta request/response contract types
  - explicit workspace-launch boundary contract types
    - `LaunchRequestInput`
    - `CreateWorkspaceLaunchIntentRequestInput`
    - `CreateWorkspaceLaunchIntentResponse`
    - `LaunchResponse`
    - these are dedicated frontend contract types, not a direct reflection of
      `internal/workspacelaunch.Request`, because the runtime request type also
      carries field-presence semantics for intent storage/validation
  - launcher-home contract types
    - recent-workspace query/mutation payloads
    - filesystem-root and directory-listing payloads
    - `LauncherOpenWorkspaceRequestInput`
    - `LauncherOpenWorkspaceResponse`
    - the open-workspace request stays a dedicated frontend contract type
      rather than reflecting the internal launcher request that tracks
      `settaFilesLocation` presence for runtime behavior
  - launcher-management contract types
    - launcher status and update payloads
    - setup/update request payloads
    - launcher status-query and request-base payloads
    - launcher state enums used by the frontend
  - deployment/share contract types
    - `DeploymentVersionRouteParams`
    - `LoadDeploymentProjectConfigRequestInput`
    - `DeploymentManifest`
    - `ShareDeploymentSessionResponse`
    - `AppDeploymentSessionResponse`
    - `ShareDeploymentMetadata`
    - `ShareDeploymentMetadataList`
    - `AppDeploymentMetadata`
    - `AppDeploymentMetadataList`
    - `AppDeploymentStateResponse`
    - `PublishShareDeploymentRequestInput`
    - `PublishAppDeploymentRequestInput`
  - project-shell and current project-state contract types
    - settings load/save payloads
      - `SaveSettingsRequestInput`
    - project metadata and project-shell payloads
    - latest-project-state/code-edit/watch-code/chat-settings/codegen contract
      payloads
      - `GetLatestProjectStateRequestInput`
      - `ProjectStateSingleConfigWithCompletedOpIds`
      - `SetCodeRequestInput`
      - `FormatCodeRequestInput`
      - `SetCallableRequestInput`
      - `SetCallableResponse`
      - `SetCallableHideParamsRequestInput`
      - `SetSectionHideUnpinnedParamsRequestInput`
      - `SetSectionPinnedParamsRequestInput`
      - `SetProjectConfigCodegenTargetsRequestInput`
      - `SetChatSectionSettingsRequestInput`
      - `SetWatchCodeEnabledRequestInput`
      - `SetWatchCodeInputsRequestInput`
      - `ProjectMetadataEntry`
      - `AllProjectMetadata`
      - `LoadProjectConfigRequestInput`
      - `SaveProjectRequestInput`
      - `SaveAsNewProjectConfigRequestInput`
      - `CreateProjectConfigRequestInput`
      - `CreateProjectConfigResponse`
      - `DeleteProjectConfigsRequestInput`
      - `SetProjectConfigNameRequestInput`
      - `SetAsDefaultProjectRequestInput`
      - `GetNotificationsRequestInput`
      - `DeleteNotificationRequestInput`
      - `NotificationsResponse`
    - current layout/selection/viewport mutation payloads
      - `TopLevelSectionLayoutInput`
      - `SetTopLevelSectionLayoutRequestInput`
      - `ToggleSectionVisibilityRequestInput`
      - `AutoLayoutTopLevelSectionsRequestInput`
      - `SetShowParamDisplayNamesRequestInput`
      - `SetSectionSizesRequestInput`
      - `SetActiveIDsRequestInput`
      - `ViewportInput`
      - `SetViewportRequestInput`
      - `TogglePositionLocksRequestInput`
      - `ToggleMinimizedRequestInput`
      - `SetSectionParamFilterRequestInput`
      - `SetMetaControlShowSectionTitleRequestInput`
      - `SetSectionColumnWidthRequestInput`
      - `SetParentDefaultChildSectionTypeRequestInput`
      - `SetListRootViewModeRequestInput`
      - `SetGroupOverflowModeRequestInput`
      - `SetSectionTagColorRequestInput`
      - `SetSectionStyleColorRequestInput`
      - `ToggleGroupOrientationRequestInput`
      - `SetSpreadsheetFilePathRequestInput`
      - `SetSpreadsheetSectionSettingsRequestInput`
      - `SetTaskBoardSectionStateRequestInput`
      - `SetImageAreaImagePathRequestInput`
      - `SetSocialURLRequestInput`
      - `AppendDrawAreaLayerItemRequestInput`
      - `SetChartAreaDataPathRequestInput`
      - `SetChartTypeRequestInput`
      - `SetChartSettingsRequestInput`
    - current param-impl/value/config, code-object naming/display,
      python-codegen prefix/suffix, and attached-terminal helper payloads
      - `ChangeParamImplRequest`
      - `SetParamEnteredValueRequestInput`
      - `UpdateParamImplConfigRequestInput`
      - `SetCodeSectionAttachedTerminalRequestInput`
      - `SetGenCodePrefixRequestInput`
      - `SetGenCodeSuffixRequestInput`
      - `SetCodeObjNameRequestInput`
      - `SetCodeObjDisplayNameRequestInput`
    - current clipboard copy/paste payloads
      - `PrepareSectionsForCopyRequestInput`
      - `PasteSectionsRequestInput`
      - `ClipboardDataType`
      - `ClipboardProjectStateCore`
      - `ClipboardProjectStateCoreWithSectionVariantMap`
      - `SectionsClipboardData`
      - `BaseClipboardDataUnionWithDiscriminator`
    - current text-block helper payloads
      - `SetTextBlockTextRequestInput`
      - `SetTextBlockDisplayModeRequestInput`
      - `SetTextBlockFormatRequestInput`
      - `SetTextBlockHeadingAsSectionNameRequestInput`
      - `SetTextBlockMetaControlStyleRequestInput`
      - `SetTextBlockMasterFontSizeRequestInput`
      - `DocstringToMarkdownRequest`
      - `DocstringToMarkdownResponse`
    - current structure/param-selection mutation payloads
      - `CreateChildSectionsRequestInput`
      - `CreateChildSectionsViaIncrementerRequestInput`
      - `CreateChildSectionsResponse`
      - `DeleteChildSectionsViaDecrementerRequestInput`
      - `DeleteChildSectionsViaDecrementerResponse`
      - `DeleteSectionsRequestInput`
      - `DeleteSelectedParamsRequestInput`
      - `MoveParamGroup`
      - `MoveParamsRequestInput`
      - `MoveParamGroupsRequestInput`
      - `IndentParamsRequestInput`
      - `UnindentParamsRequestInput`
      - `GroupSectionsRequestInput`
      - `UngroupGroupsRequestInput`
      - `ToggleParamSelectedRequestInput`
      - `UnselectAllParamsRequestInput`
    - current graph-edge mutation payloads
      - `CreateEdgeRequestInput`
      - `UpdateEdgeRequestInput`
      - `DeleteEdgesRequestInput`
      - `ReconnectEdgeRequestInput`
      - `SetEdgesRequestInput`
      - `CreateAgenticEdgeRequestInput`
      - `UpdateAgenticEdgeRequestInput`
      - `DeleteAgenticEdgesRequestInput`
      - `SetAgenticEdgesRequestInput`
    - current section-variant mutation payloads
      - `CreateNewSectionVariantRequestInput`
      - `CreateNewSectionVariantResponse`
      - `SetSectionVariantRequestInput`
      - `SetDefaultSectionVariantRequestInput`
      - `SetSectionVariantSortOrderRequestInput`
      - `ToggleVariantFrozenRequestInput`
      - `ToggleVariantJSONSourceRequestInput`
      - `SetVariantJSONSourceKeysRequestInput`
      - `SetSectionVariantNameRequestInput`
      - `DeleteSectionVariantOrAskRequest`
      - `DeleteSectionVariantOrAskResponse`
      - `DeleteJSONSourceFileAndVariantRequest`
    - current AI helper read payloads
      - `GetAIFollowSnapshotRequest`
      - `AIFollowToolArgumentsUpdateContent`
      - `AIFollowToolResultUpdateContent`
      - `AIFollowSnapshotResponse`
      - `GetAgenticSummaryCacheStatusRequest`
      - `AgenticSummaryCacheStatus`
    - current engine-config and managed agent-execution mutation payloads
      - `CreateEngineConfigRequestInput`
      - `DeleteEngineConfigRequestInput`
      - `StartAgentRunRequestInput`
      - `StopAgentRunRequestInput`
      - `StartRunChainRequestInput`
      - `StopRunChainRequestInput`
    - current browser section metadata payloads
      - `SetBrowserColumnWidthsRequestInput`
      - `SetBrowserAreaViewModeRequestInput`
      - `SetBrowserHideColumnRequestInput`
      - `SetBrowserSavedSearchesRequestInput`
    - current top-level section creation, view-mode lifecycle, and
      section-rename payloads
      - `Position`
      - `CreateTopLevelSectionRequestInput`
      - `CreateTopLevelSectionResponse`
      - `CreateViewModeRequestInput`
      - `CreateViewModeResponse`
      - `SetActiveViewModeRequestInput`
      - `ToggleIsEditingViewModeRequestInput`
      - `ToggleViewModeUserFacingRequestInput`
      - `ToggleViewModeTabRequestInput`
      - `SetViewModeNameRequestInput`
      - `SetViewModeSortOrderRequestInput`
      - `DeleteViewModeRequestInput`
      - `SetSectionNameRequestInput`
      - `AcceptRenameRefactorRequestInput`
      - `DeclineRenameRefactorRequestInput`
    - current code file binding payloads
      - `CodeFileBindingUpdate`
      - `SetCodeFileBindingRequestInput`
    - current git read payloads and responses
      - `GitDiffMode`
      - `GitRepoInfo`
      - `GitStatusEntry`
      - `GetGitStatusResponse`
      - `GetGitDiffRequestInput`
      - `GetGitDiffResponse`
      - `GitCommit`
      - `GetGitLogRequestInput`
      - `GetGitLogResponse`
      - `GitCommitChangedFile`
      - `GetGitCommitDetailsRequestInput`
      - `GetGitCommitDetailsResponse`
      - `GetGitCommitFileDiffRequestInput`
      - `GetGitCommitFileDiffResponse`
    - shared project-state/core types used by current callers
      - `SectionType`
      - `CodeObjType`
      - `ListRootViewMode`
      - `Core`
      - `Variant`
      - `ProjectConfig`
      - `ProjectStateSingleConfig`
      - `ProjectStateSingleConfigWithCompletedOpIds`
      - `SettingsState`
    - current canonical project-state helper support used by current callers
      - `ViewModeConfig` plus `createViewMode` and `createViewModeConfig`
      - shared code binding enums/types
        - `CodeFileAccessMode`
        - `CodeFileBinding`
      - current settings helper/enums used by current callers
        - `SettingsShortcuts`
        - `SettingsGUI`
        - `SettingsBackend`
        - `SectionSizingPolicy`
        - `createSettingsShortcuts`
        - `createSettingsGUI`
        - `createSettingsBackend`
        - `createSectionSizingPolicy`
        - `RenameRefactorMode`
        - `BackgroundVariant`
        - `SelectionMode`
        - `PanOnScrollMode`
        - `MetaControlSizeMode`
      - current section sizing enums/types/helpers used by current callers
        - `SectionSizeMode`
        - `SectionSizeValue`
        - `SectionSize`
        - `createSectionSize`
      - current project-codegen target enums/types/helpers used by current
        callers
        - `ProjectCodegenLanguage`
        - `SectionCodegenMode`
        - `SectionRepresentationMode`
        - `CodeObjValueRepresentationMode`
        - `SectionTypeCodegenPolicy`
        - `SectionCodegenOverride`
        - `SectionCodegenPolicy`
        - `CodeObjTypeValuePolicy`
        - `CodeObjValueOverride`
        - `CodeObjValuePolicy`
        - `ProjectCodegenPythonTarget`
        - `ProjectCodegenPluginTarget`
        - `ProjectCodegenTarget`
        - `createSectionCodegenPolicy`
        - `createCodeObjValuePolicy`
        - `createProjectCodegenPythonTarget`
        - `createProjectCodegenPluginTarget`
        - `ProjectConfig.codegenTargets` now uses the canonical
          `Array<ProjectCodegenTarget>` surface instead of
          `Array<Record<string, unknown>>`
      - section/default factories for `Callable`, `Dict`, `ListRoot`,
        `TextBlock`, `Code`, `Terminal`, `Chat`, `Browser`, `Chart`,
        `TaskBoard`, and `Spreadsheet`
      - current chart helper/types used by the chart layout and settings
        callers
        - `ChartType`
        - `LineChartSettings`
        - `ScatterChartSettings`
        - `BaseChartSettingsUnion`
        - `ChartData`
        - `ChartDataType`
        - `createLineChartSettings`
        - `createScatterChartSettings`
        - `createBaseChartSettingsUnionWithDiscriminator`
      - browser shared enums and helpers
        - `BrowserAreaViewMode`
        - `BrowserSearchScope`
        - `BrowserSavedSearchTypeFilters`
        - `BrowserSavedSearch`
        - `createBrowserSavedSearchTypeFilters`
        - `createBrowserSavedSearch`
      - current code-object helper/type coverage for `CodeParam` plus the
        caller-used param-UI impl shapes for `CodeCallable`, `TextParam`,
        `DateParam`, `TimeParam`, `ButtonParam`, `SliderParam`,
        `RotaryParam`, `SwitchParam`, `ColorPickerParam`,
        `DropdownParam`, `PasswordParam`, `TextAreaParam`,
        `DropzoneParam`, and `NestedParam`
      - current code-object type-set exports used by UI config callers
        - `BaseChildlessCodeObjImplTypeSet`
        - `BaseParamCodeObjImplTypeSet`
        - `ControlCodeObjTypeSet`
        - `SectionParamCodeObjTypeSet`
      - chat message/tool-call helpers and chat section state/branch payloads
      - agentic-edge enums/helper support
        - `AgenticEdgeKind`
        - `AgenticEdgeContextMode`
        - `createAgenticEdge`
      - runtime enums used by the current helper callers, including
        `CodeLanguage`, `CodeFileAccessMode`, `ConfigLanguage`,
        `ChartType`, `TextBlockFormat`,
        `TextBlockDisplayMode`, `ChatRole`, `ChatPermissionMode`,
        `ChatDictationMode`, `TaskBoardViewMode`,
        `TaskBoardTaskRecurrence`, `TaskBoardRecurringWeekday`,
        `TaskBoardRecurringMonth`, `SpreadsheetGridDensity`,
        `ParamNameType`, `ParameterPassingStyle`,
        `ButtonActionMode`, `HttpRequestMethod`, `DropzoneMode`,
        `TextParamInputUIType`, `TimeDisplayFormat`, `TimeControlMode`,
        `TimeDisplayFont`, `DateDisplayFormat`, `DateControlMode`,
        `DateSelectionMode`, and `DateCalendarWeekStart`
    - current frontend websocket transport helper/types used by current callers
      - `WebsocketConnectionType`
      - `WebsocketConnectionInfo`
      - `WebsocketMsgTypeForFrontend`
      - `WebsocketMsgTypeForBackend`
      - `WebsocketMsg`
      - `FrontendWebsocketMsgUnion`
      - `WebsocketMsgCurrentAddressUpdate`
      - `WebsocketMsgRealtimeUIChange`
      - `WebsocketMsgRealtimeDependencyEvent`
      - `WebsocketMsgUISettingRevealResult`
      - `createWebsocketConnectionInfo`
      - `createWebsocketMsgCurrentAddressUpdate`
      - `UISettingRevealContent`
      - `UISettingRevealContentSchema`
    - current shared AI runtime/helper types used by current callers
      - `EngineType`
      - `EngineConfigDefaults`
      - `EngineConfig`
      - `createEngineConfig`
      - `AgentProfile`
      - `TranscriptionTransportMode`
      - `TranscriptionProfile`
      - `AgentRunStatus`
      - `RunEvent`
      - `createRunEvent`
      - `AgentRun`
      - `createAgentRun`
      - `StreamingEventType`
      - `MessageStartEvent`
      - `MessageDeltaEvent`
      - `ToolCallDeltaEvent`
      - `ToolResultEvent`
      - `ToolArgumentPreviewDeltaEvent`
      - `MessageStopEvent`
      - `MessageFinalizedEvent`
      - `LLMStreamingResponse`
    - current project-level AI settings/config types used by current pure
      callers
      - LLM config and API-key support
        - `APIKeys`
        - `LLMConfig`
        - `createLLMConfig`
        - `MCPServerTransport`
        - `MCPServerConfig`
        - `AllLLMConfigs`
        - `createAllLLMConfigs`
      - external-agent settings/config support
        - `ExternalAgentToolType`
        - `ExternalAgentRunMode`
        - `ExternalAgentSettingsMode`
        - `ExternalAgentWorkingDirStrategy`
        - `ClaudeSettingsSource`
        - `ExternalAgentConfig`
        - `createExternalAgentConfig`
        - `ExternalAgentPreflightStatus`
        - `createExternalAgentPreflightStatus`
      - prompt-template settings support
        - `PromptFormat`
        - `PromptTemplate`
        - `createPromptTemplate`
      - project-level AI transport/action support used by the current
        `state/actions/ai` and notification callers
        - managed API-key snapshot payloads
        - notification enum/object support
          - `SettaNotificationType`
          - `SettaNotification`
        - request payloads for agent-profile CRUD plus single-item reads,
          engine-config update plus single-item reads,
          transcription-profile CRUD, prompt-template CRUD plus single-item
          reads, external-agent-config CRUD plus single-item reads, agent-run
          single-item reads, and chat-section state/chat-id persistence
        - transport payloads for agent/profile/run/config/profile list and
          single-item reads, managed/external chat hydration, managed-chat
          stop results, transcription session start/delta responses, and
          string chat-id responses from `getLLMResponse`
  - app-config pane contract types
    - `AppCatalogResponse` and the catalog component/action/prop payloads
    - `AppDefinition`, `AppRoute`, and the app-definition read/mutation
      payloads
    - validation result payloads for `validateAppDefinition`
    - these are dedicated frontend contract types rather than a direct dump of
      `projectstate.AppDefinition`, because the runtime metadata uses
      `json.RawMessage` while the frontend boundary needs structured JSON
      values
  - plugin-management contract types
    - runtime/status payloads
      - `PluginRuntimeResponse`
      - `PluginListResponse`
      - `PluginStatusResponse`
      - `PluginListEntry`
      - `PluginStatusEntry`
      - `PluginRestartCapability`
    - mutation payloads
      - `PluginInstallRequestInput`
      - `PluginInstallResponse`
      - `PluginEnableDisableRequestInput`
      - `PluginEnableDisableResponse`
      - `PluginUninstallRequestInput`
      - `PluginUninstallResponse`
      - `PluginUpdateRequestInput`
      - `PluginUpdateResponse`
      - `PluginRollbackRequestInput`
      - `PluginRollbackResponse`
      - `PluginConfigWriteRequestInput`
      - `PluginConfigWriteResponse`
      - `PluginRestartResponse`
      - `PluginRescanResponse`
    - runtime enums and nested registration/config payloads
      - `PluginScope`
      - `PluginRuntimeState`
      - `PluginEnablementSource`
      - `PluginSourceManager`
      - `PluginInstallerBackend`
      - `PluginSourceTrustStatus`
      - `PluginBlockedCapabilityReason`
      - `PluginRestartCapabilityMode`
      - `PluginBlockedCapability`
      - `PluginErrorInfo`
      - `PluginFrontendDescriptor`
      - `PluginContentDescriptor`
      - `PluginConfigDescriptor`
      - `PluginRegisteredLanguageServer`
      - `PluginRegisteredExternalAgentAdapter`
      - `PluginRegisteredCodegenTarget`
  - binary payload and bounded artifact contract types used by the current
    callers
    - binary transport payloads
      - `BinaryUploadRequestInput`
      - `BinaryDownloadRequestInput`
      - `BinaryDownloadResponse`
    - artifact transport payloads
      - `ImportFilesToArtifactsRequestInput`
      - `ImportFilesToArtifactsResponse`
      - `LoadCachedArtifactsRequestInput`
      - `LoadCachedImageArtifactsResponse`
      - `LoadCachedChartDataResponse`
      - `LoadCachedBrushStrokesResponse`
      - `LoadCachedDrawAreaLayerItemTransformResponse`
      - `AppendDrawAreaLayerItemRequestInput`
      - `UpdateArtifactsRequestInput`
      - `UpdateArtifactsResponse`
      - `DeleteArtifactsRequestInput`
      - `DeleteArtifactsResponse`
    - shared artifact/draw-area runtime types and helpers
      - `ArtifactType`
      - `DrawAreaBrushShape`
      - `DrawAreaMode`
      - `CanvasPoint`
      - `DrawAreaTransform`
      - `BrushStroke`
      - `BrushStrokeWithTransform`
      - `DrawAreaLayerItemTransform`
      - `DrawAreaLayerItem`
      - `DrawAreaLayer`
      - `ImageArtifact`
      - `BrushStrokeArtifact`
      - `DrawAreaLayerItemTransformArtifact`
      - `ChartDataArtifact`
      - `FileArtifact`
      - `ImageMapping`
      - `BrushStrokeMapping`
      - `DrawAreaLayerItemTransformMapping`
      - `ChartDataMapping`
      - `FileMapping`
      - `UpdateArtifactMsgContent`
      - `createBrushStroke`
      - `createBrushStrokeArtifact`
      - `createDrawAreaLayer`
      - `createDrawAreaLayerItem`
      - `createDrawAreaLayerItemTransform`
      - `createDrawAreaLayerItemTransformArtifact`
- `frontend/src/utils/generatedEndpoints.ts`
  - current status/meta endpoint wrappers
  - project-shell and current project-state endpoint wrappers
    - `route_load_settings`
    - `route_save_settings`
    - `route_load_all_project_metadata`
    - `route_load_project_config`
    - `route_get_latest_project_state`
    - `route_save_project`
    - `route_save_as_new_project_config`
    - `route_create_project_config`
    - `route_delete_project_configs`
    - `route_set_as_default_project`
    - `route_set_project_config_name`
    - `route_get_notifications`
    - `route_delete_notification`
    - `route_set_code`
    - `route_format_code`
    - `route_set_callable`
    - `route_set_callable_hide_params`
    - `route_set_section_hide_unpinned_params`
    - `route_set_section_pinned_params`
    - `route_set_project_config_codegen_targets`
    - `route_set_chat_section_settings`
    - `route_set_watch_code_enabled`
    - `route_set_watch_code_inputs`
    - `route_docstring_to_markdown`
    - `route_delete_sections`
    - `route_delete_selected_params`
    - `route_delete_section_variant_or_ask`
    - `route_delete_json_source_file_and_variant`
    - `route_create_top_level_section`
    - `route_create_view_mode`
    - `route_set_active_view_mode`
    - `route_toggle_is_editing_view_mode`
    - `route_toggle_view_mode_user_facing`
    - `route_toggle_view_mode_tab`
    - `route_set_view_mode_name`
    - `route_set_view_mode_sort_order`
    - `route_delete_view_mode`
    - `route_set_section_name`
    - `route_set_top_level_section_layout`
    - `route_toggle_section_visibility`
    - `route_auto_layout_top_level_sections`
    - `route_set_show_param_display_names`
    - `route_group_sections`
    - `route_ungroup_groups`
    - `route_set_active_ids`
    - `route_toggle_position_locks`
    - `route_toggle_minimized`
    - `route_toggle_param_selected`
    - `route_unselect_all_params`
    - `route_set_viewport`
    - `route_set_section_tag_color`
    - `route_set_section_style_color`
  - workspace-launch endpoint wrappers
    - `route_create_workspace_launch_intent`
    - `route_launch`
  - launcher-home endpoint wrappers
    - `route_get_launcher_recent_workspaces`
    - `route_add_launcher_recent_workspace`
    - `route_remove_launcher_recent_workspace`
    - `route_pin_launcher_recent_workspace`
    - `route_get_launcher_filesystem_roots`
    - `route_list_launcher_directory`
    - `route_open_launcher_workspace`
  - launcher-management endpoint wrappers
    - `route_get_launcher_status`
    - `route_setup_launcher`
    - `route_repair_launcher`
    - `route_remove_launcher`
    - `route_update_launcher`
  - deployment/share endpoint wrappers
    - `route_create_share_session_current`
    - `route_create_app_session_current`
    - `route_get_share_deployment_state`
    - `route_load_share_project_config`
    - `route_get_app_deployment_state`
    - `route_load_app_project_config`
    - `route_list_share_deployments`
    - `route_publish_share_deployment`
    - `route_list_app_deployments`
    - `route_publish_app_deployment`
  - app-config pane endpoint wrappers
    - `route_get_app_catalog`
    - `route_get_app_definition`
    - `route_set_app_definition`
    - `route_validate_app_definition`
  - LSP diagnostics/admin endpoint wrappers
    - `route_clear_text_field_completion`
    - `route_text_field_completion`
    - `route_output_accessor_completion`
    - `route_code_area_completion`
    - `route_gen_code_prefix_completion`
    - `route_gen_code_suffix_completion`
    - `route_get_latest_lsp_diagnostics`
    - `route_restart_language_server`
    - `route_set_code_section_diagnostics_mute`
    - `route_set_code_section_diagnostic_code_suppression`
    - `route_set_type_error_ignore`
    - `route_type_check`
  - LSP diagnostics/admin contract types
    - `ClearTextFieldCompletionRequest`
    - `TextFieldCompletionRequest`
    - `OutputAccessorCompletionRequest`
    - `CodeAreaCompletionRequest`
    - `GenCodePrefixCompletionRequest`
    - `GenCodeSuffixCompletionRequest`
    - `CodeMirrorCompletion`
    - `CodeMirrorCompletionResponse`
    - `SetCodeSectionDiagnosticsMuteRequest`
    - `SetCodeSectionDiagnosticCodeSuppressionRequest`
    - `SettaLspDiagnostic`
    - `SettaLspDiagnosticRange`
    - `SettaLspDiagnosticPosition`
    - `SettaSectionTypeErrors`
    - `SettaProjectConfigDiagnostics`
    - `SettaLspDiagnosticsPayload`
  - project-level AI skills and MCP viewer endpoint wrappers
    - `route_get_app_gen_skills`
    - `route_get_app_gen_skill_content`
    - `route_upsert_app_gen_custom_skill`
    - `route_get_mcp_server_runtime_status`
    - `route_get_ai_follow_snapshot`
    - `route_get_agentic_summary_cache_status`
  - project-level AI skills and MCP viewer contract types
    - `AppGenSkillEntry`
    - `AppGenSkillContent`
    - `GetAppGenSkillsResponse`
    - `UpsertAppGenCustomSkillResponse`
    - `MCPServerRuntimeStatus`
    - `MCPRuntimeStatusResponse`
  - password reveal helper endpoint wrapper
    - `route_get_password_param_value`
  - param-impl switching helper endpoint wrapper
    - `route_change_param_impl`
  - password reveal helper contract types
    - `GetPasswordParamValueRequestInput`
    - `GetPasswordParamValueResponse`
  - attachment download helper endpoint wrappers
    - `route_get_attachment_download_url`
    - `route_get_attachment_download_urls`
  - file-browser endpoint wrappers
    - `route_create_file`
    - `route_check_if_file_exists`
    - `route_check_workspace_initialized`
    - `route_get_file_browser_root`
    - `route_get_folder_contents`
    - `route_get_file_browser_download_urls`
    - `route_file_browser_download`
    - `route_get_file_browser_file_content`
    - `route_get_file_browser_file_stat`
    - `route_write_file_browser_file_content`
    - `route_transfer_file_browser_entry`
  - browser section metadata endpoint wrappers
    - `route_set_browser_column_widths`
    - `route_set_browser_area_view_mode`
    - `route_set_browser_hide_column`
    - `route_set_browser_saved_searches`
  - binary payload and bounded artifact endpoint wrappers
    - `route_binary_upload`
    - `route_binary_download`
    - `route_import_files_to_artifacts`
    - `route_load_cached_image_artifacts`
    - `route_load_cached_chart_data`
    - `route_load_cached_brush_strokes`
    - `route_load_cached_draw_area_layer_item_transform`
    - `route_update_artifacts`
    - `route_delete_artifacts`
  - attachment download helper contract types
    - `GetAttachmentDownloadURLRequestInput`
    - `GetAttachmentDownloadURLResponse`
    - `GetAttachmentDownloadURLsRequestInput`
    - `AttachmentDownloadURLEntry`
    - `GetAttachmentDownloadURLsResponse`
  - file-browser contract types
    - `CreateFileRequestInput`
    - `CheckIfFileExistsRequestInput`
    - `CheckIfFileExistsResponse`
    - `CheckWorkspaceInitializedRequestInput`
    - `CheckWorkspaceInitializedResponse`
    - `FileBrowserRootResponse`
    - `MissingFolderBehavior`
    - `GetFolderContentsRequestInput`
    - `FolderContentItemType`
    - `FolderContentItem`
    - `GetFolderContentsResponse`
    - `GetFileBrowserDownloadURLsRequestInput`
    - `FileBrowserDownloadURLEntry`
    - `GetFileBrowserDownloadURLsResponse`
    - `GetFileBrowserFileContentRequestInput`
    - `FileBrowserFileContentResponse`
    - `GetFileBrowserFileStatRequestInput`
    - `FileBrowserFileStatResponse`
    - `WriteFileBrowserFileContentRequestInput`
    - `WriteFileBrowserFileContentResponse`
    - `TransferOperation`
    - `TransferFileBrowserEntryRequestInput`
    - `TransferFileBrowserEntryResponse`
  - listener force-refresh endpoint wrapper
    - `route_force_refresh_listener`
  - listener coverage endpoint wrapper
    - `route_get_listener_coverage`
  - listener coverage and realtime dependency contract types
    - `ListenerCoverageRequestInput`
    - `ListenerCoverageSnapshot`
    - `DependencyKeyType`
    - `SectionDependencyKey`
    - `SectionParamDependencyKey`
    - `BaseDependencyKeyUnion`
    - `DependencyValueType`
    - `BinaryContentRef`
    - `LiteralDependencyValue`
    - `FileReadDependencyValue`
    - `BinaryDependencyValue`
    - `BaseDependencyValueUnion`
    - `DependencyEvent`
  - listener force-refresh contract type
    - `ForceRefreshListenerRequestInput`
  - plugin-management endpoint wrappers
    - `route_plugins_runtime`
    - `route_plugins_rescan`
    - `route_plugins_install`
    - `route_plugins_link`
    - `route_plugins_uninstall`
    - `route_plugins_update`
    - `route_plugins_rollback`
    - `route_plugins_enable`
    - `route_plugins_disable`
    - `route_plugins_config`
    - `route_plugins_lock_write`
    - `route_plugins_lock_apply`
    - `route_plugins_restart`
  - project-level AI endpoint wrappers used by the current action layer
    - config/settings transport
      - `route_get_llm_config`
      - `route_set_llm_config`
      - `route_get_llm_api_keys`
      - `route_set_llm_api_keys`
      - `route_get_agent_profiles`
      - `route_create_agent_profile`
      - `route_update_agent_profile`
      - `route_delete_agent_profile`
      - `route_get_agent_runs`
      - `route_get_engine_configs`
      - `route_update_engine_config`
      - `route_get_prompt_templates`
      - `route_create_prompt_template`
      - `route_update_prompt_template`
      - `route_delete_prompt_template`
      - `route_get_external_agent_configs`
      - `route_get_external_agent_health`
      - `route_create_external_agent_config`
      - `route_update_external_agent_config`
      - `route_delete_external_agent_config`
      - `route_get_transcription_profiles`
      - `route_create_transcription_profile`
      - `route_update_transcription_profile`
      - `route_delete_transcription_profile`
    - transcription/chat transport
      - `route_start_transcription_session`
      - `route_append_transcription_audio`
      - `route_stop_transcription_session`
      - `route_cancel_transcription_session`
      - `route_get_llm_response`
      - `route_get_llm_chat`
      - `route_stop_llm_chat`
      - `route_get_external_agent_chat`
      - `route_stop_external_agent_run`
      - `route_respond_external_agent_approval`
      - `route_respond_external_agent_question`
      - `route_set_chat_section_state`
      - `route_set_chat_section_chat_id`
- active caller adoption
  - `GlobalWrapper`, `WorktreeHint`, `initializeServerMode`,
    `websocketReceive`, and the `settaHomeInfo` read in
    `WorkspaceSwitcherModal` now consume the canonical Go-generated modules
    for this initial slice
  - `WorkspaceSwitcherModal`, `WorkspaceLaunchPage`,
    `workspaceSwitcherLaunch`, and `launchRequestDedupeKey` now consume the
    canonical Go-generated workspace-launch bindings
  - `LauncherHomePage` now consumes the canonical Go-generated launcher-home
    bindings
  - `DesktopLauncherSettingsSection` now consumes the canonical Go-generated
    launcher-management bindings
  - `AppConfigPane` now consumes the canonical Go-generated app-config
    bindings
  - `loadProjectConfig`, `processLspDiagnostics`, `requestTypeCheck`,
    `restartLanguageServer`, and `TypeErrorContextMenu` are now covered by
    canonical Go-generated LSP diagnostics/admin bindings
  - `ProjectChatSkillsMcpViewer` is now covered by canonical Go-generated
    app-gen-skill and MCP-runtime bindings
  - the current pure project-level AI settings/config helper callers,
    including `buildLLMConfigGroups`, `resolveProviderDictationAvailability`,
    `ProjectLLMSettings`, and `projectChatSkillsMcpViewerUtils`, now consume
    canonical Go-generated AI settings/config types and enums
  - `state/actions/ai`, `state/actions/notifications`, and the current
    project-level AI settings pane now consume canonical Go-generated AI
    route wrappers and boundary types for LLM config/API keys, agent-profile,
    engine-config, prompt-template, external-agent-config, transcription,
    managed/external chat hydrate-stop-submit flows, and chat-section
    state/chat-id persistence
  - `ParamInput` and the app-mode password reveal path in `appRegistry` are
    now covered by the canonical Go-generated password-value helper binding
  - `ParamInput`, `MetaControlArea`, the app-mode param-input path in
    `appRegistry`, `TextParamInput`, `DropzoneInput`, `ButtonInput`,
    `SliderInput`, `DropdownInput`, `ColorPickerInput`, `QuickInfoConfig`,
    `createSectionsHelper`, and `applyUiTypeComboboxSelection` now consume
    canonical Go-generated param value/config route bindings for
    `setParamEnteredValue` and `updateParamImplConfig`
  - `ParamNameInput` and `QuickInfoConfig` now consume canonical
    Go-generated code-object naming/display route bindings for
    `setCodeObjName` and `setCodeObjDisplayName`
  - `state/actions/codeUpdates` now consumes canonical Go-generated
    `setGenCodePrefix` and `setGenCodeSuffix` bindings for the current
    python-codegen helper writes instead of the legacy Python-generated route
    surface
  - `state/actions/copyPaste` now consumes canonical Go-generated
    `prepareSectionsForCopy` and `pasteSections` route wrappers plus the
    clipboard discriminated-union types from the current project-state
    contract surface
  - `moveSectionsWithBackend` now consumes the canonical Go-generated
    `moveSections` binding for the current pane/reparent flow, while the
    attached-terminal branch continues consuming the canonical
    `setCodeSectionAttachedTerminal` binding
  - `AppRenderer` and `ChatMessages` are now covered by canonical
    Go-generated attachment download helper bindings
  - `runOrImportCode`, `RunButton`, and `AppRenderer` now consume canonical
    Go-generated terminal HTTP bindings for `runCode` and
    `interruptTerminalProcesses`; the canonical generated terminal HTTP
    surface also includes `deleteTerminals`, while terminal websocket viewing
    now uses the canonical Go route in IDE plus deployment/share/app flows
  - `triggerListenerForceRefresh`, `fetchListenerCoverageSnapshot`, and the
    current listener-coverage dependency-key helpers now consume canonical
    Go-generated listener bindings and dependency contracts
  - `state/actions/git`, `state/git`, `GitDiffOverlay`, and
    `GitGraphOverlay` now consume canonical Go-generated git route wrappers
    and contract types
  - the current project create/load flow plus the layout/selection/viewport
    publishers in `sectionInfos` now consume canonical Go-generated
    project-shell and current project-state bindings
  - the current layout/presentation caller cluster in
    `state/actions/sections/sectionPositions`, `DeleteOrHideButton`,
    `SelectionContextMenu`, `LockPositionButton`,
    `AttachedTerminalControls`, `MinimizeButton`,
    `TextBlockMetaControlMenuButton`, `QuickInfoConfig`,
    `SectionTagColorSettings`, and `SectionStyleColorSettings` now consumes
    canonical Go-generated layout/presentation bindings
  - `state/actions/project/saveProject`, `DeleteProjectWarningModal`,
    `ProjectName`, `HomePage`, and `NotificationsArea` now consume canonical
    Go-generated project-shell bindings for save/save-as-new, delete, rename,
    default-project, and notification reads/deletes
  - the current section delete/group/ungroup and param-selection callers in
    `sectionInfos`, `SelectionContextMenu`, `DeleteOrHideButton`,
    `UngroupButton`, `KwargsControls`, and `PluginArea` now consume canonical
    Go-generated project-state mutation bindings
  - `KwargsControls` now consumes canonical Go-generated `addKwarg` and
    `deleteKwarg` bindings for the current arg add/remove slice, and the
    supporting Go runtime now treats `GlobalVariables` as the same dict-like
    caller-backed surface already used by the current param-selection and
    edge-input mutation slices
  - `state/actions/edges` and `state/actions/agenticEdges` now consume
    canonical Go-generated create/update/delete/reconnect/set edge bindings
    for both data edges and agentic edges, and the Go runtime now owns the
    current Python dependency-graph-backed data-edge expression builder path
  - `KwargsControls` and `EdgePortsSettings` now consume canonical
    Go-generated `setSectionEdgeInputs` and `setSectionEdgeOutputs` bindings
    for the current edge-input/output mutation slice, including the
    `GlobalVariables` conversion path and edge-cleanup semantics owned by Go
  - `createSections`, `ViewingEditingMode`, `ViewModeTabs`, `SectionTitle`,
    and the Setta API preset helper now consume canonical Go-generated
    top-level section creation, view-mode lifecycle, and section-rename
    bindings
  - `RenameReferencesModal` and `state/actions/renameRefactors` now consume
    canonical Go-generated rename-refactor bindings for
    `acceptRenameRefactor` and `declineRenameRefactor`
  - the current settings-backed UI/layout caller cluster in `ProjectNav`,
    `ProjectPageSearch`, `GlobalWrapper`, `DictArea`, `GroupContainer`,
    `FlowRenderer`, `ZoomPane`, `Pane`, `Background`, `ProjectAISettings`,
    `PluginsPane`, and `RenameReferencesModal` now consumes canonical
    Go-generated settings helpers and enums instead of the legacy
    Python-generated surface
  - `useLoadSettings`, `ProjectAISettings`, `PluginsPane`,
    `RenameReferencesModal`, and `SectionTagColorSettings` now consume
    canonical Go-generated settings route wrappers for load/save
  - `VariantList`, `EdgePortsSettings`, and `ParamNameInput` now consume the
    canonical Go-generated base-dict section helper surface needed for
    JSON-source and top-level-param-aware dict-section behavior
  - `ParamSwitch`, `ParamDndMonitor`, `state/actions/params/paramTree`, and
    `state/actions/params/moveParams` now consume the canonical
    Go-generated base-parent code-object helper surface needed for nested
    param tree behavior
  - `plugins/runtime`, `plugins/restart`, and the current `PluginsPane`
    plugin runtime/mutation callers now consume canonical Go-generated plugin
    bindings for plugin runtime/status/config/restart/install/update/rollback
    and enable/disable operations, plus the shared project-state/core bindings
  - `websocketReceive`, `realtimeDependencySend`, and
    `WebsocketConnections` now consume canonical Go-generated frontend
    websocket message enums/helpers and the bounded UI-setting reveal payload
    validator needed by the active `/ws/frontend` caller
    they load during bootstrap/runtime mutation flows

## Cutover Rule

- The steady state is a single frontend-generated contract surface, not
  parallel Python-owned and Go-owned modules.
- The canonical generated frontend files are now the active cutover target for
  the converted slice; do not reintroduce `generatedGo*` shadow outputs.
- Do not spend rewrite effort preserving Python-generated binding consumers
  that only exist to keep the app partially working during the transition.

## Rules

- Prefer explicit Go contract types over reflection on arbitrary runtime
  structs.
- Prefer converter rules and reusable rendering over ad hoc output assembly.
- Prefer Go boundary DTOs plus converter rules over embedded raw TypeScript.
- Raw TS escape hatches are temporary debt, not a normal generator feature.
- Endpoint specs must declare the real response contract explicitly; do not use
  omitted response typing as shorthand for `null`.
- Make generation fail when a type cannot be converted cleanly.
- Keep transport wrappers thin.
- Keep the generated surface deliberate and reviewable.
- When widening coverage, reuse the converter pipeline instead of adding
  one-off generator branches.

## Verification Rule

The generator needs stronger checks than golden snapshots alone.

Required verification for the steady-state pipeline:

- golden output tests for routes, types, and endpoints
- parity tests that compare endpoint specs against the intended Go boundary
  source of truth and fail when request/response contracts drift
- parity checks for route constant coverage on the converted slice
- a TypeScript compile check for the generated outputs
- targeted tests for converter edge cases such as enums, optional fields,
  maps, discriminated unions, and unsupported shapes

Golden tests remain useful, but they are not sufficient on their own because
they do not prove that the generated contracts still match the real Go HTTP
surface.

## Non-Goals

- replacing every `generatedTypes.ts` consumer in one pass
- recreating dormant Python-only helper surfaces without a caller
- reflecting arbitrary Go runtime internals directly into frontend types
- preserving Python route naming or wrapper shape when no current caller needs
  it
