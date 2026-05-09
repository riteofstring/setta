package mcpx

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"sort"
	"testing"
	"time"

	"setta/internal/tools"
)

func TestReadFileRangeHandlerReadsEntireFile(t *testing.T) {
	t.Parallel()

	handler, _, sourcePath := newReadFileRangeTestHandler(t)
	result := mustReadFileRangeResult(t, handler, map[string]any{
		"path": "example.txt",
	})
	assertReadFileRangeResult(t, result, readFileRangeExpected{
		path:         "example.txt",
		absolutePath: sourcePath,
		startLine:    1,
		endLine:      3,
		content:      "alpha\nbeta\ngamma",
	})
}

func TestReadFileRangeHandlerReadsSpecifiedRange(t *testing.T) {
	t.Parallel()

	handler, _, _ := newReadFileRangeTestHandler(t)
	result := mustReadFileRangeResult(t, handler, map[string]any{
		"path":       "example.txt",
		"start_line": 2,
		"end_line":   3,
	})
	assertReadFileRangeResult(t, result, readFileRangeExpected{
		path:      "example.txt",
		startLine: 2,
		endLine:   3,
		content:   "beta\ngamma",
	})
}

func TestReadFileRangeHandlerHandlesStartBeyondEnd(t *testing.T) {
	t.Parallel()

	handler, _, _ := newReadFileRangeTestHandler(t)
	result := mustReadFileRangeResult(t, handler, map[string]any{
		"path":       "example.txt",
		"start_line": 10,
	})
	assertReadFileRangeResult(t, result, readFileRangeExpected{
		path:      "example.txt",
		startLine: 10,
		endLine:   9,
		content:   "",
	})
}

func TestReadFileRangeHandlerReturnsStructuredErrors(t *testing.T) {
	t.Parallel()

	handler, workspaceRoot, _ := newReadFileRangeTestHandler(t)
	assertReadFileRangeErrorCode(t, handler, map[string]any{
		"path": "missing.txt",
	}, "file_not_found")

	binaryPath := filepath.Join(workspaceRoot, "binary.dat")
	if err := os.WriteFile(binaryPath, []byte{0xff, 0xfe, 0xfa}, 0o644); err != nil {
		t.Fatalf("write binary file: %v", err)
	}
	assertReadFileRangeErrorCode(t, handler, map[string]any{
		"path": "binary.dat",
	}, "invalid_arguments")
	assertReadFileRangeErrorCode(t, handler, map[string]any{
		"path": "../outside.txt",
	}, "invalid_arguments")

	outsideRoot := t.TempDir()
	outsidePath := filepath.Join(outsideRoot, "outside.txt")
	if err := os.WriteFile(outsidePath, []byte("nope"), 0o644); err != nil {
		t.Fatalf("write outside file: %v", err)
	}
	assertReadFileRangeErrorCode(t, handler, map[string]any{
		"path": outsidePath,
	}, "invalid_arguments")
}

type readFileRangeExpected struct {
	path         string
	absolutePath string
	startLine    int
	endLine      int
	content      string
}

func newReadFileRangeTestHandler(t *testing.T) (tools.Handler, string, string) {
	t.Helper()

	workspaceRoot := t.TempDir()
	sourcePath := filepath.Join(workspaceRoot, "example.txt")
	if err := os.WriteFile(sourcePath, []byte("alpha\nbeta\ngamma\n"), 0o644); err != nil {
		t.Fatalf("write source file: %v", err)
	}
	return newReadFileRangeHandler(workspaceRoot), workspaceRoot, sourcePath
}

func assertReadFileRangeResult(t *testing.T, result readFileRangeResult, expected readFileRangeExpected) {
	t.Helper()

	if result.Path != expected.path {
		t.Fatalf("expected relative path %q, got %q", expected.path, result.Path)
	}
	if expected.absolutePath != "" && result.AbsolutePath != expected.absolutePath {
		t.Fatalf("expected absolute path %q, got %q", expected.absolutePath, result.AbsolutePath)
	}
	if result.StartLine != expected.startLine {
		t.Fatalf("expected start line %d, got %d", expected.startLine, result.StartLine)
	}
	if result.EndLine != expected.endLine {
		t.Fatalf("expected end line %d, got %d", expected.endLine, result.EndLine)
	}
	if result.Content != expected.content {
		t.Fatalf("expected content %q, got %q", expected.content, result.Content)
	}
}

