import { renderToStaticMarkup } from "react-dom/server";
import { useLocalStorage } from "state/definitions";
import { useNotifications } from "state/stores/feedbackStores";
import { resetProjectStores } from "state/utils";
import { OverviewNotificationsPaneTabEnum } from "utils/constants";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncStoreInitialState } from "../paneTestUtils";
import { NotificationsArea } from "./NotificationsArea";

describe("NotificationsArea", () => {
  beforeEach(() => {
    resetProjectStores();
    useNotifications.setState({ notifications: [] });
    useLocalStorage.setState({
      overviewNotificationsPaneTab:
        OverviewNotificationsPaneTabEnum.Notifications,
    });
    syncStoreInitialState(useNotifications);
    syncStoreInitialState(useLocalStorage);
  });

  afterEach(() => {
    resetProjectStores();
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
});
