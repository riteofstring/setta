package mcpx

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"runtime"
	"slices"
	"sort"
	"strings"
	"testing"
	"time"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
	"setta/internal/agentprofiles"
	"setta/internal/appspec"
	"setta/internal/projectstate"
	"setta/internal/terminals"
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
	if len(toolsResult.Tools) != 79 {
		t.Fatalf("expected 79 tools, got %d", len(toolsResult.Tools))
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
	var setWatchCodeEnabledTool *sdkmcp.Tool
	var setWatchCodeInputsTool *sdkmcp.Tool
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
	var compareAndSetWatchCodeEnabledTool *sdkmcp.Tool
	var compareAndSetWatchCodeFoldersTool *sdkmcp.Tool
	var compareAndSetWatchCodeFilesTool *sdkmcp.Tool
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
		if tool.Name == "set_watch_code_enabled" {
			setWatchCodeEnabledTool = tool
		}
		if tool.Name == "set_watch_code_inputs" {
			setWatchCodeInputsTool = tool
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
		if tool.Name == "compare_and_set_watch_code_enabled" {
			compareAndSetWatchCodeEnabledTool = tool
		}
		if tool.Name == "compare_and_set_watch_code_folders" {
			compareAndSetWatchCodeFoldersTool = tool
		}
		if tool.Name == "compare_and_set_watch_code_files" {
			compareAndSetWatchCodeFilesTool = tool
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
		"compare_and_set_watch_code_enabled",
		"compare_and_set_watch_code_files",
		"compare_and_set_watch_code_folders",
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
		"set_watch_code_enabled",
		"set_watch_code_inputs",
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
	if setWatchCodeEnabledTool == nil {
		t.Fatal("expected set_watch_code_enabled tool")
	}
	if setWatchCodeInputsTool == nil {
		t.Fatal("expected set_watch_code_inputs tool")
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
	if compareAndSetWatchCodeEnabledTool == nil {
		t.Fatal("expected compare_and_set_watch_code_enabled tool")
	}
	if compareAndSetWatchCodeFoldersTool == nil {
		t.Fatal("expected compare_and_set_watch_code_folders tool")
	}
	if compareAndSetWatchCodeFilesTool == nil {
		t.Fatal("expected compare_and_set_watch_code_files tool")
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
	setWatchCodeEnabledMeta := mustStructuredMap(t, setWatchCodeEnabledTool.Meta[toolMetaNamespace])
	if setWatchCodeEnabledMeta["accessType"] != string(tools.AccessTypeStructural) {
		t.Fatalf("expected structural access type for set_watch_code_enabled, got %#v", setWatchCodeEnabledMeta["accessType"])
	}
	setWatchCodeInputsMeta := mustStructuredMap(t, setWatchCodeInputsTool.Meta[toolMetaNamespace])
	if setWatchCodeInputsMeta["accessType"] != string(tools.AccessTypeStructural) {
		t.Fatalf("expected structural access type for set_watch_code_inputs, got %#v", setWatchCodeInputsMeta["accessType"])
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
	compareAndSetWatchCodeEnabledMeta := mustStructuredMap(t, compareAndSetWatchCodeEnabledTool.Meta[toolMetaNamespace])
	if compareAndSetWatchCodeEnabledMeta["accessType"] != string(tools.AccessTypeStructural) {
		t.Fatalf("expected structural access type for compare_and_set_watch_code_enabled, got %#v", compareAndSetWatchCodeEnabledMeta["accessType"])
	}
	compareAndSetWatchCodeFoldersMeta := mustStructuredMap(t, compareAndSetWatchCodeFoldersTool.Meta[toolMetaNamespace])
	if compareAndSetWatchCodeFoldersMeta["accessType"] != string(tools.AccessTypeStructural) {
		t.Fatalf("expected structural access type for compare_and_set_watch_code_folders, got %#v", compareAndSetWatchCodeFoldersMeta["accessType"])
	}
	compareAndSetWatchCodeFilesMeta := mustStructuredMap(t, compareAndSetWatchCodeFilesTool.Meta[toolMetaNamespace])
	if compareAndSetWatchCodeFilesMeta["accessType"] != string(tools.AccessTypeStructural) {
		t.Fatalf("expected structural access type for compare_and_set_watch_code_files, got %#v", compareAndSetWatchCodeFilesMeta["accessType"])
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
	if len(listNames) != 79 {
		t.Fatalf("expected 79 registered tool names, got %#v", listNames)
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

func TestServerToolCatalogOmitsLegacyInvokeLinkedChatTool(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	toolsResult, err := clientSession.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatalf("list tools: %v", err)
	}
	for _, tool := range toolsResult.Tools {
		if tool.Name == "invoke_linked_chat" {
			t.Fatalf("did not expect legacy invoke_linked_chat tool in live catalog: %#v", tool)
		}
	}

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "list_mcp_tools",
		Arguments: map[string]any{},
	})
	if err != nil {
		t.Fatalf("call list_mcp_tools: %v", err)
	}
	payload, ok := result.StructuredContent.(map[string]any)
	if !ok {
		t.Fatalf("expected structured list payload, got %#v", result.StructuredContent)
	}
	rawNames, ok := payload["tools"].([]any)
	if !ok {
		t.Fatalf("expected tool list array, got %#v", payload["tools"])
	}
	for _, rawName := range rawNames {
		if name, ok := rawName.(string); ok && name == "invoke_linked_chat" {
			t.Fatalf("did not expect invoke_linked_chat in list_mcp_tools payload: %#v", rawNames)
		}
	}
}

func TestServerDiscoverableToolsHaveExplicitAccessMetadata(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	toolsResult, err := clientSession.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatalf("list tools: %v", err)
	}

	allowNoTargets := map[string]struct{}{
		"getInstalledPythonPackages": {},
		"get_agent_profile":          {},
		"list_agent_profiles":        {},
		"read_file_range":            {},
	}
	missingAccess := []string{}
	missingTargets := []string{}
	for _, tool := range toolsResult.Tools {
		if tool == nil {
			continue
		}

		rawMeta, ok := tool.Meta[toolMetaNamespace]
		if !ok {
			missingAccess = append(missingAccess, tool.Name+" (missing setta metadata)")
			continue
		}
		meta := mustStructuredMap(t, rawMeta)
		if meta["toolKind"] != string(tools.KindDiscoverable) {
			continue
		}

		accessType, _ := meta["accessType"].(string)
		if strings.TrimSpace(accessType) == "" {
			missingAccess = append(missingAccess, tool.Name+" (missing accessType)")
			continue
		}
		if accessType != string(tools.AccessTypeRead) && accessType != string(tools.AccessTypeWrite) {
			continue
		}

		idPaths := map[string]any{}
		if rawPaths, ok := meta["idPathsByType"]; ok {
			idPaths = mustStructuredMap(t, rawPaths)
		}
		_, hasResultFilter := meta["resultFilter"]
		defaultSingleton, _ := meta["defaultTargetSingletonSection"].(string)
		if len(idPaths) != 0 || hasResultFilter || strings.TrimSpace(defaultSingleton) != "" {
			continue
		}
		if _, ok := allowNoTargets[tool.Name]; ok {
			continue
		}
		missingTargets = append(missingTargets, tool.Name)
	}

	sort.Strings(missingAccess)
	sort.Strings(missingTargets)
	if len(missingAccess) != 0 {
		t.Fatalf("expected explicit access metadata for discoverable tools, missing %#v", missingAccess)
	}
	if len(missingTargets) != 0 {
		t.Fatalf("expected discoverable read/write tools to publish target hints, missing %#v", missingTargets)
	}
}

func TestServerSetAgenticContextRejectsBlankFrontendAffinityToken(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_agentic_context",
		Arguments: map[string]any{
			"projectConfigId":       "project-alpha",
			"chatId":                "chat-1",
			"sectionId":             "chat-section",
			"frontendAffinityToken": "   ",
		},
	})
	if err != nil {
		t.Fatalf("call set_agentic_context: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blank frontend affinity token to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	message, _ := payload["message"].(string)
	if !strings.Contains(message, "frontendAffinityToken must be a non-empty string when provided") {
		t.Fatalf("expected blank frontend affinity token message, got %#v", payload)
	}
}

func TestServerScopedReadToolsRejectEmptyReadableScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	if _, err := projectRuntime.Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		project := document.Projects["project-alpha"]
		project.AgenticEdges = nil
		document.Projects["project-alpha"] = project
		return document, nil
	}); err != nil {
		t.Fatalf("remove scoped read edges: %v", err)
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:  t.TempDir(),
		ProjectState:   projectRuntime,
		LSPDiagnostics: openScopedTestLSPDiagnosticsRegistry(),
	})
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	for _, toolName := range []string{
		"get_latest_project_state_summary",
		"get_latest_lsp_diagnostics",
	} {
		result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
			Name:      toolName,
			Arguments: map[string]any{"projectConfigId": "project-alpha"},
		})
		if err != nil {
			t.Fatalf("call %s: %v", toolName, err)
		}
		if !result.IsError {
			t.Fatalf("expected %s empty-scope failure, got %#v", toolName, result.StructuredContent)
		}
		payload := mustStructuredMap(t, result.StructuredContent)
		if payload["code"] != scopeViolationErrorCode {
			t.Fatalf("expected scope_violation code for %s, got %#v", toolName, payload["code"])
		}
		if payload["reason"] != "empty_scope" {
			t.Fatalf("expected empty_scope reason for %s, got %#v", toolName, payload["reason"])
		}
		message, ok := payload["message"].(string)
		if !ok || !strings.Contains(message, "no readable sections") {
			t.Fatalf("expected no-readable-sections message for %s, got %#v", toolName, payload["message"])
		}
	}
}

func TestServerScopedReadToolsRequireAgenticContextAndSectionContext(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	server, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	testCases := []struct {
		name         string
		request      ToolRequestContext
		expectedCode string
	}{
		{
			name:         "missing context",
			request:      ToolRequestContext{},
			expectedCode: "missing_context",
		},
		{
			name: "missing section id",
			request: ToolRequestContext{
				Meta: map[string]any{
					"projectConfigId": "project-alpha",
					"chatId":          "chat-1",
				},
			},
			expectedCode: "missing_section_id",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			for _, toolName := range []string{
				"get_latest_project_state_summary",
				"get_latest_lsp_diagnostics",
			} {
				result, err := server.InvokeTool(context.Background(), toolName, map[string]any{
					"projectConfigId": "project-alpha",
				}, testCase.request)
				if err != nil {
					t.Fatalf("invoke %s: %v", toolName, err)
				}
				if !result.IsError {
					t.Fatalf("expected %s %s failure, got %#v", toolName, testCase.expectedCode, result.StructuredContent)
				}
				payload := mustStructuredMap(t, result.StructuredContent)
				if payload["code"] != scopeViolationErrorCode {
					t.Fatalf("expected scope_violation code for %s, got %#v", toolName, payload["code"])
				}
				if payload["reason"] != testCase.expectedCode {
					t.Fatalf("expected %s reason for %s, got %#v", testCase.expectedCode, toolName, payload["reason"])
				}
			}
		})
	}
}

func TestServerSetCodeSectionDiagnosticsMuteRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	diagnostics := openScopedTestLSPDiagnosticsRegistry()
	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:  t.TempDir(),
		ProjectState:   projectRuntime,
		LSPDiagnostics: diagnostics,
	})
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code_section_diagnostics_mute",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"mute":            true,
		},
	})
	if err != nil {
		t.Fatalf("call set_code_section_diagnostics_mute allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed mute success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after mute: %v", err)
	}
	ignoreState, err := project.CodeSectionDiagnosticsIgnoreStateForSection("allowed-section")
	if err != nil {
		t.Fatalf("ignore state for allowed-section: %v", err)
	}
	if !ignoreState.Muted {
		t.Fatalf("expected allowed-section to be muted, got %#v", ignoreState)
	}

	filteredDiagnostics := diagnostics.Snapshot("project-alpha")
	if _, ok := filteredDiagnostics.CodeSections["allowed-section"]; ok {
		t.Fatalf("expected allowed-section diagnostics to be filtered after mute, got %#v", filteredDiagnostics.CodeSections)
	}
	if _, ok := filteredDiagnostics.CodeSections["blocked-section"]; !ok {
		t.Fatalf("expected blocked-section diagnostics to remain, got %#v", filteredDiagnostics.CodeSections)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code_section_diagnostics_mute",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-section",
			"mute":            true,
		},
	})
	if err != nil {
		t.Fatalf("call set_code_section_diagnostics_mute blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked mute call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["code"] != scopeViolationErrorCode {
		t.Fatalf("expected scope_violation code, got %#v", blockedPayload["code"])
	}
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
	if ids := mustStringList(t, blockedPayload["targetSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("unexpected targetSectionIds %#v", ids)
	}
}

func TestServerSetCodeSectionDiagnosticCodeSuppressionRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	diagnostics := openScopedTestLSPDiagnosticsRegistry()
	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:  t.TempDir(),
		ProjectState:   projectRuntime,
		LSPDiagnostics: diagnostics,
	})
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code_section_diagnostic_code_suppression",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"code":            "reportFoo",
			"suppress":        true,
		},
	})
	if err != nil {
		t.Fatalf("call set_code_section_diagnostic_code_suppression allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed suppression success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after suppression: %v", err)
	}
	ignoreState, err := project.CodeSectionDiagnosticsIgnoreStateForSection("allowed-section")
	if err != nil {
		t.Fatalf("ignore state for allowed-section after suppression: %v", err)
	}
	if len(ignoreState.SuppressedCodes) != 1 || ignoreState.SuppressedCodes[0] != "reportFoo" {
		t.Fatalf("expected reportFoo suppression, got %#v", ignoreState.SuppressedCodes)
	}

	filteredDiagnostics := diagnostics.Snapshot("project-alpha")
	if _, ok := filteredDiagnostics.CodeSections["allowed-section"]; ok {
		t.Fatalf("expected allowed-section diagnostics to be filtered after suppression, got %#v", filteredDiagnostics.CodeSections)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code_section_diagnostic_code_suppression",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-section",
			"code":            "reportFoo",
			"suppress":        true,
		},
	})
	if err != nil {
		t.Fatalf("call set_code_section_diagnostic_code_suppression blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked suppression call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["code"] != scopeViolationErrorCode {
		t.Fatalf("expected scope_violation code, got %#v", blockedPayload["code"])
	}
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
}

func TestServerSetParamEnteredValueRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_param_entered_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-params-section",
			"paramInfoId":     "allowed-param",
			"value":           "updated",
		},
	})
	if err != nil {
		t.Fatalf("call set_param_entered_value allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed set_param_entered_value success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_param_entered_value: %v", err)
	}
	payload, _, _, _, err := project.ResolveSectionCodeObject("allowed-params-section", "allowed-param")
	if err != nil {
		t.Fatalf("resolve allowed-param after update: %v", err)
	}
	if got := payloadRawStringField(payload, "value"); got != "updated" {
		t.Fatalf("expected updated param value, got %q", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_param_entered_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-params-section",
			"paramInfoId":     "blocked-param",
			"value":           "blocked",
		},
	})
	if err != nil {
		t.Fatalf("call set_param_entered_value blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked set_param_entered_value call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-params-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
}

func TestServerSetParamNameAndValueRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_param_name_and_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-params-section",
			"codeObjId":       "allowed-param",
			"name":            "user-id@v2",
			"value":           "updated",
		},
	})
	if err != nil {
		t.Fatalf("call set_param_name_and_value allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed set_param_name_and_value success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_param_name_and_value: %v", err)
	}
	if got := project.CodeObjs["allowed-param"].Name; got != "user-id@v2" {
		t.Fatalf("expected code object name user-id@v2, got %q", got)
	}
	payload, _, _, _, err := project.ResolveSectionCodeObject("allowed-params-section", "allowed-param")
	if err != nil {
		t.Fatalf("resolve allowed-param after combined update: %v", err)
	}
	if got := payloadRawStringField(payload, "value"); got != "updated" {
		t.Fatalf("expected updated param value, got %q", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_param_name_and_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-params-section",
			"codeObjId":       "blocked-param",
			"name":            "blocked_name",
			"value":           "blocked",
		},
	})
	if err != nil {
		t.Fatalf("call set_param_name_and_value blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked set_param_name_and_value call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-params-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
}

func TestServerSetParamNameAndValueReturnsInvalidArgumentsForInvalidName(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_param_name_and_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-params-section",
			"codeObjId":       "allowed-param",
			"name":            "bad\nname",
			"value":           "updated",
		},
	})
	if err != nil {
		t.Fatalf("call set_param_name_and_value invalid name: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid set_param_name_and_value call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if payload["message"] != "Param name cannot include control characters." {
		t.Fatalf("expected control-character validation message, got %#v", payload["message"])
	}
}

func TestServerSetCallableRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_callable",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-callable-section",
			"callableName":    "sorted",
			"refetchParams":   false,
		},
	})
	if err != nil {
		t.Fatalf("call set_callable allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed set_callable success, got %#v", allowedResult.StructuredContent)
	}

	allowedPayload := mustStructuredMap(t, allowedResult.StructuredContent)
	if allowedPayload["callableId"] != "allowed-callable-2" {
		t.Fatalf("expected callable id allowed-callable-2, got %#v", allowedPayload["callableId"])
	}
	if allowedPayload["lspStatus"] != string(projectstate.SignatureHelpStatusSkipped) {
		t.Fatalf("expected skipped lsp status, got %#v", allowedPayload["lspStatus"])
	}
	childCodeObjs := mustStructuredList(t, allowedPayload["childCodeObjs"])
	if len(childCodeObjs) != 1 {
		t.Fatalf("expected one returned callable child, got %#v", childCodeObjs)
	}
	childCodeObj := mustStructuredMap(t, childCodeObjs[0])
	if childCodeObj["codeObjId"] != "allowed-param-existing" {
		t.Fatalf("expected allowed-param-existing child id, got %#v", childCodeObj["codeObjId"])
	}
	if childCodeObj["name"] != "iterable" {
		t.Fatalf("expected iterable child name, got %#v", childCodeObj["name"])
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_callable: %v", err)
	}
	_, _, impl, err := project.ResolveSection("allowed-callable-section")
	if err != nil {
		t.Fatalf("resolve allowed-callable-section after set_callable: %v", err)
	}
	sectionPayload := mustDecodedProjectPayload(t, impl.Payload)
	if got := sectionPayload["callable"]; got != "allowed-callable-2" {
		t.Fatalf("expected persisted callable allowed-callable-2, got %#v", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_callable",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-callable-section",
			"callableName":    "sorted",
			"refetchParams":   false,
		},
	})
	if err != nil {
		t.Fatalf("call set_callable blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked set_callable call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-callable-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
}

func TestServerSetCallableUsesResolverWhenRefetchRequested(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:  t.TempDir(),
		ProjectState:   projectRuntime,
		LSPDiagnostics: openScopedTestLSPDiagnosticsRegistry(),
		CallableSignatures: stubCallableSignatureResolver{ok: true, result: projectstate.CallableSignatureResult{
			Status: projectstate.SignatureHelpStatusMatched,
			Params: []projectstate.CallableParamProposal{
				{Name: "iterable", PassingStyle: "DEFAULT"},
				{Name: "key", DefaultValue: "None", PassingStyle: "DEFAULT"},
			},
		}},
	})
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_callable",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-callable-section",
			"callableName":    "sorted",
			"refetchParams":   true,
		},
	})
	if err != nil {
		t.Fatalf("call set_callable resolver-backed: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected resolver-backed set_callable success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["callableId"] != "allowed-callable-2" {
		t.Fatalf("expected callable id allowed-callable-2, got %#v", payload["callableId"])
	}
	if payload["lspStatus"] != string(projectstate.SignatureHelpStatusMatched) {
		t.Fatalf("expected matched lsp status, got %#v", payload["lspStatus"])
	}
	childCodeObjs := mustStructuredList(t, payload["childCodeObjs"])
	if len(childCodeObjs) != 2 {
		t.Fatalf("expected two returned callable children, got %#v", childCodeObjs)
	}
	firstChild := mustStructuredMap(t, childCodeObjs[0])
	if firstChild["codeObjId"] != "allowed-param-existing" || firstChild["name"] != "iterable" {
		t.Fatalf("unexpected first child payload %#v", firstChild)
	}
	secondChild := mustStructuredMap(t, childCodeObjs[1])
	if secondChild["name"] != "key" {
		t.Fatalf("expected synthesized key child, got %#v", secondChild)
	}
	if secondChild["codeObjId"] == "" || secondChild["codeObjId"] == "allowed-param-existing" {
		t.Fatalf("expected synthesized child id, got %#v", secondChild["codeObjId"])
	}
}

func TestServerAddKwargRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "add_kwarg",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-callable-section",
		},
	})
	if err != nil {
		t.Fatalf("call add_kwarg allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed add_kwarg success, got %#v", allowedResult.StructuredContent)
	}

	allowedPayload := mustStructuredMap(t, allowedResult.StructuredContent)
	codeObjID, ok := allowedPayload["codeObjId"].(string)
	if !ok || codeObjID == "" {
		t.Fatalf("expected created codeObjId string, got %#v", allowedPayload["codeObjId"])
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after add_kwarg: %v", err)
	}
	callablePayload, _, _, _, err := project.ResolveSectionCodeObject("allowed-callable-section", "allowed-callable-1")
	if err != nil {
		t.Fatalf("resolve active callable after add_kwarg: %v", err)
	}
	children := mustStringList(t, callablePayload["children"])
	if len(children) != 1 || children[0] != codeObjID {
		t.Fatalf("expected created callable child [%q], got %#v", codeObjID, children)
	}
	paramPayload, codeObj, _, paramImpl, err := project.ResolveSectionCodeObject("allowed-callable-section", codeObjID)
	if err != nil {
		t.Fatalf("resolve created callable param after add_kwarg: %v", err)
	}
	if codeObj.Name != "" {
		t.Fatalf("expected placeholder callable param name to start empty, got %q", codeObj.Name)
	}
	if paramImpl.Type != "CodeParam" {
		t.Fatalf("expected created callable param type CodeParam, got %q", paramImpl.Type)
	}
	if got := payloadRawStringField(paramPayload, "value"); got != "" {
		t.Fatalf("expected created callable param value to start empty, got %q", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "add_kwarg",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-callable-section",
		},
	})
	if err != nil {
		t.Fatalf("call add_kwarg blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked add_kwarg call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-callable-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
}

func TestServerDeleteKwargRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, addResult, err := projectRuntime.AddKwarg(context.Background(), "project-alpha", "allowed-callable-section")
	if err != nil {
		t.Fatalf("prepare callable param for delete_kwarg: %v", err)
	}

	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "delete_kwarg",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-callable-section",
		},
	})
	if err != nil {
		t.Fatalf("call delete_kwarg allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed delete_kwarg success, got %#v", allowedResult.StructuredContent)
	}
	allowedPayload := mustStructuredMap(t, allowedResult.StructuredContent)
	if got := allowedPayload["codeObjId"]; got != addResult.CodeObjID {
		t.Fatalf("expected deleted codeObjId %q, got %#v", addResult.CodeObjID, got)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after delete_kwarg: %v", err)
	}
	callablePayload, _, _, _, err := project.ResolveSectionCodeObject("allowed-callable-section", "allowed-callable-1")
	if err != nil {
		t.Fatalf("resolve allowed-callable-1 after delete_kwarg: %v", err)
	}
	if children := mustStringList(t, callablePayload["children"]); len(children) != 0 {
		t.Fatalf("expected allowed-callable-1 children to be empty, got %#v", children)
	}
	if _, ok := project.CodeObjs[addResult.CodeObjID]; ok {
		t.Fatalf("expected deleted callable param %q to be pruned, got %#v", addResult.CodeObjID, project.CodeObjs[addResult.CodeObjID])
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "delete_kwarg",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-callable-section",
		},
	})
	if err != nil {
		t.Fatalf("call delete_kwarg blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked delete_kwarg call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-callable-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
}

func TestServerChangeParamImplRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "change_param_impl",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-params-section",
			"paramInfoId":     "allowed-param",
			"selectedId":      "PasswordParam",
		},
	})
	if err != nil {
		t.Fatalf("call change_param_impl allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed change_param_impl success, got %#v", allowedResult.StructuredContent)
	}
	allowedPayload := mustStructuredMap(t, allowedResult.StructuredContent)
	if allowedPayload["status"] != "ok" {
		t.Fatalf("expected change_param_impl status ok, got %#v", allowedPayload["status"])
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after change_param_impl: %v", err)
	}
	paramPayload, _, _, paramImpl, err := project.ResolveSectionCodeObject("allowed-params-section", "allowed-param")
	if err != nil {
		t.Fatalf("resolve allowed param after change_param_impl: %v", err)
	}
	if paramImpl.Type != "PasswordParam" {
		t.Fatalf("expected PasswordParam impl after change_param_impl, got %q", paramImpl.Type)
	}
	if got := payloadRawStringField(paramPayload, "value"); got != "" {
		t.Fatalf("expected password param value to stay blank, got %q", got)
	}
	if !payloadBoolField(paramPayload, "hasSecret") {
		t.Fatalf("expected password param hasSecret true, got %#v", paramPayload)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "change_param_impl",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-params-section",
			"paramInfoId":     "blocked-param",
			"selectedId":      "PasswordParam",
		},
	})
	if err != nil {
		t.Fatalf("call change_param_impl blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked change_param_impl call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-params-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
}

func TestServerUpdateParamImplConfigRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	if _, err := projectRuntime.ChangeParamImpl(context.Background(), "project-alpha", "allowed-params-section", "allowed-param", "SliderParam"); err != nil {
		t.Fatalf("prepare slider param impl: %v", err)
	}
	if _, err := projectRuntime.SetSectionCodeObjectValue(context.Background(), "project-alpha", "allowed-params-section", "allowed-param", "75"); err != nil {
		t.Fatalf("prepare slider param value: %v", err)
	}

	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "update_param_impl_config",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-params-section",
			"paramInfoId":     "allowed-param",
			"newConfig": map[string]any{
				"max": 10,
			},
		},
	})
	if err != nil {
		t.Fatalf("call update_param_impl_config allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed update_param_impl_config success, got %#v", allowedResult.StructuredContent)
	}
	allowedPayload := mustStructuredMap(t, allowedResult.StructuredContent)
	if allowedPayload["status"] != "ok" {
		t.Fatalf("expected update_param_impl_config status ok, got %#v", allowedPayload["status"])
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after update_param_impl_config: %v", err)
	}
	paramPayload, _, _, paramImpl, err := project.ResolveSectionCodeObject("allowed-params-section", "allowed-param")
	if err != nil {
		t.Fatalf("resolve allowed param after update_param_impl_config: %v", err)
	}
	if paramImpl.Type != "SliderParam" {
		t.Fatalf("expected SliderParam impl after update_param_impl_config, got %q", paramImpl.Type)
	}
	if got := payloadRawStringField(paramPayload, "value"); got != "10" {
		t.Fatalf("expected slider value to clamp to 10, got %q", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "update_param_impl_config",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-params-section",
			"paramInfoId":     "blocked-param",
			"newConfig": map[string]any{
				"description": "Blocked",
			},
		},
	})
	if err != nil {
		t.Fatalf("call update_param_impl_config blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked update_param_impl_config call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-params-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
}

func TestServerDeleteSelectedParamsRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, addResult, err := projectRuntime.AddKwarg(context.Background(), "project-alpha", "allowed-callable-section")
	if err != nil {
		t.Fatalf("prepare callable param for delete_selected_params: %v", err)
	}

	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "delete_selected_params",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-callable-section",
			"paramInfoIds":    []any{addResult.CodeObjID},
		},
	})
	if err != nil {
		t.Fatalf("call delete_selected_params allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed delete_selected_params success, got %#v", allowedResult.StructuredContent)
	}
	allowedPayload := mustStructuredMap(t, allowedResult.StructuredContent)
	if ids := mustStringList(t, allowedPayload["paramInfoIds"]); len(ids) != 1 || ids[0] != addResult.CodeObjID {
		t.Fatalf("expected deleted paramInfoIds [%s], got %#v", addResult.CodeObjID, ids)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after delete_selected_params: %v", err)
	}
	callablePayload, _, _, _, err := project.ResolveSectionCodeObject("allowed-callable-section", "allowed-callable-1")
	if err != nil {
		t.Fatalf("resolve allowed-callable-1 after delete_selected_params: %v", err)
	}
	if children := mustStringList(t, callablePayload["children"]); len(children) != 0 {
		t.Fatalf("expected allowed-callable-1 children to be empty, got %#v", children)
	}
	if _, ok := project.CodeObjs[addResult.CodeObjID]; ok {
		t.Fatalf("expected deleted callable param %q to be pruned, got %#v", addResult.CodeObjID, project.CodeObjs[addResult.CodeObjID])
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "delete_selected_params",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-params-section",
			"paramInfoIds":    []any{"blocked-param"},
		},
	})
	if err != nil {
		t.Fatalf("call delete_selected_params blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked delete_selected_params call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-params-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
}

func TestServerAddKwargTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":            "11",
		"chat-1":                   "12",
		"chat-section":             "13",
		"allowed-callable-section": "24",
		"blocked-callable-section": "25",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "add_kwarg",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "24",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id add_kwarg allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected temp-id add_kwarg success, got %#v", allowedResult.StructuredContent)
	}

	allowedPayload := mustStructuredMap(t, allowedResult.StructuredContent)
	temporaryCodeObjID, ok := allowedPayload["codeObjId"].(string)
	if !ok || temporaryCodeObjID == "" {
		t.Fatalf("expected translated codeObjId string, got %#v", allowedPayload["codeObjId"])
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id add_kwarg: %v", err)
	}
	callablePayload, _, _, _, err := project.ResolveSectionCodeObject("allowed-callable-section", "allowed-callable-1")
	if err != nil {
		t.Fatalf("resolve active callable after temp-id add_kwarg: %v", err)
	}
	children := mustStringList(t, callablePayload["children"])
	if len(children) != 1 {
		t.Fatalf("expected one canonical callable child after temp-id add_kwarg, got %#v", children)
	}
	canonicalCodeObjID := children[0]
	if temporaryCodeObjID == canonicalCodeObjID {
		t.Fatalf("expected translated codeObjId distinct from canonical id %q", canonicalCodeObjID)
	}
	temporaryMap := readTemporaryIDMapForTest(t, temporaryIDMapPath)
	if got := temporaryMap[canonicalCodeObjID]; got != temporaryCodeObjID {
		t.Fatalf("expected temporary map %q -> %q, got %q", canonicalCodeObjID, temporaryCodeObjID, got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "add_kwarg",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "25",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id add_kwarg blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked temp-id add_kwarg call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "25" {
		t.Fatalf("expected translated blockedSectionIds [25], got %#v", ids)
	}
}

func TestServerDeleteKwargTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, addResult, err := projectRuntime.AddKwarg(context.Background(), "project-alpha", "allowed-callable-section")
	if err != nil {
		t.Fatalf("prepare callable param for temp-id delete_kwarg: %v", err)
	}

	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":            "11",
		"chat-1":                   "12",
		"chat-section":             "13",
		"allowed-callable-section": "24",
		addResult.CodeObjID:        "28",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "delete_kwarg",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "24",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id delete_kwarg allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected temp-id delete_kwarg success, got %#v", allowedResult.StructuredContent)
	}
	allowedPayload := mustStructuredMap(t, allowedResult.StructuredContent)
	if got := allowedPayload["codeObjId"]; got != "28" {
		t.Fatalf("expected translated deleted codeObjId 28, got %#v", got)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id delete_kwarg: %v", err)
	}
	callablePayload, _, _, _, err := project.ResolveSectionCodeObject("allowed-callable-section", "allowed-callable-1")
	if err != nil {
		t.Fatalf("resolve allowed-callable-1 after temp-id delete_kwarg: %v", err)
	}
	if children := mustStringList(t, callablePayload["children"]); len(children) != 0 {
		t.Fatalf("expected callable children to be empty after temp-id delete_kwarg, got %#v", children)
	}
	if _, ok := project.CodeObjs[addResult.CodeObjID]; ok {
		t.Fatalf("expected canonical deleted callable param %q to be pruned", addResult.CodeObjID)
	}
}

func TestServerChangeParamImplTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":          "11",
		"chat-1":                 "12",
		"chat-section":           "13",
		"allowed-params-section": "26",
		"allowed-param":          "27",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "change_param_impl",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "26",
			"paramInfoId":     "27",
			"selectedId":      "PasswordParam",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id change_param_impl allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected temp-id change_param_impl success, got %#v", allowedResult.StructuredContent)
	}
	allowedPayload := mustStructuredMap(t, allowedResult.StructuredContent)
	if allowedPayload["status"] != "ok" {
		t.Fatalf("expected temp-id change_param_impl status ok, got %#v", allowedPayload["status"])
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id change_param_impl: %v", err)
	}
	paramPayload, _, _, paramImpl, err := project.ResolveSectionCodeObject("allowed-params-section", "allowed-param")
	if err != nil {
		t.Fatalf("resolve allowed param after temp-id change_param_impl: %v", err)
	}
	if paramImpl.Type != "PasswordParam" {
		t.Fatalf("expected PasswordParam impl after temp-id change_param_impl, got %q", paramImpl.Type)
	}
	if !payloadBoolField(paramPayload, "hasSecret") {
		t.Fatalf("expected password param hasSecret true after temp-id change_param_impl, got %#v", paramPayload)
	}
}

func TestServerUpdateParamImplConfigTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	if _, err := projectRuntime.ChangeParamImpl(context.Background(), "project-alpha", "allowed-params-section", "allowed-param", "SliderParam"); err != nil {
		t.Fatalf("prepare slider param impl: %v", err)
	}
	if _, err := projectRuntime.SetSectionCodeObjectValue(context.Background(), "project-alpha", "allowed-params-section", "allowed-param", "75"); err != nil {
		t.Fatalf("prepare slider param value: %v", err)
	}

	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":          "11",
		"chat-1":                 "12",
		"chat-section":           "13",
		"allowed-params-section": "26",
		"allowed-param":          "27",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "update_param_impl_config",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "26",
			"paramInfoId":     "27",
			"newConfig": map[string]any{
				"max": 10,
			},
		},
	})
	if err != nil {
		t.Fatalf("call temp-id update_param_impl_config allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected temp-id update_param_impl_config success, got %#v", allowedResult.StructuredContent)
	}
	allowedPayload := mustStructuredMap(t, allowedResult.StructuredContent)
	if allowedPayload["status"] != "ok" {
		t.Fatalf("expected temp-id update_param_impl_config status ok, got %#v", allowedPayload["status"])
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id update_param_impl_config: %v", err)
	}
	paramPayload, _, _, _, err := project.ResolveSectionCodeObject("allowed-params-section", "allowed-param")
	if err != nil {
		t.Fatalf("resolve allowed param after temp-id update_param_impl_config: %v", err)
	}
	if got := payloadRawStringField(paramPayload, "value"); got != "10" {
		t.Fatalf("expected slider value to clamp to 10 after temp-id update, got %q", got)
	}
}

func TestServerDeleteSelectedParamsTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, addResult, err := projectRuntime.AddKwarg(context.Background(), "project-alpha", "allowed-callable-section")
	if err != nil {
		t.Fatalf("prepare callable param for temp-id delete_selected_params: %v", err)
	}

	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":            "11",
		"chat-1":                   "12",
		"chat-section":             "13",
		"allowed-callable-section": "24",
		addResult.CodeObjID:        "28",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "delete_selected_params",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "24",
			"paramInfoIds":    []any{"28"},
		},
	})
	if err != nil {
		t.Fatalf("call temp-id delete_selected_params allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected temp-id delete_selected_params success, got %#v", allowedResult.StructuredContent)
	}
	allowedPayload := mustStructuredMap(t, allowedResult.StructuredContent)
	if ids := mustStringList(t, allowedPayload["paramInfoIds"]); len(ids) != 1 || ids[0] != "28" {
		t.Fatalf("expected translated deleted paramInfoIds [28], got %#v", ids)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id delete_selected_params: %v", err)
	}
	callablePayload, _, _, _, err := project.ResolveSectionCodeObject("allowed-callable-section", "allowed-callable-1")
	if err != nil {
		t.Fatalf("resolve allowed-callable-1 after temp-id delete_selected_params: %v", err)
	}
	if children := mustStringList(t, callablePayload["children"]); len(children) != 0 {
		t.Fatalf("expected callable children to be empty after temp-id delete_selected_params, got %#v", children)
	}
	if _, ok := project.CodeObjs[addResult.CodeObjID]; ok {
		t.Fatalf("expected canonical deleted callable param %q to be pruned", addResult.CodeObjID)
	}
}

func TestServerSetSectionNameRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_name",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"name":            "Allowed Renamed",
		},
	})
	if err != nil {
		t.Fatalf("call set_section_name allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed set_section_name success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_section_name: %v", err)
	}
	if got := project.Sections["allowed-section"].Name; got != "Allowed Renamed" {
		t.Fatalf("expected renamed section name, got %q", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_name",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-section",
			"name":            "Blocked Renamed",
		},
	})
	if err != nil {
		t.Fatalf("call set_section_name blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked set_section_name call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
	missingEdgesCanonical := mustStructuredList(t, blockedPayload["missingEdgesCanonical"])
	if len(missingEdgesCanonical) != 1 {
		t.Fatalf("expected one canonical missing edge, got %#v", missingEdgesCanonical)
	}
	missingEdgeCanonical := mustStructuredMap(t, missingEdgesCanonical[0])
	if missingEdgeCanonical["sourceSectionId"] != "chat-section" ||
		missingEdgeCanonical["targetSectionId"] != "blocked-section" ||
		missingEdgeCanonical["kind"] != agenticEdgeKindChatSection {
		t.Fatalf("unexpected canonical missing edge %#v", missingEdgeCanonical)
	}
}

func TestServerSetSectionTagColorRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_tag_color",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"tagColor":        "#123456",
		},
	})
	if err != nil {
		t.Fatalf("call set_section_tag_color allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed set_section_tag_color success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_section_tag_color: %v", err)
	}
	allowedPayload := mustDecodedProjectPayload(t, project.Sections["allowed-section"].SharedModifier)
	if got := allowedPayload["tagColor"]; got != "#123456" {
		t.Fatalf("expected allowed-section tagColor #123456, got %#v", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_tag_color",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-section",
			"tagColor":        "#654321",
		},
	})
	if err != nil {
		t.Fatalf("call set_section_tag_color blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked set_section_tag_color call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
	if ids := mustStringList(t, blockedPayload["targetSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("unexpected targetSectionIds %#v", ids)
	}
}

func TestServerSetSectionTagColorClearsNull(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	tagColor := "#123456"
	if _, err := projectRuntime.SetSectionTagColor(context.Background(), "project-alpha", "allowed-section", &tagColor); err != nil {
		t.Fatalf("seed tag color: %v", err)
	}

	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_tag_color",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"tagColor":        nil,
		},
	})
	if err != nil {
		t.Fatalf("call set_section_tag_color clear: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected tag-color clear success, got %#v", result.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after clearing tag color: %v", err)
	}
	allowedPayload := mustDecodedProjectPayload(t, project.Sections["allowed-section"].SharedModifier)
	got, ok := allowedPayload["tagColor"]
	if !ok || got != nil {
		t.Fatalf("expected allowed-section tagColor to clear to null, got %#v", allowedPayload["tagColor"])
	}
}

func TestServerSetSectionTagColorFailsClosedForUnknownSectionTarget(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_tag_color",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "missing-section",
			"tagColor":        "#123456",
		},
	})
	if err != nil {
		t.Fatalf("call missing-target set_section_tag_color: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected missing-target set_section_tag_color call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != scopeViolationErrorCode {
		t.Fatalf("expected scope_violation code, got %#v", payload["code"])
	}
	if payload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", payload["reason"])
	}
	if ids := mustStringList(t, payload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "missing-section" {
		t.Fatalf("expected blockedSectionIds [missing-section], got %#v", ids)
	}
	if ids := mustStringList(t, payload["targetSectionIds"]); len(ids) != 1 || ids[0] != "missing-section" {
		t.Fatalf("expected targetSectionIds [missing-section], got %#v", ids)
	}
}

func TestServerSetSectionStyleColorRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_style_color",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"styleColor":      "#654321",
		},
	})
	if err != nil {
		t.Fatalf("call set_section_style_color allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed set_section_style_color success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_section_style_color: %v", err)
	}
	allowedPayload := mustDecodedProjectPayload(t, project.Sections["allowed-section"].SharedModifier)
	if got := allowedPayload["styleColor"]; got != "#654321" {
		t.Fatalf("expected allowed-section styleColor #654321, got %#v", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_style_color",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-section",
			"styleColor":      "#123456",
		},
	})
	if err != nil {
		t.Fatalf("call set_section_style_color blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked set_section_style_color call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
	if ids := mustStringList(t, blockedPayload["targetSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("unexpected targetSectionIds %#v", ids)
	}
}

func TestServerSetSectionStyleColorClearsNull(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	styleColor := "#654321"
	if _, err := projectRuntime.SetSectionStyleColor(context.Background(), "project-alpha", "allowed-section", &styleColor); err != nil {
		t.Fatalf("seed style color: %v", err)
	}

	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_style_color",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"styleColor":      nil,
		},
	})
	if err != nil {
		t.Fatalf("call set_section_style_color clear: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected style-color clear success, got %#v", result.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after clearing style color: %v", err)
	}
	allowedPayload := mustDecodedProjectPayload(t, project.Sections["allowed-section"].SharedModifier)
	got, ok := allowedPayload["styleColor"]
	if !ok || got != nil {
		t.Fatalf("expected allowed-section styleColor to clear to null, got %#v", allowedPayload["styleColor"])
	}
}

func TestServerSetSectionStyleColorFailsClosedForUnknownSectionTarget(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_style_color",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "missing-section",
			"styleColor":      "#654321",
		},
	})
	if err != nil {
		t.Fatalf("call missing-target set_section_style_color: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected missing-target set_section_style_color call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != scopeViolationErrorCode {
		t.Fatalf("expected scope_violation code, got %#v", payload["code"])
	}
	if payload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", payload["reason"])
	}
	if ids := mustStringList(t, payload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "missing-section" {
		t.Fatalf("expected blockedSectionIds [missing-section], got %#v", ids)
	}
	if ids := mustStringList(t, payload["targetSectionIds"]); len(ids) != 1 || ids[0] != "missing-section" {
		t.Fatalf("expected targetSectionIds [missing-section], got %#v", ids)
	}
}

func TestServerSetSectionParamFilterRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_param_filter",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-params-section",
			"paramFilter":     "   ",
		},
	})
	if err != nil {
		t.Fatalf("call set_section_param_filter allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed set_section_param_filter success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_section_param_filter: %v", err)
	}
	allowedPayload := mustDecodedProjectPayload(t, project.Sections["allowed-params-section"].SharedModifier)
	if got := allowedPayload["paramFilter"]; got != "   " {
		t.Fatalf("expected allowed-params-section raw paramFilter whitespace, got %#v", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_param_filter",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-params-section",
			"paramFilter":     "blocked",
		},
	})
	if err != nil {
		t.Fatalf("call set_section_param_filter blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked set_section_param_filter call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-params-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
	if ids := mustStringList(t, blockedPayload["targetSectionIds"]); len(ids) != 1 || ids[0] != "blocked-params-section" {
		t.Fatalf("unexpected targetSectionIds %#v", ids)
	}
}

func TestServerSetSectionParamFilterRejectsUnsupportedSectionType(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_param_filter",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"paramFilter":     "alpha",
		},
	})
	if err != nil {
		t.Fatalf("call invalid set_section_param_filter: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid set_section_param_filter call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if message, ok := payload["message"].(string); !ok || !strings.Contains(message, "section does not support param filter") {
		t.Fatalf("expected unsupported param filter message, got %#v", payload["message"])
	}
}

func TestServerSetMetaControlShowSectionTitleRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustAddScopedTestMetaControlSections(t, projectRuntime)

	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_meta_control_show_section_title",
		Arguments: map[string]any{
			"projectConfigId":  "project-alpha",
			"sectionId":        "allowed-meta-section",
			"showSectionTitle": true,
		},
	})
	if err != nil {
		t.Fatalf("call set_meta_control_show_section_title allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed set_meta_control_show_section_title success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_meta_control_show_section_title: %v", err)
	}
	allowedPayload := mustDecodedProjectPayload(t, project.Sections["allowed-meta-section"].SharedModifier)
	if got := allowedPayload["showSectionTitle"]; got != true {
		t.Fatalf("expected allowed-meta-section showSectionTitle=true, got %#v", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_meta_control_show_section_title",
		Arguments: map[string]any{
			"projectConfigId":  "project-alpha",
			"sectionId":        "blocked-meta-section",
			"showSectionTitle": true,
		},
	})
	if err != nil {
		t.Fatalf("call set_meta_control_show_section_title blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked set_meta_control_show_section_title call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-meta-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
	if ids := mustStringList(t, blockedPayload["targetSectionIds"]); len(ids) != 1 || ids[0] != "blocked-meta-section" {
		t.Fatalf("unexpected targetSectionIds %#v", ids)
	}
}

func TestServerSetMetaControlShowSectionTitleRejectsNonMetaControlSection(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_meta_control_show_section_title",
		Arguments: map[string]any{
			"projectConfigId":  "project-alpha",
			"sectionId":        "allowed-params-section",
			"showSectionTitle": true,
		},
	})
	if err != nil {
		t.Fatalf("call invalid set_meta_control_show_section_title: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid set_meta_control_show_section_title call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if message, ok := payload["message"].(string); !ok || !strings.Contains(message, "section must resolve to a meta control section") {
		t.Fatalf("expected non-meta-control message, got %#v", payload["message"])
	}
}

func TestServerSetCodeRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"code":            "print('updated by set_code')\n",
		},
	})
	if err != nil {
		t.Fatalf("call set_code allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed set_code success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_code: %v", err)
	}
	payload := mustDecodedProjectPayload(t, project.Sections["allowed-section"].SharedModifier)
	if got := payload["code"]; got != "print('updated by set_code')\n" {
		t.Fatalf("expected updated code payload, got %#v", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-section",
			"code":            "print('blocked')\n",
		},
	})
	if err != nil {
		t.Fatalf("call set_code blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked set_code call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
}

func TestServerFormatCodeRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	var capturedProjectID string
	var capturedSectionID string
	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:  t.TempDir(),
		ProjectState:   projectRuntime,
		LSPDiagnostics: openScopedTestLSPDiagnosticsRegistry(),
		CodeUpdates: testCodeUpdateService{
			formatCode: func(_ context.Context, projectID string, sectionID string) error {
				capturedProjectID = projectID
				capturedSectionID = sectionID
				return nil
			},
		},
	})
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "format_code",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
		},
	})
	if err != nil {
		t.Fatalf("call format_code allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed format_code success, got %#v", allowedResult.StructuredContent)
	}
	if capturedProjectID != "project-alpha" || capturedSectionID != "allowed-section" {
		t.Fatalf("unexpected allowed format_code call project=%q section=%q", capturedProjectID, capturedSectionID)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "format_code",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-section",
		},
	})
	if err != nil {
		t.Fatalf("call format_code blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked format_code call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
	if capturedProjectID != "project-alpha" || capturedSectionID != "allowed-section" {
		t.Fatalf("expected blocked format_code not to reach provider, got project=%q section=%q", capturedProjectID, capturedSectionID)
	}
}

func TestServerSetTopLevelSectionLayoutRespectsScopedStructuralTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	if _, _, err := projectRuntime.CreateViewMode(context.Background(), "project-alpha"); err != nil {
		t.Fatalf("seed view mode: %v", err)
	}
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedLayout := map[string]any{
		"x":      345.5,
		"y":      210.25,
		"zIndex": 7,
		"w":      640.0,
		"h":      320.0,
	}
	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_top_level_section_layout",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"topLevelSections": map[string]any{
				"allowed-section": allowedLayout,
			},
		},
	})
	if err != nil {
		t.Fatalf("call set_top_level_section_layout allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed set_top_level_section_layout success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_top_level_section_layout: %v", err)
	}
	layout := project.TopLevelSections["allowed-section"]
	if layout.X != 345.5 || layout.Y != 210.25 || layout.ZIndex != 7 {
		t.Fatalf("unexpected persisted top-level layout %#v", layout)
	}
	if layout.W == nil || *layout.W != 640.0 {
		t.Fatalf("expected persisted width 640, got %#v", layout.W)
	}
	if layout.H == nil || *layout.H != 320.0 {
		t.Fatalf("expected persisted height 320, got %#v", layout.H)
	}
	viewMode := project.ViewModes[project.ActiveViewModeID]
	activeLayout := viewMode.TopLevelSections["allowed-section"]
	if activeLayout.X != layout.X || activeLayout.Y != layout.Y || activeLayout.ZIndex != layout.ZIndex {
		t.Fatalf("expected active view-mode layout %#v, got %#v", layout, activeLayout)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_top_level_section_layout",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"topLevelSections": map[string]any{
				"blocked-section": map[string]any{"x": 1.0, "y": 2.0},
			},
		},
	})
	if err != nil {
		t.Fatalf("call set_top_level_section_layout blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked set_top_level_section_layout call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
}

func TestServerAutoLayoutTopLevelSectionsRequiresStructuralScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	if _, _, err := projectRuntime.CreateViewMode(context.Background(), "project-alpha"); err != nil {
		t.Fatalf("seed view mode: %v", err)
	}
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "auto_layout_top_level_sections",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"margin":          10,
		},
	})
	if err != nil {
		t.Fatalf("call auto_layout_top_level_sections blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked auto_layout_top_level_sections call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "structural_denied" {
		t.Fatalf("expected structural_denied reason, got %#v", payload["reason"])
	}
}

func TestServerAutoLayoutTopLevelSectionsAllowsUnscopedStructuralCallsAndTranslatesTemporaryProjectID(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	if _, _, err := projectRuntime.CreateViewMode(context.Background(), "project-alpha"); err != nil {
		t.Fatalf("seed view mode: %v", err)
	}
	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before auto layout: %v", err)
	}
	beforeAllowed := project.TopLevelSections["allowed-section"]
	beforeBlocked := project.TopLevelSections["blocked-section"]

	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha": "11",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "auto_layout_top_level_sections",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"margin":          10,
		},
	})
	if err != nil {
		t.Fatalf("call temp-id auto_layout_top_level_sections: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id auto_layout_top_level_sections success, got %#v", result.StructuredContent)
	}

	project, err = projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after auto layout: %v", err)
	}
	afterAllowed := project.TopLevelSections["allowed-section"]
	afterBlocked := project.TopLevelSections["blocked-section"]
	if afterAllowed == beforeAllowed && afterBlocked == beforeBlocked {
		t.Fatalf(
			"expected auto layout to rewrite top-level layouts, allowed before=%#v after=%#v blocked before=%#v after=%#v",
			beforeAllowed,
			afterAllowed,
			beforeBlocked,
			afterBlocked,
		)
	}
}

func TestServerAutoLayoutTopLevelSectionsRejectsInvalidMargin(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	if _, _, err := projectRuntime.CreateViewMode(context.Background(), "project-alpha"); err != nil {
		t.Fatalf("seed view mode: %v", err)
	}
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "auto_layout_top_level_sections",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"margin":          -1,
		},
	})
	if err != nil {
		t.Fatalf("call invalid-margin auto_layout_top_level_sections: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid-margin auto_layout_top_level_sections call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if message, ok := payload["message"].(string); !ok || !strings.Contains(message, "Auto layout margin must be non-negative.") {
		t.Fatalf("expected invalid margin message, got %#v", payload["message"])
	}
}

func TestServerSetShowParamDisplayNamesRequiresStructuralScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_show_param_display_names",
		Arguments: map[string]any{
			"projectConfigId":       "project-alpha",
			"showParamDisplayNames": true,
		},
	})
	if err != nil {
		t.Fatalf("call set_show_param_display_names blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked set_show_param_display_names call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "structural_denied" {
		t.Fatalf("expected structural_denied reason, got %#v", payload["reason"])
	}
}

func TestServerSetShowParamDisplayNamesAllowsUnscopedStructuralCallsAndTranslatesTemporaryProjectID(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before show-param toggle: %v", err)
	}
	if project.ShowParamDisplayNames {
		t.Fatal("expected ShowParamDisplayNames=false before mutation")
	}

	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha": "11",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_show_param_display_names",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId":       "11",
			"showParamDisplayNames": true,
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_show_param_display_names: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_show_param_display_names success, got %#v", result.StructuredContent)
	}

	project, err = projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after show-param toggle: %v", err)
	}
	if !project.ShowParamDisplayNames {
		t.Fatal("expected ShowParamDisplayNames=true after mutation")
	}
}

