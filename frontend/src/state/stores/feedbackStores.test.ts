import { resetProjectStores } from "state/utils";
import { beforeEach, describe, expect, it } from "vitest";
import {
  useBackendLogEvents,
  useModal,
  useNotifications,
} from "./feedbackStores";

describe("feedbackStores", () => {
  beforeEach(() => {
    resetProjectStores();
    useNotifications.getState().reset?.();
  });

  it("resets project-scoped modal and backend-log stores through resetProjectStores", () => {
    useModal.setState({
      open: true,
      modalInfo: { type: "WORKSPACE_SWITCHER", data: null },
    });
    useBackendLogEvents.setState({
      events: [
        {
          id: "backend-log-1",
          projectConfigId: null,
          severity: "error",
          message: "Crash",
          timestamp: new Date().toISOString(),
        },
      ],
      filter: {
        projectConfigId: "config-a",
        minSeverity: "warning",
        query: "crash",
      },
      unreadHighSeverityCount: 1,
    });

    resetProjectStores();

    expect(useModal.getState()).toEqual({
      open: false,
      modalInfo: null,
      reset: expect.any(Function),
    });
    expect(useBackendLogEvents.getState()).toEqual({
      events: [],
      filter: {
        projectConfigId: null,
        minSeverity: "info",
        query: "",
      },
      unreadHighSeverityCount: 0,
      reset: expect.any(Function),
    });
  });

  it("keeps notifications on their local reset path", () => {
    useNotifications.setState({
      notifications: [
        {
          id: "notification-1",
          projectConfigId: null,
          message: "Saved",
          type: "success",
          temporary: false,
          timestamp: new Date().toISOString(),
          read: false,
        },
      ],
    });

    useNotifications.getState().reset?.();

    expect(useNotifications.getState()).toEqual({
      notifications: [],
      reset: expect.any(Function),
    });
  });
});
