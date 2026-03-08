import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { C_ADDRESSES } from "./c_addresses";
import { resolveEndpointOrigin } from "./endpointUtils";
import {
  route_append_transcription_audio,
  route_create_project_config,
  route_delete_sections,
  route_delete_selected_params,
  route_force_refresh_listener,
  route_get_agent_profiles,
  route_get_agent_runs,
  route_get_app_catalog,
  route_get_app_definition,
  route_get_app_gen_skill_content,
  route_get_app_gen_skills,
  route_get_attachment_download_url,
  route_get_attachment_download_urls,
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
  route_load_all_project_metadata,
  route_load_project_config,
  route_plugins_config,
  route_plugins_install,
  route_plugins_restart,
  route_plugins_runtime,
  route_restart_language_server,
  route_set_active_ids,
  route_set_app_definition,
  route_set_chat_section_state,
  route_set_llm_api_keys,
  route_set_top_level_section_layout,
  route_set_type_error_ignore,
  route_set_viewport,
  route_start_transcription_session,
  route_toggle_param_selected,
  route_type_check,
  route_ungroup_groups,
  route_unselect_all_params,
  route_upsert_app_gen_custom_skill,
  route_validate_app_definition,
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
