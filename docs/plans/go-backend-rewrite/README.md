# Go Rewrite Docs

This folder contains the working plan set for the Go backend rewrite.

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
8. `phase-3-project-state-core.md`
   - project-state persistence, runtime ownership, and revision plan
9. `phase-4-realtime-and-terminal-runtime.md`
   - realtime ownership, websocket fan-out, and terminal runtime plan
10. `phase-4-terminal-transport-migration.md`
   - focused current-work plan for terminal websocket and HTTP transport migration
11. `phase-4-terminal-run-code-migration.md`
   - focused current-work plan for remaining terminal run-code migration
12. `phase-4-generated-entry-runs-and-temp-terminals.md`
   - focused current-work plan for generated-entry run support and temporary-terminal fallback
13. `phase-4-deployment-run-code-policy-and-session-overlays.md`
   - focused current-work plan for deployment/share run-code policy and session runtime foundations
14. `phase-4-deployment-session-transport-and-cleanup.md`
   - focused current-work plan for deployment session bootstrap/state transport and session cleanup ownership
15. `phase-4-deployment-state-routes-and-projectstate-transport.md`
   - focused current-work plan for frontend-facing Go project-state transport and deployment state/project-config route migration
16. `phase-4-listener-realtime-producer-migration.md`
   - focused current-work plan for the remaining listener realtime producer boundaries
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
  - entry inventory doc for the remaining Python-owned non-MCP backend runtime
    surface after the completed Phase 6 MCP closeout
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
    slice; launcher management is now complete and the remaining gap is
    launch/bootstrap handoff
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
  - focused implementation-plan doc for the remaining local launch/bootstrap
    handoff slice after launcher management completion
105. `spike-mcp.md`
   - MCP uncertainty-reduction plan
106. `spike-pty.md`
   - PTY uncertainty-reduction plan
107. `spike-lsp.md`
   - LSP uncertainty-reduction plan

All docs in this folder assume a clean-break rewrite:

- no backward compatibility requirement
- no legacy route preservation requirement
- no storage migration requirement
- current Python code/tests/docs are reference material, not a compatibility contract
