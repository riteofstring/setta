# Go Rewrite Docs

This folder contains the working plan set for the Go backend rewrite.

## Library Selection Guardrail

For this rewrite, prefer the Go stdlib or well established Go libraries.

- do not add obscure Go libraries by default
- if a non-obvious library is proposed, the relevant phase doc should justify
  why a stdlib or more established option is not good enough
- if an obscure library already appears in `go.mod`, treat that as current
  technical debt, not as precedent for future choices
- the earlier `github.com/aquasecurity/go-pep440-version` debt has now been
  removed; do not reintroduce a replacement third-party version-parser
  dependency without a documented reason

## Go Toolchain Shortcut

Use the repo-pinned wrapper instead of searching for a system Go install:

- run Go commands with `./scripts/go.sh <args>`
- resolve the pinned SDK root with `./scripts/go.sh env GOROOT`
- run `gofmt` from that SDK path when it is not on `PATH`:
  - `GOROOT="$(./scripts/go.sh env GOROOT)"`
  - `"$GOROOT/bin/gofmt" -w <files>`
- if the wrapper cannot find the required SDK, install the repo-local toolchain
  with `./scripts/install_go_toolchain.sh`

## Additional Snapshots

- `pyproject-dependency-replacement-snapshot.md`
  - point-in-time classification of every root `pyproject.toml` runtime
    dependency into Go-library replacement, custom Go replacement, still
    Python, not yet ported, or no-longer-needed buckets

Use the docs in this order:

1. `go-backend-rewrite-plan.md`
   - master roadmap and sequencing
2. `go-backend-rewrite-stack-recommendations.md`
   - stack and library research input
3. `dependency-docs-local-reference.md`
   - safe acquisition and local-reference strategy for external dependency docs
4. `testing-strategy.md`
   - rewrite-wide testing expectations, harness model, and coverage rules
5. `phase-0-capability-inventory-and-harness.md`
   - immediate planning work before implementation
6. `phase-1-foundation-runtime.md`
   - first implementation phase
7. `phase-2-auth-modes-request-context.md`
   - auth, mode-policy, and request-context implementation plan
- `phase-2-status-meta-read-route-closeout.md`
  - focused completed-slice doc for the live status/meta read follow-on:
    Go-owned `GET /backendInitStatus`, `GET /authRefreshStatus`, and
    IDE-only `GET /settaHomeInfo`
8. `phase-3-project-state-core.md`
   - project-state persistence, runtime ownership, and revision plan
- `phase-3-settings-state-owner-and-transport.md`
  - focused plan for the separate Go-owned `SettingsState`
    source-of-truth, the completed owner/query/transport/materialization
    slices, and the deferred future settings-project transport sync boundary
9. `phase-4-realtime-and-terminal-runtime.md`
   - realtime ownership, websocket fan-out, and terminal runtime plan
10. `phase-4-terminal-transport-migration.md`
   - focused current-work plan for terminal websocket and HTTP transport migration
11. `phase-4-terminal-run-code-migration.md`
   - focused current-work plan for remaining terminal run-code migration
12. `phase-4-generated-entry-runs-and-temp-terminals.md`
   - focused current-work plan for generated-entry run support and temporary-terminal fallback
- `phase-4-terminal-command-dispatch-prompt-readiness-and-echo-stability.md`
  - focused completed-slice doc for prompt-ready terminal dispatch and long-command echo handling in the Go terminal runtime
- `phase-4-creack-pty-unix-backend-migration.md`
  - focused completed-slice doc for the bounded Unix PTY backend move from `go-pty` to `creack/pty`
- `phase-4-terminal-websocket-attach-lifecycle-and-resize-regression-hardening.md`
  - focused completed-slice doc for terminal websocket reconnect/history replay and route-level resize regression hardening
- `phase-4-terminal-websocket-app-middleware-regression-hardening.md`
  - focused completed-slice doc for app-level terminal websocket reconnect/history replay and resize regression coverage
13. `phase-4-deployment-run-code-policy-and-session-overlays.md`
   - focused current-work plan for deployment/share run-code policy and session runtime foundations
14. `phase-4-deployment-session-transport-and-cleanup.md`
   - focused current-work plan for deployment session bootstrap/state transport and session cleanup ownership
15. `phase-4-deployment-state-routes-and-projectstate-transport.md`
   - focused current-work plan for frontend-facing Go project-state transport and deployment state/project-config route migration
16. `phase-4-listener-realtime-producer-migration.md`
   - focused current-work plan for the remaining listener realtime producer boundaries
- `phase-4-listener-coverage-read-transport-closeout.md`
  - focused completed-slice doc for the Go-owned `getListenerCoverage` live
    read route over the current listener registry/runtime boundary
17. `phase-4-plugin-worker-listener-event-bridge.md`
   - focused current-work plan for the first Go plugin worker host + transport boundary needed by the remaining listener producer migration
18. `phase-4-plugin-worker-session-owner.md`
   - focused current-work plan for the first Go-owned backend worker process/session lifecycle boundary
19. `phase-4-plugin-codegen-worker-runtime.md`
   - focused current-work plan for the first worker-backed plugin codegen runtime and target invocation boundary
20. `phase-4-plugin-codegen-refresh-owner.md`
   - focused current-work plan for the first Go-owned plugin codegen output materialization owner above the worker runtime
21. `phase-4-codegen-targets-mutation-transport.md`
   - focused current-work plan for the first IDE project-state mutation/save transport that can drive the new Go codegen refresh hook
22. `phase-4-python-codegen-runtime-and-enablement.md`
   - focused current-work plan for first-party Python codegen runtime ownership, generated file materialization, and target enablement
23. `phase-4-project-layout-and-presentation-mutation-transport.md`
   - focused current-work plan for the first Go-owned IDE project layout/presentation mutation transport cluster
24. `phase-4-project-view-mode-and-top-level-layout-mutation-transport.md`
   - focused current-work plan for Go-owned top-level layout persistence and view-mode lifecycle mutation transport
25. `phase-4-auto-layout-top-level-sections.md`
   - focused current-work plan for Go-owned top-level auto-layout packing and settings-backed sizing policy resolution
