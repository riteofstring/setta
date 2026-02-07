import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useServerMode } from "state/definitions";
import { resetProjectStores } from "state/utils";
import * as endpoints from "utils/generatedEndpoints";

import { initializeServerMode } from "./serverMode";

describe("initializeServerMode", () => {
  beforeEach(() => {
    resetProjectStores();
    useServerMode.setState({ mode: "ide", modeResolved: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetProjectStores();
  });

  it("returns cached mode when already resolved", async () => {
    useServerMode.setState({ mode: "share", modeResolved: true });
    const spy = vi.spyOn(endpoints, "route_get_server_mode");

    const mode = await initializeServerMode();

    expect(mode).toBe("share");
    expect(spy).not.toHaveBeenCalled();
  });

  it("sets mode from backend response", async () => {
    vi.spyOn(endpoints, "route_get_server_mode").mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: { mode: "app" },
    });

    const mode = await initializeServerMode();

    expect(mode).toBe("app");
    expect(useServerMode.getState()).toEqual({
      mode: "app",
      modeResolved: true,
    });
  });

  it("falls back to ide on request failure", async () => {
    vi.spyOn(endpoints, "route_get_server_mode").mockResolvedValue({
      status: 500,
      hasResponse: true,
      data: null,
    });

    const mode = await initializeServerMode();

    expect(mode).toBe("ide");
    expect(useServerMode.getState()).toEqual({
      mode: "ide",
      modeResolved: true,
    });
  });
});
