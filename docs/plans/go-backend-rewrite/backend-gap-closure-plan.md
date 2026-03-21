# Backend Gap Closure Plan

Last updated: `2026-03-18`

Purpose: define the default workflow for future Codex sessions that are
closing remaining Go backend parity gaps.

## Core Rule

Use executable parity checks to find gaps. Use the parity matrix to record and
categorize them.

## Default Loop

1. Run the differential harness against `main`.
   - Default: `./scripts/run-backend-differential-parity.sh --baseline-ref main`
   - Iterate with `--only <scenario>`
   - Use `--manifest scripts/backend-differential-parity-corpus-scenarios.yaml`
     for latest-state corpus checks
2. Treat harness mismatches as the active work queue.
   - Fix the Go behavior, or explicitly classify it as an intentional
     divergence or retained Python boundary
3. Add or update focused tests for the specific behavior.
4. Re-run the relevant harness scenario(s) and targeted tests until they pass.
5. Update `backend-behavior-parity-matrix.md`.
   - Split coarse rows when a harness mismatch disproves a broad `Proved` row
   - Do not mark behavior `Proved` without executable or narrowly targeted
     proof

## How To Use The Matrix

- Use it as a searchable ledger of behavior ids, source evidence, Go ownership,
  and test coverage.
- Use existing `Missing` and `Implemented, proof incomplete` rows to choose the
  next harness slice.
- Do not use matrix status counts alone as evidence that major gaps are gone.

## Priority Order

1. User-visible current-caller mismatches found by the harness
2. Existing matrix rows already marked `Missing` or
   `Implemented, proof incomplete`
3. New harness scenarios for high-risk areas the matrix still covers mainly by
   inspection

## Current Starting Backlog

- Expand the differential manifest beyond the current bootstrap / websocket /
  create-defaults / dedicated-`/settings` shell / settings-live-hydration /
  reserved-name-save / required-view-mode-repair /
  deleted-active-tab-repair / missing-required-section /
  code-obj-backfill / display-name-backfill / workspace-launch
  outdated-settings slice
- The previously isolated dedicated-`/settings` persisted-layout gap is now
  closed; keep any newly uncovered non-caller-visible mismatches explicit
  instead of folding them back into broader live-contract rows
- The next queue should come from the remaining matrix `Missing` and
  `Implemented, proof incomplete` rows outside this now-proved `/settings`
  slice
- The latest-state stale-`activeIds`, empty-`windowSpaces`, and
  project/window-space load-normalization rows are now proved via the default
  harness; add more corpus/latest-state scenarios only when a new current-
  caller mismatch appears or an unproved row still lacks executable coverage
- The fail-closed missing-authoritative `projectChatWindowing`, section-bound
  title-clearing/dedupe, project-chat owner/mode validation, saved
  window-space owner/mode validation, and empty latest-state `windowSpaces`
  shape rows are now all proved via the default harness
- The multi-project windowing scoping, direct
  `setProjectChatWindowChatId`, and broader
  `setProjectChatWindowingState` invalid-owner rows are now proved via the
  default harness too, and the remaining saved-window-space write-validation
  row is now proved as well
- For that `createWindowSpace` write-validation slice, the harness now treats
  the source FastAPI validation envelope as a retained Python boundary and
  compares the caller-visible rejection detail text instead of Python's raw
  stringified validator internals
- The prompt-template-link non-prompt-section route row is now proved via the
  default harness too, including normalization of the source dynamic
  `Section <id> failed type guard` detail string; the next queue remains the
  broader remaining `Missing` and `Implemented, proof incomplete` rows
  outside the now-proved windowing, `/settings`, and prompt-link slices
- The local-dev auth middleware negative branch for an inactive
  dev-frontend-port contract is now proved by direct Go handler coverage too;
  keep using small targeted tests like this when a caller-visible row is
  already implemented and a full differential harness slice would add little
  beyond the isolated proof
- The no-profile config-loader branch that ignores `profileLookupHome` is now
  proved by direct Go `Load(...)` coverage too; continue taking these shared
  config/CLI proof-only rows in small slices while the larger remaining work
  stays on deployment, websocket, watch-code, external-agent, and packaged-CLI
  gaps
- The trimmed/env-expanded `SETTA_HOME` resolution row is now proved by direct
  helper coverage too; keep harvesting these shared config rows when they can
  be closed with focused tests faster than a new harness slice
- The Setta-home leaf-name validation row is now proved too; the remaining
  config backlog is the harder profile-validation and platform-default-path
  rows, so keep preferring small, direct tests where the shared owner is
  already implemented and the branch can be isolated cleanly
- The profile-loader fail-closed validation family is now proved too; that
  leaves the platform-default Setta-home path row as the main remaining config
  proof slice before it makes sense to switch focus fully back to the larger
  deployment, websocket, watch-code, external-agent, and packaged-CLI gaps