26. `phase-4-section-name-validation-and-rename-refactor.md`
   - focused current-work plan for Go-owned section-name validation, rename-refactor flow, and frontend op tracking needed by rename prompts
27. `phase-5-lsp-diagnostics-and-completion-runtime.md`
   - focused current-work plan for the first Go-owned LSP runtime, diagnostics, and completion transport
- `phase-5-plugin-language-server-code-section-runtime.md`
  - focused landed follow-on for plugin-defined `Code` sections, multi-language
    LSP routing, and `codeAreaCompletion` over the bounded backend-registration
    snapshot dependency
28. `phase-5-snapshot-completion-transport.md`
   - focused current-work plan for Go-owned read-only LSP completion transport over canonical and generated Python snapshot documents
29. `phase-5-signature-help-callable-refetch-and-param-synthesis.md`
   - focused current-work plan for Go-owned callable binding, signature-help parsing, and param synthesis
30. `phase-5-watch-code-runtime-and-callable-refresh.md`
   - focused current-work plan for Go-owned Watch Code state, transport, watcher runtime, and callable refresh reuse
31. `phase-5-watch-code-scan-diff-and-manager-foundation.md`
   - focused current-work plan for Slice 2 parser-backed Watch Code scan/delete/move planning and manager foundations
32. `phase-5-watch-code-file-identity-runtime-owner.md`
   - focused current-work plan for the concrete Watch Code runtime owner using file-identity snapshots instead of heuristic watcher rename pairing
33. `phase-5-watch-code-projectstate-apply-and-section-mutation.md`
   - focused current-work plan for Go-owned Watch Code file apply helpers, section mutation, and callable refresh reuse above the completed runtime owner
34. `phase-5-watch-code-callable-section-mutation.md`
   - focused current-work plan for Go-owned Watch Code Callable section backfill, rename/remove handling, and Python import-prefix sync
35. `phase-5-watch-code-inline-edit-and-bound-code-file-reuse.md`
   - focused current-work plan for Go-owned inline `setCode` and bound code-file reload reuse over the completed Watch Code apply/runtime path
36. `phase-6-mcp-server-client-and-tool-registry-foundation.md`
   - focused next-work plan for Go-owned MCP server/client foundations, namespaced tool registry, and scoped tool-call boundaries ahead of LLM/chat migration
37. `phase-6-internal-mcp-client-and-runtime-status.md`
   - focused current-work plan for the first Go-owned internal MCP client, namespaced tool routing, and runtime-status transport
38. `phase-6-scoped-tool-call-pilot.md`
   - focused current-work plan for the first Go-owned agentic-context carrier, scoped MCP invocation boundary, and filtered project-summary pilot
39. `phase-6-invocation-edge-id-translation-and-lsp-diagnostics.md`
   - focused current-work plan for Go-owned temporary/canonical ID translation at the MCP invocation edge and the first scoped diagnostics tool
40. `phase-6-first-scoped-write-tool-and-target-extraction.md`
   - focused current-work plan for metadata-driven target extraction and the first Go-owned scoped write tool
41. `phase-6-codeobj-target-mapping-singleton-fallback-and-suppression.md`
   - focused current-work plan for `codeObj` target mapping, singleton fallback, and the next scoped MCP write tool
42. `phase-6-codeobj-write-tool-parity.md`
   - focused current-work plan for code-object write mutation parity over the completed MCP targeting boundary
43. `phase-6-section-name-tool-parity.md`
   - focused current-work plan for Go-owned `set_section_name` MCP parity over the completed scoped write and rename-refactor boundaries
44. `phase-6-create-top-level-section-structural-tool.md`
   - focused current-work plan for the first Go-owned structural MCP tool and the minimal top-level section creation owner it requires
45. `phase-6-create-child-sections-structural-tool.md`
   - focused current-work plan for Go-owned child section creation over the
     completed structural section-construction boundary
46. `phase-6-create-child-sections-via-incrementer-structural-tool.md`
   - focused current-work plan for Go-owned incrementer child creation over the
     completed structural child-section boundary
47. `phase-6-delete-sections-structural-tool.md`
   - focused current-work plan for Go-owned recursive section deletion over the
     completed structural construction boundary
48. `phase-6-delete-child-sections-via-decrementer-structural-tool.md`
   - focused current-work plan for Go-owned decrementer child deletion over the
     completed structural deletion boundary
49. `phase-6-create-new-section-variant-structural-tool.md`
   - focused current-work plan for Go-owned section-variant duplication over
     the completed structural construction and deletion boundaries
50. `phase-6-codeobj-name-tool-parity.md`
   - focused slice doc for Go-owned `set_code_obj_name` MCP parity over the
     completed code-object targeting and rename-validation boundaries
51. `phase-6-param-name-and-value-tool-parity.md`
   - focused slice doc for Go-owned `set_param_name_and_value` MCP parity over
     the completed section-scoped value and code-object rename boundaries
52. `phase-6-set-callable-tool-parity.md`
   - focused slice doc for Go-owned `set_callable` MCP parity over the
     completed callable/signature-help runtime and scoped MCP write boundary
53. `phase-6-add-kwarg-tool-parity.md`
   - focused slice doc for Go-owned `add_kwarg` MCP parity over the completed
     callable selection plus combined param rename/value boundaries
54. `phase-6-change-param-impl-tool-parity.md`
  - focused slice doc for Go-owned `change_param_impl` MCP parity plus the
    bounded password-secret runtime support it requires
55. `phase-6-update-param-impl-config-tool-parity.md`
  - focused slice doc for Go-owned `update_param_impl_config` MCP parity over
    the completed impl-switch and config-sensitive value-normalization
    boundaries
56. `phase-6-delete-selected-params-tool-parity.md`
  - focused slice doc for Go-owned `delete_selected_params` MCP parity over
    the completed param-creation, impl-switch, and config-write boundaries
57. `phase-6-delete-kwarg-tool-parity.md`
  - focused slice doc for Go-owned `delete_kwarg` MCP parity over the
    completed selected-param cleanup boundary
58. `phase-6-remaining-mcp-mutation-gap-inventory.md`
  - focused inventory doc for the remaining Python-owned MCP mutation gaps
    after the completed param-structure cluster
59. `phase-6-set-code-tool-parity.md`
  - focused slice doc for Go-owned `set_code` MCP parity over the completed
    Watch Code inline-edit and scoped MCP boundaries