func assertReadFileRangeErrorCode(t *testing.T, handler tools.Handler, arguments map[string]any, expectedCode string) {
	t.Helper()

	err := mustToolError(t, handler, arguments)
	if err.code != expectedCode {
		t.Fatalf("expected %s, got %q", expectedCode, err.code)
	}
}

func TestServerListsTools(t *testing.T) {
	t.Parallel()

	fixture := openScopedToolCatalogFixture(t)
	defer fixture.clientSession.Close()

	expectedNames := expectedScopedServerToolNames()
	if names := sortedToolNames(fixture.toolsByName); !slices.Equal(names, expectedNames) {
		t.Fatalf("unexpected tool names %#v", names)
	}

	listResult := mustCallTool(t, fixture.clientSession, "list_mcp_tools", nil)
	listPayload := mustStructuredMap(t, mustSuccessfulToolResult(t, listResult).StructuredContent)
	listNames := mustStringList(t, listPayload["tools"])
	if !slices.Equal(listNames, expectedNames) {
		t.Fatalf("expected registered tool names %#v, got %#v", expectedNames, listNames)
	}
}

func TestServerToolMetadata(t *testing.T) {
	t.Parallel()

	fixture := openScopedToolCatalogFixture(t)
	defer fixture.clientSession.Close()

	assertToolMetadataExpectations(t, fixture.toolsByName, []toolMetadataExpectation{
		{
			name:   "create_child_sections",
			access: tools.AccessTypeStructural,
			idPaths: map[tools.IDType][]string{
				tools.IDTypeSection: []string{"parentId"},
			},
			resultIDPaths: map[tools.IDType][]string{
				tools.IDTypeSection: []string{"sectionIds"},
			},
		},
		{
			name:   "create_child_sections_via_incrementer",
			access: tools.AccessTypeStructural,
			idPaths: map[tools.IDType][]string{
				tools.IDTypeSection: []string{"calledBy"},
			},
			resultIDPaths: map[tools.IDType][]string{
				tools.IDTypeSection: []string{"sectionIds"},
			},
		},
		{
			name:   "create_new_section_variant",
			access: tools.AccessTypeStructural,
			idPaths: map[tools.IDType][]string{
				tools.IDTypeSection: []string{"sectionId"},
			},
			resultIDPaths: map[tools.IDType][]string{
				tools.IDTypeSectionVariant: []string{"variantId"},
			},
		},
		{
			name:   "set_section_variant",
			access: tools.AccessTypeWrite,
			idPaths: map[tools.IDType][]string{
				tools.IDTypeSection:        []string{"sectionId"},
				tools.IDTypeSectionVariant: []string{"variantId"},
			},
		},
		{
			name:   "set_default_section_variant",
			access: tools.AccessTypeWrite,
			idPaths: map[tools.IDType][]string{
				tools.IDTypeSection:        []string{"sectionId"},
				tools.IDTypeSectionVariant: []string{"variantId"},
			},
		},
		{
			name:   "set_section_variant_sort_order",
			access: tools.AccessTypeWrite,
			idPaths: map[tools.IDType][]string{
				tools.IDTypeSection:        []string{"sectionId"},
				tools.IDTypeSectionVariant: []string{"orderedVariantIds"},
			},
		},
		{
			name:   "delete_child_sections_via_decrementer",
			access: tools.AccessTypeStructural,
			idPaths: map[tools.IDType][]string{
				tools.IDTypeSection: []string{"calledBy"},
			},
			resultIDPaths: map[tools.IDType][]string{
				tools.IDTypeSection: []string{"sectionIds"},
			},
		},
		{
			name:   "delete_sections",
			access: tools.AccessTypeStructural,
			idPaths: map[tools.IDType][]string{
				tools.IDTypeSection: []string{"sectionIds"},
			},
			resultIDPaths: map[tools.IDType][]string{
				tools.IDTypeSection: []string{"sectionIds"},
			},
		},
		{
			name:   "create_top_level_section",
			access: tools.AccessTypeStructural,
			resultIDPaths: map[tools.IDType][]string{
				tools.IDTypeSection:    []string{"sectionId"},
				tools.IDTypeCodeObject: []string{"metaControlParamId"},
			},
		},
		{
			name:   "set_callable",
			access: tools.AccessTypeWrite,
			idPaths: map[tools.IDType][]string{
				tools.IDTypeSection: []string{"sectionId"},
			},
			resultIDPaths: map[tools.IDType][]string{
				tools.IDTypeCodeObject: []string{"callableId", "childCodeObjs.codeObjId"},
			},
			preview: &toolPreviewExpectation{
				targetIDPaths: map[tools.IDType][]string{
					tools.IDTypeSection: []string{"sectionId"},
				},
				valuePath: "callableName",
				kind:      tools.PreviewKindCallableName,
			},
		},
		{
			name:   "set_code_section_attached_terminal",
			access: tools.AccessTypeStructural,
			idPaths: map[tools.IDType][]string{
				tools.IDTypeSection: []string{"sectionId", "terminalSectionId"},
			},
		},
		{
			name:   "set_code",
			access: tools.AccessTypeWrite,
			idPaths: map[tools.IDType][]string{
				tools.IDTypeSection: []string{"sectionId"},
			},
			preview: &toolPreviewExpectation{
				targetIDPaths: map[tools.IDType][]string{
					tools.IDTypeSection: []string{"sectionId"},
				},
				valuePath: "code",
				kind:      tools.PreviewKindCode,
			},
		},
		{
			name:   "format_code",
			access: tools.AccessTypeWrite,
			idPaths: map[tools.IDType][]string{
				tools.IDTypeSection: []string{"sectionId"},
			},
		},
		{
			name:   "set_group_overflow_mode",
			access: tools.AccessTypeStructural,
			idPaths: map[tools.IDType][]string{
				tools.IDTypeSection: []string{"sectionId"},
			},
		},
		{
			name:   "set_section_sizes",
			access: tools.AccessTypeStructural,
			idPaths: map[tools.IDType][]string{
				tools.IDTypeSection: []string{"sectionSizes"},
			},
		},
		{
			name:   "set_section_tag_color",
			access: tools.AccessTypeWrite,
			idPaths: map[tools.IDType][]string{
				tools.IDTypeSection: []string{"sectionId"},
			},
		},
		{
			name:   "set_section_style_color",
			access: tools.AccessTypeWrite,
			idPaths: map[tools.IDType][]string{
				tools.IDTypeSection: []string{"sectionId"},
			},
		},
		{
			name:   "set_section_param_filter",
			access: tools.AccessTypeWrite,
			idPaths: map[tools.IDType][]string{
				tools.IDTypeSection: []string{"sectionId"},
			},
		},
		{
			name:   "set_meta_control_show_section_title",
			access: tools.AccessTypeWrite,
			idPaths: map[tools.IDType][]string{
				tools.IDTypeSection: []string{"sectionId"},
			},
		},
		{name: "auto_layout_top_level_sections", access: tools.AccessTypeStructural},
		{name: "set_show_param_display_names", access: tools.AccessTypeStructural},
		{name: "getInstalledPythonPackages", access: tools.AccessTypeRead, expectNoIDPaths: true},
		{
			name:            "list_agent_profiles",
			access:          tools.AccessTypeRead,
			requiresLLM:     boolPtr(true),
			omitStartsRun:   true,
			expectNoIDPaths: true,
		},
		{
			name:            "get_agent_profile",
			access:          tools.AccessTypeRead,
			requiresLLM:     boolPtr(true),
			omitStartsRun:   true,
			expectNoIDPaths: true,
		},
		{
			name:            "run_agent_profile",
			access:          tools.AccessTypeStructural,
			requiresLLM:     boolPtr(true),
			startsRun:       boolPtr(true),
			expectNoIDPaths: true,
		},
		{name: "report_state_machine_signal", access: tools.AccessTypeStructural, expectNoIDPaths: true},
		{name: "install_plugin", access: tools.AccessTypeStructural, expectNoIDPaths: true},
		{name: "uninstall_plugin", access: tools.AccessTypeStructural, expectNoIDPaths: true},
		{name: "rescan_plugins", access: tools.AccessTypeStructural, expectNoIDPaths: true},
		{name: "update_plugin", access: tools.AccessTypeStructural, expectNoIDPaths: true},
		{name: "rollback_plugin", access: tools.AccessTypeStructural, expectNoIDPaths: true},
		{name: "get_app_catalog", access: tools.AccessTypeStructural, expectNoIDPaths: true},
		{name: "list_app_components", access: tools.AccessTypeStructural, expectNoIDPaths: true},
		{name: "get_app_definition", access: tools.AccessTypeStructural},
		{name: "validate_app_definition", access: tools.AccessTypeStructural},
		{name: "set_app_definition", access: tools.AccessTypeStructural},
		{
			name:   "stream_app_definition",
			access: tools.AccessTypeStructural,
			preview: &toolPreviewExpectation{
				targetIDPaths: map[tools.IDType][]string{},
				valuePath:     "patches",
				kind:          tools.PreviewKindAppSpecPatch,
			},
		},
		{name: "update_app_definition", access: tools.AccessTypeStructural},
		{name: "compare_and_set_show_param_display_names", access: tools.AccessTypeStructural},
		{name: "set_project_config_codegen_targets", access: tools.AccessTypeStructural},
		{
			name:                          "set_gen_code_prefix",
			access:                        tools.AccessTypeWrite,
			defaultTargetSingletonSection: "GenPythonCode",
		},
		{
			name:                          "set_gen_code_suffix",
			access:                        tools.AccessTypeWrite,
			defaultTargetSingletonSection: "GenPythonCode",
		},
		{
			name:   "toggle_position_locks",
			access: tools.AccessTypeStructural,
			idPaths: map[tools.IDType][]string{
				tools.IDTypeSection: []string{"sectionIds"},
			},
		},
		{
			name:   "toggle_group_orientation",
			access: tools.AccessTypeStructural,
			idPaths: map[tools.IDType][]string{
				tools.IDTypeSection: []string{"sectionId"},
			},
		},
		{
			name:   "toggle_minimized",
			access: tools.AccessTypeStructural,
			idPaths: map[tools.IDType][]string{
				tools.IDTypeSection: []string{"sectionId"},
			},
		},
		{
			name:   "set_top_level_section_layout",
			access: tools.AccessTypeWrite,
			idPaths: map[tools.IDType][]string{
				tools.IDTypeSection: []string{"topLevelSections"},
			},
		},
		{
			name:   "add_kwarg",
			access: tools.AccessTypeWrite,
			idPaths: map[tools.IDType][]string{
				tools.IDTypeSection: []string{"sectionId"},
			},
			resultIDPaths: map[tools.IDType][]string{
				tools.IDTypeCodeObject: []string{"codeObjId"},
			},
		},
		{
			name:   "delete_kwarg",
			access: tools.AccessTypeWrite,
			idPaths: map[tools.IDType][]string{
				tools.IDTypeSection: []string{"sectionId"},
			},
			resultIDPaths: map[tools.IDType][]string{
				tools.IDTypeCodeObject: []string{"codeObjId"},
			},
		},
		{
			name:   "change_param_impl",
			access: tools.AccessTypeWrite,
			idPaths: map[tools.IDType][]string{
				tools.IDTypeSection:    []string{"sectionId"},
				tools.IDTypeCodeObject: []string{"paramInfoId"},
			},
		},
		{
			name:   "update_param_impl_config",
			access: tools.AccessTypeWrite,
			idPaths: map[tools.IDType][]string{
				tools.IDTypeSection:    []string{"sectionId"},
				tools.IDTypeCodeObject: []string{"paramInfoId"},
			},
		},
		{
			name:   "delete_selected_params",
			access: tools.AccessTypeWrite,
			idPaths: map[tools.IDType][]string{
				tools.IDTypeSection:    []string{"sectionId"},
				tools.IDTypeCodeObject: []string{"paramInfoIds"},
			},
			resultIDPaths: map[tools.IDType][]string{
				tools.IDTypeCodeObject: []string{"paramInfoIds"},
			},
		},
		{name: "get_latest_project_state_summary", resultFilter: tools.ResultFilterProjectStateSummary},
		{name: "get_latest_lsp_diagnostics", resultFilter: tools.ResultFilterLSPDiagnostics},
		{
			name:   "set_code_section_diagnostics_mute",
			access: tools.AccessTypeWrite,
			idPaths: map[tools.IDType][]string{
				tools.IDTypeSection: []string{"sectionId"},
			},
		},
		{
			name: "set_section_name",
			idPaths: map[tools.IDType][]string{
				tools.IDTypeSection: []string{"sectionId"},
			},
		},
		{
			name: "set_param_entered_value",
			idPaths: map[tools.IDType][]string{
				tools.IDTypeSection:    []string{"sectionId"},
				tools.IDTypeCodeObject: []string{"paramInfoId"},
			},
			preview: &toolPreviewExpectation{
				targetIDPaths: map[tools.IDType][]string{
					tools.IDTypeSection:    []string{"sectionId"},
					tools.IDTypeCodeObject: []string{"paramInfoId"},
				},
				valuePath: "value",
				kind:      tools.PreviewKindParamValue,
			},
		},
		{
			name: "set_param_name_and_value",
			idPaths: map[tools.IDType][]string{
				tools.IDTypeSection:    []string{"sectionId"},
				tools.IDTypeCodeObject: []string{"codeObjId"},
			},
			preview: &toolPreviewExpectation{
				targetIDPaths: map[tools.IDType][]string{
					tools.IDTypeSection:    []string{"sectionId"},
					tools.IDTypeCodeObject: []string{"codeObjId"},
				},
				valuePath: "value",
				kind:      tools.PreviewKindParamValue,
			},
		},
		{
			name: "set_code_obj_name",
			idPaths: map[tools.IDType][]string{
				tools.IDTypeCodeObject: []string{"codeObjId"},
			},
		},
		{
			name: "set_code_obj_display_name",
			idPaths: map[tools.IDType][]string{
				tools.IDTypeCodeObject: []string{"codeObjId"},
			},
		},
	})

	assertToolInputSchemaOmitsProperties(
		t,
		mustTool(t, fixture.toolsByName, "create_top_level_section"),
		[]string{"implOverrides", "topLevelSections", "viewportBounds"},
	)
}

