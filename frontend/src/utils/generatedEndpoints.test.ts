import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { C_ADDRESSES } from "./c_addresses";
import { resolveEndpointOrigin } from "./endpointUtils";
import {
  route_add_kwarg,
  route_append_draw_area_layer_item,
  route_append_transcription_audio,
  route_binary_download,
  route_binary_upload,
  route_check_if_file_exists,
  route_check_workspace_initialized,
  route_create_agentic_edge,
  route_create_child_sections,
  route_create_child_sections_via_incrementer,
  route_create_edge,
  route_create_file,
  route_create_new_section_variant,
  route_create_project_config,
  route_create_top_level_section,
  route_create_view_mode,
  route_delete_agentic_edges,
  route_delete_artifacts,
  route_delete_child_sections_via_decrementer,
  route_delete_edges,
  route_delete_kwarg,
  route_delete_sections,
  route_delete_selected_params,
  route_delete_view_mode,
  route_force_refresh_listener,
  route_get_agent_profiles,
  route_get_agent_runs,
  route_get_app_catalog,
  route_get_app_definition,
  route_get_app_gen_skill_content,
  route_get_app_gen_skills,
  route_get_attachment_download_url,
  route_get_attachment_download_urls,
  route_get_file_browser_download_urls,
  route_get_file_browser_file_content,
  route_get_file_browser_file_stat,
  route_get_file_browser_root,
  route_get_folder_contents,
  route_get_git_commit_details,
  route_get_git_commit_file_diff,
  route_get_git_diff,
  route_get_git_log,
  route_get_git_status,
  route_get_latest_lsp_diagnostics,
  route_get_launcher_recent_workspaces,
  route_get_launcher_status,
  route_get_listener_coverage,
  route_get_llm_chat,
  route_get_llm_config,
  route_get_llm_response,
  route_get_mcp_server_runtime_status,
  route_get_password_param_value,
  route_group_sections,
  route_import_files_to_artifacts,
  route_indent_params,
  route_kill_subprocesses,
  route_load_all_project_metadata,
  route_load_cached_brush_strokes,
  route_load_cached_chart_data,
  route_load_cached_draw_area_layer_item_transform,
  route_load_cached_image_artifacts,
  route_load_project_config,
  route_move_param_groups,
  route_move_params,
  route_move_sections,
  route_paste_sections,
  route_plugins_config,
  route_plugins_install,
  route_plugins_restart,
  route_plugins_runtime,
  route_prepare_sections_for_copy,
  route_reconnect_edge,
  route_restart_language_server,
  route_run_code,
  route_set_active_ids,
  route_set_active_view_mode,
  route_set_agentic_edges,
  route_set_app_definition,
  route_set_browser_area_view_mode,
  route_set_browser_column_widths,
  route_set_browser_hide_column,
  route_set_browser_saved_searches,
  route_set_chart_area_data_path,
  route_set_chart_settings,
  route_set_chart_type,
  route_set_chat_section_state,
  route_set_code_file_binding,
  route_set_code_obj_display_name,
  route_set_code_obj_name,
  route_set_code_section_attached_terminal,
  route_set_default_section_variant,
  route_set_edges,
  route_set_gen_code_prefix,
  route_set_gen_code_suffix,
  route_set_group_overflow_mode,
  route_set_image_area_image_path,
  route_set_list_root_view_mode,
  route_set_llm_api_keys,
  route_set_meta_control_show_section_title,
  route_set_param_entered_value,
  route_set_parent_default_child_section_type,
  route_set_section_column_width,
  route_set_section_edge_inputs,
  route_set_section_edge_outputs,
  route_set_section_name,
  route_set_section_param_filter,
  route_set_section_sizes,
  route_set_section_variant,
  route_set_section_variant_name,
  route_set_section_variant_sort_order,
  route_set_social_url,
  route_set_spreadsheet_file_path,
  route_set_spreadsheet_section_settings,
  route_set_task_board_section_state,
  route_set_text_block_display_mode,
  route_set_text_block_format,
  route_set_text_block_heading_as_section_name,
  route_set_text_block_master_font_size,
  route_set_text_block_meta_control_style,
  route_set_text_block_text,
  route_set_top_level_section_layout,
  route_set_type_error_ignore,
  route_set_variant_json_source_keys,
  route_set_view_mode_name,
  route_set_view_mode_sort_order,
  route_set_viewport,
  route_start_transcription_session,
  route_toggle_group_orientation,
  route_toggle_is_editing_view_mode,
  route_toggle_param_selected,
  route_toggle_variant_frozen,
  route_toggle_variant_json_source,
  route_toggle_view_mode_tab,
  route_toggle_view_mode_user_facing,
  route_transfer_file_browser_entry,
  route_type_check,
  route_ungroup_groups,
  route_unindent_params,
  route_unselect_all_params,
  route_update_agentic_edge,
  route_update_artifacts,
  route_update_edge,
  route_update_param_impl_config,
  route_upsert_app_gen_custom_skill,
  route_validate_app_definition,
  route_write_file_browser_file_content,
} from "./generatedEndpoints";

vi.mock("state/definitions", () => ({
  useServerMode: {
    getState: () => ({
      mode: null,
      modeResolved: false,
      modeError: null,
    }),
  },
  useShareSession: {
    getState: () => ({
      isDeploymentMode: false,
      shareSessionId: null,
    }),
  },
}));

describe("generatedEndpoints launcher recent-workspaces", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("transmits setta_home as a query parameter", async () => {
    // This endpoint's backend contract uses a query param, not a path segment.
    await route_get_launcher_recent_workspaces({
      setta_home: "/tmp/launcher-home",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.LAUNCHER}/launcherRecentWorkspaces?setta_home=%2Ftmp%2Flauncher-home`,
    );
  });

  it("omits setta_home query parameter when null", async () => {
    await route_get_launcher_recent_workspaces({
      setta_home: null,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.LAUNCHER}/launcherRecentWorkspaces`,
    );
  });
});