func TestServerSetWatchCodeEnabledRequiresStructuralScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_watch_code_enabled",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"enabled":         true,
		},
	})
	if err != nil {
		t.Fatalf("call set_watch_code_enabled blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked set_watch_code_enabled call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "structural_denied" {
		t.Fatalf("expected structural_denied reason, got %#v", payload["reason"])
	}
}

func TestServerSetWatchCodeEnabledAllowsUnscopedStructuralCallsAndTranslatesTemporaryProjectID(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	watchFile := filepath.Join(workspaceRoot, "pkg", "watch_me.py")
	if err := os.MkdirAll(filepath.Dir(watchFile), 0o755); err != nil {
		t.Fatalf("mkdir watch file parent: %v", err)
	}
	if err := os.WriteFile(watchFile, []byte("def existing(value):\n    return value\n"), 0o644); err != nil {
		t.Fatalf("write watch file: %v", err)
	}

	projectRuntime := openScopedTestProjectRuntime(t)
	mustSetScopedTestWatchCodeFiles(t, projectRuntime, []string{"pkg/watch_me.py"})

	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha": "11",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:      workspaceRoot,
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_watch_code_enabled",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"enabled":         true,
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_watch_code_enabled: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_watch_code_enabled success, got %#v", result.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_watch_code_enabled: %v", err)
	}
	if !project.WatchCodeEnabled {
		t.Fatal("expected watch code to be enabled after mutation")
	}
	expectedBaselineKey := filepath.Clean(watchFile)
	expectedIdentity := "pkg.watch_me.existing:function"
	if ids := project.WatchCodeBaselineByPath[expectedBaselineKey]; len(ids) != 1 || ids[0] != expectedIdentity {
		t.Fatalf("expected watch code baseline [%s] for %q, got %#v", expectedIdentity, expectedBaselineKey, project.WatchCodeBaselineByPath)
	}
	if len(project.WatchCodeRegistry) != 0 {
		t.Fatalf("expected empty watch code registry after baseline-on-enable, got %#v", project.WatchCodeRegistry)
	}
}

func TestServerSetWatchCodeEnabledRejectsInvalidWatchInputPath(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustSetScopedTestWatchCodeFiles(t, projectRuntime, []string{"../outside_watch.py"})

	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_watch_code_enabled",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"enabled":         true,
		},
	})
	if err != nil {
		t.Fatalf("call invalid set_watch_code_enabled: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid set_watch_code_enabled call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if message, ok := payload["message"].(string); !ok || !strings.Contains(message, "watch code input path is invalid") {
		t.Fatalf("expected invalid watch code path message, got %#v", payload["message"])
	}
}

func TestServerSetAppDefinitionRequiresStructuralScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_app_definition",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"appSpec": map[string]any{
				"root":     map[string]any{"key": "root", "type": "Stack"},
				"elements": map[string]any{},
			},
		},
	})
	if err != nil {
		t.Fatalf("call set_app_definition blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked set_app_definition call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "structural_denied" {
		t.Fatalf("expected structural_denied reason, got %#v", payload["reason"])
	}
}

func TestServerGetAppDefinitionAllowsUnscopedStructuralCallsAndTranslatesTemporaryProjectID(t *testing.T) {
	t.Parallel()

	root, projectRuntime := openPersistedAppDefinitionTestProjectRuntime(t)
	if _, _, err := projectRuntime.SetAppDefinition(context.Background(), projectstate.SetAppDefinitionInput{
		AppSpec: map[string]any{
			"root":     map[string]any{"key": "root", "type": "Stack"},
			"elements": map[string]any{},
		},
	}); err != nil {
		t.Fatalf("seed app definition: %v", err)
	}

	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha": "11",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_app_definition",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id get_app_definition: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id get_app_definition success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	appDefinition := mustStructuredMap(t, payload["appDefinition"])
	if appDefinition["appSpecPath"] != appspec.DefaultPath() {
		t.Fatalf("expected default app spec path %q, got %#v", appspec.DefaultPath(), appDefinition["appSpecPath"])
	}
	storedSpec, err := appspec.Read(root, appspec.DefaultPath())
	if err != nil {
		t.Fatalf("read stored app spec: %v", err)
	}
	if !reflect.DeepEqual(storedSpec, payload["appSpec"]) {
		t.Fatalf("expected stored app spec %#v, got %#v", storedSpec, payload["appSpec"])
	}
}

func TestServerValidateAppDefinitionAllowsUnscopedStructuralCallsAndTranslatesTemporaryProjectID(t *testing.T) {
	t.Parallel()

	_, projectRuntime := openPersistedAppDefinitionTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha": "11",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "validate_app_definition",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"appSpec": map[string]any{
				"root": map[string]any{
					"key":  "run-btn",
					"type": "ActionButton",
					"props": map[string]any{
						"label":  "Run",
						"action": "run",
					},
				},
				"elements": map[string]any{},
			},
			"theme": map[string]any{
				"vars": map[string]any{
					"accent":       "#fff",
					"--app-accent": "#fff",
				},
			},
			"assets": []any{
				map[string]any{"href": "https://example.com/app.css"},
			},
		},
	})
	if err != nil {
		t.Fatalf("call temp-id validate_app_definition: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id validate_app_definition success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	errors, ok := payload["errors"].([]any)
	if !ok {
		t.Fatalf("expected errors array, got %#v", payload["errors"])
	}
	if len(errors) != 0 {
		t.Fatalf("expected no validation errors, got %#v", errors)
	}
	warnings, ok := payload["warnings"].([]any)
	if !ok {
		t.Fatalf("expected warnings array, got %#v", payload["warnings"])
	}
	if len(warnings) < 3 {
		t.Fatalf("expected multiple warnings, got %#v", warnings)
	}
	capabilities := mustStructuredMap(t, payload["capabilities"])
	if capabilities["catalogId"] != appspec.DefaultCatalogID {
		t.Fatalf("expected catalog id %q, got %#v", appspec.DefaultCatalogID, capabilities["catalogId"])
	}
	features := mustStructuredMap(t, capabilities["features"])
	if features["responsive"] != true || features["motion"] != true {
		t.Fatalf("expected responsive and motion feature flags, got %#v", features)
	}
}

func TestServerSetAppDefinitionAllowsUnscopedStructuralCallsAndTranslatesTemporaryProjectID(t *testing.T) {
	t.Parallel()

	root, projectRuntime := openPersistedAppDefinitionTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha": "11",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_app_definition",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"appSpec": map[string]any{
				"root":     map[string]any{"key": "root", "type": "Stack"},
				"elements": map[string]any{},
			},
			"appSpecPath":    "app_specs/custom.json",
			"appSpecVersion": "v2",
			"catalogId":      appspec.DefaultCatalogID,
			"routes": []any{
				map[string]any{"path": "/", "name": "Home", "rootKey": "root"},
			},
			"theme": map[string]any{"mode": "dark"},
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_app_definition: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_app_definition success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	appDefinition := mustStructuredMap(t, payload["appDefinition"])
	if appDefinition["appSpecPath"] != "app_specs/custom.json" {
		t.Fatalf("expected normalized app spec path, got %#v", appDefinition["appSpecPath"])
	}
	if appDefinition["appSpecVersion"] != "v2" {
		t.Fatalf("expected app spec version v2, got %#v", appDefinition["appSpecVersion"])
	}

	storedSpec, err := appspec.Read(root, "app_specs/custom.json")
	if err != nil {
		t.Fatalf("read stored app spec: %v", err)
	}
	if !reflect.DeepEqual(storedSpec, payload["appSpec"]) {
		t.Fatalf("expected stored app spec %#v, got %#v", payload["appSpec"], storedSpec)
	}
	if projectRuntime.Snapshot().Document.AppDefinition == nil || projectRuntime.Snapshot().Document.AppDefinition.AppSpecPath != "app_specs/custom.json" {
		t.Fatalf("expected runtime app definition after mutation, got %#v", projectRuntime.Snapshot().Document.AppDefinition)
	}
}

func TestServerUpdateAppDefinitionAllowsUnscopedStructuralCallsAndTranslatesTemporaryProjectID(t *testing.T) {
	t.Parallel()

	root, projectRuntime := openPersistedAppDefinitionTestProjectRuntime(t)
	if _, _, err := projectRuntime.SetAppDefinition(context.Background(), projectstate.SetAppDefinitionInput{
		AppSpec: map[string]any{
			"root": map[string]any{
				"key":  "root",
				"type": "Stack",
				"props": map[string]any{
					"gap":       float64(8),
					"direction": "column",
				},
			},
			"elements": map[string]any{},
		},
	}); err != nil {
		t.Fatalf("seed app definition: %v", err)
	}

	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha": "11",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "update_app_definition",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"patch": map[string]any{
				"root": map[string]any{
					"props": map[string]any{
						"gap": float64(12),
					},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("call temp-id update_app_definition: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id update_app_definition success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	appSpec := mustStructuredMap(t, payload["appSpec"])
	rootSpec := mustStructuredMap(t, appSpec["root"])
	props := mustStructuredMap(t, rootSpec["props"])
	if props["gap"] != float64(12) {
		t.Fatalf("expected merged gap 12, got %#v", props["gap"])
	}
	if props["direction"] != "column" {
		t.Fatalf("expected preserved direction column, got %#v", props["direction"])
	}

	storedSpec, err := appspec.Read(root, appspec.DefaultPath())
	if err != nil {
		t.Fatalf("read stored app spec: %v", err)
	}
	if !reflect.DeepEqual(storedSpec, payload["appSpec"]) {
		t.Fatalf("expected stored app spec %#v, got %#v", payload["appSpec"], storedSpec)
	}
}

func TestServerUpdateAppDefinitionReturnsFileNotFoundWhenStoredSpecIsMissing(t *testing.T) {
	t.Parallel()

	_, projectRuntime := openPersistedAppDefinitionTestProjectRuntime(t)
	if _, err := projectRuntime.Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.AppDefinition = &projectstate.AppDefinition{
			AppSpecPath:    appspec.DefaultPath(),
			AppSpecVersion: "v1",
			CatalogID:      appspec.DefaultCatalogID,
		}
		return document, nil
	}); err != nil {
		t.Fatalf("seed missing app definition metadata: %v", err)
	}
	if _, err := projectRuntime.Save(context.Background()); err != nil {
		t.Fatalf("save missing app definition metadata: %v", err)
	}

	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "update_app_definition",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"patch": map[string]any{
				"root": map[string]any{"type": "Stack"},
			},
		},
	})
	if err != nil {
		t.Fatalf("call missing-spec update_app_definition: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected missing-spec update_app_definition call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "file_not_found" {
		t.Fatalf("expected file_not_found code, got %#v", payload["code"])
	}
}

func TestServerSetWatchCodeInputsRequiresStructuralScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_watch_code_inputs",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"watchCodeFolders": []any{
				map[string]any{"path": "pkg", "recursive": true},
			},
			"watchCodeFiles": []any{"pkg/existing.py"},
		},
	})
	if err != nil {
		t.Fatalf("call set_watch_code_inputs blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked set_watch_code_inputs call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "structural_denied" {
		t.Fatalf("expected structural_denied reason, got %#v", payload["reason"])
	}
}

func TestServerSetWatchCodeInputsAllowsUnscopedStructuralCallsAndTranslatesTemporaryProjectID(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	existingFile := filepath.Join(workspaceRoot, "pkg", "existing.py")
	newFolderFile := filepath.Join(workspaceRoot, "pkg", "subdir", "added.py")
	if err := os.MkdirAll(filepath.Dir(newFolderFile), 0o755); err != nil {
		t.Fatalf("mkdir watch file parent: %v", err)
	}
	if err := os.WriteFile(existingFile, []byte("def existing(value):\n    return value\n"), 0o644); err != nil {
		t.Fatalf("write existing file: %v", err)
	}
	if err := os.WriteFile(newFolderFile, []byte("def added(value):\n    return value\n"), 0o644); err != nil {
		t.Fatalf("write new file: %v", err)
	}

	projectRuntime := openScopedTestProjectRuntime(t)
	existingBaselineKey := filepath.Clean(existingFile)
	mustSetScopedTestWatchCodeState(t, projectRuntime, true, nil, []string{"pkg/existing.py"}, map[string][]string{
		existingBaselineKey: {"pkg.existing.existing:function"},
	})

	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha": "11",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:      workspaceRoot,
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_watch_code_inputs",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"watchCodeFolders": []any{
				map[string]any{"path": "pkg/subdir", "recursive": true},
			},
			"watchCodeFiles": []any{"pkg/existing.py"},
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_watch_code_inputs: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_watch_code_inputs success, got %#v", result.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_watch_code_inputs: %v", err)
	}
	if !project.WatchCodeEnabled {
		t.Fatal("expected watch code to stay enabled after mutation")
	}
	if !reflect.DeepEqual(project.WatchCodeFolders, []projectstate.WatchCodeFolder{{Path: "pkg/subdir", Recursive: true}}) {
		t.Fatalf("expected normalized watch code folders, got %#v", project.WatchCodeFolders)
	}
	if !reflect.DeepEqual(project.WatchCodeFiles, []string{"pkg/existing.py"}) {
		t.Fatalf("expected normalized watch code files, got %#v", project.WatchCodeFiles)
	}
	if got := project.WatchCodeBaselineByPath[existingBaselineKey]; !reflect.DeepEqual(got, []string{"pkg.existing.existing:function"}) {
		t.Fatalf("expected existing baseline unchanged, got %#v", project.WatchCodeBaselineByPath)
	}
	newBaselineKey := filepath.Clean(newFolderFile)
	if got := project.WatchCodeBaselineByPath[newBaselineKey]; !reflect.DeepEqual(got, []string{"pkg.subdir.added.added:function"}) {
		t.Fatalf("expected new folder baseline, got %#v", project.WatchCodeBaselineByPath)
	}
	if len(project.WatchCodeRegistry) != 0 {
		t.Fatalf("expected empty watch code registry after baseline-for-new-inputs, got %#v", project.WatchCodeRegistry)
	}
}

func TestServerSetWatchCodeInputsRejectsInvalidWatchFolderPath(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_watch_code_inputs",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"watchCodeFolders": []any{
				map[string]any{"path": "../outside_watch_dir", "recursive": false},
			},
			"watchCodeFiles": []any{},
		},
	})
	if err != nil {
		t.Fatalf("call invalid set_watch_code_inputs: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid set_watch_code_inputs call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if message, ok := payload["message"].(string); !ok || !strings.Contains(message, "watch code input path is invalid") {
		t.Fatalf("expected invalid watch code path message, got %#v", payload["message"])
	}
}

func TestServerCompareAndSetShowParamDisplayNamesRequiresStructuralScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "compare_and_set_show_param_display_names",
		Arguments: map[string]any{
			"projectConfigId":       "project-alpha",
			"showParamDisplayNames": true,
			"expectedOldValue":      false,
		},
	})
	if err != nil {
		t.Fatalf("call compare_and_set_show_param_display_names blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked compare_and_set_show_param_display_names call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "structural_denied" {
		t.Fatalf("expected structural_denied reason, got %#v", payload["reason"])
	}
}

func TestServerCompareAndSetShowParamDisplayNamesAllowsUnscopedStructuralCallsAndTranslatesTemporaryProjectID(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before CAS show-param toggle: %v", err)
	}
	if project.ShowParamDisplayNames {
		t.Fatal("expected ShowParamDisplayNames=false before mutation")
	}

	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha": "11",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "compare_and_set_show_param_display_names",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId":       "11",
			"showParamDisplayNames": true,
			"expectedOldValue":      false,
		},
	})
	if err != nil {
		t.Fatalf("call temp-id compare_and_set_show_param_display_names: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id compare_and_set_show_param_display_names success, got %#v", result.StructuredContent)
	}

	project, err = projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after CAS show-param toggle: %v", err)
	}
	if !project.ShowParamDisplayNames {
		t.Fatal("expected ShowParamDisplayNames=true after mutation")
	}
}

func TestServerCompareAndSetWatchCodeEnabledReturnsMutationFailedForStaleExpectedOldValue(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "compare_and_set_watch_code_enabled",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId":  "project-alpha",
			"enabled":          true,
			"expectedOldValue": true,
		},
	})
	if err != nil {
		t.Fatalf("call stale compare_and_set_watch_code_enabled: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected stale compare_and_set_watch_code_enabled call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "mutation_failed" {
		t.Fatalf("expected mutation_failed code, got %#v", payload["code"])
	}
	if message, ok := payload["message"].(string); !ok || !strings.Contains(message, "core.watch_code.enabled changed since pre-write validation") {
		t.Fatalf("expected stale watch-code message, got %#v", payload["message"])
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after stale CAS watch-code enabled: %v", err)
	}
	if project.WatchCodeEnabled {
		t.Fatal("expected watch code to remain disabled after stale CAS call")
	}
}

func TestServerCompareAndSetWatchCodeFoldersAllowsUnscopedStructuralCallsAndTranslatesTemporaryProjectID(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	existingFile := filepath.Join(workspaceRoot, "pkg", "existing.py")
	newFolderFile := filepath.Join(workspaceRoot, "pkg", "subdir", "added.py")
	if err := os.MkdirAll(filepath.Dir(newFolderFile), 0o755); err != nil {
		t.Fatalf("mkdir watch file parent: %v", err)
	}
	if err := os.WriteFile(existingFile, []byte("def existing(value):\n    return value\n"), 0o644); err != nil {
		t.Fatalf("write existing file: %v", err)
	}
	if err := os.WriteFile(newFolderFile, []byte("def added(value):\n    return value\n"), 0o644); err != nil {
		t.Fatalf("write new file: %v", err)
	}

	projectRuntime := openScopedTestProjectRuntime(t)
	existingBaselineKey := filepath.Clean(existingFile)
	mustSetScopedTestWatchCodeState(t, projectRuntime, true, nil, []string{"pkg/existing.py"}, map[string][]string{
		existingBaselineKey: {"pkg.existing.existing:function"},
	})

	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha": "11",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:      workspaceRoot,
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "compare_and_set_watch_code_folders",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"watchCodeFolders": []any{
				map[string]any{"path": "pkg/subdir", "recursive": true},
			},
			"expectedOldValue": []any{},
		},
	})
	if err != nil {
		t.Fatalf("call temp-id compare_and_set_watch_code_folders: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id compare_and_set_watch_code_folders success, got %#v", result.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after compare_and_set_watch_code_folders: %v", err)
	}
	if !reflect.DeepEqual(project.WatchCodeFolders, []projectstate.WatchCodeFolder{{Path: "pkg/subdir", Recursive: true}}) {
		t.Fatalf("expected normalized watch code folders, got %#v", project.WatchCodeFolders)
	}
	if !reflect.DeepEqual(project.WatchCodeFiles, []string{"pkg/existing.py"}) {
		t.Fatalf("expected watch code files unchanged, got %#v", project.WatchCodeFiles)
	}
	if got := project.WatchCodeBaselineByPath[existingBaselineKey]; !reflect.DeepEqual(got, []string{"pkg.existing.existing:function"}) {
		t.Fatalf("expected existing baseline unchanged, got %#v", project.WatchCodeBaselineByPath)
	}
	newBaselineKey := filepath.Clean(newFolderFile)
	if got := project.WatchCodeBaselineByPath[newBaselineKey]; !reflect.DeepEqual(got, []string{"pkg.subdir.added.added:function"}) {
		t.Fatalf("expected new folder baseline, got %#v", project.WatchCodeBaselineByPath)
	}
}

func TestServerCompareAndSetWatchCodeFilesAllowsUnscopedStructuralCallsAndTranslatesTemporaryProjectID(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	existingFile := filepath.Join(workspaceRoot, "pkg", "existing.py")
	newFile := filepath.Join(workspaceRoot, "pkg", "new_watch.py")
	if err := os.MkdirAll(filepath.Dir(existingFile), 0o755); err != nil {
		t.Fatalf("mkdir existing file parent: %v", err)
	}
	if err := os.WriteFile(existingFile, []byte("def existing(value):\n    return value\n"), 0o644); err != nil {
		t.Fatalf("write existing file: %v", err)
	}
	if err := os.WriteFile(newFile, []byte("class Added:\n    def __init__(self, value):\n        self.value = value\n"), 0o644); err != nil {
		t.Fatalf("write new file: %v", err)
	}

	projectRuntime := openScopedTestProjectRuntime(t)
	existingBaselineKey := filepath.Clean(existingFile)
	mustSetScopedTestWatchCodeState(t, projectRuntime, true, nil, []string{"pkg/existing.py"}, map[string][]string{
		existingBaselineKey: {"pkg.existing.existing:function"},
	})

	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha": "11",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:      workspaceRoot,
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "compare_and_set_watch_code_files",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId":  "11",
			"watchCodeFiles":   []any{"pkg/existing.py", "pkg/new_watch.py"},
			"expectedOldValue": []any{"pkg/existing.py"},
		},
	})
	if err != nil {
		t.Fatalf("call temp-id compare_and_set_watch_code_files: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id compare_and_set_watch_code_files success, got %#v", result.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after compare_and_set_watch_code_files: %v", err)
	}
	if !reflect.DeepEqual(project.WatchCodeFiles, []string{"pkg/existing.py", "pkg/new_watch.py"}) {
		t.Fatalf("expected normalized watch code files, got %#v", project.WatchCodeFiles)
	}
	if got := project.WatchCodeBaselineByPath[existingBaselineKey]; !reflect.DeepEqual(got, []string{"pkg.existing.existing:function"}) {
		t.Fatalf("expected existing baseline unchanged, got %#v", project.WatchCodeBaselineByPath)
	}
	newBaselineKey := filepath.Clean(newFile)
	if got := project.WatchCodeBaselineByPath[newBaselineKey]; !reflect.DeepEqual(got, []string{"pkg.new_watch.Added:class_init"}) {
		t.Fatalf("expected new watch-file baseline, got %#v", project.WatchCodeBaselineByPath)
	}
}

func TestServerSetProjectConfigCodegenTargetsRejectsPluginTargetsBeforeScopeCheck(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_project_config_codegen_targets",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"codegenTargets": []any{
				map[string]any{
					"language": "setta-fixture-backend-codegen:typescript",
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("call set_project_config_codegen_targets blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid set_project_config_codegen_targets call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "scope_violation" {
		t.Fatalf("expected scope_violation code, got %#v", payload["code"])
	}
	if payload["reason"] != "structural_denied" {
		t.Fatalf("expected structural_denied reason, got %#v", payload["reason"])
	}
}

func TestServerSetProjectConfigCodegenTargetsSupportsPluginTargetsWithTemporaryProjectID(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha": "11",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
		CodegenTargetValidator: projectstate.CodegenTargetValidatorFunc(func(context.Context, projectstate.ProjectCodegenTarget) error {
			return nil
		}),
		PythonCodegenSectionReconciler: projectstate.PythonCodegenSectionReconcilerFunc(func(context.Context, *projectstate.Project) error {
			return nil
		}),
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_project_config_codegen_targets",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"codegenTargets": []any{
				map[string]any{
					"language": "setta-fixture-backend-codegen:typescript",
					"options":  map[string]any{"className": "ScopedMCPState"},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_project_config_codegen_targets: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_project_config_codegen_targets success, got %#v", result.StructuredContent)
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["status"] != "ok" {
		t.Fatalf("expected ok status, got %#v", payload)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id set_project_config_codegen_targets: %v", err)
	}
	if len(project.CodegenTargets) != 1 || project.CodegenTargets[0].Language != "setta-fixture-backend-codegen:typescript" {
		t.Fatalf("expected persisted plugin codegen target, got %#v", project.CodegenTargets)
	}
}

func TestServerSetProjectConfigCodegenTargetsRejectsDuplicateLanguages(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot: t.TempDir(),
		ProjectState:  projectRuntime,
		CodegenTargetValidator: projectstate.CodegenTargetValidatorFunc(func(context.Context, projectstate.ProjectCodegenTarget) error {
			return nil
		}),
		PythonCodegenSectionReconciler: projectstate.PythonCodegenSectionReconcilerFunc(func(context.Context, *projectstate.Project) error {
			return nil
		}),
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_project_config_codegen_targets",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"codegenTargets": []any{
				map[string]any{"language": "python"},
				map[string]any{"language": "python", "generateMetadata": true},
			},
		},
	})
	if err != nil {
		t.Fatalf("call invalid set_project_config_codegen_targets: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid set_project_config_codegen_targets call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if message, ok := payload["message"].(string); !ok || !strings.Contains(message, "project codegen target language must be unique") {
		t.Fatalf("expected duplicate codegen target message, got %#v", payload["message"])
	}
}

func TestServerSetGenCodePrefixRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	enableScopedTestPythonCodegenTarget(t, projectRuntime)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_gen_code_prefix",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"genCodePrefix":   "import math\n",
		},
	})
	if err != nil {
		t.Fatalf("call set_gen_code_prefix blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked set_gen_code_prefix call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", payload["reason"])
	}
	if ids := mustStringList(t, payload["targetSectionIds"]); len(ids) != 1 || ids[0] != projectstate.GeneratedPythonCodeSectionID {
		t.Fatalf("expected generated python targetSectionIds, got %#v", ids)
	}
	if ids := mustStringList(t, payload["blockedSectionIds"]); len(ids) != 1 || ids[0] != projectstate.GeneratedPythonCodeSectionID {
		t.Fatalf("expected generated python blockedSectionIds, got %#v", ids)
	}
}

func TestServerSetGenCodePrefixAllowsUnscopedCallsAndTranslatesTemporaryProjectID(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	enableScopedTestPythonCodegenTarget(t, projectRuntime)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha": "11",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_gen_code_prefix",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"genCodePrefix":   "import math\n",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_gen_code_prefix: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_gen_code_prefix success, got %#v", result.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_gen_code_prefix: %v", err)
	}
	config, ok, err := project.PythonCodegenTarget()
	if err != nil {
		t.Fatalf("decode python target after set_gen_code_prefix: %v", err)
	}
	if !ok {
		t.Fatal("expected python target after set_gen_code_prefix")
	}
	if config.GenCodePrefix != "import math\n" {
		t.Fatalf("expected persisted gen code prefix, got %q", config.GenCodePrefix)
	}
}