func TestServerScopesToolCalls(t *testing.T) {
	t.Parallel()

	fixture := openScopedToolCatalogFixture(t)
	defer fixture.clientSession.Close()

	scopeResult := mustCallTool(t, fixture.clientSession, "read_file_range", map[string]any{
		"path": "example.txt",
	})
	assertStructuredFields(t, mustErrorToolResult(t, scopeResult), map[string]any{
		"code":   scopeViolationErrorCode,
		"reason": "missing_context",
	})

	blankAffinityResult := mustCallTool(t, fixture.clientSession, "set_agentic_context", map[string]any{
		"projectConfigId":       "project-alpha",
		"chatId":                "chat-1",
		"sectionId":             "chat-section",
		"frontendAffinityToken": "   ",
	})
	mustErrorToolResult(t, blankAffinityResult)

	setContextResult := mustCallTool(t, fixture.clientSession, "set_agentic_context", map[string]any{
		"projectConfigId":       "project-alpha",
		"chatId":                "chat-1",
		"sectionId":             "chat-section",
		"frontendAffinityToken": "frontend-1",
	})
	mustSuccessfulToolResult(t, setContextResult)

	readResult := mustCallTool(t, fixture.clientSession, "read_file_range", map[string]any{
		"path":       "example.txt",
		"start_line": 2,
		"end_line":   3,
	})
	readPayload := mustStructuredMap(t, mustSuccessfulToolResult(t, readResult).StructuredContent)
	if readPayload["content"] != "beta\ngamma" {
		t.Fatalf("expected ranged file content, got %#v", readPayload["content"])
	}

	summaryResult := mustCallTool(t, fixture.clientSession, "get_latest_project_state_summary", map[string]any{
		"projectConfigId": "project-alpha",
	})
	assertSummaryPayload(t, mustSuccessfulToolResult(t, summaryResult).StructuredContent)

	mismatchResult := mustCallTool(t, fixture.clientSession, "get_latest_project_state_summary", map[string]any{
		"projectConfigId": "project-beta",
	})
	mismatchPayload := mustErrorToolResult(t, mismatchResult)
	assertStructuredFields(t, mismatchPayload, map[string]any{"code": "invalid_arguments"})
	if mismatchPayload["message"] == nil {
		t.Fatalf("expected mismatch message, got %#v", mismatchPayload)
	}

	diagnosticsResult := mustCallTool(t, fixture.clientSession, "get_latest_lsp_diagnostics", map[string]any{
		"projectConfigId": "project-alpha",
	})
	assertDiagnosticsPayload(t, mustSuccessfulToolResult(t, diagnosticsResult).StructuredContent)

	if fixture.server.sessionAgenticContext("missing-session") != nil {
		t.Fatal("expected missing session agentic context lookup to return nil")
	}
}