60. `phase-6-set-top-level-section-layout-tool-parity.md`
  - focused slice doc for Go-owned `set_top_level_section_layout` MCP parity
    over the completed top-level layout runtime and scoped MCP boundaries
61. `phase-6-auto-layout-top-level-sections-tool-parity.md`
  - focused slice doc for Go-owned `auto_layout_top_level_sections` MCP
    parity over the completed top-level auto-layout runtime and settings-backed
    sizing-policy boundary
62. `phase-6-set-show-param-display-names-tool-parity.md`
  - focused slice doc for Go-owned `set_show_param_display_names` MCP parity
    over the completed layout-presentation runtime boundary
63. `phase-6-toggle-position-locks-tool-parity.md`
  - focused slice doc for Go-owned `toggle_position_locks` MCP parity over the
    completed layout-presentation runtime and scoped structural boundary
64. `phase-6-toggle-minimized-tool-parity.md`
  - focused slice doc for Go-owned `toggle_minimized` MCP parity over the
    completed layout-presentation runtime and scoped structural boundary
65. `phase-6-set-section-tag-color-tool-parity.md`
  - focused slice doc for Go-owned `set_section_tag_color` MCP parity over the
    completed layout-presentation runtime and scoped write boundary
66. `phase-6-set-section-style-color-tool-parity.md`
  - focused slice doc for Go-owned `set_section_style_color` MCP parity over
    the completed layout-presentation runtime and scoped write boundary
67. `phase-6-set-watch-code-enabled-tool-parity.md`
  - focused slice doc for Go-owned `set_watch_code_enabled` MCP parity over
    the completed Watch Code runtime owner and project-scoped structural MCP
    boundary
68. `phase-6-set-watch-code-inputs-tool-parity.md`
  - focused slice doc for Go-owned `set_watch_code_inputs` MCP parity over
    the completed Watch Code input-normalization/runtime owner and
    project-scoped structural MCP boundary
69. `phase-6-set-project-config-codegen-targets-tool-parity.md`
  - focused slice doc for Go-owned `set_project_config_codegen_targets` MCP
    parity over the completed codegen-target runtime owner, validator,
    generated-section reconciler, and project-scoped structural MCP boundary
70. `phase-6-set-gen-code-prefix-tool-parity.md`
  - focused slice doc for Go-owned `set_gen_code_prefix` MCP parity over the
    completed Python codegen target runtime owner and scoped singleton-section
    write boundary
71. `phase-6-set-gen-code-suffix-tool-parity.md`
  - focused slice doc for Go-owned `set_gen_code_suffix` MCP parity over the
    completed Python codegen target runtime owner and scoped singleton-section
    write boundary
72. `phase-6-format-code-tool-parity.md`
  - focused slice doc for Go-owned `format_code` runtime ownership plus
    project-route and MCP parity over the completed code-update and Python
    codegen target boundaries
73. `phase-6-compare-and-set-ui-setting-tools-parity.md`
  - focused slice doc for Go-owned compare-and-set UI-setting and Watch Code
    MCP parity over the completed presentation and Watch Code runtime owners
74. `phase-6-set-code-section-attached-terminal-tool-parity.md`
  - focused slice doc for Go-owned `set_code_section_attached_terminal` MCP
    parity over the completed run-graph attached-terminal and section-sizing
    foundations
75. `phase-6-set-section-sizes-tool-parity.md`
  - focused implementation-plan doc for Go-owned `set_section_sizes` MCP
    parity over the completed sizing-policy, attached-terminal, and auto-layout
    foundations
76. `phase-6-group-layout-toggle-tools-parity.md`
  - focused implementation-plan doc for Go-owned `toggle_group_orientation`
    and `set_group_overflow_mode` MCP parity over the completed
    section-size, layout-presentation, and Group-section foundations
77. `phase-6-section-variant-selection-and-order-tools-parity.md`
  - focused implementation-plan doc for Go-owned `set_section_variant`,
    `set_default_section_variant`, and `set_section_variant_sort_order` MCP
    parity over the completed section-variant creation and project-graph
    foundations
78. `phase-6-section-filter-and-meta-control-title-tools-parity.md`
  - focused implementation-plan doc for Go-owned `set_section_param_filter`
    and `set_meta_control_show_section_title` MCP parity over the completed
    effective section-impl payload-write boundary
79. `phase-6-app-definition-validation-and-store-foundation.md`
  - focused implementation-plan doc for the Go-owned app-spec validation,
    catalog, and store-path foundation required before app-definition mutation
    parity can land cleanly
80. `phase-6-app-definition-mutation-tool-parity.md`
  - focused implementation-plan doc for Go-owned `set_app_definition` and
    `update_app_definition` MCP parity over the completed app-spec
    validation/store foundation and the document-level app-definition metadata
    boundary
81. `phase-6-app-definition-read-and-validation-tool-parity.md`
  - focused implementation-plan doc for Go-owned `get_app_definition` and
    `validate_app_definition` parity over the completed app-definition
    mutation/store foundations and the bounded diagnostics owner in
    `internal/appspec`
82. `phase-6-post-project-state-mcp-surface-inventory.md`
  - focused Phase 6 closeout inventory for the remaining Python-owned MCP
    surface outside `BaseProjectManager.@project_state_tool`
83. `phase-6-general-mcp-utility-read-tools-parity.md`
  - completed slice doc for the bounded Go MCP utility/read tool cluster
    outside project-state parity
84. `phase-6-report-completion-status-tool-parity.md`
  - completed slice doc for Go-owned `report_completion_status` parity over
    the completed post-project-state utility/read transport foundations
85. `phase-6-agent-profile-store-and-read-tools-parity.md`
  - completed slice doc for the file-backed agent-profile store foundation
    plus Go-owned `list_agent_profiles` and `get_agent_profile` parity
86. `phase-6-managed-agent-run-runtime-foundation.md`
  - completed slice doc for the Go-owned managed agent-run persistence,
    engine-config resolution, `llm_config` ownership, and non-streaming
    runtime foundation required before `run_agent_profile`
- `phase-6-llm-env-parser-dependency-cleanup.md`
  - focused completed-slice doc for the bounded `internal/llmconfig` `.env`
    parser owner and removal of the previous `godotenv` dependency