func TestServerSetGenCodePrefixRejectsProjectsWithoutPythonCodegen(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_gen_code_prefix",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"genCodePrefix":   "import math\n",
		},
	})
	if err != nil {
		t.Fatalf("call invalid set_gen_code_prefix: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid set_gen_code_prefix call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if message, ok := payload["message"].(string); !ok || !strings.Contains(message, "project python codegen target was not found") {
		t.Fatalf("expected missing python target message, got %#v", payload["message"])
	}
}

func TestServerSetGenCodeSuffixRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	enableScopedTestPythonCodegenTarget(t, projectRuntime)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_gen_code_suffix",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"genCodeSuffix":   "state = CustomState()\n",
		},
	})
	if err != nil {
		t.Fatalf("call set_gen_code_suffix blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked set_gen_code_suffix call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", payload["reason"])
	}
	if ids := mustStringList(t, payload["targetSectionIds"]); len(ids) != 1 || ids[0] != projectstate.GeneratedPythonCodeSectionID {
		t.Fatalf("expected generated python targetSectionIds, got %#v", ids)
	}
	if ids := mustStringList(t, payload["blockedSectionIds"]); len(ids) != 1 || ids[0] != projectstate.GeneratedPythonCodeSectionID {
		t.Fatalf("expected generated python blockedSectionIds, got %#v", ids)
	}
}

func TestServerSetGenCodeSuffixAllowsUnscopedCallsAndTranslatesTemporaryProjectID(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	enableScopedTestPythonCodegenTarget(t, projectRuntime)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha": "11",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_gen_code_suffix",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"genCodeSuffix":   "state = CustomState()\n",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_gen_code_suffix: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_gen_code_suffix success, got %#v", result.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_gen_code_suffix: %v", err)
	}
	config, ok, err := project.PythonCodegenTarget()
	if err != nil {
		t.Fatalf("decode python target after set_gen_code_suffix: %v", err)
	}
	if !ok {
		t.Fatal("expected python target after set_gen_code_suffix")
	}
	if config.GenCodeSuffix != "state = CustomState()\n" {
		t.Fatalf("expected persisted gen code suffix, got %q", config.GenCodeSuffix)
	}
}

func TestServerSetGenCodeSuffixRejectsProjectsWithoutPythonCodegen(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_gen_code_suffix",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"genCodeSuffix":   "state = CustomState()\n",
		},
	})
	if err != nil {
		t.Fatalf("call invalid set_gen_code_suffix: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid set_gen_code_suffix call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if message, ok := payload["message"].(string); !ok || !strings.Contains(message, "project python codegen target was not found") {
		t.Fatalf("expected missing python target message, got %#v", payload["message"])
	}
}

func TestServerTogglePositionLocksRequiresStructuralScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "toggle_position_locks",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionIds":      []string{"blocked-section"},
		},
	})
	if err != nil {
		t.Fatalf("call toggle_position_locks blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked toggle_position_locks call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "structural_denied" {
		t.Fatalf("expected structural_denied reason, got %#v", payload["reason"])
	}
	if ids := mustStringList(t, payload["targetSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("expected targetSectionIds [blocked-section], got %#v", ids)
	}
	if ids := mustStringList(t, payload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("expected blockedSectionIds [blocked-section], got %#v", ids)
	}
}

func TestServerTogglePositionLocksAllowsUnscopedStructuralCallsAndTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before toggle_position_locks: %v", err)
	}
	if len(project.Sections["allowed-section"].SharedModifier) != 0 &&
		payloadBoolField(mustDecodedProjectPayload(t, project.Sections["allowed-section"].SharedModifier), "positionAndSizeLocked") {
		t.Fatal("expected allowed-section to start unlocked")
	}
	if len(project.Sections["blocked-section"].SharedModifier) != 0 &&
		payloadBoolField(mustDecodedProjectPayload(t, project.Sections["blocked-section"].SharedModifier), "positionAndSizeLocked") {
		t.Fatal("expected blocked-section to start unlocked")
	}

	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":   "11",
		"allowed-section": "14",
		"blocked-section": "16",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "toggle_position_locks",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionIds":      []string{"14", "16"},
		},
	})
	if err != nil {
		t.Fatalf("call temp-id toggle_position_locks: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id toggle_position_locks success, got %#v", result.StructuredContent)
	}

	project, err = projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after toggle_position_locks: %v", err)
	}
	if !payloadBoolField(mustDecodedProjectPayload(t, project.Sections["allowed-section"].SharedModifier), "positionAndSizeLocked") {
		t.Fatal("expected allowed-section to be locked after mutation")
	}
	if !payloadBoolField(mustDecodedProjectPayload(t, project.Sections["blocked-section"].SharedModifier), "positionAndSizeLocked") {
		t.Fatal("expected blocked-section to be locked after mutation")
	}
}

func TestServerTogglePositionLocksRejectsUnknownSection(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "toggle_position_locks",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionIds":      []string{"missing-section"},
		},
	})
	if err != nil {
		t.Fatalf("call invalid toggle_position_locks: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid toggle_position_locks call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if message, ok := payload["message"].(string); !ok || !strings.Contains(message, "missing-section") {
		t.Fatalf("expected missing-section message, got %#v", payload["message"])
	}
}

func TestServerToggleMinimizedRequiresStructuralScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "toggle_minimized",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-section",
		},
	})
	if err != nil {
		t.Fatalf("call toggle_minimized blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked toggle_minimized call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "structural_denied" {
		t.Fatalf("expected structural_denied reason, got %#v", payload["reason"])
	}
	if ids := mustStringList(t, payload["targetSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("expected targetSectionIds [blocked-section], got %#v", ids)
	}
	if ids := mustStringList(t, payload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("expected blockedSectionIds [blocked-section], got %#v", ids)
	}
}

func TestServerToggleMinimizedAllowsUnscopedStructuralCallsAndTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before toggle_minimized: %v", err)
	}
	if len(project.Sections["allowed-section"].SharedModifier) != 0 &&
		payloadBoolField(mustDecodedProjectPayload(t, project.Sections["allowed-section"].SharedModifier), "isMinimized") {
		t.Fatal("expected allowed-section to start unminimized")
	}

	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":   "11",
		"allowed-section": "14",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "toggle_minimized",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "14",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id toggle_minimized: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id toggle_minimized success, got %#v", result.StructuredContent)
	}

	project, err = projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after toggle_minimized: %v", err)
	}
	if !payloadBoolField(mustDecodedProjectPayload(t, project.Sections["allowed-section"].SharedModifier), "isMinimized") {
		t.Fatal("expected allowed-section to be minimized after mutation")
	}
}

func TestServerToggleMinimizedRejectsUnknownSection(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "toggle_minimized",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "missing-section",
		},
	})
	if err != nil {
		t.Fatalf("call invalid toggle_minimized: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid toggle_minimized call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if message, ok := payload["message"].(string); !ok || !strings.Contains(message, "missing-section") {
		t.Fatalf("expected missing-section message, got %#v", payload["message"])
	}
}

func TestServerToggleGroupOrientationRequiresStructuralScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustAddScopedTestGroupSection(t, projectRuntime)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "toggle_group_orientation",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "group-section",
		},
	})
	if err != nil {
		t.Fatalf("call toggle_group_orientation blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked toggle_group_orientation call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "structural_denied" {
		t.Fatalf("expected structural_denied reason, got %#v", payload["reason"])
	}
	if ids := mustStringList(t, payload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "group-section" {
		t.Fatalf("expected blockedSectionIds [group-section], got %#v", ids)
	}
}

func TestServerToggleGroupOrientationAllowsUnscopedStructuralCallsAndTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustAddScopedTestGroupSection(t, projectRuntime)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha": "11",
		"group-section": "41",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "toggle_group_orientation",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "41",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id toggle_group_orientation: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id toggle_group_orientation success, got %#v", result.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after toggle_group_orientation: %v", err)
	}
	if !payloadBoolField(mustDecodedProjectPayload(t, project.Sections["group-section"].SharedModifier), "isHorizontalOrientation") {
		t.Fatal("expected group-section isHorizontalOrientation=true after mutation")
	}
}

func TestServerSetCodeRejectsReadOnlyCodeSections(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustSetTestCodeSectionReadOnly(t, projectRuntime, "project-alpha", "allowed-section")
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"code":            "print('blocked by readonly')\n",
		},
	})
	if err != nil {
		t.Fatalf("call set_code readonly: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected readonly set_code call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if payload["message"] != `code section is read-only: "allowed-section"` {
		t.Fatalf("unexpected readonly set_code message %#v", payload["message"])
	}
}

func TestServerFormatCodeRejectsReadOnlyCodeSections(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:  t.TempDir(),
		ProjectState:   projectRuntime,
		LSPDiagnostics: openScopedTestLSPDiagnosticsRegistry(),
		CodeUpdates: testCodeUpdateService{
			formatCode: func(context.Context, string, string) error {
				return fmt.Errorf("%w: %q", projectstate.ErrCodeSectionReadOnly, "allowed-section")
			},
		},
	})
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "format_code",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
		},
	})
	if err != nil {
		t.Fatalf("call format_code readonly: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected readonly format_code call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if payload["message"] != `code section is read-only: "allowed-section"` {
		t.Fatalf("unexpected readonly format_code message %#v", payload["message"])
	}
}

func TestServerSetSectionNameRejectsInvalidNames(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_name",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"name":            "bad/name",
		},
	})
	if err != nil {
		t.Fatalf("call set_section_name invalid: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid set_section_name call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if payload["message"] != "Section name cannot include path separators." {
		t.Fatalf("unexpected invalid section-name message %#v", payload["message"])
	}
}

func TestServerCreateTopLevelSectionRequiresStructuralScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "create_top_level_section",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"implType":        "Dict",
		},
	})
	if err != nil {
		t.Fatalf("call create_top_level_section blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked create_top_level_section call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "structural_denied" {
		t.Fatalf("expected structural_denied reason, got %#v", payload["reason"])
	}
}

func TestServerDeleteSectionsRequiresStructuralScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "delete_sections",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionIds":      []string{"blocked-section"},
		},
	})
	if err != nil {
		t.Fatalf("call delete_sections blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked delete_sections call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "structural_denied" {
		t.Fatalf("expected structural_denied reason, got %#v", payload["reason"])
	}
	if ids := mustStringList(t, payload["targetSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("expected targetSectionIds [blocked-section], got %#v", ids)
	}
}

func TestServerCreateNewSectionVariantRequiresStructuralScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "create_new_section_variant",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-section",
		},
	})
	if err != nil {
		t.Fatalf("call create_new_section_variant blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked create_new_section_variant call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "structural_denied" {
		t.Fatalf("expected structural_denied reason, got %#v", payload["reason"])
	}
	if ids := mustStringList(t, payload["targetSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("expected targetSectionIds [blocked-section], got %#v", ids)
	}
}

func TestServerCreateTopLevelSectionAllowsUnscopedStructuralCallsAndTranslatesResultIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha": "11",
	})

	beforeProject, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before structural create: %v", err)
	}
	beforeSectionIDs := map[string]struct{}{}
	for sectionID := range beforeProject.Sections {
		beforeSectionIDs[sectionID] = struct{}{}
	}
	beforeCodeObjIDs := map[string]struct{}{}
	for codeObjID := range beforeProject.CodeObjs {
		beforeCodeObjIDs[codeObjID] = struct{}{}
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Name: "create_top_level_section",
		Arguments: map[string]any{
			"projectConfigId":    "11",
			"implType":           "MetaControl",
			"controlCodeObjType": "TextParam",
		},
	})
	if err != nil {
		t.Fatalf("call create_top_level_section allowed: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected create_top_level_section success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	tempSectionID, ok := payload["sectionId"].(string)
	if !ok || strings.TrimSpace(tempSectionID) == "" {
		t.Fatalf("expected translated sectionId string, got %#v", payload["sectionId"])
	}
	tempParamID, ok := payload["metaControlParamId"].(string)
	if !ok || strings.TrimSpace(tempParamID) == "" {
		t.Fatalf("expected translated metaControlParamId string, got %#v", payload["metaControlParamId"])
	}

	afterProject, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after structural create: %v", err)
	}
	var canonicalSectionID string
	for sectionID := range afterProject.Sections {
		if _, existed := beforeSectionIDs[sectionID]; !existed {
			canonicalSectionID = sectionID
			break
		}
	}
	if canonicalSectionID == "" {
		t.Fatalf("expected one new canonical section id, got %#v", afterProject.Sections)
	}
	var canonicalParamID string
	for codeObjID := range afterProject.CodeObjs {
		if _, existed := beforeCodeObjIDs[codeObjID]; !existed {
			canonicalParamID = codeObjID
			break
		}
	}
	if canonicalParamID == "" {
		t.Fatalf("expected one new canonical code-object id, got %#v", afterProject.CodeObjs)
	}
	if tempSectionID == canonicalSectionID {
		t.Fatalf("expected translated section id to differ from canonical %q", canonicalSectionID)
	}
	if tempParamID == canonicalParamID {
		t.Fatalf("expected translated code-object id to differ from canonical %q", canonicalParamID)
	}
	if _, ok := afterProject.Sections[tempSectionID]; ok {
		t.Fatalf("did not expect translated section id %q to be a canonical project key", tempSectionID)
	}
	if _, ok := afterProject.CodeObjs[tempParamID]; ok {
		t.Fatalf("did not expect translated code-object id %q to be a canonical project key", tempParamID)
	}
}

func TestServerCreateChildSectionsAllowsUnscopedStructuralCallsAndTranslatesResultIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":   "11",
		"allowed-section": "14",
	})

	beforeProject, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before child create: %v", err)
	}
	beforeSectionIDs := map[string]struct{}{}
	for sectionID := range beforeProject.Sections {
		beforeSectionIDs[sectionID] = struct{}{}
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Name: "create_child_sections",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"parentId":        "14",
			"implType":        "Terminal",
			"numChildren":     1,
		},
	})
	if err != nil {
		t.Fatalf("call create_child_sections allowed: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected create_child_sections success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	sectionIDs := mustStringList(t, payload["sectionIds"])
	if len(sectionIDs) != 1 || strings.TrimSpace(sectionIDs[0]) == "" {
		t.Fatalf("expected one translated child section id, got %#v", sectionIDs)
	}

	afterProject, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after child create: %v", err)
	}
	var canonicalSectionID string
	for sectionID := range afterProject.Sections {
		if _, existed := beforeSectionIDs[sectionID]; !existed {
			canonicalSectionID = sectionID
			break
		}
	}
	if canonicalSectionID == "" {
		t.Fatalf("expected one new canonical section id, got %#v", afterProject.Sections)
	}
	if sectionIDs[0] == canonicalSectionID {
		t.Fatalf("expected translated child id to differ from canonical %q", canonicalSectionID)
	}
	if _, ok := afterProject.Sections[sectionIDs[0]]; ok {
		t.Fatalf("did not expect translated section id %q to be a canonical project key", sectionIDs[0])
	}
	createdSection := afterProject.Sections[canonicalSectionID]
	if createdSection.ParentSectionID != "allowed-section" {
		t.Fatalf("expected created child parent allowed-section, got %#v", createdSection)
	}

	parentPayload := mustDecodedProjectPayload(t, afterProject.SectionImpls["allowed-impl"].Payload)
	children := mustStringList(t, parentPayload["children"])
	if len(children) != 1 || children[0] != canonicalSectionID {
		t.Fatalf("expected allowed-section children [%q], got %#v", canonicalSectionID, children)
	}
}

func TestServerSetCodeSectionAttachedTerminalRequiresStructuralScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	terminalSectionID := mustSeedScopedTestTopLevelTerminal(t, projectRuntime)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code_section_attached_terminal",
		Arguments: map[string]any{
			"projectConfigId":   "project-alpha",
			"sectionId":         "allowed-section",
			"terminalSectionId": terminalSectionID,
		},
	})
	if err != nil {
		t.Fatalf("call set_code_section_attached_terminal blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked set_code_section_attached_terminal call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "structural_denied" {
		t.Fatalf("expected structural_denied reason, got %#v", payload["reason"])
	}
}

func TestServerSetCodeSectionAttachedTerminalAllowsUnscopedStructuralCallsAndTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	terminalSectionID := mustSeedScopedTestTopLevelTerminal(t, projectRuntime)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":   "11",
		"allowed-section": "14",
		terminalSectionID: "91",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Name: "set_code_section_attached_terminal",
		Arguments: map[string]any{
			"projectConfigId":   "11",
			"sectionId":         "14",
			"terminalSectionId": "91",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_code_section_attached_terminal: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_code_section_attached_terminal success, got %#v", result.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_code_section_attached_terminal: %v", err)
	}
	_, _, codeImpl, err := project.ResolveSection("allowed-section")
	if err != nil {
		t.Fatalf("resolve allowed section after attach: %v", err)
	}
	if codeImpl.Code.AttachedTerminalSectionID != terminalSectionID {
		t.Fatalf("expected attached terminal %q, got %q", terminalSectionID, codeImpl.Code.AttachedTerminalSectionID)
	}

	terminalSection, _, _, err := project.ResolveSection(terminalSectionID)
	if err != nil {
		t.Fatalf("resolve attached terminal section: %v", err)
	}
	if terminalSection.ParentSectionID != "allowed-section" {
		t.Fatalf("expected attached terminal parent allowed-section, got %q", terminalSection.ParentSectionID)
	}
	if project.HasTopLevelSection(terminalSectionID) {
		t.Fatalf("did not expect attached terminal %q to remain top-level", terminalSectionID)
	}

	parentPayload := mustDecodedProjectPayload(t, project.SectionImpls["allowed-impl"].Payload)
	children := mustStringList(t, parentPayload["children"])
	if len(children) != 1 || children[0] != terminalSectionID {
		t.Fatalf("expected allowed-section children [%q], got %#v", terminalSectionID, children)
	}
}

func TestServerSetSectionSizesRequiresStructuralScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_sizes",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionSizes": map[string]any{
				"allowed-section": map[string]any{"width": 480.0, "height": 220.0},
			},
		},
	})
	if err != nil {
		t.Fatalf("call set_section_sizes blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked set_section_sizes call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "structural_denied" {
		t.Fatalf("expected structural_denied reason, got %#v", payload["reason"])
	}
}

func TestServerSetSectionSizesAllowsUnscopedStructuralCallsAndTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":   "11",
		"allowed-section": "14",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Name: "set_section_sizes",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionSizes": map[string]any{
				"14": map[string]any{"width": 480.0, "height": 220.0},
			},
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_section_sizes: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_section_sizes success, got %#v", result.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_section_sizes: %v", err)
	}
	payload := mustDecodedProjectPayload(t, project.SectionImpls["allowed-impl"].Payload)
	size := mustStructuredMap(t, payload["size"])
	if size["width"] != 480.0 || size["height"] != 220.0 {
		t.Fatalf("expected normalized size {480 220}, got %#v", size)
	}
}

func TestServerSetGroupOverflowModeRequiresStructuralScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustAddScopedTestGroupSection(t, projectRuntime)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_group_overflow_mode",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "group-section",
			"overflowMode":    true,
		},
	})
	if err != nil {
		t.Fatalf("call set_group_overflow_mode blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked set_group_overflow_mode call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "structural_denied" {
		t.Fatalf("expected structural_denied reason, got %#v", payload["reason"])
	}
	if ids := mustStringList(t, payload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "group-section" {
		t.Fatalf("expected blockedSectionIds [group-section], got %#v", ids)
	}
}

func TestServerSetGroupOverflowModeAllowsUnscopedStructuralCallsAndTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustAddScopedTestGroupSection(t, projectRuntime)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha": "11",
		"group-section": "41",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_group_overflow_mode",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "41",
			"overflowMode":    true,
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_group_overflow_mode: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_group_overflow_mode success, got %#v", result.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_group_overflow_mode: %v", err)
	}
	if !payloadBoolField(mustDecodedProjectPayload(t, project.Sections["group-section"].SharedModifier), "overflowMode") {
		t.Fatal("expected group-section overflowMode=true after mutation")
	}
}

func TestServerSetGroupOverflowModeRejectsNonGroupSection(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_group_overflow_mode",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"overflowMode":    true,
		},
	})
	if err != nil {
		t.Fatalf("call invalid set_group_overflow_mode: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid set_group_overflow_mode call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if message, ok := payload["message"].(string); !ok || !strings.Contains(strings.ToLower(message), "group section") {
		t.Fatalf("expected group-section requirement message, got %#v", payload["message"])
	}
}

func TestServerCreateChildSectionsViaIncrementerAllowsUnscopedStructuralCallsAndTranslatesResultIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":   "11",
		"allowed-section": "14",
	})

	beforeProject, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before incrementer child create: %v", err)
	}
	beforeSectionIDs := map[string]struct{}{}
	for sectionID := range beforeProject.Sections {
		beforeSectionIDs[sectionID] = struct{}{}
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Name: "create_child_sections_via_incrementer",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"calledBy":        "14",
			"implType":        "Terminal",
			"numChildren":     1,
		},
	})
	if err != nil {
		t.Fatalf("call create_child_sections_via_incrementer allowed: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected create_child_sections_via_incrementer success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	sectionIDs := mustStringList(t, payload["sectionIds"])
	if len(sectionIDs) != 1 || strings.TrimSpace(sectionIDs[0]) == "" {
		t.Fatalf("expected one translated incrementer child section id, got %#v", sectionIDs)
	}

	afterProject, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after incrementer child create: %v", err)
	}
	var canonicalSectionID string
	for sectionID := range afterProject.Sections {
		if _, existed := beforeSectionIDs[sectionID]; !existed {
			canonicalSectionID = sectionID
			break
		}
	}
	if canonicalSectionID == "" {
		t.Fatalf("expected one new canonical section id, got %#v", afterProject.Sections)
	}
	if sectionIDs[0] == canonicalSectionID {
		t.Fatalf("expected translated incrementer child id to differ from canonical %q", canonicalSectionID)
	}
	if _, ok := afterProject.Sections[sectionIDs[0]]; ok {
		t.Fatalf("did not expect translated incrementer child id %q to be a canonical project key", sectionIDs[0])
	}
	createdSection := afterProject.Sections[canonicalSectionID]
	if createdSection.ParentSectionID != "allowed-section" {
		t.Fatalf("expected created incrementer child parent allowed-section, got %#v", createdSection)
	}

	parentPayload := mustDecodedProjectPayload(t, afterProject.SectionImpls["allowed-impl"].Payload)
	children := mustStringList(t, parentPayload["children"])
	if len(children) != 1 || children[0] != canonicalSectionID {
		t.Fatalf("expected allowed-section children [%q], got %#v", canonicalSectionID, children)
	}
}

func TestServerDeleteSectionsAllowsUnscopedStructuralCallsAndTranslatesIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":          "11",
		"allowed-params-section": "20",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Name: "delete_sections",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionIds":      []string{"20"},
		},
	})
	if err != nil {
		t.Fatalf("call delete_sections allowed: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected delete_sections success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	sectionIDs := mustStringList(t, payload["sectionIds"])
	if len(sectionIDs) != 1 || sectionIDs[0] != "20" {
		t.Fatalf("expected translated deleted section ids [20], got %#v", sectionIDs)
	}

	afterProject, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after delete_sections: %v", err)
	}
	if _, ok := afterProject.Sections["allowed-params-section"]; ok {
		t.Fatalf("expected allowed-params-section to be removed, got %#v", afterProject.Sections)
	}
	if _, ok := afterProject.CodeObjs["allowed-param"]; ok {
		t.Fatalf("expected allowed-param to be pruned, got %#v", afterProject.CodeObjs)
	}
}

func TestServerDeleteChildSectionsViaDecrementerAllowsUnscopedStructuralCallsAndTranslatesIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	canonicalChildID := mustSeedScopedTestChildSection(t, projectRuntime, "allowed-section")
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":   "11",
		"allowed-section": "14",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Name: "delete_child_sections_via_decrementer",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"calledBy":        "14",
			"numChildren":     1,
		},
	})
	if err != nil {
		t.Fatalf("call delete_child_sections_via_decrementer allowed: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected delete_child_sections_via_decrementer success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	sectionIDs := mustStringList(t, payload["sectionIds"])
	if len(sectionIDs) != 1 || strings.TrimSpace(sectionIDs[0]) == "" {
		t.Fatalf("expected one translated deleted child section id, got %#v", sectionIDs)
	}
	if sectionIDs[0] == canonicalChildID {
		t.Fatalf("expected translated deleted child id to differ from canonical %q", canonicalChildID)
	}

	afterProject, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after delete_child_sections_via_decrementer: %v", err)
	}
	if _, ok := afterProject.Sections[canonicalChildID]; ok {
		t.Fatalf("expected %q to be removed, got %#v", canonicalChildID, afterProject.Sections)
	}
	if _, ok := afterProject.Sections[sectionIDs[0]]; ok {
		t.Fatalf("did not expect translated deleted child id %q to be a canonical project key", sectionIDs[0])
	}

	parentPayload := mustDecodedProjectPayload(t, afterProject.SectionImpls["allowed-impl"].Payload)
	children := mustStringList(t, parentPayload["children"])
	if len(children) != 0 {
		t.Fatalf("expected allowed-section children to be empty after decrementer delete, got %#v", children)
	}
}