type scopedToolCatalogFixture struct {
	server        *Server
	clientSession *sdkmcp.ClientSession
	toolsByName   map[string]*sdkmcp.Tool
}

type toolMetadataExpectation struct {
	name                          string
	access                        tools.AccessType
	idPaths                       map[tools.IDType][]string
	resultIDPaths                 map[tools.IDType][]string
	preview                       *toolPreviewExpectation
	requiresLLM                   *bool
	startsRun                     *bool
	omitStartsRun                 bool
	expectNoIDPaths               bool
	defaultTargetSingletonSection string
	resultFilter                  tools.ResultFilter
}

type toolPreviewExpectation struct {
	targetIDPaths map[tools.IDType][]string
	valuePath     string
	kind          tools.PreviewKind
}

func openScopedToolCatalogFixture(t *testing.T) scopedToolCatalogFixture {
	t.Helper()

	workspaceRoot := t.TempDir()
	if err := os.WriteFile(filepath.Join(workspaceRoot, "example.txt"), []byte("alpha\nbeta\ngamma\n"), 0o644); err != nil {
		t.Fatalf("write source file: %v", err)
	}

	projectRuntime := openScopedTestProjectRuntime(t)
	server, clientSession := newScopedTestServerSession(t, workspaceRoot, projectRuntime)
	return scopedToolCatalogFixture{
		server:        server,
		clientSession: clientSession,
		toolsByName:   listToolsByName(t, clientSession),
	}
}

