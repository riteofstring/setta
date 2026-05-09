package mcpx

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"testing"
	"time"

	"setta/internal/tools"
)

func TestReadFileRangeHandlerMirrorsPythonBehavior(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	sourcePath := filepath.Join(workspaceRoot, "example.txt")
	if err := os.WriteFile(sourcePath, []byte("alpha\nbeta\ngamma\n"), 0o644); err != nil {
		t.Fatalf("write source file: %v", err)
	}

	handler := newReadFileRangeHandler(workspaceRoot)

	t.Run("reads entire file when range unspecified", func(t *testing.T) {
		result := mustReadFileRangeResult(t, handler, map[string]any{
			"path": "example.txt",
		})

		if result.Path != "example.txt" {
			t.Fatalf("expected relative path example.txt, got %q", result.Path)
		}
		if result.AbsolutePath != sourcePath {
			t.Fatalf("expected absolute path %q, got %q", sourcePath, result.AbsolutePath)
		}
		if result.StartLine != 1 {
			t.Fatalf("expected start line 1, got %d", result.StartLine)
		}
		if result.EndLine != 3 {
			t.Fatalf("expected end line 3, got %d", result.EndLine)
		}
		if result.Content != "alpha\nbeta\ngamma" {
			t.Fatalf("unexpected file content %q", result.Content)
		}
	})

	t.Run("reads specified range", func(t *testing.T) {
		result := mustReadFileRangeResult(t, handler, map[string]any{
			"path":       "example.txt",
			"start_line": 2,
			"end_line":   3,
		})

		if result.StartLine != 2 {
			t.Fatalf("expected start line 2, got %d", result.StartLine)
		}
		if result.EndLine != 3 {
			t.Fatalf("expected end line 3, got %d", result.EndLine)
		}
		if result.Content != "beta\ngamma" {
			t.Fatalf("unexpected ranged content %q", result.Content)
		}
	})

	t.Run("handles start beyond end of file", func(t *testing.T) {
		result := mustReadFileRangeResult(t, handler, map[string]any{
			"path":       "example.txt",
			"start_line": 10,
		})

		if result.StartLine != 10 {
			t.Fatalf("expected start line 10, got %d", result.StartLine)
		}
		if result.EndLine != 9 {
			t.Fatalf("expected realized end line 9, got %d", result.EndLine)
		}
		if result.Content != "" {
			t.Fatalf("expected empty content, got %q", result.Content)
		}
	})

	t.Run("missing file returns structured tool error", func(t *testing.T) {
		err := mustToolError(t, handler, map[string]any{
			"path": "missing.txt",
		})

		if err.code != "file_not_found" {
			t.Fatalf("expected file_not_found, got %q", err.code)
		}
	})

	t.Run("rejects non utf8 files", func(t *testing.T) {
		binaryPath := filepath.Join(workspaceRoot, "binary.dat")
		if err := os.WriteFile(binaryPath, []byte{0xff, 0xfe, 0xfa}, 0o644); err != nil {
			t.Fatalf("write binary file: %v", err)
		}

		err := mustToolError(t, handler, map[string]any{
			"path": "binary.dat",
		})

		if err.code != "invalid_arguments" {
			t.Fatalf("expected invalid_arguments, got %q", err.code)
		}
	})

	t.Run("rejects path escapes outside workspace", func(t *testing.T) {
		err := mustToolError(t, handler, map[string]any{
			"path": "../outside.txt",
		})

		if err.code != "invalid_arguments" {
			t.Fatalf("expected invalid_arguments, got %q", err.code)
		}
	})

	t.Run("rejects absolute paths outside workspace", func(t *testing.T) {
		outsideRoot := t.TempDir()
		outsidePath := filepath.Join(outsideRoot, "outside.txt")
		if err := os.WriteFile(outsidePath, []byte("nope"), 0o644); err != nil {
			t.Fatalf("write outside file: %v", err)
		}

		err := mustToolError(t, handler, map[string]any{
			"path": outsidePath,
		})

		if err.code != "invalid_arguments" {
			t.Fatalf("expected invalid_arguments, got %q", err.code)
		}
	})
}