func TestServerCreateNewSectionVariantAllowsUnscopedStructuralCallsAndTranslatesVariantIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":          "11",
		"allowed-params-section": "20",
	})

	beforeProject, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before create_new_section_variant: %v", err)
	}
	beforeVariantIDs := append([]string(nil), beforeProject.Sections["allowed-params-section"].VariantIDs...)

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Name: "create_new_section_variant",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "20",
		},
	})
	if err != nil {
		t.Fatalf("call create_new_section_variant allowed: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected create_new_section_variant success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	tempVariantID, ok := payload["variantId"].(string)
	if !ok || strings.TrimSpace(tempVariantID) == "" {
		t.Fatalf("expected translated variantId string, got %#v", payload["variantId"])
	}

	afterProject, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after create_new_section_variant: %v", err)
	}
	afterVariantIDs := afterProject.Sections["allowed-params-section"].VariantIDs
	if len(afterVariantIDs) != len(beforeVariantIDs)+1 {
		t.Fatalf("expected one new section variant, got before=%#v after=%#v", beforeVariantIDs, afterVariantIDs)
	}
	var canonicalVariantID string
	for _, variantID := range afterVariantIDs {
		if !containsString(beforeVariantIDs, variantID) {
			canonicalVariantID = variantID
			break
		}
	}
	if canonicalVariantID == "" {
		t.Fatalf("expected one new canonical section variant id, got %#v", afterVariantIDs)
	}
	if tempVariantID == canonicalVariantID {
		t.Fatalf("expected translated variant id to differ from canonical %q", canonicalVariantID)
	}
	if _, ok := afterProject.SectionVariants[tempVariantID]; ok {
		t.Fatalf("did not expect translated variant id %q to be a canonical project key", tempVariantID)
	}
	if got := afterProject.SectionVariantMap["allowed-params-section"]; got != canonicalVariantID {
		t.Fatalf("expected active allowed-params-section variant %q, got %q", canonicalVariantID, got)
	}
	if len(afterProject.CodeObjs["allowed-param"].VariantIDs) != 2 {
		t.Fatalf("expected allowed-param to gain one code-object variant, got %#v", afterProject.CodeObjs["allowed-param"].VariantIDs)
	}
}

func TestServerSetSectionVariantRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustAddScopedTestAlternateSectionVariant(t, projectRuntime)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_variant",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"variantId":       "allowed-variant-alt",
		},
	})
	if err != nil {
		t.Fatalf("call set_section_variant allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed set_section_variant success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_section_variant: %v", err)
	}
	if got := project.SectionVariantMap["allowed-section"]; got != "allowed-variant-alt" {
		t.Fatalf("expected allowed-section active variant to be updated, got %q", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_variant",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-section",
			"variantId":       "blocked-variant",
		},
	})
	if err != nil {
		t.Fatalf("call set_section_variant blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked set_section_variant call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
}

func TestServerSetSectionVariantAllowsUnscopedCallsAndTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustAddScopedTestAlternateSectionVariant(t, projectRuntime)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":       "11",
		"allowed-section":     "14",
		"allowed-variant-alt": "30",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_variant",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "14",
			"variantId":       "30",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_section_variant: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_section_variant success, got %#v", result.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id set_section_variant: %v", err)
	}
	if got := project.SectionVariantMap["allowed-section"]; got != "allowed-variant-alt" {
		t.Fatalf("expected translated section variant update, got %q", got)
	}
}

func TestServerSetSectionVariantRejectsVariantOutsideSection(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustAddScopedTestAlternateSectionVariant(t, projectRuntime)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_variant",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"variantId":       "peer-chat-variant",
		},
	})
	if err != nil {
		t.Fatalf("call invalid set_section_variant: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid set_section_variant call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if message, ok := payload["message"].(string); !ok || !strings.Contains(message, "section variant must belong to the section") {
		t.Fatalf("expected section variant membership message, got %#v", payload["message"])
	}
}

func TestServerSetDefaultSectionVariantRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustAddScopedTestAlternateSectionVariant(t, projectRuntime)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_default_section_variant",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"variantId":       "allowed-variant-alt",
		},
	})
	if err != nil {
		t.Fatalf("call set_default_section_variant allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed set_default_section_variant success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_default_section_variant: %v", err)
	}
	if got := project.Sections["allowed-section"].DefaultVariantID; got != "allowed-variant-alt" {
		t.Fatalf("expected allowed-section default variant to be updated, got %q", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_default_section_variant",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-section",
			"variantId":       "blocked-variant",
		},
	})
	if err != nil {
		t.Fatalf("call set_default_section_variant blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked set_default_section_variant call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
}

func TestServerSetDefaultSectionVariantAllowsUnscopedCallsAndTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustAddScopedTestAlternateSectionVariant(t, projectRuntime)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":       "11",
		"allowed-section":     "14",
		"allowed-variant-alt": "30",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_default_section_variant",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "14",
			"variantId":       "30",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_default_section_variant: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_default_section_variant success, got %#v", result.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id set_default_section_variant: %v", err)
	}
	if got := project.Sections["allowed-section"].DefaultVariantID; got != "allowed-variant-alt" {
		t.Fatalf("expected translated default section variant update, got %q", got)
	}
}

func TestServerSetSectionVariantSortOrderRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustAddScopedTestAlternateSectionVariant(t, projectRuntime)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_variant_sort_order",
		Arguments: map[string]any{
			"projectConfigId":   "project-alpha",
			"sectionId":         "allowed-section",
			"orderedVariantIds": []string{"allowed-variant-alt", "allowed-variant"},
		},
	})
	if err != nil {
		t.Fatalf("call set_section_variant_sort_order allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed set_section_variant_sort_order success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_section_variant_sort_order: %v", err)
	}
	if !reflect.DeepEqual(project.Sections["allowed-section"].VariantIDs, []string{"allowed-variant-alt", "allowed-variant"}) {
		t.Fatalf("expected reordered variants, got %#v", project.Sections["allowed-section"].VariantIDs)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_variant_sort_order",
		Arguments: map[string]any{
			"projectConfigId":   "project-alpha",
			"sectionId":         "blocked-section",
			"orderedVariantIds": []string{"blocked-variant"},
		},
	})
	if err != nil {
		t.Fatalf("call set_section_variant_sort_order blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked set_section_variant_sort_order call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
}

func TestServerSetSectionVariantSortOrderAllowsUnscopedCallsAndTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustAddScopedTestAlternateSectionVariant(t, projectRuntime)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":       "11",
		"allowed-section":     "14",
		"allowed-variant":     "16",
		"allowed-variant-alt": "30",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_variant_sort_order",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId":   "11",
			"sectionId":         "14",
			"orderedVariantIds": []string{"30", "16"},
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_section_variant_sort_order: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_section_variant_sort_order success, got %#v", result.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id set_section_variant_sort_order: %v", err)
	}
	if !reflect.DeepEqual(project.Sections["allowed-section"].VariantIDs, []string{"allowed-variant-alt", "allowed-variant"}) {
		t.Fatalf("expected translated reordered variants, got %#v", project.Sections["allowed-section"].VariantIDs)
	}
}

func TestServerSetSectionVariantSortOrderRejectsDuplicateVariantIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustAddScopedTestAlternateSectionVariant(t, projectRuntime)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_variant_sort_order",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId":   "project-alpha",
			"sectionId":         "allowed-section",
			"orderedVariantIds": []string{"allowed-variant", "allowed-variant"},
		},
	})
	if err != nil {
		t.Fatalf("call invalid set_section_variant_sort_order: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid set_section_variant_sort_order call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if message, ok := payload["message"].(string); !ok || !strings.Contains(message, "orderedVariantIds must not contain duplicate variant IDs.") {
		t.Fatalf("expected duplicate orderedVariantIds message, got %#v", payload["message"])
	}
}

func TestServerSetTypeErrorIgnoreRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_type_error_ignore",
		Arguments: map[string]any{
			"projectConfigId":  "project-alpha",
			"sectionId":        "allowed-params-section",
			"paramInfoId":      "allowed-param",
			"ignoreTypeErrors": true,
		},
	})
	if err != nil {
		t.Fatalf("call set_type_error_ignore allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed set_type_error_ignore success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_type_error_ignore: %v", err)
	}
	ignoreState, err := project.TypeErrorIgnoreStateForSection("allowed-params-section")
	if err != nil {
		t.Fatalf("type error ignore state after update: %v", err)
	}
	if !ignoreState.Params["allowed-param"] {
		t.Fatalf("expected allowed-param ignore state, got %#v", ignoreState)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_type_error_ignore",
		Arguments: map[string]any{
			"projectConfigId":  "project-alpha",
			"sectionId":        "blocked-params-section",
			"paramInfoId":      "blocked-param",
			"ignoreTypeErrors": true,
		},
	})
	if err != nil {
		t.Fatalf("call set_type_error_ignore blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked set_type_error_ignore call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
}

func TestServerSetCodeObjectNameRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code_obj_name",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"codeObjId":       "allowed-param",
			"name":            "user-id@v2",
		},
	})
	if err != nil {
		t.Fatalf("call set_code_obj_name allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed set_code_obj_name success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_code_obj_name: %v", err)
	}
	if got := project.CodeObjs["allowed-param"].Name; got != "user-id@v2" {
		t.Fatalf("expected code object name user-id@v2, got %q", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code_obj_name",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"codeObjId":       "blocked-param",
			"name":            "blocked-name",
		},
	})
	if err != nil {
		t.Fatalf("call set_code_obj_name blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked set_code_obj_name call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-params-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
}

func TestServerSetCodeObjectNameReturnsInvalidArgumentsForInvalidName(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code_obj_name",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"codeObjId":       "allowed-param",
			"name":            "bad\nname",
		},
	})
	if err != nil {
		t.Fatalf("call set_code_obj_name invalid name: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid set_code_obj_name call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if payload["message"] != "Param name cannot include control characters." {
		t.Fatalf("expected control-character validation message, got %#v", payload["message"])
	}
}

func TestServerSetCodeObjectDisplayNameRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code_obj_display_name",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"codeObjId":       "allowed-param",
			"displayName":     "Height",
		},
	})
	if err != nil {
		t.Fatalf("call set_code_obj_display_name allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed set_code_obj_display_name success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_code_obj_display_name: %v", err)
	}
	if got := project.CodeObjs["allowed-param"].DisplayName; got != "Height" {
		t.Fatalf("expected display name Height, got %q", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code_obj_display_name",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"codeObjId":       "blocked-param",
			"displayName":     "Blocked",
		},
	})
	if err != nil {
		t.Fatalf("call set_code_obj_display_name blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked set_code_obj_display_name call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-params-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
}

func TestServerProjectStateSummaryCanUsePerCallMeta(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"chatId":          "chat-1",
			"sectionId":       "chat-section",
		},
		Name:      "get_latest_project_state_summary",
		Arguments: map[string]any{"projectConfigId": "project-alpha"},
	})
	if err != nil {
		t.Fatalf("call get_latest_project_state_summary with meta: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected summary success via request meta, got %#v", result.StructuredContent)
	}
	assertSummaryPayload(t, result.StructuredContent)
}

func TestServerSetAgenticContextPersistsSessionScopeForLaterToolCalls(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	server, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	requestContext := ToolRequestContext{SessionKey: "session-alpha"}
	result, err := server.InvokeTool(context.Background(), "set_agentic_context", map[string]any{
		"projectConfigId":       "project-alpha",
		"chatId":                "chat-1",
		"sectionId":             "chat-section",
		"runId":                 "run-child",
		"frontendAffinityToken": "frontend-1",
	}, requestContext)
	if err != nil {
		t.Fatalf("invoke set_agentic_context: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_agentic_context success, got %#v", result.StructuredContent)
	}

	stored := server.sessionAgenticContext(requestContext.SessionKey)
	if stored == nil {
		t.Fatal("expected session agentic context to be stored")
	}
	if stored.ProjectConfigID != "project-alpha" {
		t.Fatalf("expected stored projectConfigId project-alpha, got %q", stored.ProjectConfigID)
	}
	if stored.ChatID != "chat-1" {
		t.Fatalf("expected stored chatId chat-1, got %q", stored.ChatID)
	}
	if stored.SectionID != "chat-section" {
		t.Fatalf("expected stored sectionId chat-section, got %q", stored.SectionID)
	}
	if stored.RunID != "run-child" {
		t.Fatalf("expected stored runId run-child, got %q", stored.RunID)
	}
	if stored.FrontendAffinityToken != "frontend-1" {
		t.Fatalf("expected stored frontend affinity frontend-1, got %q", stored.FrontendAffinityToken)
	}

	summaryResult, err := server.InvokeTool(context.Background(), "get_latest_project_state_summary", map[string]any{
		"projectConfigId": "project-alpha",
	}, requestContext)
	if err != nil {
		t.Fatalf("invoke get_latest_project_state_summary after set_agentic_context: %v", err)
	}
	if summaryResult.IsError {
		t.Fatalf("expected session-scoped project summary success, got %#v", summaryResult.StructuredContent)
	}
	assertSummaryPayload(t, summaryResult.StructuredContent)
}

func TestServerScopedReadToolsRecomputeScopeAfterEdgeMutation(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	server, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	requestContext := ToolRequestContext{SessionKey: "session-scope-refresh"}
	setContextResult, err := server.InvokeTool(context.Background(), "set_agentic_context", map[string]any{
		"projectConfigId": "project-alpha",
		"chatId":          "chat-1",
		"sectionId":       "chat-section",
	}, requestContext)
	if err != nil {
		t.Fatalf("invoke set_agentic_context: %v", err)
	}
	if setContextResult.IsError {
		t.Fatalf("expected set_agentic_context success, got %#v", setContextResult.StructuredContent)
	}

	firstResult, err := server.InvokeTool(context.Background(), "get_latest_project_state_summary", map[string]any{
		"projectConfigId": "project-alpha",
	}, requestContext)
	if err != nil {
		t.Fatalf("invoke first get_latest_project_state_summary: %v", err)
	}
	if firstResult.IsError {
		t.Fatalf("expected first project summary success, got %#v", firstResult.StructuredContent)
	}
	firstSummary := mustStructuredMap(t, firstResult.StructuredContent)
	firstProjectConfig := mustStructuredMap(t, firstSummary["projectConfig"])
	firstSectionVariantMap := mustStructuredMap(t, firstProjectConfig["sectionVariantMap"])
	if _, ok := firstSectionVariantMap["blocked-section"]; ok {
		t.Fatalf("did not expect blocked-section before edge mutation, got %#v", firstSectionVariantMap)
	}

	if _, err := projectRuntime.Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		project := document.Projects["project-alpha"]
		project.AgenticEdges = append(project.AgenticEdges, projectstate.AgenticEdge{
			ID:              "edge-unblocked",
			SourceSectionID: "chat-section",
			TargetSectionID: "blocked-section",
			Kind:            "chat_section",
		})
		document.Projects["project-alpha"] = project
		return document, nil
	}); err != nil {
		t.Fatalf("mutate agentic edges: %v", err)
	}

	secondResult, err := server.InvokeTool(context.Background(), "get_latest_project_state_summary", map[string]any{
		"projectConfigId": "project-alpha",
	}, requestContext)
	if err != nil {
		t.Fatalf("invoke second get_latest_project_state_summary: %v", err)
	}
	if secondResult.IsError {
		t.Fatalf("expected second project summary success, got %#v", secondResult.StructuredContent)
	}
	secondSummary := mustStructuredMap(t, secondResult.StructuredContent)
	secondProjectConfig := mustStructuredMap(t, secondSummary["projectConfig"])
	secondSectionVariantMap := mustStructuredMap(t, secondProjectConfig["sectionVariantMap"])
	if _, ok := secondSectionVariantMap["blocked-section"]; !ok {
		t.Fatalf("expected blocked-section after edge mutation, got %#v", secondSectionVariantMap)
	}
}

func TestServerScopedReadToolsCanUseHeaderContextAndTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":            "11",
		"chat-1":                   "12",
		"chat-section":             "13",
		"allowed-section":          "14",
		"peer-chat-section":        "15",
		"blocked-section":          "16",
		"allowed-variant":          "17",
		"peer-chat-variant":        "18",
		"blocked-variant":          "19",
		"allowed-params-section":   "20",
		"allowed-params-variant":   "21",
		"edge-context":             "22",
		"edge-peer":                "23",
		"allowed-callable-section": "24",
		"allowed-callable-variant": "25",
	})

	server, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	headers := http.Header{}
	headers.Set(AgenticContextProjectConfigIDHeader, "11")
	headers.Set(AgenticContextChatIDHeader, "12")
	headers.Set(AgenticContextSectionIDHeader, "13")
	requestContext := ToolRequestContext{Headers: headers}

	result, err := server.InvokeTool(context.Background(), "get_latest_project_state_summary", map[string]any{
		"projectConfigId": "11",
	}, requestContext)
	if err != nil {
		t.Fatalf("invoke header-scoped temp-id project summary: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected header-scoped temp-id summary success, got %#v", result.StructuredContent)
	}

	summary := mustStructuredMap(t, result.StructuredContent)
	projectConfig := mustStructuredMap(t, summary["projectConfig"])
	if projectConfig["id"] != "11" {
		t.Fatalf("expected translated project id 11, got %#v", projectConfig["id"])
	}
	sectionVariantMap := mustStructuredMap(t, projectConfig["sectionVariantMap"])
	if _, ok := sectionVariantMap["14"]; !ok {
		t.Fatalf("expected translated allowed-section key 14, got %#v", sectionVariantMap)
	}
	if _, ok := sectionVariantMap["15"]; !ok {
		t.Fatalf("expected translated peer-chat-section key 15, got %#v", sectionVariantMap)
	}
	if _, ok := sectionVariantMap["20"]; !ok {
		t.Fatalf("expected translated allowed-params-section key 20, got %#v", sectionVariantMap)
	}
	if _, ok := sectionVariantMap["24"]; !ok {
		t.Fatalf("expected translated allowed-callable-section key 24, got %#v", sectionVariantMap)
	}
	if _, ok := sectionVariantMap["16"]; ok {
		t.Fatalf("did not expect blocked-section key 16 in scoped summary, got %#v", sectionVariantMap)
	}

	sections := mustStructuredList(t, summary["sections"])
	sectionIDs := make([]string, 0, len(sections))
	for _, rawSection := range sections {
		section := mustStructuredMap(t, rawSection)
		sectionID, ok := section["sectionId"].(string)
		if !ok {
			t.Fatalf("expected translated sectionId string, got %#v", section["sectionId"])
		}
		sectionIDs = append(sectionIDs, sectionID)
	}
	sort.Strings(sectionIDs)
	if len(sectionIDs) != 4 || sectionIDs[0] != "14" || sectionIDs[1] != "15" || sectionIDs[2] != "20" || sectionIDs[3] != "24" {
		t.Fatalf("unexpected translated section ids %#v", sectionIDs)
	}

	diagnosticsResult, err := server.InvokeTool(context.Background(), "get_latest_lsp_diagnostics", map[string]any{
		"projectConfigId": "11",
	}, requestContext)
	if err != nil {
		t.Fatalf("invoke header-scoped temp-id lsp diagnostics: %v", err)
	}
	if diagnosticsResult.IsError {
		t.Fatalf("expected header-scoped temp-id diagnostics success, got %#v", diagnosticsResult.StructuredContent)
	}
	diagnosticsPayload := mustStructuredMap(t, diagnosticsResult.StructuredContent)
	codeSections := mustStructuredMap(t, diagnosticsPayload["codeSections"])
	if _, ok := codeSections["14"]; !ok {
		t.Fatalf("expected translated allowed-section diagnostics key 14, got %#v", codeSections)
	}
	if _, ok := codeSections["15"]; ok {
		t.Fatalf("did not expect peer-chat-section diagnostics key 15, got %#v", codeSections)
	}
	genCode := mustStructuredMap(t, diagnosticsPayload["genCode"])
	genErrors := mustStructuredMap(t, genCode["errors"])
	if _, ok := genErrors["14"]; !ok {
		t.Fatalf("expected translated allowed-section gen diagnostics key 14, got %#v", genErrors)
	}
	if unmapped := mustStructuredList(t, diagnosticsPayload["unmappedGenCode"]); len(unmapped) != 0 {
		t.Fatalf("expected scoped diagnostics to drop unmapped gen code, got %#v", unmapped)
	}
}

func TestServerTranslatesTemporaryIDsAtInvocationEdge(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":            "11",
		"chat-1":                   "12",
		"chat-section":             "13",
		"allowed-section":          "14",
		"peer-chat-section":        "15",
		"blocked-section":          "16",
		"allowed-variant":          "17",
		"peer-chat-variant":        "18",
		"blocked-variant":          "19",
		"allowed-params-section":   "20",
		"allowed-params-variant":   "21",
		"edge-context":             "22",
		"edge-peer":                "23",
		"allowed-callable-section": "24",
		"allowed-callable-variant": "25",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Name:      "get_latest_project_state_summary",
		Arguments: map[string]any{"projectConfigId": "11"},
	})
	if err != nil {
		t.Fatalf("call temp-id project summary: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id summary success, got %#v", result.StructuredContent)
	}

	summary := mustStructuredMap(t, result.StructuredContent)
	projectConfig := mustStructuredMap(t, summary["projectConfig"])
	if projectConfig["id"] != "11" {
		t.Fatalf("expected translated project id 11, got %#v", projectConfig["id"])
	}
	sectionVariantMap := mustStructuredMap(t, projectConfig["sectionVariantMap"])
	if _, ok := sectionVariantMap["14"]; !ok {
		t.Fatalf("expected translated allowed-section key 14, got %#v", sectionVariantMap)
	}
	if _, ok := sectionVariantMap["15"]; !ok {
		t.Fatalf("expected translated peer-chat-section key 15, got %#v", sectionVariantMap)
	}
	if _, ok := sectionVariantMap["20"]; !ok {
		t.Fatalf("expected translated allowed-params-section key 20, got %#v", sectionVariantMap)
	}
	if _, ok := sectionVariantMap["24"]; !ok {
		t.Fatalf("expected translated allowed-callable-section key 24, got %#v", sectionVariantMap)
	}
	if _, ok := sectionVariantMap["16"]; ok {
		t.Fatalf("did not expect blocked-section key 16 in scoped summary, got %#v", sectionVariantMap)
	}

	sections := mustStructuredList(t, summary["sections"])
	sectionIDs := make([]string, 0, len(sections))
	for _, rawSection := range sections {
		section := mustStructuredMap(t, rawSection)
		sectionID, ok := section["sectionId"].(string)
		if !ok {
			t.Fatalf("expected translated sectionId string, got %#v", section["sectionId"])
		}
		sectionIDs = append(sectionIDs, sectionID)
	}
	sort.Strings(sectionIDs)
	if len(sectionIDs) != 4 || sectionIDs[0] != "14" || sectionIDs[1] != "15" || sectionIDs[2] != "20" || sectionIDs[3] != "24" {
		t.Fatalf("unexpected translated section ids %#v", sectionIDs)
	}

	diagnosticsResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Name:      "get_latest_lsp_diagnostics",
		Arguments: map[string]any{"projectConfigId": "11"},
	})
	if err != nil {
		t.Fatalf("call temp-id lsp diagnostics: %v", err)
	}
	if diagnosticsResult.IsError {
		t.Fatalf("expected temp-id diagnostics success, got %#v", diagnosticsResult.StructuredContent)
	}
	diagnosticsPayload := mustStructuredMap(t, diagnosticsResult.StructuredContent)
	codeSections := mustStructuredMap(t, diagnosticsPayload["codeSections"])
	if _, ok := codeSections["14"]; !ok {
		t.Fatalf("expected translated allowed-section diagnostics key 14, got %#v", codeSections)
	}
	if _, ok := codeSections["15"]; ok {
		t.Fatalf("did not expect peer-chat-section diagnostics key 15, got %#v", codeSections)
	}
	genCode := mustStructuredMap(t, diagnosticsPayload["genCode"])
	genErrors := mustStructuredMap(t, genCode["errors"])
	if _, ok := genErrors["14"]; !ok {
		t.Fatalf("expected translated allowed-section gen diagnostics key 14, got %#v", genErrors)
	}
	if unmapped := mustStructuredList(t, diagnosticsPayload["unmappedGenCode"]); len(unmapped) != 0 {
		t.Fatalf("expected scoped diagnostics to drop unmapped gen code, got %#v", unmapped)
	}
}

func TestServerSetCodeSectionDiagnosticsMuteTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	diagnostics := openScopedTestLSPDiagnosticsRegistry()
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":   "11",
		"chat-1":          "12",
		"chat-section":    "13",
		"allowed-section": "14",
		"blocked-section": "16",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     diagnostics,
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code_section_diagnostics_mute",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "14",
			"mute":            true,
		},
	})
	if err != nil {
		t.Fatalf("call temp-id mute allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected temp-id mute success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id mute: %v", err)
	}
	ignoreState, err := project.CodeSectionDiagnosticsIgnoreStateForSection("allowed-section")
	if err != nil {
		t.Fatalf("ignore state for allowed-section after temp-id mute: %v", err)
	}
	if !ignoreState.Muted {
		t.Fatalf("expected allowed-section to be muted, got %#v", ignoreState)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code_section_diagnostics_mute",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "16",
			"mute":            true,
		},
	})
	if err != nil {
		t.Fatalf("call temp-id mute blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked temp-id mute call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["code"] != scopeViolationErrorCode {
		t.Fatalf("expected scope_violation code, got %#v", blockedPayload["code"])
	}
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "16" {
		t.Fatalf("expected translated blockedSectionIds [16], got %#v", ids)
	}
	if ids := mustStringList(t, blockedPayload["targetSectionIds"]); len(ids) != 1 || ids[0] != "16" {
		t.Fatalf("expected translated targetSectionIds [16], got %#v", ids)
	}
}

func TestServerSetCodeSectionDiagnosticCodeSuppressionTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	diagnostics := openScopedTestLSPDiagnosticsRegistry()
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":   "11",
		"chat-1":          "12",
		"chat-section":    "13",
		"allowed-section": "14",
		"blocked-section": "18",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     diagnostics,
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code_section_diagnostic_code_suppression",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "14",
			"code":            "reportFoo",
			"suppress":        true,
		},
	})
	if err != nil {
		t.Fatalf("call temp-id suppression allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected temp-id suppression success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id suppression: %v", err)
	}
	ignoreState, err := project.CodeSectionDiagnosticsIgnoreStateForSection("allowed-section")
	if err != nil {
		t.Fatalf("ignore state for allowed-section after temp-id suppression: %v", err)
	}
	if len(ignoreState.SuppressedCodes) != 1 || ignoreState.SuppressedCodes[0] != "reportFoo" {
		t.Fatalf("expected reportFoo suppression, got %#v", ignoreState.SuppressedCodes)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code_section_diagnostic_code_suppression",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "18",
			"code":            "reportFoo",
			"suppress":        true,
		},
	})
	if err != nil {
		t.Fatalf("call temp-id suppression blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked temp-id suppression call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "18" {
		t.Fatalf("expected translated blockedSectionIds [18], got %#v", ids)
	}
}

func TestServerSetParamEnteredValueTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":          "11",
		"chat-1":                 "12",
		"chat-section":           "13",
		"allowed-params-section": "20",
		"blocked-params-section": "21",
		"allowed-param":          "22",
		"blocked-param":          "23",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_param_entered_value",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "20",
			"paramInfoId":     "22",
			"value":           "translated",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_param_entered_value allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected temp-id set_param_entered_value success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id set_param_entered_value: %v", err)
	}
	payload, _, _, _, err := project.ResolveSectionCodeObject("allowed-params-section", "allowed-param")
	if err != nil {
		t.Fatalf("resolve allowed-param after temp-id update: %v", err)
	}
	if got := payloadRawStringField(payload, "value"); got != "translated" {
		t.Fatalf("expected translated param value, got %q", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_param_entered_value",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "21",
			"paramInfoId":     "23",
			"value":           "blocked",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_param_entered_value blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked temp-id set_param_entered_value call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "21" {
		t.Fatalf("expected translated blockedSectionIds [21], got %#v", ids)
	}
}

func TestServerSetParamNameAndValueTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":          "11",
		"chat-1":                 "12",
		"chat-section":           "13",
		"allowed-params-section": "20",
		"blocked-params-section": "21",
		"allowed-param":          "22",
		"blocked-param":          "23",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_param_name_and_value",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "20",
			"codeObjId":       "22",
			"name":            "translated_name",
			"value":           "translated",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_param_name_and_value allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected temp-id set_param_name_and_value success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id combined update: %v", err)
	}
	if got := project.CodeObjs["allowed-param"].Name; got != "translated_name" {
		t.Fatalf("expected translated code object name, got %q", got)
	}
	payload, _, _, _, err := project.ResolveSectionCodeObject("allowed-params-section", "allowed-param")
	if err != nil {
		t.Fatalf("resolve allowed-param after temp-id combined update: %v", err)
	}
	if got := payloadRawStringField(payload, "value"); got != "translated" {
		t.Fatalf("expected translated param value, got %q", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_param_name_and_value",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "21",
			"codeObjId":       "23",
			"name":            "blocked_name",
			"value":           "blocked",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_param_name_and_value blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked temp-id set_param_name_and_value call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "21" {
		t.Fatalf("expected translated blockedSectionIds [21], got %#v", ids)
	}
}

func TestServerSetCallableTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":            "11",
		"chat-1":                   "12",
		"chat-section":             "13",
		"allowed-callable-section": "24",
		"blocked-callable-section": "25",
		"allowed-callable-2":       "26",
		"allowed-param-existing":   "27",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_callable",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "24",
			"callableName":    "sorted",
			"refetchParams":   false,
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_callable allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected temp-id set_callable success, got %#v", allowedResult.StructuredContent)
	}

	allowedPayload := mustStructuredMap(t, allowedResult.StructuredContent)
	if allowedPayload["callableId"] != "26" {
		t.Fatalf("expected translated callable id 26, got %#v", allowedPayload["callableId"])
	}
	childCodeObjs := mustStructuredList(t, allowedPayload["childCodeObjs"])
	if len(childCodeObjs) != 1 {
		t.Fatalf("expected one translated callable child, got %#v", childCodeObjs)
	}
	childCodeObj := mustStructuredMap(t, childCodeObjs[0])
	if childCodeObj["codeObjId"] != "27" {
		t.Fatalf("expected translated child code-object id 27, got %#v", childCodeObj["codeObjId"])
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_callable",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "25",
			"callableName":    "sorted",
			"refetchParams":   false,
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_callable blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked temp-id set_callable call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "25" {
		t.Fatalf("expected translated blockedSectionIds [25], got %#v", ids)
	}
}

func TestServerSetSectionNameTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":   "11",
		"chat-1":          "12",
		"chat-section":    "13",
		"allowed-section": "14",
		"blocked-section": "16",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_name",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "14",
			"name":            "Translated Section",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_section_name allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected temp-id set_section_name success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id set_section_name: %v", err)
	}
	if got := project.Sections["allowed-section"].Name; got != "Translated Section" {
		t.Fatalf("expected translated section rename, got %q", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_name",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "16",
			"name":            "Blocked",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_section_name blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked temp-id set_section_name call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "16" {
		t.Fatalf("expected translated blockedSectionIds [16], got %#v", ids)
	}
	missingEdgesCanonical := mustStructuredList(t, blockedPayload["missingEdgesCanonical"])
	if len(missingEdgesCanonical) != 1 {
		t.Fatalf("expected one canonical missing edge, got %#v", missingEdgesCanonical)
	}
	missingEdgeCanonical := mustStructuredMap(t, missingEdgesCanonical[0])
	if missingEdgeCanonical["sourceSectionId"] != "chat-section" ||
		missingEdgeCanonical["targetSectionId"] != "blocked-section" ||
		missingEdgeCanonical["kind"] != agenticEdgeKindChatSection {
		t.Fatalf("unexpected canonical missing edge %#v", missingEdgeCanonical)
	}
	missingEdges := mustStructuredList(t, blockedPayload["missingEdges"])
	if len(missingEdges) != 1 {
		t.Fatalf("expected one translated missing edge, got %#v", missingEdges)
	}
	missingEdge := mustStructuredMap(t, missingEdges[0])
	if missingEdge["sourceSectionId"] != "13" ||
		missingEdge["targetSectionId"] != "16" ||
		missingEdge["kind"] != agenticEdgeKindChatSection {
		t.Fatalf("unexpected translated missing edge %#v", missingEdge)
	}
}

func TestServerSetSectionTagColorTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":   "11",
		"chat-1":          "12",
		"chat-section":    "13",
		"allowed-section": "14",
		"blocked-section": "16",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_tag_color",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "14",
			"tagColor":        "#123456",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_section_tag_color allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected temp-id set_section_tag_color success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id set_section_tag_color: %v", err)
	}
	allowedPayload := mustDecodedProjectPayload(t, project.Sections["allowed-section"].SharedModifier)
	if got := allowedPayload["tagColor"]; got != "#123456" {
		t.Fatalf("expected translated allowed-section tagColor #123456, got %#v", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_tag_color",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "16",
			"tagColor":        "#654321",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_section_tag_color blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked temp-id set_section_tag_color call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "16" {
		t.Fatalf("expected translated blockedSectionIds [16], got %#v", ids)
	}
	if ids := mustStringList(t, blockedPayload["targetSectionIds"]); len(ids) != 1 || ids[0] != "16" {
		t.Fatalf("expected translated targetSectionIds [16], got %#v", ids)
	}
}

func TestServerSetSectionStyleColorTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":   "11",
		"chat-1":          "12",
		"chat-section":    "13",
		"allowed-section": "14",
		"blocked-section": "16",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_style_color",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "14",
			"styleColor":      "#654321",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_section_style_color allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected temp-id set_section_style_color success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id set_section_style_color: %v", err)
	}
	allowedPayload := mustDecodedProjectPayload(t, project.Sections["allowed-section"].SharedModifier)
	if got := allowedPayload["styleColor"]; got != "#654321" {
		t.Fatalf("expected translated allowed-section styleColor #654321, got %#v", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_style_color",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "16",
			"styleColor":      "#123456",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_section_style_color blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked temp-id set_section_style_color call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "16" {
		t.Fatalf("expected translated blockedSectionIds [16], got %#v", ids)
	}
	if ids := mustStringList(t, blockedPayload["targetSectionIds"]); len(ids) != 1 || ids[0] != "16" {
		t.Fatalf("expected translated targetSectionIds [16], got %#v", ids)
	}
}

func TestServerSetSectionParamFilterTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":          "11",
		"chat-1":                 "12",
		"chat-section":           "13",
		"allowed-params-section": "20",
		"blocked-params-section": "22",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_param_filter",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "20",
			"paramFilter":     "   ",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_section_param_filter allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected temp-id set_section_param_filter success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id set_section_param_filter: %v", err)
	}
	allowedPayload := mustDecodedProjectPayload(t, project.Sections["allowed-params-section"].SharedModifier)
	if got := allowedPayload["paramFilter"]; got != "   " {
		t.Fatalf("expected translated allowed-params-section raw paramFilter whitespace, got %#v", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_param_filter",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "22",
			"paramFilter":     "blocked",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_section_param_filter blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked temp-id set_section_param_filter call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "22" {
		t.Fatalf("expected translated blockedSectionIds [22], got %#v", ids)
	}
	if ids := mustStringList(t, blockedPayload["targetSectionIds"]); len(ids) != 1 || ids[0] != "22" {
		t.Fatalf("expected translated targetSectionIds [22], got %#v", ids)
	}
}

func TestServerSetMetaControlShowSectionTitleTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustAddScopedTestMetaControlSections(t, projectRuntime)

	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":        "11",
		"chat-1":               "12",
		"chat-section":         "13",
		"allowed-meta-section": "24",
		"blocked-meta-section": "26",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_meta_control_show_section_title",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId":  "11",
			"sectionId":        "24",
			"showSectionTitle": true,
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_meta_control_show_section_title allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected temp-id set_meta_control_show_section_title success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id set_meta_control_show_section_title: %v", err)
	}
	allowedPayload := mustDecodedProjectPayload(t, project.Sections["allowed-meta-section"].SharedModifier)
	if got := allowedPayload["showSectionTitle"]; got != true {
		t.Fatalf("expected translated allowed-meta-section showSectionTitle=true, got %#v", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_meta_control_show_section_title",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId":  "11",
			"sectionId":        "26",
			"showSectionTitle": true,
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_meta_control_show_section_title blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked temp-id set_meta_control_show_section_title call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "26" {
		t.Fatalf("expected translated blockedSectionIds [26], got %#v", ids)
	}
	if ids := mustStringList(t, blockedPayload["targetSectionIds"]); len(ids) != 1 || ids[0] != "26" {
		t.Fatalf("expected translated targetSectionIds [26], got %#v", ids)
	}
}

func TestServerSetCodeTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":   "11",
		"chat-1":          "12",
		"chat-section":    "13",
		"allowed-section": "14",
		"blocked-section": "16",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "14",
			"code":            "print('temp id updated')\n",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_code allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected temp-id set_code success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id set_code: %v", err)
	}
	payload := mustDecodedProjectPayload(t, project.Sections["allowed-section"].SharedModifier)
	if got := payload["code"]; got != "print('temp id updated')\n" {
		t.Fatalf("expected translated set_code payload, got %#v", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "16",
			"code":            "print('blocked')\n",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_code blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked temp-id set_code call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "16" {
		t.Fatalf("expected translated blockedSectionIds [16], got %#v", ids)
	}
}

func TestServerFormatCodeTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":   "11",
		"chat-1":          "12",
		"chat-section":    "13",
		"allowed-section": "14",
		"blocked-section": "16",
	})

	var capturedProjectID string
	var capturedSectionID string
	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
		CodeUpdates: testCodeUpdateService{
			formatCode: func(_ context.Context, projectID string, sectionID string) error {
				capturedProjectID = projectID
				capturedSectionID = sectionID
				return nil
			},
		},
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "format_code",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "14",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id format_code: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id format_code success, got %#v", result.StructuredContent)
	}
	if capturedProjectID != "project-alpha" || capturedSectionID != "allowed-section" {
		t.Fatalf("expected canonical format_code ids, got project=%q section=%q", capturedProjectID, capturedSectionID)
	}
}

func TestServerSetTopLevelSectionLayoutTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	if _, _, err := projectRuntime.CreateViewMode(context.Background(), "project-alpha"); err != nil {
		t.Fatalf("seed view mode: %v", err)
	}
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":   "11",
		"chat-1":          "12",
		"chat-section":    "13",
		"allowed-section": "14",
		"blocked-section": "16",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_top_level_section_layout",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"topLevelSections": map[string]any{
				"14": map[string]any{"x": 510.0, "y": 220.0, "zIndex": 8},
			},
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_top_level_section_layout allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected temp-id set_top_level_section_layout success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id set_top_level_section_layout: %v", err)
	}
	layout := project.TopLevelSections["allowed-section"]
	if layout.X != 510.0 || layout.Y != 220.0 || layout.ZIndex != 8 {
		t.Fatalf("expected translated top-level layout update, got %#v", layout)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_top_level_section_layout",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"topLevelSections": map[string]any{
				"16": map[string]any{"x": 1.0, "y": 2.0},
			},
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_top_level_section_layout blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked temp-id set_top_level_section_layout call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "16" {
		t.Fatalf("expected translated blockedSectionIds [16], got %#v", ids)
	}
}

func TestServerSetCodeObjectDisplayNameTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":          "11",
		"chat-1":                 "12",
		"chat-section":           "13",
		"allowed-params-section": "20",
		"blocked-params-section": "21",
		"allowed-param":          "22",
		"blocked-param":          "23",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code_obj_display_name",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"codeObjId":       "22",
			"displayName":     "Translated",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_code_obj_display_name allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected temp-id set_code_obj_display_name success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id display-name update: %v", err)
	}
	if got := project.CodeObjs["allowed-param"].DisplayName; got != "Translated" {
		t.Fatalf("expected translated display name, got %q", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code_obj_display_name",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"codeObjId":       "23",
			"displayName":     "Blocked",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_code_obj_display_name blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked temp-id set_code_obj_display_name call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "21" {
		t.Fatalf("expected translated blockedSectionIds [21], got %#v", ids)
	}
}

func TestServerSetCodeObjectNameTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":          "11",
		"chat-1":                 "12",
		"chat-section":           "13",
		"allowed-params-section": "20",
		"blocked-params-section": "21",
		"allowed-param":          "22",
		"blocked-param":          "23",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code_obj_name",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"codeObjId":       "22",
			"name":            "translated_name",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_code_obj_name allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected temp-id set_code_obj_name success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id code-object name update: %v", err)
	}
	if got := project.CodeObjs["allowed-param"].Name; got != "translated_name" {
		t.Fatalf("expected translated code object name, got %q", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code_obj_name",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"codeObjId":       "23",
			"name":            "blocked_name",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_code_obj_name blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked temp-id set_code_obj_name call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "21" {
		t.Fatalf("expected translated blockedSectionIds [21], got %#v", ids)
	}
}

func TestServerHandlerServesSSETransport(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	server, err := NewServer(ServerOptions{WorkspaceRoot: workspaceRoot})
	if err != nil {
		t.Fatalf("new server: %v", err)
	}

	httpServer := httptest.NewServer(server.Handler())
	defer httpServer.Close()

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.SSEClientTransport{
		Endpoint: httpServer.URL,
	}, nil)
	if err != nil {
		t.Fatalf("connect sse client: %v", err)
	}
	defer session.Close()

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "list_mcp_tools",
		Arguments: map[string]any{},
	})
	if err != nil {
		t.Fatalf("call list_mcp_tools over sse: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected success result, got error %#v", result.StructuredContent)
	}
}

func openScopedTestProjectRuntime(t *testing.T) *projectstate.Runtime {
	t.Helper()

	runtime, err := projectstate.OpenOverlayRuntimeWithOptions(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				TopLevelSectionIDs: []string{
					"chat-section",
					"peer-chat-section",
					"allowed-section",
					"allowed-callable-section",
					"blocked-section",
					"blocked-callable-section",
					"allowed-params-section",
					"blocked-params-section",
				},
				TopLevelSections: map[string]projectstate.TopLevelSectionLayout{
					"chat-section":             {X: 10, Y: 20},
					"peer-chat-section":        {X: 20, Y: 30},
					"allowed-section":          {X: 30, Y: 40},
					"allowed-callable-section": {X: 35, Y: 45},
					"blocked-section":          {X: 40, Y: 50},
					"blocked-callable-section": {X: 45, Y: 55},
					"allowed-params-section":   {X: 50, Y: 60},
					"blocked-params-section":   {X: 60, Y: 70},
				},
				SectionVariantMap: map[string]string{
					"chat-section":             "chat-variant",
					"peer-chat-section":        "peer-chat-variant",
					"allowed-section":          "allowed-variant",
					"allowed-callable-section": "allowed-callable-variant",
					"blocked-section":          "blocked-variant",
					"blocked-callable-section": "blocked-callable-variant",
					"allowed-params-section":   "allowed-params-variant",
					"blocked-params-section":   "blocked-params-variant",
				},
				AgenticEdges: []projectstate.AgenticEdge{
					{
						ID:              "edge-context",
						SourceSectionID: "allowed-section",
						TargetSectionID: "chat-section",
						Kind:            agenticEdgeKindSectionChat,
					},
					{
						ID:              "edge-peer",
						SourceSectionID: "chat-section",
						TargetSectionID: "peer-chat-section",
						Kind:            agenticEdgeKindChatChat,
					},
					{
						ID:              "edge-write",
						SourceSectionID: "chat-section",
						TargetSectionID: "allowed-section",
						Kind:            agenticEdgeKindChatSection,
					},
					{
						ID:              "edge-callable-context",
						SourceSectionID: "allowed-callable-section",
						TargetSectionID: "chat-section",
						Kind:            agenticEdgeKindSectionChat,
					},
					{
						ID:              "edge-callable-write",
						SourceSectionID: "chat-section",
						TargetSectionID: "allowed-callable-section",
						Kind:            agenticEdgeKindChatSection,
					},
					{
						ID:              "edge-params-context",
						SourceSectionID: "allowed-params-section",
						TargetSectionID: "chat-section",
						Kind:            agenticEdgeKindSectionChat,
					},
					{
						ID:              "edge-params-write",
						SourceSectionID: "chat-section",
						TargetSectionID: "allowed-params-section",
						Kind:            agenticEdgeKindChatSection,
					},
				},
				Sections: map[string]projectstate.Section{
					"chat-section": {
						ID:               "chat-section",
						Name:             "Chat",
						VariantIDs:       []string{"chat-variant"},
						DefaultVariantID: "chat-variant",
					},
					"peer-chat-section": {
						ID:               "peer-chat-section",
						Name:             "Peer Chat",
						VariantIDs:       []string{"peer-chat-variant"},
						DefaultVariantID: "peer-chat-variant",
					},
					"allowed-section": {
						ID:               "allowed-section",
						Name:             "Allowed",
						VariantIDs:       []string{"allowed-variant"},
						DefaultVariantID: "allowed-variant",
					},
					"allowed-callable-section": {
						ID:               "allowed-callable-section",
						Name:             "Allowed Callable",
						VariantIDs:       []string{"allowed-callable-variant"},
						DefaultVariantID: "allowed-callable-variant",
						UnsharedKeys:     []string{"callable", "codeObjVariantMap"},
					},
					"blocked-section": {
						ID:               "blocked-section",
						Name:             "Blocked",
						VariantIDs:       []string{"blocked-variant"},
						DefaultVariantID: "blocked-variant",
					},
					"blocked-callable-section": {
						ID:               "blocked-callable-section",
						Name:             "Blocked Callable",
						VariantIDs:       []string{"blocked-callable-variant"},
						DefaultVariantID: "blocked-callable-variant",
						UnsharedKeys:     []string{"callable", "codeObjVariantMap"},
					},
					"allowed-params-section": {
						ID:               "allowed-params-section",
						Name:             "Allowed Params",
						VariantIDs:       []string{"allowed-params-variant"},
						DefaultVariantID: "allowed-params-variant",
					},
					"blocked-params-section": {
						ID:               "blocked-params-section",
						Name:             "Blocked Params",
						VariantIDs:       []string{"blocked-params-variant"},
						DefaultVariantID: "blocked-params-variant",
					},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"chat-variant":             {ID: "chat-variant", ImplID: "chat-impl"},
					"peer-chat-variant":        {ID: "peer-chat-variant", ImplID: "peer-chat-impl"},
					"allowed-variant":          {ID: "allowed-variant", ImplID: "allowed-impl"},
					"allowed-callable-variant": {ID: "allowed-callable-variant", ImplID: "allowed-callable-impl"},
					"blocked-variant":          {ID: "blocked-variant", ImplID: "blocked-impl"},
					"blocked-callable-variant": {ID: "blocked-callable-variant", ImplID: "blocked-callable-impl"},
					"allowed-params-variant":   {ID: "allowed-params-variant", ImplID: "allowed-params-impl"},
					"blocked-params-variant":   {ID: "blocked-params-variant", ImplID: "blocked-params-impl"},
				},
				SectionImpls: map[string]projectstate.SectionImpl{
					"chat-impl": {
						ID:      "chat-impl",
						Kind:    projectstate.SectionKind("frontend"),
						Payload: mustRawJSON(t, map[string]any{"id": "chat-impl", "type": "Chat"}),
					},
					"peer-chat-impl": {
						ID:      "peer-chat-impl",
						Kind:    projectstate.SectionKind("frontend"),
						Payload: mustRawJSON(t, map[string]any{"id": "peer-chat-impl", "type": "Chat"}),
					},
					"allowed-impl": {
						ID:   "allowed-impl",
						Kind: projectstate.SectionKindCode,
						Code: &projectstate.CodeSectionImpl{
							Language: projectstate.CodeLanguagePython,
						},
						Payload: mustRawJSON(t, map[string]any{
							"id":           "allowed-impl",
							"type":         "Code",
							"codeLanguage": "python",
							"code":         "print('allowed')\n",
							"children":     []any{},
						}),
					},
					"allowed-callable-impl": {
						ID:   "allowed-callable-impl",
						Kind: projectstate.SectionKind("callable"),
						Payload: mustRawJSON(t, map[string]any{
							"id":       "allowed-callable-impl",
							"type":     "Callable",
							"callable": "allowed-callable-1",
							"codeObjVariantMap": map[string]string{
								"allowed-callable-1":     "allowed-callable-variant-a",
								"allowed-callable-2":     "allowed-callable-variant-b",
								"allowed-param-existing": "allowed-param-existing-variant",
							},
						}),
					},
					"blocked-impl": {
						ID:   "blocked-impl",
						Kind: projectstate.SectionKindCode,
						Code: &projectstate.CodeSectionImpl{
							Language: projectstate.CodeLanguagePython,
						},
						Payload: mustRawJSON(t, map[string]any{
							"id":           "blocked-impl",
							"type":         "Code",
							"codeLanguage": "python",
							"code":         "print('blocked')\n",
							"children":     []any{},
						}),
					},
					"blocked-callable-impl": {
						ID:   "blocked-callable-impl",
						Kind: projectstate.SectionKind("callable"),
						Payload: mustRawJSON(t, map[string]any{
							"id":                "blocked-callable-impl",
							"type":              "Callable",
							"callable":          nil,
							"codeObjVariantMap": map[string]string{},
						}),
					},
					"allowed-params-impl": {
						ID:      "allowed-params-impl",
						Kind:    projectstate.SectionKind("dict"),
						Payload: mustRawJSON(t, map[string]any{"id": "allowed-params-impl", "type": "Dict", "topLevelParamId": "allowed-param", "codeObjVariantMap": map[string]string{"allowed-param": "allowed-param-variant"}, "ignoreTypeErrors": map[string]any{"callable": false, "params": map[string]any{}}}),
					},
					"blocked-params-impl": {
						ID:      "blocked-params-impl",
						Kind:    projectstate.SectionKind("dict"),
						Payload: mustRawJSON(t, map[string]any{"id": "blocked-params-impl", "type": "Dict", "topLevelParamId": "blocked-param", "codeObjVariantMap": map[string]string{"blocked-param": "blocked-param-variant"}, "ignoreTypeErrors": map[string]any{"callable": false, "params": map[string]any{}}}),
					},
				},
				CodeObjs: map[string]projectstate.CodeObject{
					"allowed-callable-1": {
						ID:               "allowed-callable-1",
						Name:             "existing_callable",
						VariantIDs:       []string{"allowed-callable-variant-a"},
						DefaultVariantID: "allowed-callable-variant-a",
					},
					"allowed-callable-2": {
						ID:               "allowed-callable-2",
						Name:             "sorted",
						VariantIDs:       []string{"allowed-callable-variant-b"},
						DefaultVariantID: "allowed-callable-variant-b",
					},
					"allowed-param-existing": {
						ID:               "allowed-param-existing",
						Name:             "iterable",
						VariantIDs:       []string{"allowed-param-existing-variant"},
						DefaultVariantID: "allowed-param-existing-variant",
					},
					"allowed-param": {
						ID:               "allowed-param",
						Name:             "allowed_param",
						VariantIDs:       []string{"allowed-param-variant"},
						DefaultVariantID: "allowed-param-variant",
					},
					"blocked-param": {
						ID:               "blocked-param",
						Name:             "blocked_param",
						VariantIDs:       []string{"blocked-param-variant"},
						DefaultVariantID: "blocked-param-variant",
					},
				},
				CodeObjVariants: map[string]projectstate.CodeObjectVariant{
					"allowed-callable-variant-a": {
						ID:     "allowed-callable-variant-a",
						ImplID: "allowed-callable-impl-a",
					},
					"allowed-callable-variant-b": {
						ID:     "allowed-callable-variant-b",
						ImplID: "allowed-callable-impl-b",
					},
					"allowed-param-existing-variant": {
						ID:     "allowed-param-existing-variant",
						ImplID: "allowed-param-existing-impl",
					},
					"allowed-param-variant": {
						ID:     "allowed-param-variant",
						ImplID: "allowed-param-impl",
					},
					"blocked-param-variant": {
						ID:     "blocked-param-variant",
						ImplID: "blocked-param-impl",
					},
				},
				CodeObjImpls: map[string]projectstate.CodeObjectImpl{
					"allowed-callable-impl-a": {
						ID:      "allowed-callable-impl-a",
						Type:    "CodeCallable",
						Payload: mustRawJSON(t, map[string]any{"id": "allowed-callable-impl-a", "type": "CodeCallable", "children": []any{}}),
					},
					"allowed-callable-impl-b": {
						ID:      "allowed-callable-impl-b",
						Type:    "CodeCallable",
						Payload: mustRawJSON(t, map[string]any{"id": "allowed-callable-impl-b", "type": "CodeCallable", "children": []any{"allowed-param-existing"}}),
					},
					"allowed-param-existing-impl": {
						ID:      "allowed-param-existing-impl",
						Type:    "CodeParam",
						Payload: mustRawJSON(t, map[string]any{"id": "allowed-param-existing-impl", "type": "CodeParam", "value": "user_value", "passingStyle": "DEFAULT"}),
					},
					"allowed-param-impl": {
						ID:      "allowed-param-impl",
						Type:    "TextParam",
						Payload: mustRawJSON(t, map[string]any{"id": "allowed-param-impl", "type": "TextParam", "value": "1"}),
					},
					"blocked-param-impl": {
						ID:      "blocked-param-impl",
						Type:    "TextParam",
						Payload: mustRawJSON(t, map[string]any{"id": "blocked-param-impl", "type": "TextParam", "value": "2"}),
					},
				},
			},
		},
	}, projectstate.RuntimeOptions{
		PasswordSecrets: projectstate.NewMemoryPasswordSecretStore(),
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})
	return runtime
}