87. `phase-6-run-agent-profile-tool-parity.md`
  - focused implementation-plan doc for Go-owned `run_agent_profile` parity
    over the completed agent-profile store/read foundation and the completed
    managed agent-run runtime foundation
88. `phase-6-ui-setting-registry-and-reveal-tools-parity.md`
  - focused implementation-plan doc for the Go-owned UI-setting
    registry/search/value/reveal slice; the bounded core UI-setting slice is
    now complete
89. `phase-6-ui-setting-reveal-tool-parity.md`
  - completed Stage 3 implementation-plan doc for Go-owned
    `reveal_ui_setting` parity over explicit realtime message, ACK, and
    frontend-selection owners
90. `phase-6-stream-app-definition-tool-parity.md`
  - completed implementation-plan doc for Go-owned `stream_app_definition`
    parity over the completed app-definition read/write/validation owners
91. `phase-6-plugin-management-runtime-foundation.md`
  - implementation-plan doc for the Go-owned plugin install/discovery runtime
    foundation; the shared store/discovery stages are now complete
92. `phase-6-plugin-management-mutation-owner.md`
  - focused implementation-plan doc for the remaining Go-owned plugin mutation
    service above the completed store/discovery foundation; this runtime slice
    is now complete
93. `phase-6-plugin-management-tool-parity.md`
  - completed implementation-plan doc for Go-owned MCP transport parity for
    `install_plugin`, `uninstall_plugin`, `rescan_plugins`, `update_plugin`,
    and `rollback_plugin` over the completed plugin-management runtime owners
94. `phase-6-python-environment-introspection-foundation.md`
  - completed implementation-plan doc for the explicit Go Python-environment
    selection, package-inspection owner, and `getInstalledPythonPackages`
    transport parity slice
95. `phase-7-runtime-surface-inventory.md`
  - closeout inventory doc for the remaining Python-owned non-MCP backend
    runtime surface after the completed Phase 6 MCP closeout; current status is
    that no backend runtime gap remains and only CLI/distribution follow-up is
    separate scope
96. `phase-7-deployment-publish-and-list-runtime.md`
  - implementation-plan doc for the first bounded Phase 7 slice:
    Go-owned deployment publication/listing above the completed deployment
    runtime/session read foundation; the runtime-owner stages are now complete
    and the remaining gap is the IDE transport layer
97. `phase-7-share-deployment-publish-owner.md`
  - focused implementation-plan doc for the next bounded Phase 7 slice:
    the Go-owned share deployment publish service above the completed catalog
    and deployment runtime foundations; this runtime slice is now complete
98. `phase-7-app-deployment-publish-owner.md`
  - focused implementation-plan doc for the next bounded Phase 7 slice:
    the Go-owned app deployment publish service above the completed share
    publish owner and `internal/appspec` foundation; this runtime slice is now
    complete
99. `phase-7-deployment-ide-publish-list-transport.md`
  - focused implementation-plan doc for the remaining bounded Phase 7
    deployment slice: thin IDE-mode share/app deployment publish/list/latest
    transport over the completed deployment owners
100. `phase-7-launcher-management-and-bootstrap-plan.md`
  - broader Phase 7 launcher/bootstrap plan after the completed deployment
    slice; that launcher/bootstrap cluster is now complete in Go
101. `phase-7-launcher-open-workspace-and-bootstrap-contract.md`
  - focused implementation-plan doc for the launcher executable/bootstrap
    prerequisite and Go-owned `openLauncherWorkspace` runtime path; this slice
    is now complete
102. `phase-7-launcher-management-metadata-and-status-stage1a.md`
  - focused historical implementation-plan doc for the metadata-only launcher
    management landing completed before managed artifact ownership
103. `phase-7-launcher-management-artifact-ownership-stage1b.md`
  - focused implementation-plan doc for Go-owned managed launcher artifact
    planning/install/remove/update and desktop-launch contract ownership; this
    slice is now complete
104. `phase-7-launch-intent-local-launch-and-bootstrap-handoff.md`
  - focused implementation-plan doc for the completed local launch/bootstrap
    handoff slice after launcher management completion
105. `phase-7-ssh-remote-launch-and-rollback.md`
  - focused implementation-plan doc for the completed SSH/remote launch slice
    after the local launch/bootstrap handoff landing
106. `phase-7-ssh-remote-connect-and-tunnel-runtime-stage2.md`
  - focused implementation-plan doc for the completed SSH remote command,
    session, and tunnel runtime owner beneath the now-completed `/launch`
    integration slice
107. `phase-7-remote-launch-route-and-rollback-stage3.md`
  - focused historical implementation-plan doc for the completed remote
    `/launch` integration and trust-persistence rollback slice on top of the
    completed SSH runtime
- `phase-7-ssh-arg-parser-dependency-cleanup.md`
  - focused completed-slice doc for the bounded SSH arg-splitter owner and
    removal of the previous `google/shlex` dependency
108. `phase-7-closeout-and-cli-follow-up-boundary.md`
  - focused Phase 7 closeout doc that separates the remaining Python CLI and
    distribution surface from the completed backend rewrite
109. `phase-8-cli-session-auth-foundation.md`
  - focused implementation-plan doc for the first Go `cmd/setta-cli` slice:
    local read-only session discovery plus auth/bootstrap output over the
    completed Go session/auth runtime owners
110. `phase-8-cli-tools-and-api-foundation.md`
  - focused implementation-plan doc for the next Go `cmd/setta-cli` slice:
    static tool catalog emission plus authenticated tool-call transport over
    the completed session/auth foundation and Go-owned MCP route
111. `phase-8-cli-remote-stop-and-connect-foundation.md`
  - focused implementation-plan doc for the next Go `cmd/setta-cli` slice:
    remote SSH session selection plus remote `stop` first, with `connect`
    staged above the completed `internal/sshx` runtime
112. `phase-8-cli-connect-runtime-and-output-modes.md`
  - focused implementation-plan doc for the Go `cmd/setta-cli` `connect` /
    `c` slice above the completed SSH runtime and remote `stop` foundation