describe("generatedEndpoints launcher status", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("transmits setta_home query via backend origin when provided", async () => {
    // Distinct origins make routing mismatches obvious in this assertion.
    vi.spyOn(C_ADDRESSES, "BACKEND", "get").mockReturnValue(
      "http://backend.example/api",
    );
    vi.spyOn(C_ADDRESSES, "LAUNCHER", "get").mockReturnValue(
      "http://launcher.example/api",
    );
    expect(resolveEndpointOrigin("/launcherStatus")).toBe("backend");

    await route_get_launcher_status({
      setta_home: "/tmp/launcher-home",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://backend.example/api/launcherStatus?setta_home=%2Ftmp%2Flauncher-home",
    );
  });

  it("omits setta_home query and still uses backend origin when null", async () => {
    vi.spyOn(C_ADDRESSES, "BACKEND", "get").mockReturnValue(
      "http://backend.example/api",
    );
    vi.spyOn(C_ADDRESSES, "LAUNCHER", "get").mockReturnValue(
      "http://launcher.example/api",
    );
    expect(resolveEndpointOrigin("/launcherStatus")).toBe("backend");

    await route_get_launcher_status({
      setta_home: null,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://backend.example/api/launcherStatus",
    );
  });
});

describe("generatedEndpoints project shell and layout", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("posts project-metadata loads to the backend origin with a null payload", async () => {
    await route_load_all_project_metadata();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/loadAllProjectMetadata`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: null,
    });
  });

  it("posts project-config loads with the current request shape", async () => {
    await route_load_project_config({
      projectConfigName: "Alpha",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/loadProjectConfig`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigName: "Alpha",
      }),
    });
  });

  it("posts project creation through the backend origin", async () => {
    await route_create_project_config({
      previewImgColor: "bg-orange-500/60 dark:bg-orange-600/30",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/createProjectConfig`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        previewImgColor: "bg-orange-500/60 dark:bg-orange-600/30",
      }),
    });
  });

  it("posts top-level layout writes with op ids and layout payloads", async () => {
    await route_set_top_level_section_layout({
      projectConfigId: "project-alpha",
      frontendOpId: "frontend-op-1",
      topLevelSections: {
        "section-a": {
          x: 10,
          y: 20,
          zIndex: 3,
          w: 400,
          h: 250,
        },
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setTopLevelSectionLayout`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        frontendOpId: "frontend-op-1",
        topLevelSections: {
          "section-a": {
            x: 10,
            y: 20,
            zIndex: 3,
            w: 400,
            h: 250,
          },
        },
      }),
    });
  });

  it("posts section deletions with section ids", async () => {
    await route_delete_sections({
      projectConfigId: "project-alpha",
      sectionIds: ["section-a", "section-b"],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/deleteSections`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionIds: ["section-a", "section-b"],
      }),
    });
  });

  it("posts child-section creation writes with the canonical request shapes", async () => {
    await route_create_child_sections({
      projectConfigId: "project-alpha",
      parentId: "code-section",
      implType: "Terminal",
      numChildren: 1,
      startIdx: 0,
    });

    await route_create_child_sections_via_incrementer({
      projectConfigId: "project-alpha",
      calledBy: "child-a",
      implType: "TextBlock",
      numChildren: 2,
    });

    await route_delete_child_sections_via_decrementer({
      projectConfigId: "project-alpha",
      calledBy: "child-a",
      numChildren: 1,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/createChildSections`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        parentId: "code-section",
        implType: "Terminal",
        numChildren: 1,
        startIdx: 0,
      }),
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/createChildSectionsViaIncrementer`,
    );
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        calledBy: "child-a",
        implType: "TextBlock",
        numChildren: 2,
      }),
    });
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/deleteChildSectionsViaDecrementer`,
    );
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        calledBy: "child-a",
        numChildren: 1,
      }),
    });
  });

  it("posts delete-selected-param writes with the current request shape", async () => {
    await route_delete_selected_params({
      projectConfigId: "project-alpha",
      sectionId: "callable-section",
      paramInfoIds: ["param-a", "param-b"],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/deleteSelectedParams`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "callable-section",
        paramInfoIds: ["param-a", "param-b"],
      }),
    });
  });

  it("posts param move and indent writes with the canonical request shapes", async () => {
    await route_move_params({
      projectConfigId: "project-alpha",
      sectionId: "dict-section",
      paramIds: ["param-a", "param-b"],
      newParentId: "parent-param",
      newIndex: 1,
    });

    await route_move_param_groups({
      projectConfigId: "project-alpha",
      sectionId: "dict-section",
      moves: [
        {
          paramIds: ["param-a"],
          newParentId: "root-param",
          newIndex: 2,
        },
      ],
    });

    await route_indent_params({
      projectConfigId: "project-alpha",
      sectionId: "dict-section",
      paramIds: ["param-a", "param-b"],
    });

    await route_unindent_params({
      projectConfigId: "project-alpha",
      sectionId: "dict-section",
      paramIds: ["param-b"],
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/moveParams`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "dict-section",
        paramIds: ["param-a", "param-b"],
        newParentId: "parent-param",
        newIndex: 1,
      }),
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/moveParamGroups`,
    );
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "dict-section",
        moves: [
          {
            paramIds: ["param-a"],
            newParentId: "root-param",
            newIndex: 2,
          },
        ],
      }),
    });
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/indentParams`,
    );
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "dict-section",
        paramIds: ["param-a", "param-b"],
      }),
    });
    expect(fetchMock.mock.calls[3]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/unindentParams`,
    );
    expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "dict-section",
        paramIds: ["param-b"],
      }),
    });
  });

  it("posts section move writes with the canonical request shape", async () => {
    await route_move_sections({
      projectConfigId: "project-alpha",
      sectionIds: ["section-a", "section-b"],
      newParentId: "group-parent",
      newIndex: 1,
      positionsById: null,
    });

    await route_move_sections({
      projectConfigId: "project-alpha",
      sectionIds: ["section-a"],
      newParentId: null,
      newIndex: null,
      positionsById: {
        "section-a": { x: 120, y: 80 },
      },
      frontendOpId: "frontend-op-move-sections",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/moveSections`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionIds: ["section-a", "section-b"],
        newParentId: "group-parent",
        newIndex: 1,
        positionsById: null,
      }),
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/moveSections`,
    );
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionIds: ["section-a"],
        newParentId: null,
        newIndex: null,
        positionsById: {
          "section-a": { x: 120, y: 80 },
        },
        frontendOpId: "frontend-op-move-sections",
      }),
    });
  });

  it("posts kwarg add/remove writes with the current request shape", async () => {
    await route_add_kwarg({
      projectConfigId: "project-alpha",
      sectionId: "dict-section",
    });

    await route_delete_kwarg({
      projectConfigId: "project-alpha",
      sectionId: "dict-section",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/addKwarg`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "dict-section",
      }),
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/deleteKwarg`,
    );
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "dict-section",
      }),
    });
  });

  it("posts clipboard prepare and paste writes with the canonical request shape", async () => {
    await route_prepare_sections_for_copy({
      projectConfigId: "project-alpha",
      sectionIds: ["section-a", "section-b"],
    });

    await route_paste_sections({
      projectConfigId: "project-alpha",
      data: {
        core: {
          sections: {},
          sectionImpls: {},
          sectionVariants: {},
          codeObjs: {},
          codeObjImpls: {},
          codeObjVariants: {},
        },
        sectionVariantMap: {},
      },
      position: { x: 220, y: 180 },
      asRef: false,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/prepareSectionsForCopy`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionIds: ["section-a", "section-b"],
      }),
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/pasteSections`,
    );
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        data: {
          core: {
            sections: {},
            sectionImpls: {},
            sectionVariants: {},
            codeObjs: {},
            codeObjImpls: {},
            codeObjVariants: {},
          },
          sectionVariantMap: {},
        },
        position: { x: 220, y: 180 },
        asRef: false,
      }),
    });
  });

  it("posts top-level section creation with the Go request shape", async () => {
    await route_create_top_level_section({
      projectConfigId: "project-alpha",
      frontendOpId: "frontend-op-create",
      implType: "TextBlock",
      controlCodeObjType: null,
      implOverrides: null,
      position: { x: 140, y: 260 },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/createTopLevelSection`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        frontendOpId: "frontend-op-create",
        implType: "TextBlock",
        controlCodeObjType: null,
        implOverrides: null,
        position: { x: 140, y: 260 },
      }),
    });
  });

  it("posts view-mode creation with the current project id payload", async () => {
    await route_create_view_mode({
      projectConfigId: "project-alpha",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/createViewMode`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
      }),
    });
  });

  it("posts active view-mode writes", async () => {
    await route_set_active_view_mode({
      projectConfigId: "project-alpha",
      activeViewModeId: "focus-mode",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setActiveViewMode`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        activeViewModeId: "focus-mode",
      }),
    });
  });

  it("posts view-mode edit toggles", async () => {
    await route_toggle_is_editing_view_mode({
      projectConfigId: "project-alpha",
      frontendOpId: "frontend-op-view-edit",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/toggleIsEditingViewMode`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        frontendOpId: "frontend-op-view-edit",
      }),
    });
  });

  it("posts view-mode presentation toggles", async () => {
    await route_toggle_view_mode_user_facing({
      projectConfigId: "project-alpha",
      viewModeId: "focus-mode",
      frontendOpId: "frontend-op-user-facing",
    });

    await route_toggle_view_mode_tab({
      projectConfigId: "project-alpha",
      viewModeId: "focus-mode",
      frontendOpId: "frontend-op-tab",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/toggleViewModeUserFacing`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        viewModeId: "focus-mode",
        frontendOpId: "frontend-op-user-facing",
      }),
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/toggleViewModeTab`,
    );
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        viewModeId: "focus-mode",
        frontendOpId: "frontend-op-tab",
      }),
    });
  });

  it("posts view-mode rename and sort-order writes", async () => {
    await route_set_view_mode_name({
      projectConfigId: "project-alpha",
      viewModeId: "focus-mode",
      name: "Focus",
      frontendOpId: "frontend-op-rename-mode",
    });

    await route_set_view_mode_sort_order({
      projectConfigId: "project-alpha",
      orderedViewModeIds: ["focus-mode", "secondary-mode"],
      frontendOpId: "frontend-op-sort",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setViewModeName`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        viewModeId: "focus-mode",
        name: "Focus",
        frontendOpId: "frontend-op-rename-mode",
      }),
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setViewModeSortOrder`,
    );
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        orderedViewModeIds: ["focus-mode", "secondary-mode"],
        frontendOpId: "frontend-op-sort",
      }),
    });
  });

  it("posts view-mode deletion writes", async () => {
    await route_delete_view_mode({
      projectConfigId: "project-alpha",
      viewModeId: "focus-mode",
      frontendOpId: "frontend-op-delete-mode",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/deleteViewMode`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        viewModeId: "focus-mode",
        frontendOpId: "frontend-op-delete-mode",
      }),
    });
  });

  it("posts section-variant mutation writes", async () => {
    await route_create_new_section_variant({
      projectConfigId: "project-alpha",
      sectionId: "source-section",
      frontendOpId: "frontend-op-create-variant",
    });
    await route_set_section_variant({
      projectConfigId: "project-alpha",
      sectionId: "source-section",
      variantId: "source-variant-a",
      frontendOpId: "frontend-op-set-variant",
    });
    await route_set_default_section_variant({
      projectConfigId: "project-alpha",
      sectionId: "source-section",
      variantId: "source-variant-a",
      frontendOpId: "frontend-op-set-default-variant",
    });
    await route_set_section_variant_sort_order({
      projectConfigId: "project-alpha",
      sectionId: "source-section",
      orderedVariantIds: ["source-variant-a", "source-variant-b"],
      frontendOpId: "frontend-op-sort-variants",
    });
    await route_toggle_variant_frozen({
      projectConfigId: "project-alpha",
      variantId: "source-variant-a",
      frontendOpId: "frontend-op-freeze-variant",
    });
    await route_toggle_variant_json_source({
      projectConfigId: "project-alpha",
      sectionId: "json-section",
      variantId: "json-variant-b",
      frontendOpId: "frontend-op-toggle-json-source",
    });
    await route_set_variant_json_source_keys({
      projectConfigId: "project-alpha",
      sectionId: "json-section",
      variantId: "json-variant-b",
      jsonSourceKeys: ["config", "nested"],
      frontendOpId: "frontend-op-json-source-keys",
    });
    await route_set_section_variant_name({
      projectConfigId: "project-alpha",
      variantId: "source-variant-a",
      name: "Renamed Variant",
      frontendOpId: "frontend-op-name-variant",
    });

    expect(fetchMock).toHaveBeenCalledTimes(8);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/createNewSectionVariant`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "source-section",
        frontendOpId: "frontend-op-create-variant",
      }),
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setSectionVariant`,
    );
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "source-section",
        variantId: "source-variant-a",
        frontendOpId: "frontend-op-set-variant",
      }),
    });
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setDefaultSectionVariant`,
    );
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "source-section",
        variantId: "source-variant-a",
        frontendOpId: "frontend-op-set-default-variant",
      }),
    });
    expect(fetchMock.mock.calls[3]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setSectionVariantSortOrder`,
    );
    expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "source-section",
        orderedVariantIds: ["source-variant-a", "source-variant-b"],
        frontendOpId: "frontend-op-sort-variants",
      }),
    });
    expect(fetchMock.mock.calls[4]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/toggleVariantFrozen`,
    );
    expect(fetchMock.mock.calls[4]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        variantId: "source-variant-a",
        frontendOpId: "frontend-op-freeze-variant",
      }),
    });
    expect(fetchMock.mock.calls[5]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/toggleVariantJsonSource`,
    );
    expect(fetchMock.mock.calls[5]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "json-section",
        variantId: "json-variant-b",
        frontendOpId: "frontend-op-toggle-json-source",
      }),
    });
    expect(fetchMock.mock.calls[6]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setVariantJsonSourceKeys`,
    );
    expect(fetchMock.mock.calls[6]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "json-section",
        variantId: "json-variant-b",
        jsonSourceKeys: ["config", "nested"],
        frontendOpId: "frontend-op-json-source-keys",
      }),
    });
    expect(fetchMock.mock.calls[7]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setSectionVariantName`,
    );
    expect(fetchMock.mock.calls[7]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        variantId: "source-variant-a",
        name: "Renamed Variant",
        frontendOpId: "frontend-op-name-variant",
      }),
    });
  });

  it("posts section rename writes", async () => {
    await route_set_section_name({
      projectConfigId: "project-alpha",
      sectionId: "section-a",
      name: "Renamed Section",
      frontendOpId: "frontend-op-rename-section",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setSectionName`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "section-a",
        name: "Renamed Section",
        frontendOpId: "frontend-op-rename-section",
      }),
    });
  });

  it("posts code file binding writes with the canonical request shape", async () => {
    await route_set_code_file_binding({
      projectConfigId: "project-alpha",
      sectionId: "code-section",
      binding: {
        canonical_path: "pkg/updated.py",
        access_mode: "read_only",
      },
      frontendOpId: "frontend-op-code-binding",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setCodeFileBinding`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "code-section",
        binding: {
          canonical_path: "pkg/updated.py",
          access_mode: "read_only",
        },
        frontendOpId: "frontend-op-code-binding",
      }),
    });
  });

  it("posts python codegen prefix and suffix writes", async () => {
    await route_set_gen_code_prefix({
      projectConfigId: "project-alpha",
      genCodePrefix: "import math\\n",
      frontendOpId: "frontend-op-gen-prefix",
    });
    await route_set_gen_code_suffix({
      projectConfigId: "project-alpha",
      genCodeSuffix: "state = CustomState()\\n",
      frontendOpId: "frontend-op-gen-suffix",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setGenCodePrefix`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        genCodePrefix: "import math\\n",
        frontendOpId: "frontend-op-gen-prefix",
      }),
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setGenCodeSuffix`,
    );
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        genCodeSuffix: "state = CustomState()\\n",
        frontendOpId: "frontend-op-gen-suffix",
      }),
    });
  });

  it("posts section grouping writes", async () => {
    await route_group_sections({
      projectConfigId: "project-alpha",
      sectionIds: ["section-a", "section-b"],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/groupSections`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionIds: ["section-a", "section-b"],
      }),
    });
  });

  it("posts group ungroup writes", async () => {
    await route_ungroup_groups({
      projectConfigId: "project-alpha",
      groupIds: ["group-a"],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/ungroupGroups`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        groupIds: ["group-a"],
      }),
    });
  });

  it("posts active-id writes", async () => {
    await route_set_active_ids({
      projectConfigId: "project-alpha",
      frontendOpId: "frontend-op-2a",
      activeIds: ["section-a", "section-b"],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setActiveIds`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        frontendOpId: "frontend-op-2a",
        activeIds: ["section-a", "section-b"],
      }),
    });
  });

  it("posts section size writes with the canonical size-map request shape", async () => {
    await route_set_section_sizes({
      projectConfigId: "project-alpha",
      frontendOpId: "frontend-op-resize",
      sectionSizes: {
        "section-a": {
          width: 320,
          height: "auto",
        },
        "section-b": {
          width: "auto",
          height: 180,
        },
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setSectionSizes`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        frontendOpId: "frontend-op-resize",
        sectionSizes: {
          "section-a": {
            width: 320,
            height: "auto",
          },
          "section-b": {
            width: "auto",
            height: 180,
          },
        },
      }),
    });
  });

  it("posts edge-input writes with the canonical request shape", async () => {
    await route_set_section_edge_inputs({
      projectConfigId: "project-alpha",
      sectionId: "dict-section",
      edgeInputParams: ["param-a", "param-b"],
      frontendOpId: "frontend-op-edge-inputs",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setSectionEdgeInputs`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "dict-section",
        edgeInputParams: ["param-a", "param-b"],
        frontendOpId: "frontend-op-edge-inputs",
      }),
    });
  });

  it("posts edge-output writes with the canonical request shape", async () => {
    await route_set_section_edge_outputs({
      projectConfigId: "project-alpha",
      sectionId: "dict-section",
      edgeOutputPorts: [
        { id: "result", accessor: ".result" },
        { id: "summary", accessor: "" },
      ],
      frontendOpId: "frontend-op-edge-outputs",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setSectionEdgeOutputs`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "dict-section",
        edgeOutputPorts: [
          { id: "result", accessor: ".result" },
          { id: "summary", accessor: "" },
        ],
        frontendOpId: "frontend-op-edge-outputs",
      }),
    });
  });

  it("posts create-edge writes with the canonical request shape", async () => {
    await route_create_edge({
      projectConfigId: "project-alpha",
      sourceSectionId: "source-section",
      sourceVariantId: "source-variant",
      sourcePortId: "result",
      targetSectionId: "target-section",
      targetVariantId: "target-variant",
      targetPortId: "input",
      type: "default",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/createEdge`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sourceSectionId: "source-section",
        sourceVariantId: "source-variant",
        sourcePortId: "result",
        targetSectionId: "target-section",
        targetVariantId: "target-variant",
        targetPortId: "input",
        type: "default",
      }),
    });
  });

  it("posts update-edge writes with the canonical request shape", async () => {
    await route_update_edge({
      projectConfigId: "project-alpha",
      edge: {
        id: "edge-1",
        sourceSectionId: "source-section",
        sourceVariantId: "source-variant",
        sourcePortId: "result",
        targetSectionId: "target-section",
        targetVariantId: "target-variant",
        targetPortId: "input",
        type: "default",
        selected: true,
      },
      frontendOpId: "frontend-op-edge-update",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/updateEdge`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        edge: {
          id: "edge-1",
          sourceSectionId: "source-section",
          sourceVariantId: "source-variant",
          sourcePortId: "result",
          targetSectionId: "target-section",
          targetVariantId: "target-variant",
          targetPortId: "input",
          type: "default",
          selected: true,
        },
        frontendOpId: "frontend-op-edge-update",
      }),
    });
  });

  it("posts delete-edges writes with the canonical request shape", async () => {
    await route_delete_edges({
      projectConfigId: "project-alpha",
      edgeIds: ["edge-1", "edge-2"],
      frontendOpId: "frontend-op-edge-delete",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/deleteEdges`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        edgeIds: ["edge-1", "edge-2"],
        frontendOpId: "frontend-op-edge-delete",
      }),
    });
  });

  it("posts reconnect-edge writes with the canonical request shape", async () => {
    await route_reconnect_edge({
      projectConfigId: "project-alpha",
      edgeId: "edge-1",
      sourceSectionId: "source-section",
      sourceVariantId: "source-variant",
      sourcePortId: "summary",
      targetSectionId: "target-section",
      targetVariantId: "target-variant",
      targetPortId: "input",
      frontendOpId: "frontend-op-edge-reconnect",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/reconnectEdge`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        edgeId: "edge-1",
        sourceSectionId: "source-section",
        sourceVariantId: "source-variant",
        sourcePortId: "summary",
        targetSectionId: "target-section",
        targetVariantId: "target-variant",
        targetPortId: "input",
        frontendOpId: "frontend-op-edge-reconnect",
      }),
    });
  });

  it("posts set-edges writes with the canonical request shape", async () => {
    await route_set_edges({
      projectConfigId: "project-alpha",
      edges: [
        {
          id: "edge-1",
          sourceSectionId: "source-section",
          sourceVariantId: "source-variant",
          sourcePortId: "result",
          targetSectionId: "target-section",
          targetVariantId: "target-variant",
          targetPortId: "input",
          type: "default",
          hidden: true,
        },
      ],
      frontendOpId: "frontend-op-edge-set",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setEdges`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        edges: [
          {
            id: "edge-1",
            sourceSectionId: "source-section",
            sourceVariantId: "source-variant",
            sourcePortId: "result",
            targetSectionId: "target-section",
            targetVariantId: "target-variant",
            targetPortId: "input",
            type: "default",
            hidden: true,
          },
        ],
        frontendOpId: "frontend-op-edge-set",
      }),
    });
  });

  it("posts create-agentic-edge writes with the canonical request shape", async () => {
    await route_create_agentic_edge({
      projectConfigId: "project-alpha",
      id: "agentic-edge-1",
      sourceSectionId: "chat-a",
      targetSectionId: "chat-b",
      kind: "chat_chat",
      contextMode: "reference_only",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/createAgenticEdge`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        id: "agentic-edge-1",
        sourceSectionId: "chat-a",
        targetSectionId: "chat-b",
        kind: "chat_chat",
        contextMode: "reference_only",
      }),
    });
  });

  it("posts update-agentic-edge writes with the canonical request shape", async () => {
    await route_update_agentic_edge({
      projectConfigId: "project-alpha",
      edge: {
        id: "agentic-edge-1",
        sourceSectionId: "chat-a",
        targetSectionId: "chat-b",
        kind: "chat_chat",
        contextMode: "inline_text",
        selected: true,
      },
      frontendOpId: "frontend-op-agentic-update",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/updateAgenticEdge`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        edge: {
          id: "agentic-edge-1",
          sourceSectionId: "chat-a",
          targetSectionId: "chat-b",
          kind: "chat_chat",
          contextMode: "inline_text",
          selected: true,
        },
        frontendOpId: "frontend-op-agentic-update",
      }),
    });
  });

  it("posts delete-agentic-edges writes with the canonical request shape", async () => {
    await route_delete_agentic_edges({
      projectConfigId: "project-alpha",
      edgeIds: ["agentic-edge-1"],
      frontendOpId: "frontend-op-agentic-delete",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/deleteAgenticEdges`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        edgeIds: ["agentic-edge-1"],
        frontendOpId: "frontend-op-agentic-delete",
      }),
    });
  });

  it("posts set-agentic-edges writes with the canonical request shape", async () => {
    await route_set_agentic_edges({
      projectConfigId: "project-alpha",
      edges: [
        {
          id: "agentic-edge-1",
          sourceSectionId: "chat-a",
          targetSectionId: "chat-b",
          kind: "chat_chat",
          contextMode: "reference_only",
          hidden: true,
        },
      ],
      frontendOpId: "frontend-op-agentic-set",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setAgenticEdges`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        edges: [
          {
            id: "agentic-edge-1",
            sourceSectionId: "chat-a",
            targetSectionId: "chat-b",
            kind: "chat_chat",
            contextMode: "reference_only",
            hidden: true,
          },
        ],
        frontendOpId: "frontend-op-agentic-set",
      }),
    });
  });

  it("posts parent default-child writes with the canonical request shape", async () => {
    await route_set_parent_default_child_section_type({
      projectConfigId: "project-alpha",
      sectionId: "group-section",
      defaultChildSectionType: "Dict",
      frontendOpId: "frontend-op-child-default",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setParentDefaultChildSectionType`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "group-section",
        defaultChildSectionType: "Dict",
        frontendOpId: "frontend-op-child-default",
      }),
    });
  });

  it("posts list-root view-mode writes with the canonical request shape", async () => {
    await route_set_list_root_view_mode({
      projectConfigId: "project-alpha",
      sectionId: "list-root-section",
      viewMode: "kanban",
      frontendOpId: "frontend-op-list-root-view",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setListRootViewMode`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "list-root-section",
        viewMode: "kanban",
        frontendOpId: "frontend-op-list-root-view",
      }),
    });
  });

  it("posts group-orientation writes", async () => {
    await route_toggle_group_orientation({
      projectConfigId: "project-alpha",
      sectionId: "group-section",
      frontendOpId: "frontend-op-group-orientation",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/toggleGroupOrientation`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "group-section",
        frontendOpId: "frontend-op-group-orientation",
      }),
    });
  });

  it("posts browser column-width writes with nullable widths", async () => {
    await route_set_browser_column_widths({
      projectConfigId: "project-alpha",
      sectionId: "browser-section",
      columnWidth: 240.5,
      typesColumnWidth: null,
      frontendOpId: "frontend-op-browser-width",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setBrowserColumnWidths`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "browser-section",
        columnWidth: 240.5,
        typesColumnWidth: null,
        frontendOpId: "frontend-op-browser-width",
      }),
    });
  });

  it("posts spreadsheet file-path writes", async () => {
    await route_set_spreadsheet_file_path({
      projectConfigId: "project-alpha",
      sectionId: "spreadsheet-section",
      filePath: "reports/q1.xlsx",
      activeSheet: "Sheet 2",
      frontendOpId: "frontend-op-spreadsheet-path",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setSpreadsheetFilePath`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "spreadsheet-section",
        filePath: "reports/q1.xlsx",
        activeSheet: "Sheet 2",
        frontendOpId: "frontend-op-spreadsheet-path",
      }),
    });
  });

  it("posts spreadsheet settings writes", async () => {
    await route_set_spreadsheet_section_settings({
      projectConfigId: "project-alpha",
      sectionId: "spreadsheet-section",
      readOnly: true,
      showRowNumbers: false,
      density: "comfortable",
      autoReloadOnExternalChange: true,
      frontendOpId: "frontend-op-spreadsheet-settings",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setSpreadsheetSectionSettings`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "spreadsheet-section",
        readOnly: true,
        showRowNumbers: false,
        density: "comfortable",
        autoReloadOnExternalChange: true,
        frontendOpId: "frontend-op-spreadsheet-settings",
      }),
    });
  });

  it("posts task-board state writes", async () => {
    await route_set_task_board_section_state({
      projectConfigId: "project-alpha",
      sectionId: "task-board-section",
      viewMode: "task_list",
      columns: [{ id: "todo", name: "Todo", color: "#3b82f6", sortIndex: 0 }],
      tasks: [
        {
          id: "task-1",
          title: "Task One",
          description: "",
          completed: false,
          columnId: "todo",
          dueDateIso: "",
          recurrence: "none",
          recurrenceDays: [],
          recurrenceMonths: [],
          recurrenceYears: [],
          sortIndex: 0,
        },
      ],
      frontendOpId: "frontend-op-task-board",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setTaskBoardSectionState`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "task-board-section",
        viewMode: "task_list",
        columns: [{ id: "todo", name: "Todo", color: "#3b82f6", sortIndex: 0 }],
        tasks: [
          {
            id: "task-1",
            title: "Task One",
            description: "",
            completed: false,
            columnId: "todo",
            dueDateIso: "",
            recurrence: "none",
            recurrenceDays: [],
            recurrenceMonths: [],
            recurrenceYears: [],
            sortIndex: 0,
          },
        ],
        frontendOpId: "frontend-op-task-board",
      }),
    });
  });

  it("posts image-path writes", async () => {
    await route_set_image_area_image_path({
      projectConfigId: "project-alpha",
      sectionId: "image-section",
      imagePath: "/tmp/updated.png",
      frontendOpId: "frontend-op-image-path",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setImageAreaImagePath`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "image-section",
        imagePath: "/tmp/updated.png",
        frontendOpId: "frontend-op-image-path",
      }),
    });
  });

  it("posts social-url writes", async () => {
    await route_set_social_url({
      projectConfigId: "project-alpha",
      sectionId: "social-section",
      url: "https://example.com/watch?v=123",
      frontendOpId: "frontend-op-social-url",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setSocialUrl`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "social-section",
        url: "https://example.com/watch?v=123",
        frontendOpId: "frontend-op-social-url",
      }),
    });
  });

  it("posts chart data-path writes", async () => {
    await route_set_chart_area_data_path({
      projectConfigId: "project-alpha",
      sectionId: "chart-section",
      dataPath: "artifacts/chart.csv",
      frontendOpId: "frontend-op-chart-path",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setChartAreaDataPath`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "chart-section",
        dataPath: "artifacts/chart.csv",
        frontendOpId: "frontend-op-chart-path",
      }),
    });
  });

  it("posts chart-type writes", async () => {
    await route_set_chart_type({
      projectConfigId: "project-alpha",
      sectionId: "chart-section",
      chartType: "scatter",
      frontendOpId: "frontend-op-chart-type",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setChartType`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "chart-section",
        chartType: "scatter",
        frontendOpId: "frontend-op-chart-type",
      }),
    });
  });

  it("posts chart-settings writes", async () => {
    await route_set_chart_settings({
      projectConfigId: "project-alpha",
      sectionId: "chart-section",
      chartSettings: {
        type: "line",
        xAxisColumn: "time",
        secondYAxisColumns: ["humidity"],
        xAxisLog: false,
        y1AxisLog: true,
        y2AxisLog: false,
      },
      changedSettings: ["xAxisColumn", "y1AxisLog"],
      frontendOpId: "frontend-op-chart-settings",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setChartSettings`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "chart-section",
        chartSettings: {
          type: "line",
          xAxisColumn: "time",
          secondYAxisColumns: ["humidity"],
          xAxisLog: false,
          y1AxisLog: true,
          y2AxisLog: false,
        },
        changedSettings: ["xAxisColumn", "y1AxisLog"],
        frontendOpId: "frontend-op-chart-settings",
      }),
    });
  });

  it("posts param column-width writes with nullable widths", async () => {
    await route_set_section_column_width({
      projectConfigId: "project-alpha",
      sectionId: "callable-section",
      columnWidth: null,
      frontendOpId: "frontend-op-param-width",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setSectionColumnWidth`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "callable-section",
        columnWidth: null,
        frontendOpId: "frontend-op-param-width",
      }),
    });
  });

  it("posts section param-filter writes", async () => {
    await route_set_section_param_filter({
      projectConfigId: "project-alpha",
      sectionId: "params-section",
      value: "alpha",
      frontendOpId: "frontend-op-param-filter",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setSectionParamFilter`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "params-section",
        value: "alpha",
        frontendOpId: "frontend-op-param-filter",
      }),
    });
  });

  it("posts meta-control title visibility writes", async () => {
    await route_set_meta_control_show_section_title({
      projectConfigId: "project-alpha",
      sectionId: "meta-section",
      showSectionTitle: true,
      frontendOpId: "frontend-op-meta-title",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setMetaControlShowSectionTitle`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "meta-section",
        showSectionTitle: true,
        frontendOpId: "frontend-op-meta-title",
      }),
    });
  });

  it("posts param entered-value writes", async () => {
    await route_set_param_entered_value({
      projectConfigId: "project-alpha",
      sectionId: "dict-section",
      paramInfoId: "param-a",
      value: "updated",
      frontendOpId: "frontend-op-param-value",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setParamEnteredValue`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "dict-section",
        paramInfoId: "param-a",
        value: "updated",
        frontendOpId: "frontend-op-param-value",
      }),
    });
  });

  it("posts param implementation-config writes", async () => {
    await route_update_param_impl_config({
      projectConfigId: "project-alpha",
      sectionId: "dict-section",
      paramInfoId: "param-a",
      newConfig: {
        description: "Updated description",
        dateSelectionMode: "multiple",
      },
      frontendOpId: "frontend-op-param-config",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/updateParamImplConfig`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "dict-section",
        paramInfoId: "param-a",
        newConfig: {
          description: "Updated description",
          dateSelectionMode: "multiple",
        },
        frontendOpId: "frontend-op-param-config",
      }),
    });
  });

  it("posts code-object naming writes", async () => {
    await route_set_code_obj_name({
      projectConfigId: "project-alpha",
      codeObjId: "param-a",
      name: "renamed_param",
      frontendOpId: "frontend-op-code-obj-name",
    });

    await route_set_code_obj_display_name({
      projectConfigId: "project-alpha",
      codeObjId: "param-a",
      displayName: "Renamed Param",
      frontendOpId: "frontend-op-code-obj-display-name",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setCodeObjName`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        codeObjId: "param-a",
        name: "renamed_param",
        frontendOpId: "frontend-op-code-obj-name",
      }),
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setCodeObjDisplayName`,
    );
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        codeObjId: "param-a",
        displayName: "Renamed Param",
        frontendOpId: "frontend-op-code-obj-display-name",
      }),
    });
  });

  it("posts code-section attached-terminal writes", async () => {
    await route_set_code_section_attached_terminal({
      projectConfigId: "project-alpha",
      sectionId: "code-section",
      terminalSectionId: "terminal-section",
      frontendOpId: "frontend-op-attach-terminal",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setCodeSectionAttachedTerminal`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "code-section",
        terminalSectionId: "terminal-section",
        frontendOpId: "frontend-op-attach-terminal",
      }),
    });
  });

  it("posts group overflow-mode writes", async () => {
    await route_set_group_overflow_mode({
      projectConfigId: "project-alpha",
      sectionId: "group-section",
      overflowMode: true,
      frontendOpId: "frontend-op-group-overflow",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setGroupOverflowMode`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "group-section",
        overflowMode: true,
        frontendOpId: "frontend-op-group-overflow",
      }),
    });
  });

  it("posts browser view-mode writes", async () => {
    await route_set_browser_area_view_mode({
      projectConfigId: "project-alpha",
      sectionId: "browser-section",
      viewMode: "thumbnail",
      frontendOpId: "frontend-op-browser-view",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setBrowserAreaViewMode`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "browser-section",
        viewMode: "thumbnail",
        frontendOpId: "frontend-op-browser-view",
      }),
    });
  });

  it("posts text-block text writes", async () => {
    await route_set_text_block_text({
      projectConfigId: "project-alpha",
      sectionId: "text-section",
      text: "# Updated Heading\n\nBody",
      frontendOpId: "frontend-op-text-block-text",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setTextBlockText`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "text-section",
        text: "# Updated Heading\n\nBody",
        frontendOpId: "frontend-op-text-block-text",
      }),
    });
  });

  it("posts text-block display-mode writes", async () => {
    await route_set_text_block_display_mode({
      projectConfigId: "project-alpha",
      sectionId: "text-section",
      textDisplayMode: "Edit",
      frontendOpId: "frontend-op-text-block-display",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setTextBlockDisplayMode`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "text-section",
        textDisplayMode: "Edit",
        frontendOpId: "frontend-op-text-block-display",
      }),
    });
  });

  it("posts text-block format writes", async () => {
    await route_set_text_block_format({
      projectConfigId: "project-alpha",
      sectionId: "text-section",
      format: "Markdown",
      frontendOpId: "frontend-op-text-block-format",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setTextBlockFormat`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "text-section",
        format: "Markdown",
        frontendOpId: "frontend-op-text-block-format",
      }),
    });
  });

  it("posts text-block heading-as-title writes", async () => {
    await route_set_text_block_heading_as_section_name({
      projectConfigId: "project-alpha",
      sectionId: "text-section",
      headingAsSectionName: true,
      frontendOpId: "frontend-op-text-block-heading",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setTextBlockHeadingAsSectionName`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "text-section",
        headingAsSectionName: true,
        frontendOpId: "frontend-op-text-block-heading",
      }),
    });
  });

  it("posts text-block meta-control-style writes", async () => {
    await route_set_text_block_meta_control_style({
      projectConfigId: "project-alpha",
      sectionId: "text-section",
      metaControlStyle: true,
      frontendOpId: "frontend-op-text-block-meta",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setTextBlockMetaControlStyle`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "text-section",
        metaControlStyle: true,
        frontendOpId: "frontend-op-text-block-meta",
      }),
    });
  });

  it("posts text-block master-font-size writes", async () => {
    await route_set_text_block_master_font_size({
      projectConfigId: "project-alpha",
      sectionId: "text-section",
      masterFontSizePx: 22,
      frontendOpId: "frontend-op-text-block-font",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setTextBlockMasterFontSize`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "text-section",
        masterFontSizePx: 22,
        frontendOpId: "frontend-op-text-block-font",
      }),
    });
  });

  it("posts browser hide-column writes", async () => {
    await route_set_browser_hide_column({
      projectConfigId: "project-alpha",
      sectionId: "browser-section",
      hideColumn: true,
      frontendOpId: "frontend-op-browser-hide",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setBrowserHideColumn`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "browser-section",
        hideColumn: true,
        frontendOpId: "frontend-op-browser-hide",
      }),
    });
  });

  it("posts browser saved-search writes", async () => {
    await route_set_browser_saved_searches({
      projectConfigId: "project-alpha",
      sectionId: "browser-section",
      savedSearches: [
        {
          id: "saved-search-1",
          name: "Images",
          query: "png",
          searchScope: "local",
          typeFilters: {
            image: true,
            video: false,
            audio: false,
            text: false,
            data: false,
          },
          color: "#ef4444",
          quickInfo: "Only images",
        },
      ],
      frontendOpId: "frontend-op-browser-saved-searches",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setBrowserSavedSearches`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "browser-section",
        savedSearches: [
          {
            id: "saved-search-1",
            name: "Images",
            query: "png",
            searchScope: "local",
            typeFilters: {
              image: true,
              video: false,
              audio: false,
              text: false,
              data: false,
            },
            color: "#ef4444",
            quickInfo: "Only images",
          },
        ],
        frontendOpId: "frontend-op-browser-saved-searches",
      }),
    });
  });

  it("posts param-selection toggles with frontend op ids", async () => {
    await route_toggle_param_selected({
      projectConfigId: "project-alpha",
      sectionId: "callable-section",
      paramInfoId: "param-a",
      frontendOpId: "frontend-op-2b",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/toggleParamSelected`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        sectionId: "callable-section",
        paramInfoId: "param-a",
        frontendOpId: "frontend-op-2b",
      }),
    });
  });

  it("posts unselect-all-param writes with frontend op ids", async () => {
    await route_unselect_all_params({
      projectConfigId: "project-alpha",
      frontendOpId: "frontend-op-2c",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/unselectAllParams`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        frontendOpId: "frontend-op-2c",
      }),
    });
  });

  it("posts viewport writes with nullable viewport payloads", async () => {
    await route_set_viewport({
      projectConfigId: "project-alpha",
      frontendOpId: "frontend-op-2",
      viewport: null,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setViewport`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        frontendOpId: "frontend-op-2",
        viewport: null,
      }),
    });
  });
});

