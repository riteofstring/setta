import { useLocalStorage } from "state/definitions";
import { useBackendLogEvents } from "state/stores/runtimeStores";
import { resetProjectStores } from "state/utils";
import {
  OverviewNotificationsPaneTabEnum,
  OverviewTabNameEnum,
} from "utils/constants";
import { type SettaBackendLogEvent } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addBackendLogEvent } from "./backendLogEvents";

let backendLogEventCounter = 0;

function createBackendLogEvent(
  severity: SettaBackendLogEvent["severity"],
): SettaBackendLogEvent {
  backendLogEventCounter += 1;
  return {
    id: `backend-log-event-${backendLogEventCounter}`,
    projectConfigId: null,
    severity,
    message: `event ${backendLogEventCounter}`,
    timestamp: new Date().toISOString(),
  };
}

describe("backend log unread tracking", () => {
  beforeEach(() => {
    resetProjectStores();
    useLocalStorage.setState({
      overviewVis: true,
      overviewTab: OverviewTabNameEnum.Overview,
      overviewNotificationsPaneTab:
        OverviewNotificationsPaneTabEnum.Notifications,
    });
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("marks high-severity events unread when logs are not visible", () => {
    useLocalStorage.setState({
      overviewTab: OverviewTabNameEnum.Notifications,
      overviewNotificationsPaneTab:
        OverviewNotificationsPaneTabEnum.Notifications,
    });

    addBackendLogEvent(createBackendLogEvent("error"));

    expect(useBackendLogEvents.getState().unreadHighSeverityCount).toBe(1);
  });

  it("does not mark high-severity events unread when logs sub-tab is visible", () => {
    useLocalStorage.setState({
      overviewTab: OverviewTabNameEnum.Notifications,
      overviewNotificationsPaneTab:
        OverviewNotificationsPaneTabEnum.BackendLogs,
    });

    addBackendLogEvent(createBackendLogEvent("critical"));

    expect(useBackendLogEvents.getState().unreadHighSeverityCount).toBe(0);
  });

  it("treats removed BackendLogs tab state as logs not visible", () => {
    useLocalStorage.setState({
      overviewTab: "BackendLogs" as never,
    });

    addBackendLogEvent(createBackendLogEvent("error"));

    expect(useBackendLogEvents.getState().unreadHighSeverityCount).toBe(1);
  });
});
