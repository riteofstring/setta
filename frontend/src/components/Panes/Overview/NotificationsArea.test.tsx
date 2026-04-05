/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import {
  useLocalStorage,
  useNotifications,
  useProjectState,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { OverviewNotificationsPaneTabEnum } from "utils/constants";
import { route_get_notifications } from "utils/generatedEndpoints";
import {
  createNotification,
  createProjectConfig,
  NotificationTypeEnum,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncStoreInitialState } from "../paneTestUtils";
import { NotificationsArea } from "./NotificationsArea";

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await import("utils/generatedEndpoints");
  return {
    ...actual,
    route_get_notifications: vi.fn(),
  };
});

type RenderedNotificationsArea = {
  host: HTMLDivElement;
  root: Root;
};

async function renderNotificationsArea() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(<NotificationsArea />);
  });

  return { host, root } satisfies RenderedNotificationsArea;
}

async function flushEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("NotificationsArea", () => {
  beforeEach(() => {
    resetProjectStores();
    useNotifications.setState({ notifications: [] });
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({
        id: "project-1",
        name: "Project 1",
      });
    });
    useLocalStorage.setState({
      overviewNotificationsPaneTab:
        OverviewNotificationsPaneTabEnum.Notifications,
    });
    syncStoreInitialState(useNotifications);
    syncStoreInitialState(useProjectState);
    syncStoreInitialState(useLocalStorage);
    vi.mocked(route_get_notifications).mockReset();
  });

  afterEach(() => {
    resetProjectStores();
    document.body.innerHTML = "";
  });

  it("renders from persisted tab state", () => {
    const markup = renderToStaticMarkup(<NotificationsArea />);

    expect(markup).toContain(
      'data-testid="notifications-pane-tab-notifications"',
    );
    expect(markup).toContain(
      'data-testid="notifications-pane-tab-backend-logs"',
    );
    expect(markup).toMatch(
      /aria-selected="true"[^>]*data-testid="notifications-pane-tab-notifications"/,
    );
    expect(markup).toMatch(
      /aria-selected="false"[^>]*data-testid="notifications-pane-tab-backend-logs"/,
    );
  });

  it("loads notifications through the Go route for the active project", async () => {
    vi.mocked(route_get_notifications).mockResolvedValue({
      data: [
        createNotification({
          id: "notif-1",
          type: NotificationTypeEnum.warning,
          message: "Save needed",
          timestamp: "2026-03-12T10:00:00Z",
          read_status: false,
          temporary: false,
          metadata: { details: "Project has unsaved changes." },
        }),
      ],
      status: 200,
      hasResponse: true,
    });

    const { host, root } = await renderNotificationsArea();

    try {
      await flushEffects();

      expect(route_get_notifications).toHaveBeenCalledWith({
        projectConfigId: "project-1",
      });
      expect(host.textContent).toContain("Save needed");
      expect(host.textContent).toContain("Project has unsaved changes.");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
