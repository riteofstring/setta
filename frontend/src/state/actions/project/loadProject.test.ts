import { useAllProjectMetadata } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { createProjectConfig } from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";

const routeLoadAllProjectMetadataMock = vi.fn();
const initializeServerModeMock = vi.fn();

vi.mock("utils/generatedEndpoints", () => ({
  route_create_project_config: vi.fn(),
  route_get_latest_lsp_diagnostics: vi.fn(),
  route_load_all_project_metadata: (...args: unknown[]) =>
    routeLoadAllProjectMetadataMock(...args),
  route_load_project_config: vi.fn(),
}));

vi.mock("../serverMode", () => ({
  initializeServerMode: (...args: unknown[]) => initializeServerModeMock(...args),
}));

import { loadAllProjectMetadata } from "./loadProject";

describe("loadAllProjectMetadata", () => {
  beforeEach(() => {
    resetProjectStores();
    useAllProjectMetadata.setState({
      defaultProjectConfigId: null,
      projectMetadata: [],
    });
    routeLoadAllProjectMetadataMock.mockReset();
    initializeServerModeMock.mockReset();
  });

  it("returns false and skips loading when server mode is not ide", async () => {
    initializeServerModeMock.mockResolvedValue("launcher");

    const loaded = await loadAllProjectMetadata();

    expect(loaded).toBe(false);
    expect(routeLoadAllProjectMetadataMock).not.toHaveBeenCalled();
  });

  it("returns true and updates metadata store after a successful response", async () => {
    const project = createProjectConfig({ id: "project-1", name: "Project One" });
    initializeServerModeMock.mockResolvedValue("ide");
    routeLoadAllProjectMetadataMock.mockResolvedValue({
      data: {
        defaultProjectConfigId: project.id,
        projectMetadata: [project],
      },
      status: 200,
      hasResponse: true,
    });

    const loaded = await loadAllProjectMetadata();

    expect(loaded).toBe(true);
    expect(useAllProjectMetadata.getState().defaultProjectConfigId).toBe(
      project.id,
    );
    expect(useAllProjectMetadata.getState().projectMetadata).toEqual([project]);
  });

  it("returns false when metadata request fails", async () => {
    initializeServerModeMock.mockResolvedValue("ide");
    routeLoadAllProjectMetadataMock.mockResolvedValue({
      data: undefined,
      status: 503,
      hasResponse: true,
    });

    const loaded = await loadAllProjectMetadata();

    expect(loaded).toBe(false);
    expect(useAllProjectMetadata.getState().projectMetadata).toEqual([]);
    expect(useAllProjectMetadata.getState().defaultProjectConfigId).toBeNull();
  });
});