describe("generatedEndpoints app definition", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("loads the app catalog from the backend origin", async () => {
    await route_get_app_catalog();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/getAppCatalog`,
    );
  });

  it("posts app-definition reads with the request payload", async () => {
    await route_get_app_definition({ frontendOpId: "frontend-op-1" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/getAppDefinition`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ frontendOpId: "frontend-op-1" }),
    });
  });

  it("posts app-definition saves with the current payload shape", async () => {
    await route_set_app_definition({
      appSpec: { root: "root", elements: {} },
      appSpecPath: "app_specs/app.json",
      catalogId: "setta.app.default",
      theme: { mode: "dark" },
      assets: [{ type: "image", url: "/x.png" }],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setAppDefinition`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        appSpec: { root: "root", elements: {} },
        appSpecPath: "app_specs/app.json",
        catalogId: "setta.app.default",
        theme: { mode: "dark" },
        assets: [{ type: "image", url: "/x.png" }],
      }),
    });
  });

  it("posts app-definition validation payloads to the backend origin", async () => {
    await route_validate_app_definition({
      appSpec: { root: "root", elements: {} },
      appSpecVersion: "v1",
      catalogId: "setta.app.default",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/validateAppDefinition`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        appSpec: { root: "root", elements: {} },
        appSpecVersion: "v1",
        catalogId: "setta.app.default",
      }),
    });
  });
});

