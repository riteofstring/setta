import { useProjectState } from "state/definitions";
import { useNotifications } from "state/stores/feedbackStores";
import { SettaNotificationTypeEnum } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addPersistentNotification,
  addTemporaryNotification,
  DEFAULT_TEMP_TIMEOUT,
} from "./notifications";

describe("notification actions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useNotifications.setState({ notifications: [] });
    useProjectState.setState((state) => ({
      projectConfig: {
        ...state.projectConfig,
        id: "project-config-for-notification-tests",
      },
    }));
  });

  afterEach(() => {
    useNotifications.setState({ notifications: [] });
    vi.useRealTimers();
  });

  it("adds persistent notifications that remain in the notifications store", () => {
    // External engine failures should persist in the notifications area.
    const notificationId = addPersistentNotification(
      "External engine unavailable",
      SettaNotificationTypeEnum.warning,
    );

    const initial = useNotifications
      .getState()
      .notifications.find((item) => item.id === notificationId);
    expect(initial).toBeDefined();
    expect(initial?.temporary).toBe(false);

    vi.advanceTimersByTime(DEFAULT_TEMP_TIMEOUT + 50);

    const afterTimeout = useNotifications
      .getState()
      .notifications.find((item) => item.id === notificationId);
    expect(afterTimeout).toBeDefined();
  });

  it("deduplicates persistent notifications with the same message and type", () => {
    // Repeated checks for the same engine issue should not spam the notifications area.
    const firstId = addPersistentNotification(
      "External engine unavailable",
      SettaNotificationTypeEnum.warning,
    );
    const secondId = addPersistentNotification(
      "External engine unavailable",
      SettaNotificationTypeEnum.warning,
    );

    expect(secondId).toBe(firstId);
    expect(useNotifications.getState().notifications).toHaveLength(1);
  });

  it("keeps temporary notifications auto-expiring", () => {
    // Existing temporary notification behavior should remain unchanged.
    const notificationId = addTemporaryNotification("Temporary message");

    const initial = useNotifications
      .getState()
      .notifications.find((item) => item.id === notificationId);
    expect(initial).toBeDefined();
    expect(initial?.temporary).toBe(true);

    vi.advanceTimersByTime(DEFAULT_TEMP_TIMEOUT + 50);

    const afterTimeout = useNotifications
      .getState()
      .notifications.find((item) => item.id === notificationId);
    expect(afterTimeout).toBeUndefined();
  });
});
