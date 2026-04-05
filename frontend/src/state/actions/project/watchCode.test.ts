import { beforeEach, describe, expect, it, vi } from "vitest";
import { setWatchCodeEnabled, setWatchCodeInputs } from "./watchCode";

vi.mock("utils/generatedEndpoints", () => ({
  route_set_watch_code_enabled: vi.fn(),
  route_set_watch_code_inputs: vi.fn(),
}));

describe("watchCode mutation actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns success for setWatchCodeEnabled and leaves project-state sync to websocket updates", async () => {
    const { route_set_watch_code_enabled } = await import(
      "utils/generatedEndpoints"
    );
    vi.mocked(route_set_watch_code_enabled).mockResolvedValue({
      status: 200,
      data: null,
      hasResponse: true,
    });

    const updated = await setWatchCodeEnabled({
      projectConfigId: "project-alpha",
      enabled: true,
    });

    expect(updated).toBe(true);
    expect(route_set_watch_code_enabled).toHaveBeenCalledWith({
      projectConfigId: "project-alpha",
      enabled: true,
    });
  });

  it("returns failure for setWatchCodeEnabled when the route fails", async () => {
    const { route_set_watch_code_enabled } = await import(
      "utils/generatedEndpoints"
    );
    vi.mocked(route_set_watch_code_enabled).mockResolvedValue({
      status: 500,
      data: null,
      hasResponse: true,
    });

    const updated = await setWatchCodeEnabled({
      projectConfigId: "project-alpha",
      enabled: false,
    });

    expect(updated).toBe(false);
  });

  it("returns success for setWatchCodeInputs and leaves project-state sync to websocket updates", async () => {
    const { route_set_watch_code_inputs } = await import(
      "utils/generatedEndpoints"
    );
    vi.mocked(route_set_watch_code_inputs).mockResolvedValue({
      status: 200,
      data: null,
      hasResponse: true,
    });

    const updated = await setWatchCodeInputs({
      projectConfigId: "project-alpha",
      watchCodeFolders: [],
      watchCodeFiles: ["pkg/watch_me.py"],
    });

    expect(updated).toBe(true);
    expect(route_set_watch_code_inputs).toHaveBeenCalledWith({
      projectConfigId: "project-alpha",
      watchCodeFolders: [],
      watchCodeFiles: ["pkg/watch_me.py"],
    });
  });

  it("returns failure for setWatchCodeInputs when the route fails", async () => {
    const { route_set_watch_code_inputs } = await import(
      "utils/generatedEndpoints"
    );
    vi.mocked(route_set_watch_code_inputs).mockResolvedValue({
      status: 500,
      data: null,
      hasResponse: true,
    });

    const updated = await setWatchCodeInputs({
      projectConfigId: "project-alpha",
      watchCodeFolders: [],
      watchCodeFiles: ["pkg/watch_me.py"],
    });

    expect(updated).toBe(false);
  });
});