describe("generatedEndpoints lsp helpers", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("posts type-check requests to the backend origin", async () => {
    await route_type_check({ projectConfigId: "project-1" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/typeCheck`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ projectConfigId: "project-1" }),
    });
  });

  it("posts latest-diagnostics reads with the project id", async () => {
    await route_get_latest_lsp_diagnostics({ projectConfigId: "project-1" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/getLatestLspDiagnostics`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ projectConfigId: "project-1" }),
    });
  });

  it("posts restart-language-server requests without a payload", async () => {
    await route_restart_language_server();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/restartLanguageServer`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: null,
    });
  });

  it("posts type-error ignore mutations with the current request shape", async () => {
    await route_set_type_error_ignore({
      projectConfigId: "project-1",
      sectionId: "section-1",
      paramInfoId: "param-1",
      ignoreTypeErrors: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setTypeErrorIgnore`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-1",
        sectionId: "section-1",
        paramInfoId: "param-1",
        ignoreTypeErrors: true,
      }),
    });
  });
});

describe("generatedEndpoints project chat skills and mcp helpers", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("loads app-gen skills from the backend origin", async () => {
    await route_get_app_gen_skills();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/getAppGenSkills`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        credentials: "include",
        headers: {},
      }),
    );
  });

  it("posts skill-content reads with the selected skill id", async () => {
    await route_get_app_gen_skill_content({
      skillId: "workspace_agents_skills::ui-layout",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/getAppGenSkillContent`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        skillId: "workspace_agents_skills::ui-layout",
      }),
    });
  });

  it("posts custom-skill upserts with the current payload shape", async () => {
    await route_upsert_app_gen_custom_skill({
      skillId: null,
      relativePath: "route-created",
      content: "# route-created\n\nBody.\n",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/upsertAppGenCustomSkill`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        skillId: null,
        relativePath: "route-created",
        content: "# route-created\n\nBody.\n",
      }),
    });
  });

  it("posts runtime-status reads with the current chat and engine ids", async () => {
    await route_get_mcp_server_runtime_status({
      chatId: "chat-1",
      engineConfigId: "engine-1",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/mcpServerRuntimeStatus`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        chatId: "chat-1",
        engineConfigId: "engine-1",
      }),
    });
  });
});