func TestServerListsToolsAndScopesToolCalls(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	if err := os.WriteFile(filepath.Join(workspaceRoot, "example.txt"), []byte("alpha\nbeta\ngamma\n"), 0o644); err != nil {
		t.Fatalf("write source file: %v", err)
	}

	projectRuntime := openScopedTestProjectRuntime(t)
	server, clientSession := newScopedTestServerSession(t, workspaceRoot, projectRuntime)
	defer clientSession.Close()

	toolsResult, err := clientSession.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatalf("list tools: %v", err)
	}
	if len(toolsResult.Tools) != 74 {
		t.Fatalf("expected 74 tools, got %d", len(toolsResult.Tools))
	}

	names := make([]string, 0, len(toolsResult.Tools))
	var createChildSectionsTool *sdkmcp.Tool
	var createChildSectionsViaIncrementerTool *sdkmcp.Tool
	var createNewSectionVariantTool *sdkmcp.Tool
	var deleteChildSectionsViaDecrementerTool *sdkmcp.Tool
	var deleteSectionsTool *sdkmcp.Tool
	var createTopLevelSectionTool *sdkmcp.Tool
	var setCallableTool *sdkmcp.Tool
	var setCodeSectionAttachedTerminalTool *sdkmcp.Tool
	var setCodeTool *sdkmcp.Tool
	var formatCodeTool *sdkmcp.Tool
	var setDefaultSectionVariantTool *sdkmcp.Tool
	var setGroupOverflowModeTool *sdkmcp.Tool
	var setSectionSizesTool *sdkmcp.Tool
	var autoLayoutTopLevelSectionsTool *sdkmcp.Tool
	var setShowParamDisplayNamesTool *sdkmcp.Tool
	var getInstalledPythonPackagesTool *sdkmcp.Tool
	var listAgentProfilesTool *sdkmcp.Tool
	var getAgentProfileTool *sdkmcp.Tool
	var runAgentProfileTool *sdkmcp.Tool
	var reportStateMachineSignalTool *sdkmcp.Tool
	var installPluginTool *sdkmcp.Tool
	var uninstallPluginTool *sdkmcp.Tool
	var rescanPluginsTool *sdkmcp.Tool
	var updatePluginTool *sdkmcp.Tool
	var rollbackPluginTool *sdkmcp.Tool
	var getAppCatalogTool *sdkmcp.Tool
	var listAppComponentsTool *sdkmcp.Tool
	var getAppDefinitionTool *sdkmcp.Tool
	var validateAppDefinitionTool *sdkmcp.Tool
	var setAppDefinitionTool *sdkmcp.Tool
	var streamAppDefinitionTool *sdkmcp.Tool
	var updateAppDefinitionTool *sdkmcp.Tool
	var compareAndSetShowParamDisplayNamesTool *sdkmcp.Tool
	var setProjectConfigCodegenTargetsTool *sdkmcp.Tool
	var setGenCodePrefixTool *sdkmcp.Tool
	var setGenCodeSuffixTool *sdkmcp.Tool
	var togglePositionLocksTool *sdkmcp.Tool
	var toggleGroupOrientationTool *sdkmcp.Tool
	var toggleMinimizedTool *sdkmcp.Tool
	var setTopLevelSectionLayoutTool *sdkmcp.Tool
	var addKwargTool *sdkmcp.Tool
	var deleteKwargTool *sdkmcp.Tool
	var changeParamImplTool *sdkmcp.Tool
	var updateParamImplConfigTool *sdkmcp.Tool
	var deleteSelectedParamsTool *sdkmcp.Tool
	var summaryTool *sdkmcp.Tool
	var diagnosticsTool *sdkmcp.Tool
	var muteTool *sdkmcp.Tool
	var setSectionNameTool *sdkmcp.Tool
	var setSectionTagColorTool *sdkmcp.Tool
	var setSectionStyleColorTool *sdkmcp.Tool
	var setSectionParamFilterTool *sdkmcp.Tool
	var setMetaControlShowSectionTitleTool *sdkmcp.Tool
	var setSectionVariantTool *sdkmcp.Tool
	var setSectionVariantSortOrderTool *sdkmcp.Tool
	var setParamTool *sdkmcp.Tool
	var setParamNameAndValueTool *sdkmcp.Tool
	var setTypeErrorIgnoreTool *sdkmcp.Tool
	var setCodeObjNameTool *sdkmcp.Tool
	var setCodeObjDisplayNameTool *sdkmcp.Tool
	var suppressionTool *sdkmcp.Tool
	for _, tool := range toolsResult.Tools {
		names = append(names, tool.Name)
		if tool.Name == "create_child_sections" {
			createChildSectionsTool = tool
		}
		if tool.Name == "create_child_sections_via_incrementer" {
			createChildSectionsViaIncrementerTool = tool
		}
		if tool.Name == "create_new_section_variant" {
			createNewSectionVariantTool = tool
		}
		if tool.Name == "delete_child_sections_via_decrementer" {
			deleteChildSectionsViaDecrementerTool = tool
		}
		if tool.Name == "delete_sections" {
			deleteSectionsTool = tool
		}
		if tool.Name == "create_top_level_section" {
			createTopLevelSectionTool = tool
		}
		if tool.Name == "set_callable" {
			setCallableTool = tool
		}
		if tool.Name == "set_code_section_attached_terminal" {
			setCodeSectionAttachedTerminalTool = tool
		}
		if tool.Name == "set_code" {
			setCodeTool = tool
		}
		if tool.Name == "format_code" {
			formatCodeTool = tool
		}
		if tool.Name == "set_default_section_variant" {
			setDefaultSectionVariantTool = tool
		}
		if tool.Name == "set_group_overflow_mode" {
			setGroupOverflowModeTool = tool
		}
		if tool.Name == "set_section_sizes" {
			setSectionSizesTool = tool
		}
		if tool.Name == "auto_layout_top_level_sections" {
			autoLayoutTopLevelSectionsTool = tool
		}
		if tool.Name == "set_show_param_display_names" {
			setShowParamDisplayNamesTool = tool
		}
		if tool.Name == "getInstalledPythonPackages" {
			getInstalledPythonPackagesTool = tool
		}
		if tool.Name == "list_agent_profiles" {
			listAgentProfilesTool = tool
		}
		if tool.Name == "get_agent_profile" {
			getAgentProfileTool = tool
		}
		if tool.Name == "run_agent_profile" {
			runAgentProfileTool = tool
		}
		if tool.Name == "report_state_machine_signal" {
			reportStateMachineSignalTool = tool
		}
		if tool.Name == "install_plugin" {
			installPluginTool = tool
		}
		if tool.Name == "uninstall_plugin" {
			uninstallPluginTool = tool
		}
		if tool.Name == "rescan_plugins" {
			rescanPluginsTool = tool
		}
		if tool.Name == "update_plugin" {
			updatePluginTool = tool
		}
		if tool.Name == "rollback_plugin" {
			rollbackPluginTool = tool
		}
		if tool.Name == "get_app_catalog" {
			getAppCatalogTool = tool
		}
		if tool.Name == "list_app_components" {
			listAppComponentsTool = tool
		}
		if tool.Name == "get_app_definition" {
			getAppDefinitionTool = tool
		}
		if tool.Name == "validate_app_definition" {
			validateAppDefinitionTool = tool
		}
		if tool.Name == "set_app_definition" {
			setAppDefinitionTool = tool
		}
		if tool.Name == "stream_app_definition" {
			streamAppDefinitionTool = tool
		}
		if tool.Name == "update_app_definition" {
			updateAppDefinitionTool = tool
		}
		if tool.Name == "compare_and_set_show_param_display_names" {
			compareAndSetShowParamDisplayNamesTool = tool
		}
		if tool.Name == "set_project_config_codegen_targets" {
			setProjectConfigCodegenTargetsTool = tool
		}
		if tool.Name == "set_gen_code_prefix" {
			setGenCodePrefixTool = tool
		}
		if tool.Name == "set_gen_code_suffix" {
			setGenCodeSuffixTool = tool
		}
		if tool.Name == "toggle_position_locks" {
			togglePositionLocksTool = tool
		}
		if tool.Name == "toggle_group_orientation" {
			toggleGroupOrientationTool = tool
		}
		if tool.Name == "toggle_minimized" {
			toggleMinimizedTool = tool
		}
		if tool.Name == "set_top_level_section_layout" {
			setTopLevelSectionLayoutTool = tool
		}
		if tool.Name == "add_kwarg" {
			addKwargTool = tool
		}
		if tool.Name == "delete_kwarg" {
			deleteKwargTool = tool
		}
		if tool.Name == "change_param_impl" {
			changeParamImplTool = tool
		}
		if tool.Name == "update_param_impl_config" {
			updateParamImplConfigTool = tool
		}
		if tool.Name == "delete_selected_params" {
			deleteSelectedParamsTool = tool
		}
		if tool.Name == "get_latest_project_state_summary" {
			summaryTool = tool
		}
		if tool.Name == "get_latest_lsp_diagnostics" {
			diagnosticsTool = tool
		}
		if tool.Name == "set_code_section_diagnostics_mute" {
			muteTool = tool
		}
		if tool.Name == "set_section_name" {
			setSectionNameTool = tool
		}
		if tool.Name == "set_section_tag_color" {
			setSectionTagColorTool = tool
		}
		if tool.Name == "set_section_style_color" {
			setSectionStyleColorTool = tool
		}
		if tool.Name == "set_section_param_filter" {
			setSectionParamFilterTool = tool
		}
		if tool.Name == "set_meta_control_show_section_title" {
			setMetaControlShowSectionTitleTool = tool
		}
		if tool.Name == "set_section_variant" {
			setSectionVariantTool = tool
		}
		if tool.Name == "set_section_variant_sort_order" {
			setSectionVariantSortOrderTool = tool
		}
		if tool.Name == "set_param_entered_value" {
			setParamTool = tool
		}
		if tool.Name == "set_param_name_and_value" {
			setParamNameAndValueTool = tool
		}
		if tool.Name == "set_type_error_ignore" {
			setTypeErrorIgnoreTool = tool
		}
		if tool.Name == "set_code_obj_name" {
			setCodeObjNameTool = tool
		}
		if tool.Name == "set_code_obj_display_name" {
			setCodeObjDisplayNameTool = tool
		}
		if tool.Name == "set_code_section_diagnostic_code_suppression" {
			suppressionTool = tool
		}
	}
	sort.Strings(names)
	expectedNames := []string{
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
	for index, name := range expectedNames {
		if names[index] != name {
			t.Fatalf("unexpected tool names %#v", names)
		}
	}

	if createChildSectionsTool == nil {
		t.Fatal("expected create_child_sections tool")
	}
	if createChildSectionsViaIncrementerTool == nil {
		t.Fatal("expected create_child_sections_via_incrementer tool")
	}
	if createNewSectionVariantTool == nil {
		t.Fatal("expected create_new_section_variant tool")
	}
	if deleteChildSectionsViaDecrementerTool == nil {
		t.Fatal("expected delete_child_sections_via_decrementer tool")
	}
	if deleteSectionsTool == nil {
		t.Fatal("expected delete_sections tool")
	}
	if createTopLevelSectionTool == nil {
		t.Fatal("expected create_top_level_section tool")
	}
	if setCallableTool == nil {
		t.Fatal("expected set_callable tool")
	}
	if setCodeSectionAttachedTerminalTool == nil {
		t.Fatal("expected set_code_section_attached_terminal tool")
	}
	if setCodeTool == nil {
		t.Fatal("expected set_code tool")
	}
	if formatCodeTool == nil {
		t.Fatal("expected format_code tool")
	}
	if setDefaultSectionVariantTool == nil {
		t.Fatal("expected set_default_section_variant tool")
	}
	if setGroupOverflowModeTool == nil {
		t.Fatal("expected set_group_overflow_mode tool")
	}
	if setSectionSizesTool == nil {
		t.Fatal("expected set_section_sizes tool")
	}
	if autoLayoutTopLevelSectionsTool == nil {
		t.Fatal("expected auto_layout_top_level_sections tool")
	}
	if setShowParamDisplayNamesTool == nil {
		t.Fatal("expected set_show_param_display_names tool")
	}
	if getInstalledPythonPackagesTool == nil {
		t.Fatal("expected getInstalledPythonPackages tool")
	}
	if listAgentProfilesTool == nil {
		t.Fatal("expected list_agent_profiles tool")
	}
	if getAgentProfileTool == nil {
		t.Fatal("expected get_agent_profile tool")
	}
	if runAgentProfileTool == nil {
		t.Fatal("expected run_agent_profile tool")
	}
	if reportStateMachineSignalTool == nil {
		t.Fatal("expected report_state_machine_signal tool")
	}
	if installPluginTool == nil {
		t.Fatal("expected install_plugin tool")
	}
	if uninstallPluginTool == nil {
		t.Fatal("expected uninstall_plugin tool")
	}
	if rescanPluginsTool == nil {
		t.Fatal("expected rescan_plugins tool")
	}
	if updatePluginTool == nil {
		t.Fatal("expected update_plugin tool")
	}
	if rollbackPluginTool == nil {
		t.Fatal("expected rollback_plugin tool")
	}
	if getAppCatalogTool == nil {
		t.Fatal("expected get_app_catalog tool")
	}
	if listAppComponentsTool == nil {
		t.Fatal("expected list_app_components tool")
	}
	if getAppDefinitionTool == nil {
		t.Fatal("expected get_app_definition tool")
	}
	if validateAppDefinitionTool == nil {
		t.Fatal("expected validate_app_definition tool")
	}
	if setAppDefinitionTool == nil {
		t.Fatal("expected set_app_definition tool")
	}
	if streamAppDefinitionTool == nil {
		t.Fatal("expected stream_app_definition tool")
	}
	if updateAppDefinitionTool == nil {
		t.Fatal("expected update_app_definition tool")
	}
	if compareAndSetShowParamDisplayNamesTool == nil {
		t.Fatal("expected compare_and_set_show_param_display_names tool")
	}
	if setProjectConfigCodegenTargetsTool == nil {
		t.Fatal("expected set_project_config_codegen_targets tool")
	}
	if setGenCodePrefixTool == nil {
		t.Fatal("expected set_gen_code_prefix tool")
	}
	if setGenCodeSuffixTool == nil {
		t.Fatal("expected set_gen_code_suffix tool")
	}
	if togglePositionLocksTool == nil {
		t.Fatal("expected toggle_position_locks tool")
	}
	if toggleGroupOrientationTool == nil {
		t.Fatal("expected toggle_group_orientation tool")
	}
	if toggleMinimizedTool == nil {
		t.Fatal("expected toggle_minimized tool")
	}
	if setTopLevelSectionLayoutTool == nil {
		t.Fatal("expected set_top_level_section_layout tool")
	}
	if addKwargTool == nil {
		t.Fatal("expected add_kwarg tool")
	}
	if deleteKwargTool == nil {
		t.Fatal("expected delete_kwarg tool")
	}
	if changeParamImplTool == nil {
		t.Fatal("expected change_param_impl tool")
	}
	if updateParamImplConfigTool == nil {
		t.Fatal("expected update_param_impl_config tool")
	}
	if deleteSelectedParamsTool == nil {
		t.Fatal("expected delete_selected_params tool")
	}
	createChildMeta := mustStructuredMap(t, createChildSectionsTool.Meta[toolMetaNamespace])
	if createChildMeta["accessType"] != string(tools.AccessTypeStructural) {
		t.Fatalf("expected structural access type for create_child_sections, got %#v", createChildMeta["accessType"])
	}
	createChildPaths := mustStructuredMap(t, createChildMeta["idPathsByType"])
	if got := mustStringList(t, createChildPaths[string(tools.IDTypeSection)]); len(got) != 1 || got[0] != "parentId" {
		t.Fatalf("expected create_child_sections parentId target path, got %#v", got)
	}
	createChildResultPaths := mustStructuredMap(t, createChildMeta["resultIdPathsByType"])
	if got := mustStringList(t, createChildResultPaths[string(tools.IDTypeSection)]); len(got) != 1 || got[0] != "sectionIds" {
		t.Fatalf("expected create_child_sections sectionIds result path, got %#v", got)
	}
	createChildViaIncrementerMeta := mustStructuredMap(t, createChildSectionsViaIncrementerTool.Meta[toolMetaNamespace])
	if createChildViaIncrementerMeta["accessType"] != string(tools.AccessTypeStructural) {
		t.Fatalf("expected structural access type for create_child_sections_via_incrementer, got %#v", createChildViaIncrementerMeta["accessType"])
	}
	createChildViaIncrementerPaths := mustStructuredMap(t, createChildViaIncrementerMeta["idPathsByType"])
	if got := mustStringList(t, createChildViaIncrementerPaths[string(tools.IDTypeSection)]); len(got) != 1 || got[0] != "calledBy" {
		t.Fatalf("expected create_child_sections_via_incrementer calledBy target path, got %#v", got)
	}
	createChildViaIncrementerResultPaths := mustStructuredMap(t, createChildViaIncrementerMeta["resultIdPathsByType"])
	if got := mustStringList(t, createChildViaIncrementerResultPaths[string(tools.IDTypeSection)]); len(got) != 1 || got[0] != "sectionIds" {
		t.Fatalf("expected create_child_sections_via_incrementer sectionIds result path, got %#v", got)
	}
	createNewVariantMeta := mustStructuredMap(t, createNewSectionVariantTool.Meta[toolMetaNamespace])
	if createNewVariantMeta["accessType"] != string(tools.AccessTypeStructural) {
		t.Fatalf("expected structural access type for create_new_section_variant, got %#v", createNewVariantMeta["accessType"])
	}
	createNewVariantPaths := mustStructuredMap(t, createNewVariantMeta["idPathsByType"])
	if got := mustStringList(t, createNewVariantPaths[string(tools.IDTypeSection)]); len(got) != 1 || got[0] != "sectionId" {
		t.Fatalf("expected create_new_section_variant sectionId target path, got %#v", got)
	}
	createNewVariantResultPaths := mustStructuredMap(t, createNewVariantMeta["resultIdPathsByType"])
	if got := mustStringList(t, createNewVariantResultPaths[string(tools.IDTypeSectionVariant)]); len(got) != 1 || got[0] != "variantId" {
		t.Fatalf("expected create_new_section_variant variantId result path, got %#v", got)
	}
	setSectionVariantMeta := mustStructuredMap(t, setSectionVariantTool.Meta[toolMetaNamespace])
	if setSectionVariantMeta["accessType"] != string(tools.AccessTypeWrite) {
		t.Fatalf("expected write access type for set_section_variant, got %#v", setSectionVariantMeta["accessType"])
	}
	setSectionVariantPaths := mustStructuredMap(t, setSectionVariantMeta["idPathsByType"])
	if got := mustStringList(t, setSectionVariantPaths[string(tools.IDTypeSection)]); len(got) != 1 || got[0] != "sectionId" {
		t.Fatalf("expected set_section_variant sectionId target path, got %#v", got)
	}
	if got := mustStringList(t, setSectionVariantPaths[string(tools.IDTypeSectionVariant)]); len(got) != 1 || got[0] != "variantId" {
		t.Fatalf("expected set_section_variant variantId target path, got %#v", got)
	}
	setDefaultSectionVariantMeta := mustStructuredMap(t, setDefaultSectionVariantTool.Meta[toolMetaNamespace])
	if setDefaultSectionVariantMeta["accessType"] != string(tools.AccessTypeWrite) {
		t.Fatalf("expected write access type for set_default_section_variant, got %#v", setDefaultSectionVariantMeta["accessType"])
	}
	setDefaultSectionVariantPaths := mustStructuredMap(t, setDefaultSectionVariantMeta["idPathsByType"])
	if got := mustStringList(t, setDefaultSectionVariantPaths[string(tools.IDTypeSection)]); len(got) != 1 || got[0] != "sectionId" {
		t.Fatalf("expected set_default_section_variant sectionId target path, got %#v", got)
	}
	if got := mustStringList(t, setDefaultSectionVariantPaths[string(tools.IDTypeSectionVariant)]); len(got) != 1 || got[0] != "variantId" {
		t.Fatalf("expected set_default_section_variant variantId target path, got %#v", got)
	}
	setSectionVariantSortOrderMeta := mustStructuredMap(t, setSectionVariantSortOrderTool.Meta[toolMetaNamespace])
	if setSectionVariantSortOrderMeta["accessType"] != string(tools.AccessTypeWrite) {
		t.Fatalf("expected write access type for set_section_variant_sort_order, got %#v", setSectionVariantSortOrderMeta["accessType"])
	}
	setSectionVariantSortOrderPaths := mustStructuredMap(t, setSectionVariantSortOrderMeta["idPathsByType"])
	if got := mustStringList(t, setSectionVariantSortOrderPaths[string(tools.IDTypeSection)]); len(got) != 1 || got[0] != "sectionId" {
		t.Fatalf("expected set_section_variant_sort_order sectionId target path, got %#v", got)
	}
	if got := mustStringList(t, setSectionVariantSortOrderPaths[string(tools.IDTypeSectionVariant)]); len(got) != 1 || got[0] != "orderedVariantIds" {
		t.Fatalf("expected set_section_variant_sort_order orderedVariantIds target path, got %#v", got)
	}
	deleteChildViaDecrementerMeta := mustStructuredMap(t, deleteChildSectionsViaDecrementerTool.Meta[toolMetaNamespace])
	if deleteChildViaDecrementerMeta["accessType"] != string(tools.AccessTypeStructural) {
		t.Fatalf("expected structural access type for delete_child_sections_via_decrementer, got %#v", deleteChildViaDecrementerMeta["accessType"])
	}
	deleteChildViaDecrementerPaths := mustStructuredMap(t, deleteChildViaDecrementerMeta["idPathsByType"])
	if got := mustStringList(t, deleteChildViaDecrementerPaths[string(tools.IDTypeSection)]); len(got) != 1 || got[0] != "calledBy" {
		t.Fatalf("expected delete_child_sections_via_decrementer calledBy target path, got %#v", got)
	}
	deleteChildViaDecrementerResultPaths := mustStructuredMap(t, deleteChildViaDecrementerMeta["resultIdPathsByType"])
	if got := mustStringList(t, deleteChildViaDecrementerResultPaths[string(tools.IDTypeSection)]); len(got) != 1 || got[0] != "sectionIds" {
		t.Fatalf("expected delete_child_sections_via_decrementer sectionIds result path, got %#v", got)
	}
	deleteMeta := mustStructuredMap(t, deleteSectionsTool.Meta[toolMetaNamespace])
	if deleteMeta["accessType"] != string(tools.AccessTypeStructural) {
		t.Fatalf("expected structural access type for delete_sections, got %#v", deleteMeta["accessType"])
	}
	deletePaths := mustStructuredMap(t, deleteMeta["idPathsByType"])
	if got := mustStringList(t, deletePaths[string(tools.IDTypeSection)]); len(got) != 1 || got[0] != "sectionIds" {
		t.Fatalf("expected delete_sections sectionIds target path, got %#v", got)
	}
	deleteResultPaths := mustStructuredMap(t, deleteMeta["resultIdPathsByType"])
	if got := mustStringList(t, deleteResultPaths[string(tools.IDTypeSection)]); len(got) != 1 || got[0] != "sectionIds" {
		t.Fatalf("expected delete_sections sectionIds result path, got %#v", got)
	}
	if summaryTool == nil {
		t.Fatal("expected get_latest_project_state_summary tool")
	}
	createMeta := mustStructuredMap(t, createTopLevelSectionTool.Meta[toolMetaNamespace])
	if createMeta["accessType"] != string(tools.AccessTypeStructural) {
		t.Fatalf("expected structural access type, got %#v", createMeta["accessType"])
	}
	createResultPaths := mustStructuredMap(t, createMeta["resultIdPathsByType"])
	if got := mustStringList(t, createResultPaths[string(tools.IDTypeSection)]); len(got) != 1 || got[0] != "sectionId" {
		t.Fatalf("expected create_top_level_section section result path, got %#v", got)
	}
	if got := mustStringList(t, createResultPaths[string(tools.IDTypeCodeObject)]); len(got) != 1 || got[0] != "metaControlParamId" {
		t.Fatalf("expected create_top_level_section metaControlParamId result path, got %#v", got)
	}
	createInputSchema := mustStructuredMap(t, createTopLevelSectionTool.InputSchema)
	createInputProperties := mustStructuredMap(t, createInputSchema["properties"])
	for _, hiddenField := range []string{"implOverrides", "topLevelSections", "viewportBounds"} {
		if _, ok := createInputProperties[hiddenField]; ok {
			t.Fatalf("did not expect hidden create_top_level_section field %q in MCP schema", hiddenField)
		}
	}
	setCallableMeta := mustStructuredMap(t, setCallableTool.Meta[toolMetaNamespace])
	if setCallableMeta["accessType"] != string(tools.AccessTypeWrite) {
		t.Fatalf("expected write access type for set_callable, got %#v", setCallableMeta["accessType"])
	}
	setCallablePaths := mustStructuredMap(t, setCallableMeta["idPathsByType"])
	if got := mustStringList(t, setCallablePaths[string(tools.IDTypeSection)]); len(got) != 1 || got[0] != "sectionId" {
		t.Fatalf("expected set_callable sectionId target path, got %#v", got)
	}
	setCallableResultPaths := mustStructuredMap(t, setCallableMeta["resultIdPathsByType"])
	if got := mustStringList(t, setCallableResultPaths[string(tools.IDTypeCodeObject)]); len(got) != 2 || got[0] != "callableId" || got[1] != "childCodeObjs.codeObjId" {
		t.Fatalf("expected set_callable code-object result paths, got %#v", got)
	}
	setCallablePreviewMeta := mustStructuredMap(t, setCallableMeta["toolArgumentPreview"])
	setCallablePreviewPaths := mustStructuredMap(t, setCallablePreviewMeta["targetIdPathsByType"])
	if got := mustStringList(t, setCallablePreviewPaths[string(tools.IDTypeSection)]); len(got) != 1 || got[0] != "sectionId" {
		t.Fatalf("expected set_callable preview section target path, got %#v", got)
	}
	if setCallablePreviewMeta["previewValuePath"] != "callableName" {
		t.Fatalf("expected set_callable preview value path callableName, got %#v", setCallablePreviewMeta["previewValuePath"])
	}
	if setCallablePreviewMeta["previewKind"] != string(tools.PreviewKindCallableName) {
		t.Fatalf("expected set_callable preview kind callableName, got %#v", setCallablePreviewMeta["previewKind"])
	}
	setCodeSectionAttachedTerminalMeta := mustStructuredMap(t, setCodeSectionAttachedTerminalTool.Meta[toolMetaNamespace])
	if setCodeSectionAttachedTerminalMeta["accessType"] != string(tools.AccessTypeStructural) {
		t.Fatalf("expected structural access type for set_code_section_attached_terminal, got %#v", setCodeSectionAttachedTerminalMeta["accessType"])
	}
	setCodeSectionAttachedTerminalPaths := mustStructuredMap(t, setCodeSectionAttachedTerminalMeta["idPathsByType"])
	if got := mustStringList(t, setCodeSectionAttachedTerminalPaths[string(tools.IDTypeSection)]); len(got) != 2 || got[0] != "sectionId" || got[1] != "terminalSectionId" {
		t.Fatalf("expected set_code_section_attached_terminal section target paths, got %#v", got)
	}
	setCodeMeta := mustStructuredMap(t, setCodeTool.Meta[toolMetaNamespace])
	if setCodeMeta["accessType"] != string(tools.AccessTypeWrite) {
		t.Fatalf("expected write access type for set_code, got %#v", setCodeMeta["accessType"])
	}
	setCodePaths := mustStructuredMap(t, setCodeMeta["idPathsByType"])
	if got := mustStringList(t, setCodePaths[string(tools.IDTypeSection)]); len(got) != 1 || got[0] != "sectionId" {
		t.Fatalf("expected set_code sectionId target path, got %#v", got)
	}
	setCodePreviewMeta := mustStructuredMap(t, setCodeMeta["toolArgumentPreview"])
	setCodePreviewPaths := mustStructuredMap(t, setCodePreviewMeta["targetIdPathsByType"])
	if got := mustStringList(t, setCodePreviewPaths[string(tools.IDTypeSection)]); len(got) != 1 || got[0] != "sectionId" {
		t.Fatalf("expected set_code preview section target path, got %#v", got)
	}
	if setCodePreviewMeta["previewValuePath"] != "code" {
		t.Fatalf("expected set_code preview value path code, got %#v", setCodePreviewMeta["previewValuePath"])
	}
	if setCodePreviewMeta["previewKind"] != string(tools.PreviewKindCode) {
		t.Fatalf("expected set_code preview kind code, got %#v", setCodePreviewMeta["previewKind"])
	}
	formatCodeMeta := mustStructuredMap(t, formatCodeTool.Meta[toolMetaNamespace])
	if formatCodeMeta["accessType"] != string(tools.AccessTypeWrite) {
		t.Fatalf("expected write access type for format_code, got %#v", formatCodeMeta["accessType"])
	}
	formatCodePaths := mustStructuredMap(t, formatCodeMeta["idPathsByType"])
	if got := mustStringList(t, formatCodePaths[string(tools.IDTypeSection)]); len(got) != 1 || got[0] != "sectionId" {
		t.Fatalf("expected format_code sectionId target path, got %#v", got)
	}
	setGroupOverflowModeMeta := mustStructuredMap(t, setGroupOverflowModeTool.Meta[toolMetaNamespace])
	if setGroupOverflowModeMeta["accessType"] != string(tools.AccessTypeStructural) {
		t.Fatalf("expected structural access type for set_group_overflow_mode, got %#v", setGroupOverflowModeMeta["accessType"])
	}
	setGroupOverflowModePaths := mustStructuredMap(t, setGroupOverflowModeMeta["idPathsByType"])
	if got := mustStringList(t, setGroupOverflowModePaths[string(tools.IDTypeSection)]); len(got) != 1 || got[0] != "sectionId" {
		t.Fatalf("expected set_group_overflow_mode sectionId target path, got %#v", got)
	}
	setSectionSizesMeta := mustStructuredMap(t, setSectionSizesTool.Meta[toolMetaNamespace])
	if setSectionSizesMeta["accessType"] != string(tools.AccessTypeStructural) {
		t.Fatalf("expected structural access type for set_section_sizes, got %#v", setSectionSizesMeta["accessType"])
	}
	setSectionSizesPaths := mustStructuredMap(t, setSectionSizesMeta["idPathsByType"])
	if got := mustStringList(t, setSectionSizesPaths[string(tools.IDTypeSection)]); len(got) != 1 || got[0] != "sectionSizes" {
		t.Fatalf("expected set_section_sizes section target path, got %#v", got)
	}
	setSectionTagColorMeta := mustStructuredMap(t, setSectionTagColorTool.Meta[toolMetaNamespace])
	if setSectionTagColorMeta["accessType"] != string(tools.AccessTypeWrite) {
		t.Fatalf("expected write access type for set_section_tag_color, got %#v", setSectionTagColorMeta["accessType"])
	}
	setSectionTagColorPaths := mustStructuredMap(t, setSectionTagColorMeta["idPathsByType"])
	if got := mustStringList(t, setSectionTagColorPaths[string(tools.IDTypeSection)]); len(got) != 1 || got[0] != "sectionId" {
		t.Fatalf("expected set_section_tag_color sectionId target path, got %#v", got)
	}
	setSectionStyleColorMeta := mustStructuredMap(t, setSectionStyleColorTool.Meta[toolMetaNamespace])
	if setSectionStyleColorMeta["accessType"] != string(tools.AccessTypeWrite) {
		t.Fatalf("expected write access type for set_section_style_color, got %#v", setSectionStyleColorMeta["accessType"])
	}
	setSectionStyleColorPaths := mustStructuredMap(t, setSectionStyleColorMeta["idPathsByType"])
	if got := mustStringList(t, setSectionStyleColorPaths[string(tools.IDTypeSection)]); len(got) != 1 || got[0] != "sectionId" {
		t.Fatalf("expected set_section_style_color sectionId target path, got %#v", got)
	}
	setSectionParamFilterMeta := mustStructuredMap(t, setSectionParamFilterTool.Meta[toolMetaNamespace])
	if setSectionParamFilterMeta["accessType"] != string(tools.AccessTypeWrite) {
		t.Fatalf("expected write access type for set_section_param_filter, got %#v", setSectionParamFilterMeta["accessType"])
	}
	setSectionParamFilterPaths := mustStructuredMap(t, setSectionParamFilterMeta["idPathsByType"])
	if got := mustStringList(t, setSectionParamFilterPaths[string(tools.IDTypeSection)]); len(got) != 1 || got[0] != "sectionId" {
		t.Fatalf("expected set_section_param_filter sectionId target path, got %#v", got)
	}
	setMetaControlShowSectionTitleMeta := mustStructuredMap(t, setMetaControlShowSectionTitleTool.Meta[toolMetaNamespace])
	if setMetaControlShowSectionTitleMeta["accessType"] != string(tools.AccessTypeWrite) {
		t.Fatalf("expected write access type for set_meta_control_show_section_title, got %#v", setMetaControlShowSectionTitleMeta["accessType"])
	}
	setMetaControlShowSectionTitlePaths := mustStructuredMap(t, setMetaControlShowSectionTitleMeta["idPathsByType"])
	if got := mustStringList(t, setMetaControlShowSectionTitlePaths[string(tools.IDTypeSection)]); len(got) != 1 || got[0] != "sectionId" {
		t.Fatalf("expected set_meta_control_show_section_title sectionId target path, got %#v", got)
	}
	autoLayoutTopLevelSectionsMeta := mustStructuredMap(t, autoLayoutTopLevelSectionsTool.Meta[toolMetaNamespace])
	if autoLayoutTopLevelSectionsMeta["accessType"] != string(tools.AccessTypeStructural) {
		t.Fatalf("expected structural access type for auto_layout_top_level_sections, got %#v", autoLayoutTopLevelSectionsMeta["accessType"])
	}
	setShowParamDisplayNamesMeta := mustStructuredMap(t, setShowParamDisplayNamesTool.Meta[toolMetaNamespace])
	if setShowParamDisplayNamesMeta["accessType"] != string(tools.AccessTypeStructural) {
		t.Fatalf("expected structural access type for set_show_param_display_names, got %#v", setShowParamDisplayNamesMeta["accessType"])
	}
	getInstalledPythonPackagesMeta := mustStructuredMap(t, getInstalledPythonPackagesTool.Meta[toolMetaNamespace])
	if getInstalledPythonPackagesMeta["accessType"] != string(tools.AccessTypeRead) {
		t.Fatalf("expected read access type for getInstalledPythonPackages, got %#v", getInstalledPythonPackagesMeta["accessType"])
	}
	if paths, ok := getInstalledPythonPackagesMeta["idPathsByType"]; ok && len(mustStructuredMap(t, paths)) != 0 {
		t.Fatalf("expected getInstalledPythonPackages to have no id target paths, got %#v", paths)
	}
	listAgentProfilesMeta := mustStructuredMap(t, listAgentProfilesTool.Meta[toolMetaNamespace])
	if listAgentProfilesMeta["accessType"] != string(tools.AccessTypeRead) {
		t.Fatalf("expected read access type for list_agent_profiles, got %#v", listAgentProfilesMeta["accessType"])
	}
	if listAgentProfilesMeta["requiresLLM"] != true {
		t.Fatalf("expected list_agent_profiles requiresLLM metadata, got %#v", listAgentProfilesMeta["requiresLLM"])
	}
	if _, ok := listAgentProfilesMeta["startsRun"]; ok {
		t.Fatalf("expected list_agent_profiles to omit startsRun, got %#v", listAgentProfilesMeta["startsRun"])
	}
	if paths, ok := listAgentProfilesMeta["idPathsByType"]; ok && len(mustStructuredMap(t, paths)) != 0 {
		t.Fatalf("expected list_agent_profiles to have no id target paths, got %#v", paths)
	}
	getAgentProfileMeta := mustStructuredMap(t, getAgentProfileTool.Meta[toolMetaNamespace])
	if getAgentProfileMeta["accessType"] != string(tools.AccessTypeRead) {
		t.Fatalf("expected read access type for get_agent_profile, got %#v", getAgentProfileMeta["accessType"])
	}
	if getAgentProfileMeta["requiresLLM"] != true {
		t.Fatalf("expected get_agent_profile requiresLLM metadata, got %#v", getAgentProfileMeta["requiresLLM"])
	}
	if _, ok := getAgentProfileMeta["startsRun"]; ok {
		t.Fatalf("expected get_agent_profile to omit startsRun, got %#v", getAgentProfileMeta["startsRun"])
	}
	if paths, ok := getAgentProfileMeta["idPathsByType"]; ok && len(mustStructuredMap(t, paths)) != 0 {
		t.Fatalf("expected get_agent_profile to have no id target paths, got %#v", paths)
	}
	runAgentProfileMeta := mustStructuredMap(t, runAgentProfileTool.Meta[toolMetaNamespace])
	if runAgentProfileMeta["accessType"] != string(tools.AccessTypeStructural) {
		t.Fatalf("expected structural access type for run_agent_profile, got %#v", runAgentProfileMeta["accessType"])
	}
	if runAgentProfileMeta["requiresLLM"] != true {
		t.Fatalf("expected run_agent_profile requiresLLM metadata, got %#v", runAgentProfileMeta["requiresLLM"])
	}
	if runAgentProfileMeta["startsRun"] != true {
		t.Fatalf("expected run_agent_profile startsRun metadata, got %#v", runAgentProfileMeta["startsRun"])
	}
	if paths, ok := runAgentProfileMeta["idPathsByType"]; ok && len(mustStructuredMap(t, paths)) != 0 {
		t.Fatalf("expected run_agent_profile to have no id target paths, got %#v", paths)
	}
	reportStateMachineSignalMeta := mustStructuredMap(t, reportStateMachineSignalTool.Meta[toolMetaNamespace])
	if reportStateMachineSignalMeta["accessType"] != string(tools.AccessTypeStructural) {
		t.Fatalf("expected structural access type for report_state_machine_signal, got %#v", reportStateMachineSignalMeta["accessType"])
	}
	if paths, ok := reportStateMachineSignalMeta["idPathsByType"]; ok && len(mustStructuredMap(t, paths)) != 0 {
		t.Fatalf("expected report_state_machine_signal to have no id target paths, got %#v", paths)
	}
	installPluginMeta := mustStructuredMap(t, installPluginTool.Meta[toolMetaNamespace])
	if installPluginMeta["accessType"] != string(tools.AccessTypeStructural) {
		t.Fatalf("expected structural access type for install_plugin, got %#v", installPluginMeta["accessType"])
	}
	if paths, ok := installPluginMeta["idPathsByType"]; ok && len(mustStructuredMap(t, paths)) != 0 {
		t.Fatalf("expected install_plugin to have no id target paths, got %#v", paths)
	}
	uninstallPluginMeta := mustStructuredMap(t, uninstallPluginTool.Meta[toolMetaNamespace])
	if uninstallPluginMeta["accessType"] != string(tools.AccessTypeStructural) {
		t.Fatalf("expected structural access type for uninstall_plugin, got %#v", uninstallPluginMeta["accessType"])
	}
	if paths, ok := uninstallPluginMeta["idPathsByType"]; ok && len(mustStructuredMap(t, paths)) != 0 {
		t.Fatalf("expected uninstall_plugin to have no id target paths, got %#v", paths)
	}
	rescanPluginsMeta := mustStructuredMap(t, rescanPluginsTool.Meta[toolMetaNamespace])
	if rescanPluginsMeta["accessType"] != string(tools.AccessTypeStructural) {
		t.Fatalf("expected structural access type for rescan_plugins, got %#v", rescanPluginsMeta["accessType"])
	}
	if paths, ok := rescanPluginsMeta["idPathsByType"]; ok && len(mustStructuredMap(t, paths)) != 0 {
		t.Fatalf("expected rescan_plugins to have no id target paths, got %#v", paths)
	}
	updatePluginMeta := mustStructuredMap(t, updatePluginTool.Meta[toolMetaNamespace])
	if updatePluginMeta["accessType"] != string(tools.AccessTypeStructural) {
		t.Fatalf("expected structural access type for update_plugin, got %#v", updatePluginMeta["accessType"])
	}
	if paths, ok := updatePluginMeta["idPathsByType"]; ok && len(mustStructuredMap(t, paths)) != 0 {
		t.Fatalf("expected update_plugin to have no id target paths, got %#v", paths)
	}
	rollbackPluginMeta := mustStructuredMap(t, rollbackPluginTool.Meta[toolMetaNamespace])
	if rollbackPluginMeta["accessType"] != string(tools.AccessTypeStructural) {
		t.Fatalf("expected structural access type for rollback_plugin, got %#v", rollbackPluginMeta["accessType"])
	}
	if paths, ok := rollbackPluginMeta["idPathsByType"]; ok && len(mustStructuredMap(t, paths)) != 0 {
		t.Fatalf("expected rollback_plugin to have no id target paths, got %#v", paths)
	}
	getAppCatalogMeta := mustStructuredMap(t, getAppCatalogTool.Meta[toolMetaNamespace])
	if getAppCatalogMeta["accessType"] != string(tools.AccessTypeStructural) {
		t.Fatalf("expected structural access type for get_app_catalog, got %#v", getAppCatalogMeta["accessType"])
	}
	if paths, ok := getAppCatalogMeta["idPathsByType"]; ok && len(mustStructuredMap(t, paths)) != 0 {
		t.Fatalf("expected get_app_catalog to have no id target paths, got %#v", paths)
	}
	listAppComponentsMeta := mustStructuredMap(t, listAppComponentsTool.Meta[toolMetaNamespace])
	if listAppComponentsMeta["accessType"] != string(tools.AccessTypeStructural) {
		t.Fatalf("expected structural access type for list_app_components, got %#v", listAppComponentsMeta["accessType"])
	}
	if paths, ok := listAppComponentsMeta["idPathsByType"]; ok && len(mustStructuredMap(t, paths)) != 0 {
		t.Fatalf("expected list_app_components to have no id target paths, got %#v", paths)
	}
	getAppDefinitionMeta := mustStructuredMap(t, getAppDefinitionTool.Meta[toolMetaNamespace])
	if getAppDefinitionMeta["accessType"] != string(tools.AccessTypeStructural) {
		t.Fatalf("expected structural access type for get_app_definition, got %#v", getAppDefinitionMeta["accessType"])
	}
	validateAppDefinitionMeta := mustStructuredMap(t, validateAppDefinitionTool.Meta[toolMetaNamespace])
	if validateAppDefinitionMeta["accessType"] != string(tools.AccessTypeStructural) {
		t.Fatalf("expected structural access type for validate_app_definition, got %#v", validateAppDefinitionMeta["accessType"])
	}
	setAppDefinitionMeta := mustStructuredMap(t, setAppDefinitionTool.Meta[toolMetaNamespace])
	if setAppDefinitionMeta["accessType"] != string(tools.AccessTypeStructural) {
		t.Fatalf("expected structural access type for set_app_definition, got %#v", setAppDefinitionMeta["accessType"])
	}
	streamAppDefinitionMeta := mustStructuredMap(t, streamAppDefinitionTool.Meta[toolMetaNamespace])
	if streamAppDefinitionMeta["accessType"] != string(tools.AccessTypeStructural) {
		t.Fatalf("expected structural access type for stream_app_definition, got %#v", streamAppDefinitionMeta["accessType"])
	}
	streamAppDefinitionPreviewMeta := mustStructuredMap(t, streamAppDefinitionMeta["toolArgumentPreview"])
	if streamAppDefinitionPreviewMeta["previewValuePath"] != "patches" {
		t.Fatalf("expected stream_app_definition preview path patches, got %#v", streamAppDefinitionPreviewMeta["previewValuePath"])
	}
	if streamAppDefinitionPreviewMeta["previewKind"] != string(tools.PreviewKindAppSpecPatch) {
		t.Fatalf("expected stream_app_definition preview kind appSpecPatch, got %#v", streamAppDefinitionPreviewMeta["previewKind"])
	}
	if targetPaths, ok := streamAppDefinitionPreviewMeta["targetIdPathsByType"]; ok && len(mustStructuredMap(t, targetPaths)) != 0 {
		t.Fatalf("expected stream_app_definition preview to have no target id paths, got %#v", targetPaths)
	}
	updateAppDefinitionMeta := mustStructuredMap(t, updateAppDefinitionTool.Meta[toolMetaNamespace])
	if updateAppDefinitionMeta["accessType"] != string(tools.AccessTypeStructural) {
		t.Fatalf("expected structural access type for update_app_definition, got %#v", updateAppDefinitionMeta["accessType"])
	}
	compareAndSetShowParamDisplayNamesMeta := mustStructuredMap(t, compareAndSetShowParamDisplayNamesTool.Meta[toolMetaNamespace])
	if compareAndSetShowParamDisplayNamesMeta["accessType"] != string(tools.AccessTypeStructural) {
		t.Fatalf("expected structural access type for compare_and_set_show_param_display_names, got %#v", compareAndSetShowParamDisplayNamesMeta["accessType"])
	}
	setProjectConfigCodegenTargetsMeta := mustStructuredMap(t, setProjectConfigCodegenTargetsTool.Meta[toolMetaNamespace])
	if setProjectConfigCodegenTargetsMeta["accessType"] != string(tools.AccessTypeStructural) {
		t.Fatalf("expected structural access type for set_project_config_codegen_targets, got %#v", setProjectConfigCodegenTargetsMeta["accessType"])
	}
	setGenCodePrefixMeta := mustStructuredMap(t, setGenCodePrefixTool.Meta[toolMetaNamespace])
	if setGenCodePrefixMeta["accessType"] != string(tools.AccessTypeWrite) {
		t.Fatalf("expected write access type for set_gen_code_prefix, got %#v", setGenCodePrefixMeta["accessType"])
	}
	if setGenCodePrefixMeta["defaultTargetSingletonSection"] != "GenPythonCode" {
		t.Fatalf("expected GenPythonCode singleton target for set_gen_code_prefix, got %#v", setGenCodePrefixMeta["defaultTargetSingletonSection"])
	}
	setGenCodeSuffixMeta := mustStructuredMap(t, setGenCodeSuffixTool.Meta[toolMetaNamespace])
	if setGenCodeSuffixMeta["accessType"] != string(tools.AccessTypeWrite) {
		t.Fatalf("expected write access type for set_gen_code_suffix, got %#v", setGenCodeSuffixMeta["accessType"])
	}
	if setGenCodeSuffixMeta["defaultTargetSingletonSection"] != "GenPythonCode" {
		t.Fatalf("expected GenPythonCode singleton target for set_gen_code_suffix, got %#v", setGenCodeSuffixMeta["defaultTargetSingletonSection"])
	}
	togglePositionLocksMeta := mustStructuredMap(t, togglePositionLocksTool.Meta[toolMetaNamespace])
	if togglePositionLocksMeta["accessType"] != string(tools.AccessTypeStructural) {
		t.Fatalf("expected structural access type for toggle_position_locks, got %#v", togglePositionLocksMeta["accessType"])
	}
	togglePositionLocksPaths := mustStructuredMap(t, togglePositionLocksMeta["idPathsByType"])
	if got := mustStringList(t, togglePositionLocksPaths[string(tools.IDTypeSection)]); len(got) != 1 || got[0] != "sectionIds" {
		t.Fatalf("expected toggle_position_locks sectionIds target path, got %#v", got)
	}
	toggleGroupOrientationMeta := mustStructuredMap(t, toggleGroupOrientationTool.Meta[toolMetaNamespace])
	if toggleGroupOrientationMeta["accessType"] != string(tools.AccessTypeStructural) {
		t.Fatalf("expected structural access type for toggle_group_orientation, got %#v", toggleGroupOrientationMeta["accessType"])
	}
	toggleGroupOrientationPaths := mustStructuredMap(t, toggleGroupOrientationMeta["idPathsByType"])
	if got := mustStringList(t, toggleGroupOrientationPaths[string(tools.IDTypeSection)]); len(got) != 1 || got[0] != "sectionId" {
		t.Fatalf("expected toggle_group_orientation sectionId target path, got %#v", got)
	}
	toggleMinimizedMeta := mustStructuredMap(t, toggleMinimizedTool.Meta[toolMetaNamespace])
	if toggleMinimizedMeta["accessType"] != string(tools.AccessTypeStructural) {
		t.Fatalf("expected structural access type for toggle_minimized, got %#v", toggleMinimizedMeta["accessType"])
	}
	toggleMinimizedPaths := mustStructuredMap(t, toggleMinimizedMeta["idPathsByType"])
	if got := mustStringList(t, toggleMinimizedPaths[string(tools.IDTypeSection)]); len(got) != 1 || got[0] != "sectionId" {
		t.Fatalf("expected toggle_minimized sectionId target path, got %#v", got)
	}
	setTopLevelSectionLayoutMeta := mustStructuredMap(t, setTopLevelSectionLayoutTool.Meta[toolMetaNamespace])
	if setTopLevelSectionLayoutMeta["accessType"] != string(tools.AccessTypeWrite) {
		t.Fatalf("expected write access type for set_top_level_section_layout, got %#v", setTopLevelSectionLayoutMeta["accessType"])
	}
	setTopLevelSectionLayoutPaths := mustStructuredMap(t, setTopLevelSectionLayoutMeta["idPathsByType"])
	if got := mustStringList(t, setTopLevelSectionLayoutPaths[string(tools.IDTypeSection)]); len(got) != 1 || got[0] != "topLevelSections" {
		t.Fatalf("expected set_top_level_section_layout topLevelSections target path, got %#v", got)
	}
	addKwargMeta := mustStructuredMap(t, addKwargTool.Meta[toolMetaNamespace])
	if addKwargMeta["accessType"] != string(tools.AccessTypeWrite) {
		t.Fatalf("expected write access type for add_kwarg, got %#v", addKwargMeta["accessType"])
	}
	addKwargPaths := mustStructuredMap(t, addKwargMeta["idPathsByType"])
	if got := mustStringList(t, addKwargPaths[string(tools.IDTypeSection)]); len(got) != 1 || got[0] != "sectionId" {
		t.Fatalf("expected add_kwarg sectionId target path, got %#v", got)
	}
	addKwargResultPaths := mustStructuredMap(t, addKwargMeta["resultIdPathsByType"])
	if got := mustStringList(t, addKwargResultPaths[string(tools.IDTypeCodeObject)]); len(got) != 1 || got[0] != "codeObjId" {
		t.Fatalf("expected add_kwarg codeObjId result path, got %#v", got)
	}
	deleteKwargMeta := mustStructuredMap(t, deleteKwargTool.Meta[toolMetaNamespace])
	if deleteKwargMeta["accessType"] != string(tools.AccessTypeWrite) {
		t.Fatalf("expected write access type for delete_kwarg, got %#v", deleteKwargMeta["accessType"])
	}
	deleteKwargPaths := mustStructuredMap(t, deleteKwargMeta["idPathsByType"])
	if got := mustStringList(t, deleteKwargPaths[string(tools.IDTypeSection)]); len(got) != 1 || got[0] != "sectionId" {
		t.Fatalf("expected delete_kwarg sectionId target path, got %#v", got)
	}
	deleteKwargResultPaths := mustStructuredMap(t, deleteKwargMeta["resultIdPathsByType"])
	if got := mustStringList(t, deleteKwargResultPaths[string(tools.IDTypeCodeObject)]); len(got) != 1 || got[0] != "codeObjId" {
		t.Fatalf("expected delete_kwarg codeObjId result path, got %#v", got)
	}
	changeParamImplMeta := mustStructuredMap(t, changeParamImplTool.Meta[toolMetaNamespace])
	if changeParamImplMeta["accessType"] != string(tools.AccessTypeWrite) {
		t.Fatalf("expected write access type for change_param_impl, got %#v", changeParamImplMeta["accessType"])
	}
	changeParamImplPaths := mustStructuredMap(t, changeParamImplMeta["idPathsByType"])
	if got := mustStringList(t, changeParamImplPaths[string(tools.IDTypeSection)]); len(got) != 1 || got[0] != "sectionId" {
		t.Fatalf("expected change_param_impl sectionId target path, got %#v", got)
	}
	if got := mustStringList(t, changeParamImplPaths[string(tools.IDTypeCodeObject)]); len(got) != 1 || got[0] != "paramInfoId" {
		t.Fatalf("expected change_param_impl paramInfoId target path, got %#v", got)
	}
	updateParamImplConfigMeta := mustStructuredMap(t, updateParamImplConfigTool.Meta[toolMetaNamespace])
	if updateParamImplConfigMeta["accessType"] != string(tools.AccessTypeWrite) {
		t.Fatalf("expected write access type for update_param_impl_config, got %#v", updateParamImplConfigMeta["accessType"])
	}
	updateParamImplConfigPaths := mustStructuredMap(t, updateParamImplConfigMeta["idPathsByType"])
	if got := mustStringList(t, updateParamImplConfigPaths[string(tools.IDTypeSection)]); len(got) != 1 || got[0] != "sectionId" {
		t.Fatalf("expected update_param_impl_config sectionId target path, got %#v", got)
	}
	if got := mustStringList(t, updateParamImplConfigPaths[string(tools.IDTypeCodeObject)]); len(got) != 1 || got[0] != "paramInfoId" {
		t.Fatalf("expected update_param_impl_config paramInfoId target path, got %#v", got)
	}
	deleteSelectedParamsMeta := mustStructuredMap(t, deleteSelectedParamsTool.Meta[toolMetaNamespace])
	if deleteSelectedParamsMeta["accessType"] != string(tools.AccessTypeWrite) {
		t.Fatalf("expected write access type for delete_selected_params, got %#v", deleteSelectedParamsMeta["accessType"])
	}
	deleteSelectedParamsPaths := mustStructuredMap(t, deleteSelectedParamsMeta["idPathsByType"])
	if got := mustStringList(t, deleteSelectedParamsPaths[string(tools.IDTypeSection)]); len(got) != 1 || got[0] != "sectionId" {
		t.Fatalf("expected delete_selected_params sectionId target path, got %#v", got)
	}
	if got := mustStringList(t, deleteSelectedParamsPaths[string(tools.IDTypeCodeObject)]); len(got) != 1 || got[0] != "paramInfoIds" {
		t.Fatalf("expected delete_selected_params paramInfoIds target path, got %#v", got)
	}
	deleteSelectedParamsResultPaths := mustStructuredMap(t, deleteSelectedParamsMeta["resultIdPathsByType"])
	if got := mustStringList(t, deleteSelectedParamsResultPaths[string(tools.IDTypeCodeObject)]); len(got) != 1 || got[0] != "paramInfoIds" {
		t.Fatalf("expected delete_selected_params paramInfoIds result path, got %#v", got)
	}
	settaMeta := mustStructuredMap(t, summaryTool.Meta[toolMetaNamespace])
	if settaMeta["resultFilter"] != string(tools.ResultFilterProjectStateSummary) {
		t.Fatalf("expected project-state result filter, got %#v", settaMeta["resultFilter"])
	}
	if diagnosticsTool == nil {
		t.Fatal("expected get_latest_lsp_diagnostics tool")
	}
	diagnosticsMeta := mustStructuredMap(t, diagnosticsTool.Meta[toolMetaNamespace])
	if diagnosticsMeta["resultFilter"] != string(tools.ResultFilterLSPDiagnostics) {
		t.Fatalf("expected lsp diagnostics result filter, got %#v", diagnosticsMeta["resultFilter"])
	}
	if muteTool == nil {
		t.Fatal("expected set_code_section_diagnostics_mute tool")
	}
	if setSectionNameTool == nil {
		t.Fatal("expected set_section_name tool")
	}
	if setSectionTagColorTool == nil {
		t.Fatal("expected set_section_tag_color tool")
	}
	if setSectionStyleColorTool == nil {
		t.Fatal("expected set_section_style_color tool")
	}
	if setSectionParamFilterTool == nil {
		t.Fatal("expected set_section_param_filter tool")
	}
	if setMetaControlShowSectionTitleTool == nil {
		t.Fatal("expected set_meta_control_show_section_title tool")
	}
	if setSectionVariantTool == nil {
		t.Fatal("expected set_section_variant tool")
	}
	if setSectionVariantSortOrderTool == nil {
		t.Fatal("expected set_section_variant_sort_order tool")
	}
	if setParamTool == nil {
		t.Fatal("expected set_param_entered_value tool")
	}
	if setParamNameAndValueTool == nil {
		t.Fatal("expected set_param_name_and_value tool")
	}
	if setTypeErrorIgnoreTool == nil {
		t.Fatal("expected set_type_error_ignore tool")
	}
	if setCodeObjNameTool == nil {
		t.Fatal("expected set_code_obj_name tool")
	}
	if setCodeObjDisplayNameTool == nil {
		t.Fatal("expected set_code_obj_display_name tool")
	}
	if suppressionTool == nil {
		t.Fatal("expected set_code_section_diagnostic_code_suppression tool")
	}
	muteMeta := mustStructuredMap(t, muteTool.Meta[toolMetaNamespace])
	if muteMeta["accessType"] != string(tools.AccessTypeWrite) {
		t.Fatalf("expected write access type, got %#v", muteMeta["accessType"])
	}
	mutePaths := mustStructuredMap(t, muteMeta["idPathsByType"])
	if got := mustStringList(t, mutePaths[string(tools.IDTypeSection)]); len(got) != 1 || got[0] != "sectionId" {
		t.Fatalf("expected sectionId target path, got %#v", got)
	}
	setSectionNameMeta := mustStructuredMap(t, setSectionNameTool.Meta[toolMetaNamespace])
	setSectionNamePaths := mustStructuredMap(t, setSectionNameMeta["idPathsByType"])
	if got := mustStringList(t, setSectionNamePaths[string(tools.IDTypeSection)]); len(got) != 1 || got[0] != "sectionId" {
		t.Fatalf("expected set_section_name sectionId target path, got %#v", got)
	}
	setParamMeta := mustStructuredMap(t, setParamTool.Meta[toolMetaNamespace])
	setParamPaths := mustStructuredMap(t, setParamMeta["idPathsByType"])
	if got := mustStringList(t, setParamPaths[string(tools.IDTypeSection)]); len(got) != 1 || got[0] != "sectionId" {
		t.Fatalf("expected set_param_entered_value sectionId target path, got %#v", got)
	}
	if got := mustStringList(t, setParamPaths[string(tools.IDTypeCodeObject)]); len(got) != 1 || got[0] != "paramInfoId" {
		t.Fatalf("expected set_param_entered_value paramInfoId target path, got %#v", got)
	}
	setParamPreviewMeta := mustStructuredMap(t, setParamMeta["toolArgumentPreview"])
	setParamPreviewPaths := mustStructuredMap(t, setParamPreviewMeta["targetIdPathsByType"])
	if got := mustStringList(t, setParamPreviewPaths[string(tools.IDTypeSection)]); len(got) != 1 || got[0] != "sectionId" {
		t.Fatalf("expected set_param_entered_value preview section target path, got %#v", got)
	}
	if got := mustStringList(t, setParamPreviewPaths[string(tools.IDTypeCodeObject)]); len(got) != 1 || got[0] != "paramInfoId" {
		t.Fatalf("expected set_param_entered_value preview codeObj target path, got %#v", got)
	}
	if setParamPreviewMeta["previewValuePath"] != "value" {
		t.Fatalf("expected set_param_entered_value preview value path value, got %#v", setParamPreviewMeta["previewValuePath"])
	}
	if setParamPreviewMeta["previewKind"] != string(tools.PreviewKindParamValue) {
		t.Fatalf("expected set_param_entered_value preview kind paramValue, got %#v", setParamPreviewMeta["previewKind"])
	}
	setParamNameAndValueMeta := mustStructuredMap(t, setParamNameAndValueTool.Meta[toolMetaNamespace])
	setParamNameAndValuePaths := mustStructuredMap(t, setParamNameAndValueMeta["idPathsByType"])
	if got := mustStringList(t, setParamNameAndValuePaths[string(tools.IDTypeSection)]); len(got) != 1 || got[0] != "sectionId" {
		t.Fatalf("expected set_param_name_and_value sectionId target path, got %#v", got)
	}
	if got := mustStringList(t, setParamNameAndValuePaths[string(tools.IDTypeCodeObject)]); len(got) != 1 || got[0] != "codeObjId" {
		t.Fatalf("expected set_param_name_and_value codeObjId target path, got %#v", got)
	}
	setParamNameAndValuePreviewMeta := mustStructuredMap(t, setParamNameAndValueMeta["toolArgumentPreview"])
	setParamNameAndValuePreviewPaths := mustStructuredMap(t, setParamNameAndValuePreviewMeta["targetIdPathsByType"])
	if got := mustStringList(t, setParamNameAndValuePreviewPaths[string(tools.IDTypeSection)]); len(got) != 1 || got[0] != "sectionId" {
		t.Fatalf("expected set_param_name_and_value preview section target path, got %#v", got)
	}
	if got := mustStringList(t, setParamNameAndValuePreviewPaths[string(tools.IDTypeCodeObject)]); len(got) != 1 || got[0] != "codeObjId" {
		t.Fatalf("expected set_param_name_and_value preview codeObj target path, got %#v", got)
	}
	if setParamNameAndValuePreviewMeta["previewValuePath"] != "value" {
		t.Fatalf("expected set_param_name_and_value preview value path value, got %#v", setParamNameAndValuePreviewMeta["previewValuePath"])
	}
	if setParamNameAndValuePreviewMeta["previewKind"] != string(tools.PreviewKindParamValue) {
		t.Fatalf("expected set_param_name_and_value preview kind paramValue, got %#v", setParamNameAndValuePreviewMeta["previewKind"])
	}
	setCodeObjNameMeta := mustStructuredMap(t, setCodeObjNameTool.Meta[toolMetaNamespace])
	setCodeObjNamePaths := mustStructuredMap(t, setCodeObjNameMeta["idPathsByType"])
	if got := mustStringList(t, setCodeObjNamePaths[string(tools.IDTypeCodeObject)]); len(got) != 1 || got[0] != "codeObjId" {
		t.Fatalf("expected set_code_obj_name codeObjId target path, got %#v", got)
	}
	setCodeObjDisplayNameMeta := mustStructuredMap(t, setCodeObjDisplayNameTool.Meta[toolMetaNamespace])
	setCodeObjDisplayNamePaths := mustStructuredMap(t, setCodeObjDisplayNameMeta["idPathsByType"])
	if got := mustStringList(t, setCodeObjDisplayNamePaths[string(tools.IDTypeCodeObject)]); len(got) != 1 || got[0] != "codeObjId" {
		t.Fatalf("expected set_code_obj_display_name codeObjId target path, got %#v", got)
	}

	listResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{Name: "list_mcp_tools"})
	if err != nil {
		t.Fatalf("call list_mcp_tools: %v", err)
	}
	listPayload := mustStructuredMap(t, listResult.StructuredContent)
	listNames := mustStringList(t, listPayload["tools"])
	if len(listNames) != 74 {
		t.Fatalf("expected 74 registered tool names, got %#v", listNames)
	}

	scopeResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "read_file_range",
		Arguments: map[string]any{"path": "example.txt"},
	})
	if err != nil {
		t.Fatalf("call read_file_range missing context: %v", err)
	}
	if !scopeResult.IsError {
		t.Fatal("expected missing context to return structured tool error")
	}
	scopePayload := mustStructuredMap(t, scopeResult.StructuredContent)
	if scopePayload["code"] != scopeViolationErrorCode {
		t.Fatalf("expected scope violation code, got %#v", scopePayload["code"])
	}
	if scopePayload["reason"] != "missing_context" {
		t.Fatalf("expected missing_context reason, got %#v", scopePayload["reason"])
	}

	blankAffinityResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_agentic_context",
		Arguments: map[string]any{
			"projectConfigId":       "project-alpha",
			"chatId":                "chat-1",
			"sectionId":             "chat-section",
			"frontendAffinityToken": "   ",
		},
	})
	if err != nil {
		t.Fatalf("call set_agentic_context blank affinity: %v", err)
	}
	if !blankAffinityResult.IsError {
		t.Fatal("expected blank affinity token to fail")
	}

	setContextResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_agentic_context",
		Arguments: map[string]any{
			"projectConfigId":       "project-alpha",
			"chatId":                "chat-1",
			"sectionId":             "chat-section",
			"frontendAffinityToken": "frontend-1",
		},
	})
	if err != nil {
		t.Fatalf("call set_agentic_context: %v", err)
	}
	if setContextResult.IsError {
		t.Fatalf("expected set_agentic_context success, got %#v", setContextResult.StructuredContent)
	}

	readResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "read_file_range",
		Arguments: map[string]any{
			"path":       "example.txt",
			"start_line": 2,
			"end_line":   3,
		},
	})
	if err != nil {
		t.Fatalf("call read_file_range: %v", err)
	}
	if readResult.IsError {
		t.Fatalf("expected read_file_range success, got %#v", readResult.StructuredContent)
	}
	readPayload := mustStructuredMap(t, readResult.StructuredContent)
	if readPayload["content"] != "beta\ngamma" {
		t.Fatalf("expected ranged file content, got %#v", readPayload["content"])
	}

	summaryResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "get_latest_project_state_summary",
		Arguments: map[string]any{"projectConfigId": "project-alpha"},
	})
	if err != nil {
		t.Fatalf("call get_latest_project_state_summary: %v", err)
	}
	if summaryResult.IsError {
		t.Fatalf("expected project summary success, got %#v", summaryResult.StructuredContent)
	}
	assertSummaryPayload(t, summaryResult.StructuredContent)

	mismatchResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "get_latest_project_state_summary",
		Arguments: map[string]any{"projectConfigId": "project-beta"},
	})
	if err != nil {
		t.Fatalf("call get_latest_project_state_summary mismatch: %v", err)
	}
	if !mismatchResult.IsError {
		t.Fatal("expected mismatched project config id to fail")
	}
	mismatchPayload := mustStructuredMap(t, mismatchResult.StructuredContent)
	if mismatchPayload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments, got %#v", mismatchPayload["code"])
	}
	if mismatchPayload["message"] == nil {
		t.Fatalf("expected mismatch message, got %#v", mismatchPayload)
	}

	diagnosticsResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "get_latest_lsp_diagnostics",
		Arguments: map[string]any{"projectConfigId": "project-alpha"},
	})
	if err != nil {
		t.Fatalf("call get_latest_lsp_diagnostics: %v", err)
	}
	if diagnosticsResult.IsError {
		t.Fatalf("expected lsp diagnostics success, got %#v", diagnosticsResult.StructuredContent)
	}
	assertDiagnosticsPayload(t, diagnosticsResult.StructuredContent)

	if server.sessionAgenticContext("missing-session") != nil {
		t.Fatal("expected missing session agentic context lookup to return nil")
	}
}
