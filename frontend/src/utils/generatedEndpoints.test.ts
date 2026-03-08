import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { C_ADDRESSES } from "./c_addresses";
import { resolveEndpointOrigin } from "./endpointUtils";
import {
  route_create_project_config,
  route_force_refresh_listener,
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
  route_get_mcp_server_runtime_status,
  route_get_password_param_value,
  route_load_all_project_metadata,
  route_load_project_config,
  route_plugins_config,
  route_plugins_install,
  route_plugins_restart,
  route_plugins_runtime,
  route_restart_language_server,
  route_set_app_definition,
  route_set_top_level_section_layout,
  route_set_type_error_ignore,
  route_set_viewport,
  route_type_check,
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