describe("generatedEndpoints ai settings and chat helpers", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("loads llm config from the backend origin", async () => {
    await route_get_llm_config();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/llm/config`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        credentials: "include",
        headers: {},
      }),
    );
  });

  it("posts llm api key mutations with the expected revision payload", async () => {
    await route_set_llm_api_keys({
      apiKeys: {
        OPENAI_API_KEY: "secret",
      },
      expectedRevision: 2,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/llm/apiKeys`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        apiKeys: {
          OPENAI_API_KEY: "secret",
        },
        expectedRevision: 2,
      }),
    });
  });

  it("loads agent profile lists from the backend origin", async () => {
    await route_get_agent_profiles();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/getAgentProfiles`,
    );
  });

  it("loads agent runs from the backend origin", async () => {
    await route_get_agent_runs();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/getAgentRuns`,
    );
  });

  it("posts transcription session starts with the active profile and language", async () => {
    await route_start_transcription_session({
      transcriptionProfileId: "transcription-1",
      language: "en",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/startTranscriptionSession`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        transcriptionProfileId: "transcription-1",
        language: "en",
      }),
    });
  });

  it("posts llm chat hydration reads with the chat and project ids", async () => {
    await route_get_llm_chat({
      chatId: "chat-1",
      projectConfigId: "project-1",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/getLLMChat`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        chatId: "chat-1",
        projectConfigId: "project-1",
      }),
    });
  });

  it("posts llm response requests with the current chat execution payload", async () => {
    await route_get_llm_response({
      chatId: "chat-1",
      continueFromChatId: null,
      message: {
        id: "message-1",
        role: "user",
        content: [{ type: "text", text: "Ship it." }],
      },
      engineConfigId: "engine-1",
      agentProfileId: null,
      thinking: true,
      projectConfigId: "project-1",
      sectionId: null,
      frontendAffinityToken: "affinity-1",
      allowUnscoped: true,
      branchParentChatId: null,
      branchFromMessageId: null,
      appSpecStreamingEnabled: false,
      permissionMode: "minimal",
      searchEnabled: true,
      appGenerationMode: null,
      appGenerationReferenceImageUrl: null,
      appGenerationReferenceImageNotes: null,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/getLLMResponse`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        chatId: "chat-1",
        continueFromChatId: null,
        message: {
          id: "message-1",
          role: "user",
          content: [{ type: "text", text: "Ship it." }],
        },
        engineConfigId: "engine-1",
        agentProfileId: null,
        thinking: true,
        projectConfigId: "project-1",
        sectionId: null,
        frontendAffinityToken: "affinity-1",
        allowUnscoped: true,
        branchParentChatId: null,
        branchFromMessageId: null,
        appSpecStreamingEnabled: false,
        permissionMode: "minimal",
        searchEnabled: true,
        appGenerationMode: null,
        appGenerationReferenceImageUrl: null,
        appGenerationReferenceImageNotes: null,
      }),
    });
  });

  it("posts chat-section state persistence with the canonical request shape", async () => {
    await route_set_chat_section_state({
      projectConfigId: "project-1",
      sectionId: "section-1",
      frontendOpId: "frontend-op-1",
      state: {
        messages: [],
        inputText: "",
        waitingForResponse: false,
        toolCallArguments: {},
        activeBranchId: null,
        branches: [],
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setChatSectionState`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-1",
        sectionId: "section-1",
        frontendOpId: "frontend-op-1",
        state: {
          messages: [],
          inputText: "",
          waitingForResponse: false,
          toolCallArguments: {},
          activeBranchId: null,
          branches: [],
        },
      }),
    });
  });

  it("posts transcription audio appends with the canonical PCM payload", async () => {
    await route_append_transcription_audio({
      sessionId: "session-1",
      audioPcm16Base64: "AQIDBA==",
      sampleRateHz: 24_000,
      channels: 1,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/appendTranscriptionAudio`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        sessionId: "session-1",
        audioPcm16Base64: "AQIDBA==",
        sampleRateHz: 24_000,
        channels: 1,
      }),
    });
  });
});

describe("generatedEndpoints terminal helpers", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("posts stop-code requests through killSubprocesses", async () => {
    await route_kill_subprocesses({
      projectConfigId: "project-1",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/killSubprocesses`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-1",
      }),
    });
  });

  it("posts run-code requests with nullable execution overrides", async () => {
    await route_run_code({
      projectConfigId: "project-1",
      sectionId: null,
      terminalSectionId: null,
      cliId: null,
      runSnapshotMode: null,
      drawSnapshotsBySectionId: null,
      sectionVariantOverrides: {
        "section-1": "variant-1",
      },
      paramOverrides: {
        "section-1:param-1": "override",
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${C_ADDRESSES.BACKEND}/runCode`);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-1",
        sectionId: null,
        terminalSectionId: null,
        cliId: null,
        runSnapshotMode: null,
        drawSnapshotsBySectionId: null,
        sectionVariantOverrides: {
          "section-1": "variant-1",
        },
        paramOverrides: {
          "section-1:param-1": "override",
        },
      }),
    });
  });
});

describe("generatedEndpoints password reveal helper", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("posts password-value reads with the active param identity", async () => {
    await route_get_password_param_value({
      projectConfigId: "project-1",
      sectionId: "section-1",
      paramInfoId: "param-1",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/getPasswordParamValue`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-1",
        sectionId: "section-1",
        paramInfoId: "param-1",
      }),
    });
  });
});