113. `phase-8-cli-closeout-and-launcher-distribution-boundary.md`
  - focused historical closeout/inventory doc for the shipped entrypoint,
    launcher, and distribution surface after the completed Go helper-command
    slices; later follow-ons are completed in Phases 9-11
114. `phase-9-shipped-entrypoint-and-launcher-distribution-plan.md`
  - focused implementation-plan doc for the next rewrite track: Go-owned
    shipped `setta` entrypoint plus launcher/distribution ownership over the
    completed Go backend and helper-command foundations
115. `phase-9-packaged-go-entrypoint-and-distribution-stage1b.md`
  - focused implementation-plan doc for the coupled packaged-binary and thin
    Python-entrypoint dispatch slice needed to make launcher distribution
    actually bind to the Go-owned `cmd/setta` contract
116. `phase-9-native-installer-bundled-package-stage2.md`
  - focused implementation-plan doc for bundling the exact packaged Setta
    artifact into native macOS/Windows launcher installers so release smoke and
    installer bootstrap bind to the same release bits
117. `phase-10-local-runtime-command-cluster-plan.md`
  - focused implementation-plan doc for the completed Go-owned local runtime
    CLI cluster: `launch`, default `setta`, `share`, and `app`
118. `phase-10-default-local-ide-start-stage2.md`
  - focused implementation-plan doc for the Go-owned default local `setta`
    start path over the sibling `setta-server` runtime boundary
119. `phase-10-share-deployment-stage3.md`
  - focused implementation-plan doc for the Go-owned `setta share` command
    over the sibling `setta-server` runtime and Go deployment catalog
120. `phase-10-app-deployment-stage4.md`
  - focused implementation-plan doc for the Go-owned `setta app` command
    over the sibling `setta-server` runtime and Go deployment catalog
121. `phase-11-maintenance-command-inventory.md`
  - focused closeout/inventory doc for the completed maintenance-command
    follow-up after the Phase 10 local-runtime migration
122. `phase-11-backups-command-stage1.md`
  - focused implementation-plan doc for the first bounded Phase 11 slice:
    Go-owned `setta backups list|restore` over the completed runtime-path and
    local-session foundations
123. `phase-11-readable-export-foundation-stage2.md`
  - focused implementation-plan doc for the shared readable-export owner and
    Go-owned `setta export-db` migration
124. `phase-11-plugin-status-stage3.md`
  - focused implementation-plan doc for the first bounded `plugins` migration:
    Go-owned `setta plugins list|rescan|restart-required` plus partial
    Python-entrypoint dispatch for only those completed subcommands
125. `phase-11-plugin-lifecycle-controls-stage4.md`
  - focused implementation-plan doc for package-manager-aware plugin lifecycle
    controls: Go-owned `enable`, `disable`, `uninstall`, and `rollback`
126. `phase-11-plugin-authoring-and-local-link-stage5.md`
  - focused implementation-plan doc for the self-contained plugin
    authoring/local-link slice: Go-owned `init`, `validate`, and `link`
- `phase-11-plugin-version-range-owner-and-dependency-cleanup.md`
  - focused completed-slice doc for the bounded plugin `settaVersionRange`
    owner and removal of the previous `go-pep440-version` dependency
127. `phase-11-plugin-lock-write-stage6.md`
  - focused implementation-plan doc for the first unblocked lockfile slice:
    Go-owned `setta plugins lock write` over the completed discovery and
    install-metadata owners
128. `phase-11-plugin-source-acquisition-and-convergence-stage7.md`
  - focused implementation-plan doc for the completed candidate-provider-backed
    plugin source acquisition and lockfile convergence slice: Go-owned
    `setta plugins install|update|pin|lock apply`
129. `phase-11-plugin-restart-stage8.md`
  - focused implementation-plan doc for the completed final packaged plugin
    CLI gap: Go-owned manual-only `setta plugins restart`, closing the shipped
    plugin CLI migration
130. `phase-12-managed-chat-runtime-and-ai-route-foundation.md`
  - focused implementation-plan doc for the current bounded AI/runtime gap:
    Go-owned external-agent chat send/hydrate/stop/approval over the completed
    `internal/agentruns`, `internal/mcpx`, and realtime/http foundations;
    managed `setta_llm` is intentionally de-scoped for now
131. `phase-12-external-agent-active-runtime-stop-approval-and-send.md`
  - focused next-step implementation-plan doc for the active external-agent
    runtime plus the remaining send/stop/approval ownership after the completed
    hydration read slice
132. `phase-12-opencode-executor-and-question-runtime.md`
  - focused completed-slice doc for the OpenCode executor,
    OpenCode-managed settings parsing/writing, and the first Go-owned
    `respondExternalAgentQuestion` landing above the completed Codex runtime
133. `phase-12-claude-sdk-bridge-executor-runtime.md`
  - focused completed-slice doc for the bounded Claude Code executor landing
    using a narrow Claude SDK bridge above the completed Go runtime
134. `phase-12-opencode-rich-item-tool-result-and-mcp-status-parity.md`
  - focused implementation-plan doc for the bounded OpenCode follow-on over the
    completed Codex/runtime helpers: richer tool-result persistence plus
    OpenCode external MCP status ownership
135. `phase-12-claude-rich-item-tool-result-and-mcp-status-parity.md`
  - focused completed-slice doc for the landed Claude follow-on over the
    completed runtime helpers: Claude tool-result persistence plus Claude
    external MCP runtime-status ownership
136. `phase-12-codex-raw-tool-item-parity.md`
  - focused implementation-plan doc for the remaining bounded Codex parity gap:
    raw non-`response_item` tool-item persistence over the completed Codex
    runtime helpers
137. `phase-12-external-agent-prompt-and-app-generation-parity.md`
  - focused completed-slice doc for the bounded external-agent send-time
    prompt gap: agent-profile system prompt plus app-generation-mode prompt
    shaping over the completed Go runtime/executor boundary
138. `phase-12-external-agent-attachment-payload-parity.md`
  - focused completed-slice doc for the bounded remaining external-agent
    attachment gap: payload shaping plus the minimal token-backed download
    transport required by external-agent URLs
139. `phase-12-external-agent-ai-follow-snapshot-and-realtime-parity.md`
  - focused completed-slice doc for the bounded external-agent AI-follow gap:
    Go-owned `/getAIFollowSnapshot` external-agent snapshot transport plus
    live `AIFollowToolArgumentsUpdate` ownership
