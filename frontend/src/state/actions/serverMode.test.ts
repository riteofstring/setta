import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetProjectStores } from "state/utils";
import { useServerMode } from "state/stores/sessionStores";
import * as endpoints from "utils/generatedEndpoints";

import { initializeServerMode } from "./serverMode";

describe("initializeServerMode", () => {
  beforeEach(() => {
    resetProjectStores();
    useServerMode.setState({
      mode: null,
      modeResolved: false,
      modeError: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetProjectStores();
  });

  it("returns cached mode when already resolved", async () => {
    useServerMode.setState({
      mode: "share",
      modeResolved: true,
      modeError: null,
    });
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
      modeError: null,
    });
  });

  it("accepts launcher mode from backend response", async () => {
    vi.spyOn(endpoints, "route_get_server_mode").mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: { mode: "launcher" },
    });

    const mode = await initializeServerMode();

    expect(mode).toBe("launcher");
    expect(useServerMode.getState()).toEqual({
      mode: "launcher",
      modeResolved: true,
      modeError: null,
    });
  });

  it("stores an error when the request fails", async () => {
    vi.spyOn(endpoints, "route_get_server_mode").mockResolvedValue({
      status: 500,
      hasResponse: true,
      data: null,
    });

    const mode = await initializeServerMode();

    expect(mode).toBeNull();
    const state = useServerMode.getState();
    expect(state.mode).toBeNull();
    expect(state.modeResolved).toBe(true);
    expect(state.modeError).toMatch(/status 500/);
  });
});
