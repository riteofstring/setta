import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as endpoints from "openapi/http";
import type { ServerModeValue } from "utils/serverModeTypes";

import { initializeServerMode } from "./serverMode";

const { useServerMode } = vi.hoisted(() => {
  const state = {
    mode: null as ServerModeValue,
    modeResolved: false,
    modeError: null as string | null,
  };
  return {
    useServerMode: {
      getState: () => state,
      setState: (
        next:
          | Partial<typeof state>
          | ((prev: typeof state) => Partial<typeof state>),
      ) => {
        const patch = typeof next === "function" ? next(state) : next;
        Object.assign(state, patch);
      },
    },
  };
});

vi.mock("state/definitions", () => ({
  useServerMode,
}));

describe("initializeServerMode", () => {
  beforeEach(() => {
    useServerMode.setState({
      mode: null,
      modeResolved: false,
      modeError: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useServerMode.setState({
      mode: null,
      modeResolved: false,
      modeError: null,
    });
  });

  it("returns cached mode when already resolved", async () => {
    useServerMode.setState({
      mode: "share",
      modeResolved: true,
      modeError: null,
    });
    const spy = vi.spyOn(endpoints, "getServerMode");

    const mode = await initializeServerMode();

    expect(mode).toBe("share");
    expect(spy).not.toHaveBeenCalled();
  });

  it("sets mode from backend response", async () => {
    vi.spyOn(endpoints, "getServerMode").mockResolvedValue({
      data: { mode: "app" },
      error: undefined,
      response: new Response(null, { status: 200 }),
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
    vi.spyOn(endpoints, "getServerMode").mockResolvedValue({
      data: { mode: "launcher" },
      error: undefined,
      response: new Response(null, { status: 200 }),
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
    vi.spyOn(endpoints, "getServerMode").mockResolvedValue({
      data: undefined,
      error: null,
      response: new Response(null, { status: 500 }),
    });

    const mode = await initializeServerMode();

    expect(mode).toBeNull();
    const state = useServerMode.getState();
    expect(state.mode).toBeNull();
    expect(state.modeResolved).toBe(true);
    expect(state.modeError).toMatch(/status 500/);
  });
});