140. `phase-12-agent-run-list-read-transport-closeout.md`
  - focused completed-slice doc for the last concrete external-agent
    closeout dependency: Go-owned `GET /getAgentRuns` read transport required
    by external stop, history, and agent-run-backed overview state
141. `phase-13-agent-profile-read-transport.md`
  - focused completed-slice doc for the first post-Phase-12 bounded agentic
    read transport: Go-owned `GET /getAgentProfiles` over the canonical
    agent-profile store
142. `phase-13-prompt-template-read-transport.md`
  - focused completed-slice doc for the next post-Phase-13 bounded agentic read
    transport: a Go prompt-template file store plus thin
    `GET /getPromptTemplates`
143. `phase-13-agentic-summary-cache-status-transport-and-owner.md`
  - focused completed-slice doc for the next bounded post-Phase-13 agentic
    runtime/read owner: Go-owned `POST /getAgenticSummaryCacheStatus` over the
    live project-state runtime plus `agentic_summary_cache.json`
144. `phase-13-prompt-template-crud-transport.md`
  - focused completed-slice doc for the bounded prompt-template write gap:
    Go-owned `create/update/delete` prompt-template transport over the landed
    prompt-template file store, with watcher/websocket fan-out intentionally
    deferred
145. `phase-13-external-agent-config-and-health-read-transport.md`
  - focused completed-slice doc for the bounded external-agent hydration gap:
    Go-owned `getExternalAgentConfigs` and `getExternalAgentHealth` transport
    over the landed config store and bounded preflight checker
146. `phase-13-engine-config-read-transport.md`
  - focused completed-slice doc for the bounded engine-config hydration gap:
    Go-owned `GET /getEngineConfigs` transport over the landed
    `internal/agentruns.EngineStore`
147. `phase-13-transcription-profile-read-transport-and-capability-owner.md`
  - focused completed-slice doc for the bounded transcription-profile
    hydration gap: Go-owned `GET /getTranscriptionProfiles` transport plus a
    live capability owner over `internal/llmconfig.Runtime`
148. `phase-13-engine-config-update-transport.md`
  - focused completed-slice doc for the bounded engine-config write gap:
    Go-owned `POST /updateEngineConfig` transport over the landed
    `internal/agentruns.EngineStore`, with websocket fan-out intentionally
    deferred
149. `phase-13-agent-profile-crud-transport.md`
  - focused completed-slice doc for the bounded agent-profile write gap:
    Go-owned `create/update/delete` agent-profile transport over the landed
    `internal/agentprofiles.Store`, with watcher/realtime work intentionally
    deferred
150. `phase-13-transcription-profile-crud-transport.md`
  - focused completed-slice doc for the bounded transcription-profile write
    gap: Go-owned `create/update/delete` transcription-profile transport over
    the landed transcription-profile store/service owner, with websocket
    parity intentionally deferred
151. `phase-13-external-agent-config-crud-transport.md`
  - focused completed-slice doc for the last direct settings write gap:
    Go-owned `create/update/delete` external-agent-config transport over the
    landed store/service boundary, with plugin-registry parity and shared
    Claude settings-file ownership explicitly deferred
152. `phase-13-remaining-agentic-route-inventory-and-rerank.md`
  - focused closeout inventory doc for the remaining Python-owned agentic
    routes after the landed Phase 13 direct-surface work, including actual
    caller checks and reranked follow-on options
153. `phase-13-engine-config-create-delete-transport.md`
  - focused completed-slice doc for opportunistic Go ownership of dormant
    `create/delete` engine-config transport over the landed engine store,
    with websocket fan-out still deferred
154. `phase-13-agentic-single-item-read-transport.md`
  - focused completed-slice doc for the remaining dormant single-item agentic
    reads over the landed Go stores and services
155. `phase-13-agent-run-read-transport-closeout.md`
  - focused completed-slice doc for the last thin persisted agent-run read
    route before the remaining Python agentic surface becomes runtime-only
156. `phase-14-managed-agent-and-run-chain-runtime-mutation-plan.md`
  - focused planning doc for the remaining runtime-only Python agentic
    mutation surface, including the clean-break recommendation to reopen
    managed `start/stopAgentRun` before any run-chain work and to avoid
    reintroducing external-agent compatibility through that route
157. `phase-14-managed-agent-start-stop-runtime-and-transport.md`
  - focused completed-slice doc for the first bounded Phase 14 follow-on:
    Go-owned managed `start/stopAgentRun` runtime and transport over the
    landed managed-run service foundations, with external-agent dispatch and
    run-chain kept out of scope
158. `phase-14-run-chain-managed-runtime-and-transport.md`
  - focused completed-slice doc for the next bounded Phase 14 follow-on:
    Go-owned managed-only `start/stopRunChain` over a dedicated run-chain
    owner above the landed managed runtime, with external-agent child-step
    orchestration explicitly deferred
159. `phase-14-run-chain-external-agent-child-step-runtime.md`
  - focused completed-slice doc for the bounded Phase 14 follow-on:
    Go-owned external-agent child-step orchestration over the landed
    run-chain and external-agent runtime boundaries
160. `phase-14-run-chain-caller-and-progress-closeout.md`
  - focused closeout inventory doc confirming the landed Phase 14 runtime
    surface has no remaining caller-backed or realtime-parity gap under the
    current clean-break scope
161. `phase-14-executor-fixture-stability-and-regression-hardening.md`
  - focused completed-slice doc for the real subprocess-backed external-agent
    executor regression suite stabilization after the landed Phase 14 runtime
    closeout
162. `phase-14-agent-run-and-run-chain-app-middleware-regression-hardening.md`
  - focused completed-slice doc for real app-handler coverage of the landed
    agent-run and run-chain route surface
163. `phase-15-plugin-runtime-read-and-asset-transport.md`
  - focused completed-slice doc for Go-owned direct frontend plugin runtime
    hydration plus declared frontend asset serving over the existing Go plugin
    discovery/mutation foundations
164. `phase-15-plugin-config-write-transport.md`
  - focused completed-slice doc for Go-owned direct frontend plugin config
    validation and persistence over the existing plugin service/store boundary