describe("generatedEndpoints attachment download helpers", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("posts single attachment-url reads with the artifact and project ids", async () => {
    await route_get_attachment_download_url({
      artifactId: "artifacts/notes.txt",
      projectConfigId: "project-1",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/getAttachmentDownloadUrl`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        artifactId: "artifacts/notes.txt",
        projectConfigId: "project-1",
      }),
    });
  });

  it("posts bulk attachment-url reads with the current payload shape", async () => {
    await route_get_attachment_download_urls({
      artifactIds: ["artifacts/notes.txt", "artifacts/diagram.png"],
      projectConfigId: "project-1",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/getAttachmentDownloadUrls`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        artifactIds: ["artifacts/notes.txt", "artifacts/diagram.png"],
        projectConfigId: "project-1",
      }),
    });
  });
});

describe("generatedEndpoints file-browser helpers", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("posts file-browser root reads with the null body shape", async () => {
    await route_get_file_browser_root();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/getFileBrowserRoot`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: null,
    });
  });

  it("posts file-browser read and write payloads with the current request shapes", async () => {
    await route_create_file({
      filepath: "/workspace/new-file.txt",
    });
    await route_check_if_file_exists({
      filepath: "/workspace/new-file.txt",
    });
    await route_check_workspace_initialized({
      folderPath: "/workspace",
      allowOutsideWorkspaceRoot: false,
    });
    await route_get_folder_contents({
      folderPath: "/workspace",
      ignorePatterns: null,
      maxEntries: null,
      missingFolderBehavior: "empty",
      includeSize: true,
    });
    await route_get_file_browser_download_urls({
      paths: ["/workspace/a.txt", "/workspace/b.txt"],
    });
    await route_get_file_browser_file_content({
      path: "/workspace/a.txt",
      maxBytes: 4096,
    });
    await route_get_file_browser_file_stat({
      path: "/workspace/a.txt",
    });
    await route_write_file_browser_file_content({
      path: "/workspace/a.txt",
      contentId: "content-1",
      expectedMtimeNs: null,
    });
    await route_transfer_file_browser_entry({
      sourcePath: "/workspace/a.txt",
      destinationFolderPath: "/workspace/archive",
      operation: "move",
    });

    expect(fetchMock).toHaveBeenCalledTimes(9);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/createFile`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        filepath: "/workspace/new-file.txt",
      }),
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/checkIfFileExists`,
    );
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        filepath: "/workspace/new-file.txt",
      }),
    });
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/checkWorkspaceInitialized`,
    );
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        folderPath: "/workspace",
        allowOutsideWorkspaceRoot: false,
      }),
    });
    expect(fetchMock.mock.calls[3]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/getFolderContents`,
    );
    expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        folderPath: "/workspace",
        ignorePatterns: null,
        maxEntries: null,
        missingFolderBehavior: "empty",
        includeSize: true,
      }),
    });
    expect(fetchMock.mock.calls[4]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/getFileBrowserDownloadUrls`,
    );
    expect(fetchMock.mock.calls[4]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        paths: ["/workspace/a.txt", "/workspace/b.txt"],
      }),
    });
    expect(fetchMock.mock.calls[5]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/getFileBrowserFileContent`,
    );
    expect(fetchMock.mock.calls[5]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        path: "/workspace/a.txt",
        maxBytes: 4096,
      }),
    });
    expect(fetchMock.mock.calls[6]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/getFileBrowserFileStat`,
    );
    expect(fetchMock.mock.calls[6]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        path: "/workspace/a.txt",
      }),
    });
    expect(fetchMock.mock.calls[7]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/writeFileBrowserFileContent`,
    );
    expect(fetchMock.mock.calls[7]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        path: "/workspace/a.txt",
        contentId: "content-1",
        expectedMtimeNs: null,
      }),
    });
    expect(fetchMock.mock.calls[8]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/transferFileBrowserEntry`,
    );
    expect(fetchMock.mock.calls[8]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        sourcePath: "/workspace/a.txt",
        destinationFolderPath: "/workspace/archive",
        operation: "move",
      }),
    });
  });
});