func openPersistedAppDefinitionTestProjectRuntime(t *testing.T) (string, *projectstate.Runtime) {
	t.Helper()

	root := t.TempDir()
	store, err := projectstate.NewStore(filepath.Join(root, projectstate.MainFileName), projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("new persisted app-definition store: %v", err)
	}
	document := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}
	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save persisted app-definition document: %v", err)
	}
	runtime, err := projectstate.OpenRuntime(context.Background(), store)
	if err != nil {
		t.Fatalf("open persisted app-definition runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close persisted app-definition runtime: %v", err)
		}
	})
	return root, runtime
}

func enableScopedTestPythonCodegenTarget(t *testing.T, runtime *projectstate.Runtime) {
	t.Helper()

	_, err := runtime.SetProjectCodegenTargets(
		context.Background(),
		"project-alpha",
		[]projectstate.ProjectCodegenTarget{
			{
				Language: string(projectstate.CodeLanguagePython),
				Payload:  projectstate.RawJSON(`{"language":"python"}`),
			},
		},
		nil,
		projectstate.PythonCodegenSectionReconcilerFunc(func(_ context.Context, project *projectstate.Project) error {
			if project == nil {
				return projectstate.ErrProjectNotFound
			}
			if err := project.ReconcilePythonGeneratedBindings(); err != nil {
				return err
			}

			if project.Sections == nil {
				project.Sections = map[string]projectstate.Section{}
			}
			if project.SectionVariants == nil {
				project.SectionVariants = map[string]projectstate.SectionVariant{}
			}
			if project.SectionImpls == nil {
				project.SectionImpls = map[string]projectstate.SectionImpl{}
			}
			if project.SectionVariantMap == nil {
				project.SectionVariantMap = map[string]string{}
			}
			if project.TopLevelSections == nil {
				project.TopLevelSections = map[string]projectstate.TopLevelSectionLayout{}
			}

			project.Sections[projectstate.GeneratedPythonCodeSectionID] = projectstate.Section{
				ID:               projectstate.GeneratedPythonCodeSectionID,
				Name:             projectstate.GeneratedPythonCodeSectionName,
				VariantIDs:       []string{projectstate.GeneratedPythonCodeVariantID},
				DefaultVariantID: projectstate.GeneratedPythonCodeVariantID,
			}
			project.SectionVariants[projectstate.GeneratedPythonCodeVariantID] = projectstate.SectionVariant{
				ID:     projectstate.GeneratedPythonCodeVariantID,
				ImplID: projectstate.GeneratedPythonCodeImplID,
			}
			project.SectionImpls[projectstate.GeneratedPythonCodeImplID] = projectstate.SectionImpl{
				ID:   projectstate.GeneratedPythonCodeImplID,
				Kind: projectstate.SectionKindGenerated,
				Payload: mustRawJSON(t, map[string]any{
					"id":   projectstate.GeneratedPythonCodeImplID,
					"type": "GenPythonCode",
					"codeFileBinding": map[string]any{
						"canonical_path": projectstate.GeneratedPythonCodeRelativePath(project.Name),
						"access_mode":    "write_only",
						"autoBinding":    false,
					},
				}),
				Generated: &projectstate.GeneratedSectionImpl{
					Kind: projectstate.GeneratedSectionKindPythonCode,
				},
			}
			project.SectionVariantMap[projectstate.GeneratedPythonCodeSectionID] = projectstate.GeneratedPythonCodeVariantID
			if !containsString(project.TopLevelSectionIDs, projectstate.GeneratedPythonCodeSectionID) {
				project.TopLevelSectionIDs = append(project.TopLevelSectionIDs, projectstate.GeneratedPythonCodeSectionID)
			}
			if _, ok := project.TopLevelSections[projectstate.GeneratedPythonCodeSectionID]; !ok {
				project.TopLevelSections[projectstate.GeneratedPythonCodeSectionID] = projectstate.TopLevelSectionLayout{X: 90, Y: 100}
			}
			return nil
		}),
	)
	if err != nil {
		t.Fatalf("enable python codegen target: %v", err)
	}
}

func mustSeedScopedTestChildSection(t *testing.T, runtime *projectstate.Runtime, parentID string) string {
	t.Helper()

	_, result, err := runtime.CreateChildSections(context.Background(), "project-alpha", projectstate.CreateChildSectionsInput{
		ParentID:    parentID,
		ImplType:    "Terminal",
		NumChildren: 1,
	}, projectstate.DefaultStructuralMutationSettings())
	if err != nil {
		t.Fatalf("seed child section under %q: %v", parentID, err)
	}
	if len(result.SectionIDs) != 1 {
		t.Fatalf("expected one seeded child section under %q, got %#v", parentID, result.SectionIDs)
	}
	return result.SectionIDs[0]
}

func mustSeedScopedTestTopLevelTerminal(t *testing.T, runtime *projectstate.Runtime) string {
	t.Helper()

	_, sectionID, err := runtime.CreateTemporaryTerminal("project-alpha", projectstate.TerminalSectionSeed{
		SectionID: "attached-terminal",
		VariantID: "attached-terminal-variant",
		ImplID:    "attached-terminal-impl",
		Name:      "Terminal",
	})
	if err != nil {
		t.Fatalf("seed top-level terminal: %v", err)
	}
	return sectionID
}

func mustAddScopedTestAlternateSectionVariant(t *testing.T, runtime *projectstate.Runtime) {
	t.Helper()

	if _, err := runtime.MutateAndSave(context.Background(), func(document projectstate.Document) (projectstate.Document, error) {
		project, err := document.ProjectByID("project-alpha")
		if err != nil {
			return document, err
		}
		section, ok := project.Sections["allowed-section"]
		if !ok {
			return document, fmt.Errorf("%w: %q", projectstate.ErrSectionNotFound, "allowed-section")
		}
		if containsString(section.VariantIDs, "allowed-variant-alt") {
			return document, nil
		}

		section.VariantIDs = append(section.VariantIDs, "allowed-variant-alt")
		project.Sections[section.ID] = section
		project.SectionVariants["allowed-variant-alt"] = projectstate.SectionVariant{
			ID:     "allowed-variant-alt",
			ImplID: "allowed-impl-alt",
		}
		project.SectionImpls["allowed-impl-alt"] = projectstate.SectionImpl{
			ID:   "allowed-impl-alt",
			Kind: projectstate.SectionKindCode,
			Code: &projectstate.CodeSectionImpl{
				Language: projectstate.CodeLanguagePython,
			},
			Payload: mustRawJSON(t, map[string]any{
				"id":           "allowed-impl-alt",
				"type":         "Code",
				"codeLanguage": "python",
				"code":         "print('allowed alt')\n",
				"children":     []any{},
			}),
		}

		normalizedProject, err := project.Normalized()
		if err != nil {
			return document, err
		}
		document.Projects[normalizedProject.ID] = normalizedProject
		return document, nil
	}); err != nil {
		t.Fatalf("add scoped test alternate section variant: %v", err)
	}
}

func mustAddScopedTestGroupSection(t *testing.T, runtime *projectstate.Runtime) {
	t.Helper()

	if _, err := runtime.MutateAndSave(context.Background(), func(document projectstate.Document) (projectstate.Document, error) {
		project, err := document.ProjectByID("project-alpha")
		if err != nil {
			return document, err
		}
		if _, ok := project.Sections["group-section"]; ok {
			return document, nil
		}

		project.TopLevelSectionIDs = append(project.TopLevelSectionIDs, "group-section")
		project.TopLevelSections["group-section"] = projectstate.TopLevelSectionLayout{X: 70, Y: 80}
		project.SectionVariantMap["group-section"] = "group-variant"
		project.Sections["group-section"] = projectstate.Section{
			ID:               "group-section",
			Name:             "Group",
			VariantIDs:       []string{"group-variant"},
			DefaultVariantID: "group-variant",
		}
		project.SectionVariants["group-variant"] = projectstate.SectionVariant{
			ID:     "group-variant",
			ImplID: "group-impl",
		}
		project.SectionImpls["group-impl"] = projectstate.SectionImpl{
			ID:   "group-impl",
			Kind: projectstate.SectionKind("frontend"),
			Payload: mustRawJSON(t, map[string]any{
				"id":                      "group-impl",
				"type":                    "Group",
				"isHorizontalOrientation": false,
				"overflowMode":            false,
			}),
		}

		normalizedProject, err := project.Normalized()
		if err != nil {
			return document, err
		}
		document.Projects[normalizedProject.ID] = normalizedProject
		return document, nil
	}); err != nil {
		t.Fatalf("add scoped test group section: %v", err)
	}
}

func mustAddScopedTestMetaControlSections(t *testing.T, runtime *projectstate.Runtime) {
	t.Helper()

	if _, err := runtime.MutateAndSave(context.Background(), func(document projectstate.Document) (projectstate.Document, error) {
		project, err := document.ProjectByID("project-alpha")
		if err != nil {
			return document, err
		}
		if _, ok := project.Sections["allowed-meta-section"]; ok {
			return document, nil
		}

		project.TopLevelSectionIDs = append(project.TopLevelSectionIDs, "allowed-meta-section", "blocked-meta-section")
		project.TopLevelSections["allowed-meta-section"] = projectstate.TopLevelSectionLayout{X: 70, Y: 80}
		project.TopLevelSections["blocked-meta-section"] = projectstate.TopLevelSectionLayout{X: 80, Y: 90}
		project.SectionVariantMap["allowed-meta-section"] = "allowed-meta-variant"
		project.SectionVariantMap["blocked-meta-section"] = "blocked-meta-variant"
		project.AgenticEdges = append(project.AgenticEdges, projectstate.AgenticEdge{
			ID:              "edge-meta-context",
			SourceSectionID: "allowed-meta-section",
			TargetSectionID: "chat-section",
			Kind:            agenticEdgeKindSectionChat,
		}, projectstate.AgenticEdge{
			ID:              "edge-meta-write",
			SourceSectionID: "chat-section",
			TargetSectionID: "allowed-meta-section",
			Kind:            agenticEdgeKindChatSection,
		})
		project.Sections["allowed-meta-section"] = projectstate.Section{
			ID:               "allowed-meta-section",
			Name:             "Allowed Meta",
			VariantIDs:       []string{"allowed-meta-variant"},
			DefaultVariantID: "allowed-meta-variant",
		}
		project.Sections["blocked-meta-section"] = projectstate.Section{
			ID:               "blocked-meta-section",
			Name:             "Blocked Meta",
			VariantIDs:       []string{"blocked-meta-variant"},
			DefaultVariantID: "blocked-meta-variant",
		}
		project.SectionVariants["allowed-meta-variant"] = projectstate.SectionVariant{
			ID:     "allowed-meta-variant",
			ImplID: "allowed-meta-impl",
		}
		project.SectionVariants["blocked-meta-variant"] = projectstate.SectionVariant{
			ID:     "blocked-meta-variant",
			ImplID: "blocked-meta-impl",
		}
		project.SectionImpls["allowed-meta-impl"] = projectstate.SectionImpl{
			ID:      "allowed-meta-impl",
			Kind:    projectstate.SectionKind("frontend"),
			Payload: mustRawJSON(t, map[string]any{"id": "allowed-meta-impl", "type": "MetaControl", "showSectionTitle": false, "codeObjVariantMap": map[string]any{}}),
		}
		project.SectionImpls["blocked-meta-impl"] = projectstate.SectionImpl{
			ID:      "blocked-meta-impl",
			Kind:    projectstate.SectionKind("frontend"),
			Payload: mustRawJSON(t, map[string]any{"id": "blocked-meta-impl", "type": "MetaControl", "showSectionTitle": false, "codeObjVariantMap": map[string]any{}}),
		}

		normalizedProject, err := project.Normalized()
		if err != nil {
			return document, err
		}
		document.Projects[normalizedProject.ID] = normalizedProject
		return document, nil
	}); err != nil {
		t.Fatalf("add scoped test meta control sections: %v", err)
	}
}

func mustSetTestCodeSectionReadOnly(t *testing.T, runtime *projectstate.Runtime, projectID string, sectionID string) {
	t.Helper()

	_, err := runtime.SetCodeFileBinding(context.Background(), projectID, sectionID, projectstate.CodeFileBinding{
		Path:       "code/readonly.py",
		AccessMode: projectstate.CodeFileAccessModeReadOnly,
	})
	if err != nil {
		t.Fatalf("mark code section %q read-only: %v", sectionID, err)
	}
}

func mustSetScopedTestWatchCodeFiles(t *testing.T, runtime *projectstate.Runtime, files []string) {
	t.Helper()

	mustSetScopedTestWatchCodeState(t, runtime, false, nil, files, nil)
}

func mustSetScopedTestWatchCodeState(
	t *testing.T,
	runtime *projectstate.Runtime,
	enabled bool,
	folders []projectstate.WatchCodeFolder,
	files []string,
	baseline map[string][]string,
) {
	t.Helper()

	_, err := runtime.MutateAndSave(context.Background(), func(document projectstate.Document) (projectstate.Document, error) {
		project := document.Projects["project-alpha"]
		project.WatchCodeEnabled = enabled
		project.WatchCodeFolders = append([]projectstate.WatchCodeFolder(nil), folders...)
		project.WatchCodeFiles = append([]string(nil), files...)
		project.WatchCodeBaselineByPath = cloneStringSliceMap(baseline)
		project.WatchCodeRegistry = map[string]projectstate.WatchCodeRegistryEntry{}
		document.Projects["project-alpha"] = project
		return document, nil
	})
	if err != nil {
		t.Fatalf("seed watch code state: %v", err)
	}
}

func setScopedAgenticContext(t *testing.T, clientSession *sdkmcp.ClientSession, projectConfigID string, chatID string, sectionID string) {
	t.Helper()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_agentic_context",
		Arguments: map[string]any{
			"projectConfigId": projectConfigID,
			"chatId":          chatID,
			"sectionId":       sectionID,
		},
	})
	if err != nil {
		t.Fatalf("call set_agentic_context: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_agentic_context success, got %#v", result.StructuredContent)
	}
}

func newScopedTestServerSession(t *testing.T, workspaceRoot string, projectRuntime *projectstate.Runtime) (*Server, *sdkmcp.ClientSession) {
	t.Helper()

	return newScopedTestServerSessionWithOptions(t, workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:  workspaceRoot,
		ProjectState:   projectRuntime,
		LSPDiagnostics: openScopedTestLSPDiagnosticsRegistry(),
	})
}

func newScopedTestServerSessionWithOptions(t *testing.T, workspaceRoot string, projectRuntime *projectstate.Runtime, options ServerOptions) (*Server, *sdkmcp.ClientSession) {
	t.Helper()

	if strings.TrimSpace(options.WorkspaceRoot) == "" {
		options.WorkspaceRoot = workspaceRoot
	}
	if options.ProjectState == nil {
		options.ProjectState = projectRuntime
	}
	if options.LSPDiagnostics == nil {
		options.LSPDiagnostics = openScopedTestLSPDiagnosticsRegistry()
	}
	if options.SectionNames == nil && projectRuntime != nil {
		options.SectionNames = testSectionNameService{runtime: projectRuntime}
	}
	if options.CodeUpdates == nil && projectRuntime != nil {
		options.CodeUpdates = testCodeUpdateService{runtime: projectRuntime}
	}
	if options.CodegenTargetValidator == nil && projectRuntime != nil {
		options.CodegenTargetValidator = projectstate.CodegenTargetValidatorFunc(func(context.Context, projectstate.ProjectCodegenTarget) error {
			return nil
		})
	}
	if options.PythonCodegenSectionReconciler == nil && projectRuntime != nil {
		options.PythonCodegenSectionReconciler = projectstate.PythonCodegenSectionReconcilerFunc(func(context.Context, *projectstate.Project) error {
			return nil
		})
	}

	server, err := NewServer(options)
	if err != nil {
		t.Fatalf("new server: %v", err)
	}

	ctx := context.Background()
	serverTransport, clientTransport := sdkmcp.NewInMemoryTransports()
	serverSession, err := server.server.Connect(ctx, serverTransport, nil)
	if err != nil {
		t.Fatalf("connect server session: %v", err)
	}
	t.Cleanup(func() {
		if err := serverSession.Close(); err != nil {
			t.Fatalf("close server session: %v", err)
		}
	})

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	clientSession, err := client.Connect(ctx, clientTransport, nil)
	if err != nil {
		t.Fatalf("connect client session: %v", err)
	}
	return server, clientSession
}

type stubPythonPackageProvider struct {
	packages []string
	err      error
}

func (s stubPythonPackageProvider) InstalledPackages(context.Context) ([]string, error) {
	if s.err != nil {
		return nil, s.err
	}
	return append([]string(nil), s.packages...), nil
}

type stubCallableSignatureResolver struct {
	result projectstate.CallableSignatureResult
	ok     bool
	err    error
}

func (s stubCallableSignatureResolver) ResolveCallableSignature(
	_ context.Context,
	_ projectstate.Project,
	_ string,
	_ string,
) (projectstate.CallableSignatureResult, bool, error) {
	return s.result, s.ok, s.err
}

type testSectionNameService struct {
	runtime *projectstate.Runtime
}

func (s testSectionNameService) SetSectionName(ctx context.Context, projectID string, sectionID string, name string) error {
	if s.runtime == nil {
		return projectstate.ErrRuntimeClosed
	}
	_, err := s.runtime.SetSectionName(ctx, projectID, sectionID, name)
	return err
}

type testCodeUpdateService struct {
	runtime    *projectstate.Runtime
	formatCode func(ctx context.Context, projectID string, sectionID string) error
}

func (s testCodeUpdateService) SetCode(ctx context.Context, projectID string, sectionID string, code string) error {
	if s.runtime == nil {
		return projectstate.ErrRuntimeClosed
	}
	_, err := s.runtime.SetCode(ctx, projectID, sectionID, code)
	return err
}

func (s testCodeUpdateService) FormatCode(ctx context.Context, projectID string, sectionID string) error {
	if s.formatCode != nil {
		return s.formatCode(ctx, projectID, sectionID)
	}
	if s.runtime == nil {
		return projectstate.ErrRuntimeClosed
	}
	return nil
}

func mustReadFileRangeResult(t *testing.T, handler tools.Handler, arguments map[string]any) readFileRangeResult {
	t.Helper()

	result, err := handler(context.Background(), arguments)
	if err != nil {
		t.Fatalf("unexpected handler error: %v", err)
	}
	typed, ok := result.(readFileRangeResult)
	if !ok {
		t.Fatalf("expected readFileRangeResult, got %#v", result)
	}
	return typed
}

func mustToolError(t *testing.T, handler tools.Handler, arguments map[string]any) *toolError {
	t.Helper()

	_, err := handler(context.Background(), arguments)
	if err == nil {
		t.Fatal("expected tool error")
	}
	typed, ok := err.(*toolError)
	if !ok {
		t.Fatalf("expected *toolError, got %T", err)
	}
	return typed
}

func assertSummaryPayload(t *testing.T, payload any) {
	t.Helper()

	summary := mustStructuredMap(t, payload)
	projectConfig := mustStructuredMap(t, summary["projectConfig"])
	sectionVariantMap := mustStructuredMap(t, projectConfig["sectionVariantMap"])
	if len(sectionVariantMap) != 4 {
		t.Fatalf("expected four allowed section variants, got %#v", sectionVariantMap)
	}
	if _, ok := sectionVariantMap["allowed-section"]; !ok {
		t.Fatalf("expected allowed-section in summary, got %#v", sectionVariantMap)
	}
	if _, ok := sectionVariantMap["allowed-callable-section"]; !ok {
		t.Fatalf("expected allowed-callable-section in summary, got %#v", sectionVariantMap)
	}
	if _, ok := sectionVariantMap["allowed-params-section"]; !ok {
		t.Fatalf("expected allowed-params-section in summary, got %#v", sectionVariantMap)
	}
	if _, ok := sectionVariantMap["peer-chat-section"]; !ok {
		t.Fatalf("expected peer-chat-section in summary, got %#v", sectionVariantMap)
	}
	if _, ok := sectionVariantMap["blocked-section"]; ok {
		t.Fatalf("did not expect blocked-section in summary, got %#v", sectionVariantMap)
	}
	if _, ok := sectionVariantMap["blocked-callable-section"]; ok {
		t.Fatalf("did not expect blocked-callable-section in summary, got %#v", sectionVariantMap)
	}
	if _, ok := sectionVariantMap["blocked-params-section"]; ok {
		t.Fatalf("did not expect blocked-params-section in summary, got %#v", sectionVariantMap)
	}

	parentSectionMap := mustStructuredMap(t, summary["parentSectionMap"])
	if _, ok := parentSectionMap["blocked-section"]; ok {
		t.Fatalf("did not expect blocked-section in parent map, got %#v", parentSectionMap)
	}

	sections := mustStructuredList(t, summary["sections"])
	var sectionIDs []string
	for _, rawSection := range sections {
		section := mustStructuredMap(t, rawSection)
		sectionID, ok := section["sectionId"].(string)
		if !ok {
			t.Fatalf("expected sectionId string, got %#v", section["sectionId"])
		}
		sectionIDs = append(sectionIDs, sectionID)
	}
	sort.Strings(sectionIDs)
	if len(sectionIDs) != 4 || sectionIDs[0] != "allowed-callable-section" || sectionIDs[1] != "allowed-params-section" || sectionIDs[2] != "allowed-section" || sectionIDs[3] != "peer-chat-section" {
		t.Fatalf("unexpected filtered section ids %#v", sectionIDs)
	}
}

func assertDiagnosticsPayload(t *testing.T, payload any) {
	t.Helper()

	diagnostics := mustStructuredMap(t, payload)
	codeSections := mustStructuredMap(t, diagnostics["codeSections"])
	if len(codeSections) != 1 {
		t.Fatalf("expected one allowed code section diagnostics entry, got %#v", codeSections)
	}
	if _, ok := codeSections["allowed-section"]; !ok {
		t.Fatalf("expected allowed-section diagnostics, got %#v", codeSections)
	}
	genCode := mustStructuredMap(t, diagnostics["genCode"])
	genErrors := mustStructuredMap(t, genCode["errors"])
	if len(genErrors) != 1 {
		t.Fatalf("expected one allowed generated diagnostics entry, got %#v", genErrors)
	}
	if _, ok := genErrors["allowed-section"]; !ok {
		t.Fatalf("expected allowed-section generated diagnostics, got %#v", genErrors)
	}
	if unmapped := mustStructuredList(t, diagnostics["unmappedGenCode"]); len(unmapped) != 0 {
		t.Fatalf("expected scoped diagnostics to drop unmapped gen code, got %#v", unmapped)
	}
}

func TestServerRegisterToolAddsRuntimePluginTools(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	server, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	_, err := server.RegisterTool(ToolRegistration{
		Spec: tools.Spec{
			Name:        "setta_plugin_runtime_tool",
			Description: "Runtime-registered plugin tool.",
			Metadata: tools.Metadata{
				Kind:       tools.KindDiscoverable,
				AccessType: tools.AccessTypeRead,
				SearchTags: []string{"plugin", "runtime"},
			},
			Handler: func(_ context.Context, arguments map[string]any) (any, error) {
				return map[string]any{
					"value": arguments["value"],
				}, nil
			},
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"value": map[string]any{
					"type": "string",
				},
			},
			"required": []string{"value"},
		},
	})
	if err != nil {
		t.Fatalf("register runtime plugin tool: %v", err)
	}

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-section", "chat-section")

	toolsResult, err := clientSession.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatalf("list tools after runtime registration: %v", err)
	}
	if !slices.ContainsFunc(toolsResult.Tools, func(tool *sdkmcp.Tool) bool {
		return tool != nil && tool.Name == "setta_plugin_runtime_tool"
	}) {
		t.Fatalf("expected runtime plugin tool in tool list, got %#v", toolsResult.Tools)
	}

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "setta_plugin_runtime_tool",
		Arguments: map[string]any{
			"value": "alpha",
		},
	})
	if err != nil {
		t.Fatalf("call runtime plugin tool: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected runtime plugin tool success, got %#v", result.StructuredContent)
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["value"] != "alpha" {
		t.Fatalf("expected value alpha, got %#v", payload["value"])
	}

	searchResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_mcp_tools",
		Arguments: map[string]any{
			"query": "plugin runtime",
			"limit": 5,
		},
	})
	if err != nil {
		t.Fatalf("search tools after runtime registration: %v", err)
	}
	if searchResult.IsError {
		t.Fatalf("expected runtime search success, got %#v", searchResult.StructuredContent)
	}
	searchPayload := mustStructuredMap(t, searchResult.StructuredContent)
	results := mustStructuredList(t, searchPayload["results"])
	if len(results) == 0 {
		t.Fatal("expected runtime search results")
	}
	first := mustStructuredMap(t, results[0])
	if first["name"] != "setta_plugin_runtime_tool" {
		t.Fatalf("expected runtime plugin tool search result, got %#v", results)
	}
}

func TestServerRemoveToolsDropsRuntimePluginTools(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	server, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	if _, err := server.RegisterTool(ToolRegistration{
		Spec: tools.Spec{
			Name:        "setta_plugin_runtime_tool",
			Description: "Runtime-registered plugin tool.",
			Metadata: tools.Metadata{
				Kind:       tools.KindDiscoverable,
				AccessType: tools.AccessTypeRead,
			},
			Handler: func(_ context.Context, arguments map[string]any) (any, error) {
				return arguments, nil
			},
		},
		InputSchema: map[string]any{
			"type": "object",
		},
	}); err != nil {
		t.Fatalf("register runtime plugin tool: %v", err)
	}

	server.RemoveTools("setta_plugin_runtime_tool")

	toolsResult, err := clientSession.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatalf("list tools after removal: %v", err)
	}
	if slices.ContainsFunc(toolsResult.Tools, func(tool *sdkmcp.Tool) bool {
		return tool != nil && tool.Name == "setta_plugin_runtime_tool"
	}) {
		t.Fatalf("expected runtime plugin tool to be removed, got %#v", toolsResult.Tools)
	}
	if _, ok := server.Registry().Lookup("setta_plugin_runtime_tool"); ok {
		t.Fatal("expected removed runtime plugin tool to be absent from registry")
	}
}