- The explicit/env `settaFilesRoot` precedence, invalid-local-root bypass, and
  env-backed root-vs-location conflict row is now proved too; the remaining
  config proof backlog is basically the platform-default Setta-home row plus
  the broader user-config validation row unless another shared-owner slice
  closes faster than the larger live-surface gaps
- The broader user-config validation row is now proved too, which leaves the
  platform-default Setta-home row as the only obvious small remaining config
  proof slice before it is probably better to switch focus back to the larger
  deployment, websocket, watch-code, external-agent, and packaged-CLI gaps
- The binary-download unknown-id row is now proved too; keep favoring these
  small direct route/service proofs when the implementation already matches
  `main`, but avoid spending too long trying to force the remaining
  platform-default Setta-home row if a larger caller-visible slice is cheaper
- The file-browser missing-folder empty-list branch and the folder-listing
  `path_not_found` vs `path_not_directory` transport split are now proved too;
  the same heuristic still applies: close adjacent proof-only route/service
  rows in small bundles when the owner is already aligned, then return to the
  larger remaining live-surface gaps
- The file-browser mixed-input download-url minting row and explicit-empty
  `ignorePatterns` override row are now proved too; keep harvesting these
  adjacent service-only proofs while the owner is open, but stop once the next
  remaining row would need broader surface setup rather than one focused test
- The binary multipart >1 MB acceptance row is now proved too; the same rule
  applies on the binary owner as on file browser: close the easy direct route
  proofs while they are near each other, then pivot once only broader setup
  remains
- The artifact import missing-path versus directory-path transport split is now
  proved too; keep using the matrix to spot these isolated typed-error rows on
  already-open owners before switching back to the heavier deployment,
  websocket, watch-code, external-agent, and packaged-CLI work
- The local-session registry row for missing `serverMode` metadata is now
  proved too; the same small-proof workflow also applies to CLI/session
  plumbing when the source contract is one narrow selection or omission branch
- The `status --connect-info` optional-metadata pass-through, optional-field
  omission, and multi-match selector rows are now proved too; keep mining this
  CLI/session area when the remaining row is still one focused payload or
  selector branch instead of a broader remote-command forwarding surface
- The remaining `status --connect-info` missing-session, server-mode-filtered
  latest-selection, and outside-cwd workspace-selection rows are now proved
  too; that makes the local status/connect-info cluster largely exhausted, so
  the next cheap wins are probably outside this owner
- The backups-list restore-stash suppression row is now proved too; keep taking
  these one-branch packaged CLI rows when they fall out of an already-open
  owner before switching to a wider runtime or websocket slice
- The packaged `setta api` namespaced-tool and slash-prefixed tool-name
  rejection row is now proved too; the next cheap packaged-CLI wins are the
  remaining explicit-cookie precedence and explicit-auth unknown-tool branches
  before it is likely time to move back to the broader deployment, websocket,
  watch-code, or external-agent backlog
- Those explicit-cookie precedence and explicit-auth unknown-tool `setta api`
  rows are now proved too; that makes the remaining packaged-CLI work less of
  a narrow `internal/settacli` cleanup slice and more of a reason to pivot
  back toward the broader deployment, websocket, watch-code, external-agent,
  or platform-default config backlog unless another single-branch CLI proof is
  obviously cheaper
- The startup-banner auto-open suppression row is now proved too; if another
  narrow packaged-CLI slice is still clearly cheaper than the broader live
  backlogs, the MCP bridge bootstrap-URL / verbose-logging rows are the next
  obvious candidates
- Those MCP bridge bootstrap-URL, outside-workspace auth fallback, and
  verbose-logging rows are now proved too; the remaining packaged-CLI backlog
  is less about tiny helper proofs and more about the broader remote
  connect/stop forwarding surface plus the still-missing stricter bootstrap
  cookie-selection contract
- The external-agent env-var-whitelist normalization row is now proved too;
  that keeps the quick-win path open on `internal/externalagentconfigs`, but
  the remaining external-agent backlog is now more about runtime/config-file
  behavior than simple normalization helpers
- The plugin codegen file/dir transition row was not just unproved; direct Go
  coverage exposed a real stale-cleanup ordering bug, and the fix is now
  landed. Keep treating “proof-incomplete” rows as potentially real gaps when
  the missing test is around cleanup ordering, shape transitions, or other
  edge-case mutation sequencing
- The MCP catalog SDK-annotation row and the scoped summary/diagnostics
  empty-scope rows are now proved too; the remaining MCP backlog is less about
  the core scoped-read contract and more about adjacent UI-setting precedence
  and plugin-state availability branches unless a broader websocket or
  deployment slice becomes cheaper first
- The workspace-launch intent-store reinitialization/single-use row is now
  proved too; that trims the launch backlog down further toward the remaining
  route-level launcher-home and local-launch ordering/error-swallowing slices
- The launcher-home invalid-cursor / outside-root directory-listing row and
  the launcher-open symlink-escape row are now proved too; the remaining
  launcher-home backlog is the genuinely missing trust/rollback/metadata-
  ordering slice rather than basic fail-closed path validation
