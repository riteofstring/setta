import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  setWatchCodeEnabled as setWatchCodeEnabledAction,
  setWatchCodeInputs as setWatchCodeInputsAction,
} from "./watchCode";

const callOpenAPIMock = vi.fn((promise: Promise<unknown>) => promise);

vi.mock("openapi/http", () => ({
  setWatchCodeEnabled: vi.fn(),
  setWatchCodeInputs: vi.fn(),
}));

vi.mock("@setta/app-subsystem-frontend-sdk", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@setta/app-subsystem-frontend-sdk")>();
  return {
    ...actual,
    callOpenAPI: (promise: Promise<unknown>) => callOpenAPIMock(promise),
  };
});

describe("watchCode mutation actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    callOpenAPIMock.mockClear();
  });

  it("returns success for setWatchCodeEnabled and leaves project-state sync to websocket updates", async () => {
    const { setWatchCodeEnabled: setWatchCodeEnabledRequest } = await import(
      "openapi/http"
    );
    vi.mocked(setWatchCodeEnabledRequest).mockResolvedValue({
      status: 200,
      data: null,
      hasResponse: true,
    });

    const updated = await setWatchCodeEnabledAction({
      projectConfigId: "project-alpha",
      enabled: true,
    });

    expect(updated).toBe(true);
    expect(setWatchCodeEnabledRequest).toHaveBeenCalledWith({
      body: {
        projectConfigId: "project-alpha",
        enabled: true,
      },
    });
  });

  it("returns failure for setWatchCodeEnabled when the route fails", async () => {
    const { setWatchCodeEnabled: setWatchCodeEnabledRequest } = await import(
      "openapi/http"
    );
    vi.mocked(setWatchCodeEnabledRequest).mockResolvedValue({
      status: 500,
      data: null,
      hasResponse: true,
    });

    const updated = await setWatchCodeEnabledAction({
      projectConfigId: "project-alpha",
      enabled: false,
    });

    expect(updated).toBe(false);
  });

  it("returns success for setWatchCodeInputs and leaves project-state sync to websocket updates", async () => {
    const { setWatchCodeInputs: setWatchCodeInputsRequest } = await import(
      "openapi/http"
    );
    vi.mocked(setWatchCodeInputsRequest).mockResolvedValue({
      status: 200,
      data: null,
      hasResponse: true,
    });

    const updated = await setWatchCodeInputsAction({
      projectConfigId: "project-alpha",
      watchCodeFolders: [],
      watchCodeFiles: ["pkg/watch_me.py"],
    });

    expect(updated).toBe(true);
    expect(setWatchCodeInputsRequest).toHaveBeenCalledWith({
      body: {
        projectConfigId: "project-alpha",
        watchCodeFolders: [],
        watchCodeFiles: ["pkg/watch_me.py"],
      },
    });
  });

  it("returns failure for setWatchCodeInputs when the route fails", async () => {
    const { setWatchCodeInputs: setWatchCodeInputsRequest } = await import(
      "openapi/http"
    );
    vi.mocked(setWatchCodeInputsRequest).mockResolvedValue({
      status: 500,
      data: null,
      hasResponse: true,
    });

    const updated = await setWatchCodeInputsAction({
      projectConfigId: "project-alpha",
      watchCodeFolders: [],
      watchCodeFiles: ["pkg/watch_me.py"],
    });

    expect(updated).toBe(false);
  });
});