func TestServerReplaceToolsSwapsRuntimePluginTools(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	server, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	if _, err := server.RegisterTool(ToolRegistration{
		Spec: tools.Spec{
			Name:        "setta_plugin_runtime_tool",
			Description: "Runtime-registered plugin tool.",
			Metadata: tools.Metadata{
				Kind:       tools.KindDiscoverable,
				AccessType: tools.AccessTypeRead,
			},
			Handler: func(_ context.Context, arguments map[string]any) (any, error) {
				return arguments, nil
			},
		},
		InputSchema: map[string]any{
			"type": "object",
		},
	}); err != nil {
		t.Fatalf("register initial runtime plugin tool: %v", err)
	}

	if err := server.ReplaceTools(
		[]string{"setta_plugin_runtime_tool"},
		[]ToolRegistration{
			{
				Spec: tools.Spec{
					Name:        "setta_plugin_runtime_tool_replacement",
					Description: "Replacement runtime plugin tool.",
					Metadata: tools.Metadata{
						Kind:       tools.KindDiscoverable,
						AccessType: tools.AccessTypeRead,
					},
					Handler: func(_ context.Context, arguments map[string]any) (any, error) {
						return map[string]any{"value": arguments["value"]}, nil
					},
				},
				InputSchema: map[string]any{
					"type": "object",
				},
			},
		},
	); err != nil {
		t.Fatalf("replace runtime plugin tools: %v", err)
	}

	toolsResult, err := clientSession.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatalf("list tools after replacement: %v", err)
	}
	if slices.ContainsFunc(toolsResult.Tools, func(tool *sdkmcp.Tool) bool {
		return tool != nil && tool.Name == "setta_plugin_runtime_tool"
	}) {
		t.Fatalf("expected old runtime tool to be removed, got %#v", toolsResult.Tools)
	}
	if !slices.ContainsFunc(toolsResult.Tools, func(tool *sdkmcp.Tool) bool {
		return tool != nil && tool.Name == "setta_plugin_runtime_tool_replacement"
	}) {
		t.Fatalf("expected replacement runtime tool in list, got %#v", toolsResult.Tools)
	}
}

func TestServerSearchMCPToolsUsesDiscoverableToolsAndServerFilters(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_mcp_tools",
		Arguments: map[string]any{
			"query": "section size settings",
			"limit": 2,
		},
	})
	if err != nil {
		t.Fatalf("call search_mcp_tools: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected search_mcp_tools success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	results := mustStructuredList(t, payload["results"])
	if len(results) == 0 {
		t.Fatal("expected at least one search result")
	}
	first := mustStructuredMap(t, results[0])
	if first["name"] != "set_section_sizes" {
		t.Fatalf("expected set_section_sizes as top search result, got %#v", first)
	}
	for _, rawResult := range results {
		entry := mustStructuredMap(t, rawResult)
		if entry["name"] == "search_mcp_tools" {
			t.Fatalf("expected init search tool to be excluded from search results, got %#v", results)
		}
	}

	filtered, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_mcp_tools",
		Arguments: map[string]any{
			"query":     "section size settings",
			"serverIds": []any{"filesystem"},
		},
	})
	if err != nil {
		t.Fatalf("call filtered search_mcp_tools: %v", err)
	}
	if filtered.IsError {
		t.Fatalf("expected filtered search_mcp_tools success, got %#v", filtered.StructuredContent)
	}
	filteredPayload := mustStructuredMap(t, filtered.StructuredContent)
	if got := mustStructuredList(t, filteredPayload["results"]); len(got) != 0 {
		t.Fatalf("expected non-setta server filter to return no results, got %#v", got)
	}
}

func TestServerSearchMCPToolsFindsCreateTopLevelSectionForCreateQueries(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	testCases := []struct {
		name  string
		query string
		limit int
	}{
		{name: "singular query", query: "create section", limit: 2},
		{name: "plural query", query: "create sections", limit: 3},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
				Name: "search_mcp_tools",
				Arguments: map[string]any{
					"query": testCase.query,
					"limit": testCase.limit,
				},
			})
			if err != nil {
				t.Fatalf("call search_mcp_tools: %v", err)
			}
			if result.IsError {
				t.Fatalf("expected search_mcp_tools success, got %#v", result.StructuredContent)
			}

			payload := mustStructuredMap(t, result.StructuredContent)
			results := mustStructuredList(t, payload["results"])
			if !slices.ContainsFunc(results, func(rawResult any) bool {
				entry := mustStructuredMap(t, rawResult)
				return entry["name"] == "create_top_level_section"
			}) {
				t.Fatalf("expected create_top_level_section in search results for %q, got %#v", testCase.query, results)
			}
		})
	}
}

func TestServerToolCatalogIncludesTerminalSectionDescription(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	toolsResult, err := clientSession.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatalf("list tools: %v", err)
	}

	var terminalTool *sdkmcp.Tool
	for _, tool := range toolsResult.Tools {
		if tool != nil && tool.Name == "getTerminalOutput" {
			terminalTool = tool
			break
		}
	}
	if terminalTool == nil {
		t.Fatal("expected getTerminalOutput tool")
	}

	inputSchema := mustStructuredMap(t, terminalTool.InputSchema)
	properties := mustStructuredMap(t, inputSchema["properties"])
	sectionSchema := mustStructuredMap(t, properties["sectionId"])
	if sectionSchema["description"] != "Top-level terminal section id whose buffered output should be returned." {
		t.Fatalf("unexpected getTerminalOutput sectionId description %#v", sectionSchema["description"])
	}
}

func TestServerSearchMCPToolsRejectsNonIntegerLimit(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_mcp_tools",
		Arguments: map[string]any{
			"query": "section size settings",
			"limit": "two",
		},
	})
	if err != nil {
		t.Fatalf("call invalid search_mcp_tools: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid search_mcp_tools limit to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	message, _ := payload["message"].(string)
	if !strings.Contains(message, "limit must be an integer") {
		t.Fatalf("expected integer validation message, got %#v", payload["message"])
	}
}

func TestServerGetMCPServerRuntimeStatusReturnsClientStatuses(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	statusClient, err := NewClient(ClientOptions{
		Servers: map[string]ServerConfig{
			DefaultServerID: {
				Transport: TransportSSE,
				URL:       "http://127.0.0.1:8000/mcp",
			},
		},
	})
	if err != nil {
		t.Fatalf("new status client: %v", err)
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:  t.TempDir(),
		ProjectState:   projectRuntime,
		LSPDiagnostics: openScopedTestLSPDiagnosticsRegistry(),
		MCPStatuses:    statusClient,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "get_mcp_server_runtime_status",
		Arguments: map[string]any{},
	})
	if err != nil {
		t.Fatalf("call get_mcp_server_runtime_status: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected get_mcp_server_runtime_status success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	servers := mustStructuredList(t, payload["servers"])
	if len(servers) != 1 {
		t.Fatalf("expected one runtime status, got %#v", servers)
	}
	serverStatus := mustStructuredMap(t, servers[0])
	if serverStatus["serverId"] != DefaultServerID {
		t.Fatalf("expected default server id, got %#v", serverStatus["serverId"])
	}
	if serverStatus["state"] != string(RuntimeStateUnknown) {
		t.Fatalf("expected unknown runtime state before client start, got %#v", serverStatus["state"])
	}
	if serverStatus["toolCount"] != float64(0) {
		t.Fatalf("expected zero tool count before client start, got %#v", serverStatus["toolCount"])
	}
}

func TestServerGetProjectConfigNamesAndIDsReturnsSortedMetadata(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, err := projectRuntime.MutateAndSave(context.Background(), func(document projectstate.Document) (projectstate.Document, error) {
		document.Projects["project-zeta"] = projectstate.Project{
			ID:   "project-zeta",
			Name: "Zeta",
		}
		document.Projects["project-beta"] = projectstate.Project{
			ID:   "project-beta",
			Name: "beta",
		}
		return document, nil
	})
	if err != nil {
		t.Fatalf("seed additional project metadata: %v", err)
	}

	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "getProjectConfigNamesAndIds",
		Arguments: map[string]any{},
	})
	if err != nil {
		t.Fatalf("call getProjectConfigNamesAndIds: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected getProjectConfigNamesAndIds success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	projectConfigs := mustStructuredList(t, payload["projectConfigs"])
	if len(projectConfigs) != 3 {
		t.Fatalf("expected three project configs, got %#v", projectConfigs)
	}
	first := mustStructuredMap(t, projectConfigs[0])
	second := mustStructuredMap(t, projectConfigs[1])
	third := mustStructuredMap(t, projectConfigs[2])
	if first["name"] != "Alpha" || second["name"] != "beta" || third["name"] != "Zeta" {
		t.Fatalf("expected sorted project metadata, got %#v", projectConfigs)
	}
}

func TestServerGetInstalledPythonPackagesReturnsProviderPayload(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:  t.TempDir(),
		ProjectState:   projectRuntime,
		LSPDiagnostics: openScopedTestLSPDiagnosticsRegistry(),
		PythonPackages: stubPythonPackageProvider{packages: []string{"Alpha=1.0.0", "beta=2.0.0", "zeta=3.0.0"}},
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "getInstalledPythonPackages",
		Arguments: map[string]any{},
	})
	if err != nil {
		t.Fatalf("call getInstalledPythonPackages: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected getInstalledPythonPackages success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	packages := mustStringList(t, payload["packages"])
	if !reflect.DeepEqual(packages, []string{"Alpha=1.0.0", "beta=2.0.0", "zeta=3.0.0"}) {
		t.Fatalf("expected forwarded package list, got %#v", packages)
	}
}

func TestServerGetTerminalOutputReturnsBufferedHistory(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("PTY-backed terminal history tests currently target macOS and Linux")
	}

	projectRuntime := openScopedTestProjectRuntime(t)
	terminalService := openScopedTestTerminalService(t)
	sessionID := terminals.BuildTerminalID("allowed-section", "")
	if _, _, err := terminalService.Open(terminals.OpenOptions{
		ID:         sessionID,
		ProjectID:  "project-alpha",
		AllowInput: true,
		Command:    quietScopedTestCatCommand(t),
	}); err != nil {
		t.Fatalf("open scoped test terminal: %v", err)
	}

	attachment := attachScopedTestTerminal(t, terminalService, sessionID)
	if err := terminalService.Write(sessionID, []byte("tool history line\n")); err != nil {
		t.Fatalf("write terminal history: %v", err)
	}
	output := waitForScopedTestOutputContains(t, attachment, "tool history line")
	if !strings.Contains(output, "tool history line") {
		t.Fatalf("expected written terminal output, got %q", output)
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:  t.TempDir(),
		ProjectState:   projectRuntime,
		LSPDiagnostics: openScopedTestLSPDiagnosticsRegistry(),
		Terminals:      terminalService,
	})
	defer clientSession.Close()
	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "getTerminalOutput",
		Arguments: map[string]any{
			"sectionId": "allowed-section",
		},
	})
	if err != nil {
		t.Fatalf("call getTerminalOutput: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected getTerminalOutput success, got %#v", result.StructuredContent)
	}

	history, ok := result.StructuredContent.(string)
	if !ok {
		t.Fatalf("expected string terminal output payload, got %#v", result.StructuredContent)
	}
	if !strings.Contains(history, "tool history line") {
		t.Fatalf("expected terminal history to include written line, got %q", history)
	}
}

func TestServerGetAppCatalogAndListAppComponentsReturnDefaultCatalog(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	catalogResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "get_app_catalog",
		Arguments: map[string]any{},
	})
	if err != nil {
		t.Fatalf("call get_app_catalog: %v", err)
	}
	if catalogResult.IsError {
		t.Fatalf("expected get_app_catalog success, got %#v", catalogResult.StructuredContent)
	}
	catalogPayload := mustStructuredMap(t, catalogResult.StructuredContent)
	catalog := mustStructuredMap(t, catalogPayload["catalog"])
	if catalog["id"] != appspec.DefaultCatalogID {
		t.Fatalf("expected catalog id %q, got %#v", appspec.DefaultCatalogID, catalog["id"])
	}
	components := mustStructuredList(t, catalog["components"])
	if len(components) == 0 || mustStructuredMap(t, components[0])["type"] != "Stack" {
		t.Fatalf("expected catalog to start with Stack, got %#v", components)
	}
	actions := mustStructuredList(t, catalog["actions"])
	if len(actions) != 5 {
		t.Fatalf("expected five catalog actions, got %#v", actions)
	}

	componentResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "list_app_components",
		Arguments: map[string]any{},
	})
	if err != nil {
		t.Fatalf("call list_app_components: %v", err)
	}
	if componentResult.IsError {
		t.Fatalf("expected list_app_components success, got %#v", componentResult.StructuredContent)
	}
	componentPayload := mustStructuredMap(t, componentResult.StructuredContent)
	componentTypes := mustStructuredList(t, componentPayload["components"])
	if len(componentTypes) == 0 || componentTypes[0] != "Stack" {
		t.Fatalf("expected ordered component list, got %#v", componentTypes)
	}
}

func TestServerGetSettaDocsLoadsDefaultBundleAndRejectsEscapes(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	writeScopedTestDocsFile(t, filepath.Join(workspaceRoot, "docs", "reference", "setta-listener-examples.md"), "# Examples\n")
	writeScopedTestDocsFile(t, filepath.Join(workspaceRoot, "docs", "reference", "emit_to_frontend.md"), "# Emit\n")
	writeScopedTestDocsFile(t, filepath.Join(workspaceRoot, "docs", "reference", "setta-listener-hot-reload.md"), "# Hot Reload\n")
	writeScopedTestDocsFile(t, filepath.Join(workspaceRoot, "docs", "reference", "setta-realtime-behavior.md"), "# Realtime\n")
	writeScopedTestDocsFile(t, filepath.Join(workspaceRoot, "docs", "reference", "listener-flows.md"), "# Listener Flows\n")

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSessionWithOptions(t, workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:  workspaceRoot,
		ProjectState:   projectRuntime,
		LSPDiagnostics: openScopedTestLSPDiagnosticsRegistry(),
		DocsRoot:       filepath.Join(workspaceRoot, "docs"),
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "get_setta_docs",
		Arguments: map[string]any{},
	})
	if err != nil {
		t.Fatalf("call get_setta_docs: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected get_setta_docs success, got %#v", result.StructuredContent)
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	docs := mustStructuredList(t, payload["docs"])
	if len(docs) != 4 {
		t.Fatalf("expected four default docs, got %#v", docs)
	}
	availableDocs := mustStringList(t, payload["available_docs"])
	if !slices.Contains(availableDocs, "listener_flows") {
		t.Fatalf("expected listener_flows alias in available docs, got %#v", availableDocs)
	}

	invalid, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_setta_docs",
		Arguments: map[string]any{
			"docIds": []any{"../outside"},
		},
	})
	if err != nil {
		t.Fatalf("call invalid get_setta_docs: %v", err)
	}
	if !invalid.IsError {
		t.Fatal("expected get_setta_docs path escape to fail")
	}
	invalidPayload := mustStructuredMap(t, invalid.StructuredContent)
	if invalidPayload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments for invalid docs path, got %#v", invalidPayload)
	}
}

func TestServerReportCompletionStatusBuildsStructuredReportAndRejectsInvalidChecks(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "report_completion_status",
		Arguments: map[string]any{
			"taskId":               " task-a ",
			"completionIntent":     true,
			"requiresVerification": true,
			"checkResults": []any{
				map[string]any{
					"checkName": "pytest",
					"status":    "passed",
					"details":   "  verified  ",
					"source":    "  go test  ",
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("call report_completion_status: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected report_completion_status success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["taskId"] != "task-a" {
		t.Fatalf("expected trimmed taskId, got %#v", payload["taskId"])
	}
	if payload["completionIntent"] != true {
		t.Fatalf("expected completionIntent true, got %#v", payload["completionIntent"])
	}
	if payload["requiresVerification"] != true {
		t.Fatalf("expected requiresVerification true, got %#v", payload["requiresVerification"])
	}
	if payload["verificationStatus"] != string(verificationStatusPassed) {
		t.Fatalf("expected verificationStatus passed, got %#v", payload["verificationStatus"])
	}
	checkResults := mustStructuredList(t, payload["checkResults"])
	if len(checkResults) != 1 {
		t.Fatalf("expected one check result, got %#v", checkResults)
	}
	firstCheck := mustStructuredMap(t, checkResults[0])
	if firstCheck["details"] != "verified" {
		t.Fatalf("expected trimmed details, got %#v", firstCheck["details"])
	}
	if firstCheck["source"] != "go test" {
		t.Fatalf("expected trimmed source, got %#v", firstCheck["source"])
	}

	invalid, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "report_completion_status",
		Arguments: map[string]any{
			"completionIntent":     true,
			"requiresVerification": true,
			"checkResults": []any{
				map[string]any{
					"checkName": " ",
					"status":    "passed",
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("call invalid report_completion_status: %v", err)
	}
	if !invalid.IsError {
		t.Fatal("expected invalid report_completion_status call to fail")
	}
	invalidPayload := mustStructuredMap(t, invalid.StructuredContent)
	if invalidPayload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", invalidPayload["code"])
	}
	if invalidPayload["message"] != "checkResults[0].checkName must be non-empty" {
		t.Fatalf("unexpected invalid message %#v", invalidPayload["message"])
	}
}

func TestServerReportCompletionStatusCanUsePerCallMeta(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	server, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := server.InvokeTool(context.Background(), "report_completion_status", map[string]any{
		"taskId":               " task-a ",
		"completionIntent":     true,
		"requiresVerification": true,
		"checkResults": []any{
			map[string]any{
				"checkName": "pytest",
				"status":    "passed",
			},
		},
	}, ToolRequestContext{
		Meta: map[string]any{
			"projectConfigId": "project-alpha",
			"chatId":          "chat-1",
			"sectionId":       "chat-section",
		},
	})
	if err != nil {
		t.Fatalf("invoke report_completion_status with per-call meta: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected report_completion_status success via per-call meta, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["taskId"] != "task-a" {
		t.Fatalf("expected trimmed taskId, got %#v", payload["taskId"])
	}
	if payload["verificationStatus"] != string(verificationStatusPassed) {
		t.Fatalf("expected verificationStatus passed, got %#v", payload["verificationStatus"])
	}
}

func TestServerListAgentProfilesAndGetAgentProfile(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	store, err := agentprofiles.NewStore(root)
	if err != nil {
		t.Fatalf("new agent profile store: %v", err)
	}
	engineConfigID := "engine-alpha"
	memoryScope := "workspace"
	if err := store.Write([]agentprofiles.Profile{
		{
			ID:                          "profile-alpha",
			Name:                        "Alpha",
			Description:                 "Primary profile",
			SystemPrompt:                "You are alpha.",
			EnableBackgroundSummaryFill: true,
			EnableLlmChatTitles:         true,
			EngineConfigID:              &engineConfigID,
			ToolAllowlist:               []string{"tool.a"},
			MemoryScope:                 &memoryScope,
		},
		{
			ID:            "profile-beta",
			Name:          "Beta",
			Description:   "",
			SystemPrompt:  "You are beta.",
			ToolAllowlist: []string{},
		},
	}); err != nil {
		t.Fatalf("seed agent profiles: %v", err)
	}

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:  t.TempDir(),
		ProjectState:   projectRuntime,
		LSPDiagnostics: openScopedTestLSPDiagnosticsRegistry(),
		AgentProfiles:  store,
	})
	defer clientSession.Close()

	listResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "list_agent_profiles",
		Arguments: map[string]any{},
	})
	if err != nil {
		t.Fatalf("call list_agent_profiles: %v", err)
	}
	if listResult.IsError {
		t.Fatalf("expected list_agent_profiles success, got %#v", listResult.StructuredContent)
	}
	listPayload := mustStructuredMap(t, listResult.StructuredContent)
	profiles := mustStructuredList(t, listPayload["profiles"])
	if len(profiles) != 2 {
		t.Fatalf("expected two agent profiles, got %#v", profiles)
	}
	firstProfile := mustStructuredMap(t, profiles[0])
	if firstProfile["id"] != "profile-alpha" {
		t.Fatalf("expected first profile-alpha entry, got %#v", firstProfile)
	}

	getResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_agent_profile",
		Arguments: map[string]any{
			"profileId": "profile-alpha",
		},
	})
	if err != nil {
		t.Fatalf("call get_agent_profile: %v", err)
	}
	if getResult.IsError {
		t.Fatalf("expected get_agent_profile success, got %#v", getResult.StructuredContent)
	}
	profile := mustStructuredMap(t, getResult.StructuredContent)
	if profile["name"] != "Alpha" {
		t.Fatalf("expected Alpha profile, got %#v", profile)
	}
	if profile["memoryScope"] != "workspace" {
		t.Fatalf("expected workspace memoryScope, got %#v", profile["memoryScope"])
	}

	missingResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_agent_profile",
		Arguments: map[string]any{
			"profileId": "missing-profile",
		},
	})
	if err != nil {
		t.Fatalf("call missing get_agent_profile: %v", err)
	}
	if !missingResult.IsError {
		t.Fatal("expected missing get_agent_profile to fail")
	}
	missingPayload := mustStructuredMap(t, missingResult.StructuredContent)
	if missingPayload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments for missing profile, got %#v", missingPayload["code"])
	}
}

func openScopedTestTerminalService(t *testing.T) *terminals.Service {
	t.Helper()

	service, err := terminals.New(terminals.Options{})
	if err != nil {
		t.Fatalf("new scoped test terminal service: %v", err)
	}
	t.Cleanup(func() {
		if err := service.Close(context.Background()); err != nil {
			t.Fatalf("close scoped test terminal service: %v", err)
		}
	})
	return service
}

func quietScopedTestCatCommand(t *testing.T) []string {
	t.Helper()

	shell := requireScopedTestCommand(t, "sh")
	return []string{shell, "-c", "stty -echo; cat"}
}

func requireScopedTestCommand(t *testing.T, name string) string {
	t.Helper()

	path, err := exec.LookPath(name)
	if err != nil {
		t.Skipf("required command %q not available: %v", name, err)
	}
	return path
}

func attachScopedTestTerminal(t *testing.T, service *terminals.Service, sessionID string) *terminals.Attachment {
	t.Helper()

	attachment, err := service.Attach(sessionID)
	if err != nil {
		t.Fatalf("attach scoped test terminal %q: %v", sessionID, err)
	}
	t.Cleanup(attachment.Close)
	return attachment
}

func waitForScopedTestOutputContains(t *testing.T, attachment *terminals.Attachment, needle string) string {
	t.Helper()

	buffer := strings.Builder{}
	buffer.Write(attachment.History)
	if strings.Contains(buffer.String(), needle) {
		return buffer.String()
	}

	timeout := time.NewTimer(5 * time.Second)
	defer timeout.Stop()

	for {
		select {
		case chunk, ok := <-attachment.Output:
			if !ok {
				t.Fatalf("attachment output closed before %q appeared; collected output: %q", needle, buffer.String())
			}
			buffer.Write(chunk)
			if strings.Contains(buffer.String(), needle) {
				return buffer.String()
			}
		case <-timeout.C:
			t.Fatalf("timed out waiting for %q; collected output: %q", needle, buffer.String())
		}
	}
}

func writeScopedTestDocsFile(t *testing.T, path string, content string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir docs parent: %v", err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write docs file: %v", err)
	}
}

func openScopedTestLSPDiagnosticsRegistry() *projectstate.LSPDiagnosticsRegistry {
	diagnostics := projectstate.NewLSPDiagnosticsRegistry(projectstate.LSPDiagnosticsRegistryOptions{})
	diag := projectstate.LSPDiagnostic{
		Message: "error",
		Code:    "reportFoo",
		Range: projectstate.LSPDiagnosticRange{
			Start: projectstate.LSPDiagnosticPosition{Line: 0, Character: 0},
			End:   projectstate.LSPDiagnosticPosition{Line: 0, Character: 1},
		},
	}
	diagnostics.UpdateCodeSection("project-alpha", "allowed-section", []projectstate.LSPDiagnostic{diag})
	diagnostics.UpdateCodeSection("project-alpha", "blocked-section", []projectstate.LSPDiagnostic{diag})
	diagnostics.UpdateGeneratedDocument(
		"project-alpha",
		projectstate.GeneratedDiagnosticsDocumentCode,
		projectstate.ProjectConfigDiagnostics{
			ProjectID: "project-alpha",
			IsGenCode: true,
			Errors: map[string]projectstate.SectionTypeErrors{
				"allowed-section": {Callable: []string{"ok"}},
				"blocked-section": {Callable: []string{"nope"}},
			},
		},
		[]projectstate.LSPDiagnostic{diag},
	)
	return diagnostics
}

func mustStructuredMap(t *testing.T, value any) map[string]any {
	t.Helper()
	typed, ok := value.(map[string]any)
	if ok {
		return typed
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal structured map value: %v", err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatalf("decode structured map value: %v", err)
	}
	return decoded
}

func payloadRawStringField(object map[string]any, key string) string {
	value, ok := object[key]
	if !ok || value == nil {
		return ""
	}
	switch typed := value.(type) {
	case string:
		return typed
	default:
		return fmt.Sprint(typed)
	}
}

func payloadBoolField(object map[string]any, key string) bool {
	value, ok := object[key]
	if !ok {
		return false
	}
	typed, ok := value.(bool)
	return ok && typed
}

func mustStructuredList(t *testing.T, value any) []any {
	t.Helper()
	typed, ok := value.([]any)
	if ok {
		return typed
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal structured list value: %v", err)
	}
	var decoded []any
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatalf("decode structured list value: %v", err)
	}
	return decoded
}

func mustDecodedProjectPayload(t *testing.T, raw projectstate.RawJSON) map[string]any {
	t.Helper()

	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatalf("decode project payload: %v", err)
	}
	return decoded
}

func mustStringList(t *testing.T, value any) []string {
	t.Helper()
	items := mustStructuredList(t, value)
	result := make([]string, 0, len(items))
	for _, item := range items {
		typed, ok := item.(string)
		if !ok {
			t.Fatalf("expected string list item, got %#v", item)
		}
		result = append(result, typed)
	}
	sort.Strings(result)
	return result
}

func containsString(values []string, needle string) bool {
	for _, value := range values {
		if value == needle {
			return true
		}
	}
	return false
}

func mustRawJSON(t *testing.T, value any) projectstate.RawJSON {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal raw json: %v", err)
	}
	return encoded
}