describe("generatedEndpoints binary and artifact helpers", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("posts binary uploads with FormData intact", async () => {
    const body = new FormData();
    body.append("durable", "false");

    await route_binary_upload(body);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/binary/upload`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body,
    });
  });

  it("downloads binary payloads through the GET binary helper", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      }),
    );

    const response = await route_binary_download({
      contentId: "payload-1",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/binary/payload-1`,
    );
    expect(response.status).toBe(200);
    expect(Array.from(response.data ?? [])).toEqual([1, 2, 3]);
  });

  it("posts artifact import and cached-load payloads with current request shapes", async () => {
    await route_import_files_to_artifacts({
      paths: ["/workspace/a.png"],
      uploadScope: "chat",
    });
    await route_load_cached_image_artifacts({
      paths: ["artifacts/image.png"],
    });
    await route_load_cached_chart_data({
      paths: ["artifacts/chart.csv"],
    });
    await route_load_cached_brush_strokes({
      paths: ["artifacts/stroke.json"],
    });
    await route_load_cached_draw_area_layer_item_transform({
      paths: ["artifacts/transform.json"],
    });
    await route_append_draw_area_layer_item({
      projectConfigId: "project-1",
      sectionId: "draw-section",
      layerIdx: 0,
      element: {
        type: "BrushStroke",
        dataPath: "artifacts/stroke.json",
        transformId: "artifacts/transform.json",
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/importFilesToArtifacts`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        paths: ["/workspace/a.png"],
        uploadScope: "chat",
      }),
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/loadCachedImageArtifacts`,
    );
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/loadCachedChartData`,
    );
    expect(fetchMock.mock.calls[3]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/loadCachedBrushStrokes`,
    );
    expect(fetchMock.mock.calls[4]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/loadDrawAreaLayerItemTransform`,
    );
    expect(fetchMock.mock.calls[5]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/appendDrawAreaLayerItem`,
    );
    expect(fetchMock.mock.calls[5]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-1",
        sectionId: "draw-section",
        layerIdx: 0,
        element: {
          type: "BrushStroke",
          dataPath: "artifacts/stroke.json",
          transformId: "artifacts/transform.json",
        },
      }),
    });
  });

  it("posts artifact mutation payloads with typed artifact unions", async () => {
    await route_update_artifacts({
      artifacts: [
        {
          type: "File",
          id: "artifacts/file.bin",
          value: {
            contentId: "payload-1",
            byteLength: 12,
            mimeType: null,
            sha256: null,
          },
        },
      ],
      conflictStrategy: "backup",
      uploadScope: "generic",
    });
    await route_delete_artifacts({
      artifacts: [
        {
          id: "artifacts/file.bin",
          type: "File",
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/updateArtifacts`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        artifacts: [
          {
            type: "File",
            id: "artifacts/file.bin",
            value: {
              contentId: "payload-1",
              byteLength: 12,
              mimeType: null,
              sha256: null,
            },
          },
        ],
        conflictStrategy: "backup",
        uploadScope: "generic",
      }),
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/deleteArtifacts`,
    );
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        artifacts: [
          {
            id: "artifacts/file.bin",
            type: "File",
          },
        ],
      }),
    });
  });
});