165. `phase-15-plugin-restart-transport.md`
  - focused completed-slice doc for Go-owned direct frontend plugin restart
    transport plus the bounded optional restart-callback service boundary
166. `phase-15-plugin-lifecycle-mutation-transport.md`
  - focused completed-slice doc for Go-owned direct frontend plugin lifecycle
    mutation transport over the bounded rescan/enable-disable,
    install/uninstall, and update/rollback route surface
167. `phase-15-plugin-backend-codegen-registration-runtime.md`
  - focused completed-slice doc for Go-owned worker-backed backend codegen
    target registration loading in plugin runtime/status payloads
168. `phase-15-plugin-link-transport.md`
  - focused completed-slice doc for Go-owned local plugin link transport over
    the existing shared plugin authoring/link service
169. `phase-15-plugin-backend-language-server-and-external-agent-registration-runtime.md`
  - focused completed-slice doc for the combined Go-owned worker-backed backend
    registration loader that now surfaces plugin language-server and external-
    agent adapter registrations in runtime/status payloads
170. `phase-15-plugin-backend-route-runtime-and-transport.md`
  - focused completed-slice doc for the first Go-owned live plugin backend
    route runtime and `/api/plugins/{pluginId}/...` proxy transport
171. `phase-15-plugin-backend-mcp-tool-runtime.md`
  - focused completed-slice doc for Go-owned plugin-defined backend MCP tool
    registration and runtime over live worker sessions and the Go MCP server
172. `phase-15-plugin-static-dir-runtime.md`
  - focused completed-slice doc for Go-owned backend plugin static-directory
    registration and `/plugin-static/{pluginId}/...` serving
173. `phase-15-plugin-lock-transport.md`
  - focused completed-slice doc for Go-owned plugin lockfile write/apply
    transport over the existing shared plugin lockfile service
174. `phase-15-plugin-read-project-state-and-listener-registration-runtime.md`
  - focused completed-slice doc for Go-owned worker-host
    `read_project_state`, listener-endpoint registration capture, and backend
    fixture project-state reads over the live IDE runtime
175. `phase-15-plugin-listener-endpoint-websocket-dispatch.md`
  - focused completed-slice doc for Go-owned plugin listener-endpoint
    websocket dispatch over the live listener route and backend runtime
176. `phase-15-plugin-backend-runtime-refresh-after-mutations.md`
  - focused completed-slice doc for live IDE-mode refresh of plugin backend
    route/tool/static/listener ownership after plugin-set mutations
177. `phase-15-plugin-language-server-runtime-refresh-after-plugin-mutations.md`
  - focused completed-slice doc for live IDE-mode refresh of plugin-defined
    language-server specs after plugin-set mutations over the shared preview
    snapshot boundary
178. `phase-15-plugin-caller-and-runtime-closeout.md`
  - focused closeout inventory doc confirming the landed Phase 15 plugin
    surface has no remaining caller-backed gap under the current clean-break
    scope
179. `phase-16-llm-config-and-managed-api-key-transport.md`
  - focused completed-slice doc for Go-owned direct frontend LLM config and
    managed API-key transport, live runtime mutation, and websocket snapshot
    updates over the existing `internal/llmconfig` runtime owner
180. `phase-17-app-gen-skills-and-custom-skill-transport.md`
  - focused completed-slice doc for Go-owned app-gen skill browser and custom-
    skill editor transport over a bounded multi-root filesystem owner
181. `phase-18-remaining-ai-chat-and-transcription-route-inventory-and-rerank.md`
  - focused closeout inventory doc for the remaining direct frontend
    Python-owned AI/chat surface after Phase 17, including the reranked split
    between managed chat, transcription sessions, and the then-dormant
    chat-section read transport that later closed out
182. `phase-18-managed-chat-send-hydrate-stop-and-section-persistence-plan.md`
  - focused Phase 18 execution doc for the remaining direct frontend
    managed-chat runtime slice after the landed chat-section persistence
    transport over the managed-run, LLM-config, and project-state foundations
183. `phase-18-managed-chat-send-owner-and-route-foundation.md`
  - focused Phase 18 follow-on doc for the landed managed send owner and thin
    `/getLLMResponse` route dispatch slice ahead of provider-executor work
184. `phase-18-managed-provider-executor-and-live-chat-runtime-plan.md`
  - focused Phase 18 follow-on doc for the landed managed live chat runtime,
    websocket chunk foundation, and bounded OpenAI executor slices
185. `phase-18-managed-mcp-tool-execution-plan.md`
  - focused Phase 18 follow-on doc for the landed bounded managed MCP tool
    execution slice over resolved `MCPServerIDs` and per-call MCP metadata
186. `phase-18-managed-tool-preview-parity-plan.md`
  - focused Phase 18 follow-on doc for the landed bounded managed
    `tool_argument_preview_delta` parity slice over shared MCP tool metadata
    and the landed live chat runtime
187. `phase-18-managed-ai-follow-result-parity-plan.md`
  - focused Phase 18 follow-on doc for the bounded managed
    `AIFollowToolResultUpdate` parity slice over result-path metadata and the
    landed managed MCP execution/runtime boundary
188. `phase-18-transcription-session-runtime-plan.md`
  - focused Phase 18 follow-on doc for the bounded Go-owned transcription
    session runtime slice, starting with file-mode ownership and thin route
    transport
189. `phase-18-chat-section-chat-id-read-closeout.md`
  - focused Phase 18 closeout doc for the opportunistic Go ownership of the
    dormant `POST /getChatSectionChatId` route over project-state reads and
    durable chat-run validation
190. `phase-19-remaining-direct-frontend-route-inventory-and-rerank.md`
  - focused closeout inventory doc for the remaining caller-backed direct
    frontend route surface after the landed Phase 18 AI/chat closeout,
    reranking project-shell routes ahead of git and dormant listener/run
    transport
191. `phase-19-project-shell-route-cluster-plan.md`
  - focused closeout doc for the landed project-shell read, rename,
    notification, and lifecycle route cluster over the landed
    `projectstate` and `projectview` foundations
192. `phase-19-project-lifecycle-mutations-plan.md`
  - focused closeout doc for the landed Phase 19 save / create / save-as /
    delete lifecycle mutation slice plus its clean-break clone decision
