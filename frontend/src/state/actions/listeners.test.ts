import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  routeForceRefreshListenerMock,
  addTemporaryNotificationMock,
  getCurrProjectConfigIdMock,
} = vi.hoisted(() => ({
  routeForceRefreshListenerMock: vi.fn(),
  addTemporaryNotificationMock: vi.fn(),
  getCurrProjectConfigIdMock: vi.fn(),
}));

vi.mock("utils/generatedEndpoints", () => ({
  route_force_refresh_listener: routeForceRefreshListenerMock,
}));

vi.mock("./notifications", () => ({
  addTemporaryNotification: addTemporaryNotificationMock,
}));

vi.mock("./sectionInfos", () => ({
  getCurrProjectConfigId: getCurrProjectConfigIdMock,
}));

vi.mock("state/definitions", () => ({
  NULL_PROJECT_CONFIG_ID: "null-project-config-id",
}));

vi.mock("utils/endpointUtils", async () => {
  const actual = await vi.importActual<typeof import("utils/endpointUtils")>(
    "utils/endpointUtils",
  );
  return {
    ...actual,
  };
});

import { triggerListenerForceRefresh } from "./listeners";

describe("triggerListenerForceRefresh", () => {
  beforeEach(() => {
    routeForceRefreshListenerMock.mockReset();
    addTemporaryNotificationMock.mockReset();
    getCurrProjectConfigIdMock.mockReset();
    getCurrProjectConfigIdMock.mockReturnValue("project-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects force-refresh when no project is selected", async () => {
    getCurrProjectConfigIdMock.mockReturnValue("null-project-config-id");

    const result = await triggerListenerForceRefresh();

    expect(result).toBe(false);
    expect(routeForceRefreshListenerMock).not.toHaveBeenCalled();
    expect(addTemporaryNotificationMock).toHaveBeenCalledWith(
      "Select a project before sending a listener force refresh.",
    );
  });

  it("posts the force-refresh request and reports success", async () => {
    routeForceRefreshListenerMock.mockResolvedValue({
      status: 200,
      data: null,
    });

    const result = await triggerListenerForceRefresh();

    expect(result).toBe(true);
    expect(routeForceRefreshListenerMock).toHaveBeenCalledWith({
      projectConfigId: "project-1",
    });
    expect(addTemporaryNotificationMock).toHaveBeenCalledWith(
      "Listener force refresh dispatched to project listeners.",
    );
  });

  it("reports failure when the backend rejects the request", async () => {
    routeForceRefreshListenerMock.mockResolvedValue({
      status: 500,
      data: { error: { code: "internal_error" } },
    });

    const result = await triggerListenerForceRefresh();

    expect(result).toBe(false);
    expect(routeForceRefreshListenerMock).toHaveBeenCalledWith({
      projectConfigId: "project-1",
    });
    expect(addTemporaryNotificationMock).toHaveBeenCalledWith(
      "Failed to dispatch listener force refresh.",
    );
  });
});