func listToolsByName(t *testing.T, clientSession *sdkmcp.ClientSession) map[string]*sdkmcp.Tool {
	t.Helper()

	toolsResult, err := clientSession.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatalf("list tools: %v", err)
	}

	byName := make(map[string]*sdkmcp.Tool, len(toolsResult.Tools))
	for _, tool := range toolsResult.Tools {
		if _, exists := byName[tool.Name]; exists {
			t.Fatalf("duplicate tool name %q", tool.Name)
		}
		byName[tool.Name] = tool
	}
	return byName
}

func sortedToolNames(toolsByName map[string]*sdkmcp.Tool) []string {
	names := make([]string, 0, len(toolsByName))
	for name := range toolsByName {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

func expectedScopedServerToolNames() []string {
	return []string{
		"add_kwarg",
		"auto_layout_top_level_sections",
		"change_param_impl",
		"compare_and_set_show_param_display_names",
		"create_child_sections",
		"create_child_sections_via_incrementer",
		"create_new_section_variant",
		"create_top_level_section",
		"delete_child_sections_via_decrementer",
		"delete_kwarg",
		"delete_sections",
		"delete_selected_params",
		"format_code",
		"getInstalledPythonPackages",
		"getProjectConfigNamesAndIds",
		"getTerminalOutput",
		"get_agent_profile",
		"get_app_catalog",
		"get_app_definition",
		"get_latest_lsp_diagnostics",
		"get_latest_project_state_summary",
		"get_mcp_server_runtime_status",
		"get_setta_docs",
		"get_ui_setting_value",
		"install_plugin",
		"list_agent_profiles",
		"list_app_components",
		"list_mcp_tools",
		"read_file_range",
		"report_completion_status",
		"report_state_machine_signal",
		"rescan_plugins",
		"reveal_ui_setting",
		"rollback_plugin",
		"run_agent_profile",
		"search_mcp_tools",
		"search_ui_settings",
		"set_agentic_context",
		"set_app_definition",
		"set_callable",
		"set_code",
		"set_code_obj_display_name",
		"set_code_obj_name",
		"set_code_section_attached_terminal",
		"set_code_section_diagnostic_code_suppression",
		"set_code_section_diagnostics_mute",
		"set_default_section_variant",
		"set_gen_code_prefix",
		"set_gen_code_suffix",
		"set_group_overflow_mode",
		"set_meta_control_show_section_title",
		"set_param_entered_value",
		"set_param_name_and_value",
		"set_project_config_codegen_targets",
		"set_section_name",
		"set_section_param_filter",
		"set_section_sizes",
		"set_section_style_color",
		"set_section_tag_color",
		"set_section_variant",
		"set_section_variant_sort_order",
		"set_show_param_display_names",
		"set_top_level_section_layout",
		"set_type_error_ignore",
		"set_ui_setting_value",
		"stream_app_definition",
		"toggle_group_orientation",
		"toggle_minimized",
		"toggle_position_locks",
		"uninstall_plugin",
		"update_app_definition",
		"update_param_impl_config",
		"update_plugin",
		"validate_app_definition",
	}
}

func assertToolMetadataExpectations(t *testing.T, toolsByName map[string]*sdkmcp.Tool, expectations []toolMetadataExpectation) {
	t.Helper()

	for _, expectation := range expectations {
		t.Run(expectation.name, func(t *testing.T) {
			tool := mustTool(t, toolsByName, expectation.name)
			metadata := mustToolMetadata(t, tool)
			assertToolScalarMetadata(t, tool, metadata, expectation)
			assertToolIDPathMetadata(t, metadata, expectation)
			assertToolPreviewMetadata(t, metadata, expectation)
		})
	}
}

func mustTool(t *testing.T, toolsByName map[string]*sdkmcp.Tool, name string) *sdkmcp.Tool {
	t.Helper()
	tool := toolsByName[name]
	if tool == nil {
		t.Fatalf("expected %s tool", name)
	}
	return tool
}

func mustToolMetadata(t *testing.T, tool *sdkmcp.Tool) tools.Metadata {
	t.Helper()

	metadata, err := parseToolMetadata(tool.Name, tool.Meta)
	if err != nil {
		t.Fatalf("parse %s metadata: %v", tool.Name, err)
	}
	if metadata == nil {
		t.Fatalf("expected %s metadata", tool.Name)
	}
	return *metadata
}

func assertToolScalarMetadata(t *testing.T, tool *sdkmcp.Tool, metadata tools.Metadata, expectation toolMetadataExpectation) {
	t.Helper()

	if expectation.access != "" && metadata.AccessType != expectation.access {
		t.Fatalf("expected %s access type %q, got %q", tool.Name, expectation.access, metadata.AccessType)
	}
	assertOptionalBoolMetadata(t, tool.Name, "requiresLLM", metadata.RequiresLLM, expectation.requiresLLM)
	assertOptionalBoolMetadata(t, tool.Name, "startsRun", metadata.StartsRun, expectation.startsRun)
	if expectation.omitStartsRun {
		assertToolMetaFieldOmitted(t, tool, "startsRun")
	}
	if expectation.defaultTargetSingletonSection != "" && metadata.DefaultTargetSingletonSection != expectation.defaultTargetSingletonSection {
		t.Fatalf("expected %s singleton target %q, got %q", tool.Name, expectation.defaultTargetSingletonSection, metadata.DefaultTargetSingletonSection)
	}
	if expectation.resultFilter != "" && metadata.ResultFilter != expectation.resultFilter {
		t.Fatalf("expected %s result filter %q, got %q", tool.Name, expectation.resultFilter, metadata.ResultFilter)
	}
}

func assertToolIDPathMetadata(t *testing.T, metadata tools.Metadata, expectation toolMetadataExpectation) {
	t.Helper()

	if expectation.expectNoIDPaths {
		assertIDPathsByType(t, expectation.name, metadata.IDPathsByType, map[tools.IDType][]string{})
	}
	if expectation.idPaths != nil {
		assertIDPathsByType(t, expectation.name, metadata.IDPathsByType, expectation.idPaths)
	}
	if expectation.resultIDPaths != nil {
		assertIDPathsByType(t, expectation.name, metadata.ResultIDPathsByType, expectation.resultIDPaths)
	}
}

func assertToolPreviewMetadata(t *testing.T, metadata tools.Metadata, expectation toolMetadataExpectation) {
	t.Helper()

	if expectation.preview == nil {
		return
	}
	if metadata.ToolArgumentPreview == nil {
		t.Fatalf("expected %s preview metadata", expectation.name)
	}
	assertIDPathsByType(t, expectation.name, metadata.ToolArgumentPreview.TargetIDPathsByType, expectation.preview.targetIDPaths)
	if metadata.ToolArgumentPreview.PreviewValuePath != expectation.preview.valuePath {
		t.Fatalf("expected %s preview path %q, got %q", expectation.name, expectation.preview.valuePath, metadata.ToolArgumentPreview.PreviewValuePath)
	}
	if metadata.ToolArgumentPreview.PreviewKind != expectation.preview.kind {
		t.Fatalf("expected %s preview kind %q, got %q", expectation.name, expectation.preview.kind, metadata.ToolArgumentPreview.PreviewKind)
	}
}

func assertIDPathsByType(t *testing.T, toolName string, actual map[tools.IDType][]string, expected map[tools.IDType][]string) {
	t.Helper()

	if len(actual) != len(expected) {
		t.Fatalf("expected %s id paths %#v, got %#v", toolName, expected, actual)
	}
	for idType, expectedPaths := range expected {
		actualPaths, ok := actual[idType]
		if !ok {
			t.Fatalf("expected %s %s id paths %#v, got %#v", toolName, idType, expectedPaths, actual)
		}
		if !slices.Equal(actualPaths, expectedPaths) {
			t.Fatalf("expected %s %s id paths %#v, got %#v", toolName, idType, expectedPaths, actualPaths)
		}
	}
}

func assertOptionalBoolMetadata(t *testing.T, toolName string, field string, actual bool, expected *bool) {
	t.Helper()

	if expected == nil {
		return
	}
	if actual != *expected {
		t.Fatalf("expected %s %s metadata %v, got %v", toolName, field, *expected, actual)
	}
}

func assertToolMetaFieldOmitted(t *testing.T, tool *sdkmcp.Tool, field string) {
	t.Helper()

	meta := mustStructuredMap(t, tool.Meta[toolMetaNamespace])
	if _, ok := meta[field]; ok {
		t.Fatalf("expected %s to omit %s, got %#v", tool.Name, field, meta[field])
	}
}

func assertToolInputSchemaOmitsProperties(t *testing.T, tool *sdkmcp.Tool, hiddenFields []string) {
	t.Helper()

	inputSchema := mustStructuredMap(t, tool.InputSchema)
	properties := mustStructuredMap(t, inputSchema["properties"])
	for _, hiddenField := range hiddenFields {
		if _, ok := properties[hiddenField]; ok {
			t.Fatalf("did not expect hidden %s field %q in MCP schema", tool.Name, hiddenField)
		}
	}
}

func mustCallTool(t *testing.T, clientSession *sdkmcp.ClientSession, name string, arguments map[string]any) *sdkmcp.CallToolResult {
	t.Helper()

	params := &sdkmcp.CallToolParams{Name: name}
	if arguments != nil {
		params.Arguments = arguments
	}
	result, err := clientSession.CallTool(context.Background(), params)
	if err != nil {
		t.Fatalf("call %s: %v", name, err)
	}
	return result
}

func mustSuccessfulToolResult(t *testing.T, result *sdkmcp.CallToolResult) *sdkmcp.CallToolResult {
	t.Helper()

	if result.IsError {
		t.Fatalf("expected tool success, got %#v", result.StructuredContent)
	}
	return result
}

func mustErrorToolResult(t *testing.T, result *sdkmcp.CallToolResult) map[string]any {
	t.Helper()

	if !result.IsError {
		t.Fatal("expected structured tool error")
	}
	return mustStructuredMap(t, result.StructuredContent)
}

func assertStructuredFields(t *testing.T, payload map[string]any, expected map[string]any) {
	t.Helper()

	for field, expectedValue := range expected {
		if payload[field] != expectedValue {
			t.Fatalf("expected %s field %#v, got %#v", field, expectedValue, payload[field])
		}
	}
}