describe("generatedEndpoints listener helpers", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("posts listener force-refresh requests with the active project id", async () => {
    await route_force_refresh_listener({
      projectConfigId: "project-1",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/forceRefreshListener`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-1",
      }),
    });
  });

  it("posts listener-coverage reads with the active project id", async () => {
    await route_get_listener_coverage({
      projectConfigId: "project-1",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/getListenerCoverage`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        projectConfigId: "project-1",
      }),
    });
  });
});

describe("generatedEndpoints git helpers", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("posts git status reads with a null payload", async () => {
    await route_get_git_status();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/git/status`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: null,
    });
  });

  it("posts git diff and log requests with the canonical payloads", async () => {
    await route_get_git_diff({
      path: "src/main.ts",
      oldPath: null,
      mode: "unstaged",
    });
    await route_get_git_log({
      rev: "HEAD",
      allRefs: true,
      offset: 250,
      pageSize: 100,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/git/diff`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        path: "src/main.ts",
        oldPath: null,
        mode: "unstaged",
      }),
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`${C_ADDRESSES.BACKEND}/git/log`);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        rev: "HEAD",
        allRefs: true,
        offset: 250,
        pageSize: 100,
      }),
    });
  });

  it("posts git commit detail and file diff lookups", async () => {
    await route_get_git_commit_details({
      commitHash: "abc123",
    });
    await route_get_git_commit_file_diff({
      commitHash: "abc123",
      path: "src/main.ts",
      oldPath: "src/old-main.ts",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/git/commitDetails`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        commitHash: "abc123",
      }),
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/git/commitFileDiff`,
    );
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        commitHash: "abc123",
        path: "src/main.ts",
        oldPath: "src/old-main.ts",
      }),
    });
  });
});

describe("generatedEndpoints plugin helpers", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("loads plugin runtime state from the backend origin", async () => {
    await route_plugins_runtime();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/plugins/runtime`,
    );
  });

  it("posts plugin install payloads with the current mutation shape", async () => {
    await route_plugins_install({
      sourceSpec: "pypi:setta-plugin==1.2.3",
      scope: "workspace",
      installer: "uv",
      enable: true,
      force: false,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/plugins/install`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        sourceSpec: "pypi:setta-plugin==1.2.3",
        scope: "workspace",
        installer: "uv",
        enable: true,
        force: false,
      }),
    });
  });

  it("posts plugin-config writes with nested JSON objects intact", async () => {
    await route_plugins_config({
      pluginId: "setta-plugin",
      config: {
        enabled: true,
        limits: {
          maxWorkers: 4,
        },
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/plugins/config`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        pluginId: "setta-plugin",
        config: {
          enabled: true,
          limits: {
            maxWorkers: 4,
          },
        },
      }),
    });
  });

  it("posts plugin restart requests without a payload", async () => {
    await route_plugins_restart();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/plugins/restart`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: null,
    });
  });
});