193. `phase-20-git-read-route-cluster-plan.md`
  - focused closeout doc for the landed full git-read route cluster over
    explicit Go repo-root resolution, subprocess execution, history reads, and
    typed transport boundaries
194. `phase-21-post-git-direct-frontend-route-inventory-and-rerank.md`
  - focused corrected post-git rerank doc showing the artifact/file-browser
    route cluster is still caller-backed and should become the next phase
195. `phase-22-artifact-and-file-browser-route-cluster-plan.md`
  - focused closeout doc for the landed workspace file-browser, artifact, and
    binary-download route cluster over explicit file-browser and artifact
    owners
196. `phase-22-ide-artifact-owner-plan.md`
  - focused landed slice doc for the bounded IDE-only artifact owner: file
    import, cached artifact reads, active caller-backed artifact writes, and
    file deletes over state-relative artifact ids
197. `phase-22-share-artifact-session-overlay-plan.md`
  - focused landed slice doc for the deployment/share artifact overlay
    behavior over explicit per-session ownership and scoped websocket updates
198. `phase-23-post-artifact-direct-frontend-route-inventory-and-rerank.md`
  - focused closeout rerank doc showing that no new caller-backed direct
    frontend route cluster remains after the landed Phase 22 closeout and that
    the next planning boundary should shift to broader capability/runtime
    inventory
199. `phase-24-caller-backed-capability-gap-inventory-and-rerank.md`
  - focused broader rerank doc showing that the remaining typed Go
    `unsupported` / `unavailable` branches still do not select a new
    caller-backed backend phase after Phase 23
200. `phase-25-remaining-python-ownership-inventory-and-rerank.md`
  - focused broader ownership rerank doc showing that the remaining rewrite
    surface is now legacy Python startup/fallback and workflow/distribution
    glue, not another backend runtime phase
201. `phase-25-legacy-startup-and-distribution-boundary-plan.md`
  - focused plan for the next optional rewrite track: reduce legacy
    `setta.start` ownership and dev/distribution workflow glue without
    reopening backend route/runtime work
202. `phase-25-startup-test-surface-classification-and-source-of-truth.md`
  - focused Slice 1 outcome doc that classifies `tests/start/*` into active
    shipped/distribution, active source/dev workflow, and legacy fallback
    buckets so later startup cleanup has an explicit contract boundary
203. `phase-25-dev-startup-command-boundary-plan.md`
  - focused Slice 2 implementation doc for the first source/dev hardening
    step: make `backendStart.sh` choose an explicit routed command path for
    normal startup and an explicit dev-only legacy path for reload
204. `phase-25-start-py-reachability-inventory-and-rerank.md`
  - focused Slice 3 inventory doc showing that the remaining reachable
    `setta.start` surface is now a small entrypoint fallback edge set rather
    than a broad active startup dependency
205. `phase-25-distribution-install-workflow-retargeting-plan.md`
  - focused Slice 4 implementation plan for converging repo-root
    build/install wrappers on the explicit packaged-distribution helper
    without changing the Python artifact boundary
206. `phase-26-post-startup-and-distribution-ownership-rerank.md`
  - focused rerank doc showing that the startup/distribution track is now
    effectively closed for the current clean-break scope and does not select a
    new implementation slice
207. `phase-27-packaged-entrypoint-fallback-hardening-plan.md`
  - focused closeout doc for the landed packaged module-entrypoint follow-on:
    Go-owned root/plugins help and invalid-root-argv handling over the thin
    Python dispatcher boundary
208. `phase-28-dev-startup-shared-helper-owner-plan.md`
  - focused closeout doc for extracting the remaining active shared startup
    helper surface out of `setta.start` for the explicit dev reload owner
209. `phase-29-post-phase-28-startup-and-distribution-rerank.md`
  - focused rerank doc showing that the startup/distribution track is now
    effectively closed for the current clean-break scope after the landed
    packaged-entrypoint and shared-helper follow-ons
210. `phase-30-post-phase-29-broader-rewrite-rerank.md`
  - focused broader rerank doc showing that active launcher
    home/management and install/native-installer surfaces are already on
    Go-owned boundaries, so the remaining Python launcher, installer, and
    dev-reload surfaces do not currently select another evidence-backed
    rewrite phase
211. `phase-31-packaged-python-surface-and-dependency-rerank.md`
  - focused rerank doc showing that the next remaining evidence-backed track
    is no longer backend/runtime ownership; it is the shipped Python package
    surface and dependency boundary
212. `phase-31-packaged-python-boundary-slimdown-plan.md`
  - focused implementation-plan doc for the landed explicit wheel boundary,
    the landed packaged-vs-source dependency split, and the landed explicit
    repo-local source/dev bootstrap closeout for the current scope
213. `phase-32-post-phase-31-distribution-artifact-rerank.md`
  - focused rerank doc showing that the remaining evidence-backed packaging
    surface is no longer generic packaged-Python trimming; it is the
    installer-managed distribution artifact boundary still anchored on sdist
214. `phase-32-wheel-first-installer-artifact-boundary-plan.md`
  - focused implementation-plan doc for retargeting native installers and
    adjacent built-install docs to a wheel-first packaged-user artifact
    boundary while keeping sdist as a separate explicit source-smoke question
215. `phase-32-verify-install-sdist-smoke-boundary-decision.md`
  - focused closeout doc recording the explicit decision to keep
    `verify_install.sh` as the dedicated sdist completeness smoke while the
    packaged-user install paths remain wheel-first
216. `phase-33-post-phase-32-packaging-and-distribution-rerank.md`
  - focused rerank doc confirming that the packaging/distribution track is now
    effectively closed for the current clean-break scope and does not select a
    new implementation slice
217. `spike-mcp.md`
   - completed MCP spike outcome and wrapper-boundary decision record
218. `spike-pty.md`
   - completed PTY spike outcome plus the current bounded Unix PTY library
     follow-up note
219. `spike-lsp.md`
   - completed LSP spike outcome and runtime-boundary decision record

All docs in this folder assume a clean-break rewrite:

- no backward compatibility requirement
- no legacy route preservation requirement
- no storage migration requirement
- current Python code/tests/docs are reference material, not a compatibility contract
