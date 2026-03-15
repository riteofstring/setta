import { resetProjectStores } from "state/utils";
import {
  createProjectConfig,
  createSettaLspDiagnosticsPayload,
  createSettaProjectConfigDiagnostics,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProjectState } from "../definitions";

vi.mock("utils/generatedEndpoints", () => ({
  route_get_latest_project_state: vi.fn(),
  route_get_latest_lsp_diagnostics: vi.fn(),
}));

vi.mock("state/actions/sectionProjectStateSync", () => ({
  processProjectStateUpdateFromBackend: vi.fn(),
}));

vi.mock("state/actions/lspDiagnostics", () => ({
  processLspDiagnostics: vi.fn(),
}));

vi.mock("state/actions/aiFollow", () => ({
  requestAIFollowSnapshot: vi.fn(),
}));

vi.mock("state/actions/aiAgentRuns", () => ({
  loadAgentRuns: vi.fn(),
}));

describe("websocketBootstrap", () => {
  beforeEach(() => {
    resetProjectStores();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("hydrates project state, follow snapshot, and diagnostics together", async () => {
    const projectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: {},
      topLevelSections: {},
      activeIds: [],
    });
    useProjectState.setState((state) => {
      state.projectConfig = projectConfig;
    });

    const { route_get_latest_project_state, route_get_latest_lsp_diagnostics } =
      await import("utils/generatedEndpoints");
    const { processProjectStateUpdateFromBackend } = await import(
      "state/actions/sectionProjectStateSync"
    );
    const { processLspDiagnostics } = await import(
      "state/actions/lspDiagnostics"
    );
    const { requestAIFollowSnapshot } = await import("state/actions/aiFollow");
    const { loadAgentRuns } = await import("state/actions/aiAgentRuns");
    const { hydrateLatestProjectState } = await import("./websocketBootstrap");

    const diagnosticsPayload = createSettaLspDiagnosticsPayload({
      projectConfigId: "project-1",
      genCode: createSettaProjectConfigDiagnostics({
        projectConfigId: "project-1",
        errors: {},
        isGenCode: true,
      }),
      codeSections: {},
      unmappedGenCode: [],
    });

    vi.mocked(route_get_latest_project_state).mockResolvedValue({
      status: 200,
      data: {
        projectState: projectConfig,
        completedOpIds: [],
        pendingOpIds: [],
      },
      hasResponse: true,
    });
    vi.mocked(route_get_latest_lsp_diagnostics).mockResolvedValue({
      status: 200,
      data: diagnosticsPayload,
      hasResponse: true,
    });

    await expect(hydrateLatestProjectState("project-1")).resolves.toBe(true);

    expect(route_get_latest_project_state).toHaveBeenCalledWith({
      projectConfigId: "project-1",
    });
    expect(processProjectStateUpdateFromBackend).toHaveBeenCalledWith({
      projectState: projectConfig,
      completedOpIds: [],
      pendingOpIds: [],
    });
    expect(loadAgentRuns).toHaveBeenCalledTimes(1);
    expect(requestAIFollowSnapshot).toHaveBeenCalledWith("project-1");
    expect(route_get_latest_lsp_diagnostics).toHaveBeenCalledWith({
      projectConfigId: "project-1",
    });
    expect(processLspDiagnostics).toHaveBeenCalledWith(diagnosticsPayload);
  });
});
