import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCallableAndRefreshProjectState } from "./callable";

vi.mock("utils/generatedEndpoints", () => ({
  route_set_callable: vi.fn(),
}));

describe("setCallableAndRefreshProjectState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns true after a successful setCallable mutation", async () => {
    const { route_set_callable } = await import("utils/generatedEndpoints");

    vi.mocked(route_set_callable).mockResolvedValue({
      status: 200,
      data: {
        callableId: "callable-1",
        childCodeObjs: [],
        lspStatus: "matched",
      },
      hasResponse: true,
    });

    const updated = await setCallableAndRefreshProjectState({
      projectConfigId: "project-alpha",
      sectionId: "section-1",
      callableName: "sorted",
      refetchParams: true,
    });

    expect(updated).toBe(true);
    expect(route_set_callable).toHaveBeenCalledWith({
      projectConfigId: "project-alpha",
      sectionId: "section-1",
      callableName: "sorted",
      refetchParams: true,
    });
  });

  it("returns false when setCallable fails", async () => {
    const { route_set_callable } = await import("utils/generatedEndpoints");

    vi.mocked(route_set_callable).mockResolvedValue({
      status: 500,
      data: null,
      hasResponse: true,
    });

    const updated = await setCallableAndRefreshProjectState({
      projectConfigId: "project-alpha",
      sectionId: "section-1",
      callableName: "sorted",
      refetchParams: false,
    });

    expect(updated).toBe(false);
  });
});