- The deployment-mode `formatCode` guard row and the stale-parent
  `moveSections` row are now proved too; keep preferring these small
  route-visible malformed-input or mode-guard proofs when they close an
  already-implemented owner without expanding the harness unnecessarily
- The section-data row for group orientation, image-path, and social-URL
  deployment blocking is now proved too; the remaining section-data backlog is
  no longer about basic share/app route exposure and should stay focused on
  broader surfaces that are still missing or unproved
- The deployment latest-route mixed-type filter row and the state-machine
  missing-`promptTemplateId` create-edge row are now proved too; the next
  cheap wins should stay on similarly narrow live route branches in
  deployment/runtime surfaces rather than reopening these already-covered
  catalog and workflow validation paths
- The launcher-mode CORS fail-closed row is now proved too, including
  unconfigured loopback preflight, non-allowlisted loopback credentialed
  requests, and trusted-origin store-read failure; the next small proof-only
  slices should keep following that pattern of route-visible negative branches
  on already-implemented owners
- That remaining watchcode resolved-root exclusion family is now closed too:
  baseline scans and live watcher filtering both honor configured
  `setta_files` / runtime roots, explicit ignored-file baselines no longer
  leak through, and unrelated user folders merely named `runtime` still stay
  scannable; the next cheap queue should move to other remaining
  proof-incomplete or missing owners instead of staying on watchcode
- Those two adjacent gitread proof rows are now closed too, so the next cheap
  queue should come from the remaining non-git proof-incomplete or missing
  owners instead of staying on this already-proved gitread cluster
- The two remaining transcription-append transport/order rows are now proved
  too, so the next cheap queue should likely come from similarly narrow
  proof-only owners such as right-pane reveal precedence, managed-chat
  whitespace frontend-affinity rejection, or the remote `stop` CLI forwarding
  and conflicting-flag rows
- That right-pane reveal precedence row is now proved too, so the next cheap
  queue should likely come from the managed-chat whitespace-affinity branch or
  the remote `stop` CLI forwarding/conflicting-flag pair before switching to
  heavier missing surfaces
- The managed-chat whitespace frontend-affinity row is now proved too, so the
  next cheap queue should likely come from the remote `stop` CLI
  forwarding/conflicting-flag pair unless another similarly narrow
  service-only proof appears nearby
- That remote `stop` CLI pair is now proved too, so the next cheap queue
  should likely come from the adjacent remote `connect` forwarding row or the
  remaining similarly narrow CLI/service proof-only owners before switching
  fully back to heavier missing surfaces
- That remote `connect` forwarding row is now proved too, so the next cheap
  queue is no longer the shared remote-path/SSH-arg pass-through family; the
  remaining adjacent CLI backlog is the more involved foreground/verbose
  connect behavior or other similarly bounded proof-only owners elsewhere
- Those remote `connect` foreground/verbose rows are now proved too, so the
  next cheap queue should move off the shared SSH-helper CLI owner and onto
  other bounded proof-only rows such as UI-setting/plugin-state,
  workspace-launch local metadata persistence, or similarly narrow service and
  route slices before returning to heavier missing surfaces
- That UI-setting plugin availability row is now proved too, so the next
  bounded proof-only queue should likely shift to workspace-launch local
  metadata persistence or the remaining similarly narrow config/external-agent
  proof slices before spending more time on heavier missing implementation
  areas
- That local-launch metadata persistence row is now proved too, so the next
  bounded proof-only queue should likely move to the remaining config-home or
  external-agent runtime proof slices unless another similarly small caller-
  backed route branch surfaces first
- That external-agent runtime env-handoff row is now proved too, so the next
  bounded proof-only queue inside external-agent runtime should likely focus
  on the remaining Codex prompt/auth branches rather than the already-proved
  per-chat artifact and subprocess-env plumbing
- That Codex runtime prompt-order row is now proved too, so the next bounded
  proof-only queue inside external-agent runtime is narrower again: the
  remaining cheap-looking slices are explicit-path no-bootstrap and session-
  home auth inheritance/login rather than prompt/config merge behavior
- That Codex explicit-path precedence row is now proved too, so the remaining
  clearly bounded Codex runtime proof slice is mostly the session-home auth
  inheritance/login branch rather than config-source precedence or prompt
  merge behavior
- That Codex auth-bootstrap row is now proved too, so the obvious bounded
  Codex runtime proof backlog is largely exhausted and the next cheap queue
  should likely move back to the remaining non-Codex proof rows or into the
  heavier missing implementation areas
- The websocket launcher-mode guard row is now proved too; the remaining
  websocket backlog should focus on still-unproved listener policy branches
  and other route-specific deployment/runtime behavior rather than the shared
  non-launcher gate
- That next listener policy branch is now proved too: deployment listener
  emits fail closed when `allowParamChanges=false`, so the remaining websocket
  backlog is narrower and more transport-specific than before
