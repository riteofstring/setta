import { resetProjectStores } from "state/utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("state/actions/appSessionState", () => ({
  initializeAppSessionFromCurrentDeployment: vi.fn(),
  resetAppSessionState: vi.fn(),
}));

vi.mock("state/actions/share", () => ({
  initializeShareSessionFromCurrentDeployment: vi.fn(),
  resetShareSessionState: vi.fn(),
}));

vi.mock("state/actions/notifications", () => ({
  addTemporaryNotification: vi.fn(),
}));

describe("websocketShareSessionRecovery", () => {
  beforeEach(async () => {
    resetProjectStores();
    vi.resetModules();
    vi.clearAllMocks();
    const { useServerMode, useShareSession } = await import(
      "state/stores/sessionStores"
    );
    useServerMode.setState({
      mode: "share",
      modeResolved: true,
      modeError: null,
    });
    useShareSession.setState({
      isDeploymentMode: true,
      deploymentMode: "share",
    });
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("resets share session state and warns when recovery fails", async () => {
    const {
      initializeShareSessionFromCurrentDeployment,
      resetShareSessionState,
    } = await import("state/actions/share");
    const { addTemporaryNotification } = await import(
      "state/actions/notifications"
    );
    vi.mocked(initializeShareSessionFromCurrentDeployment).mockResolvedValue(
      false,
    );

    const { handleShareSessionRecovery } = await import(
      "./websocketShareSessionRecovery"
    );

    await handleShareSessionRecovery();

    expect(initializeShareSessionFromCurrentDeployment).toHaveBeenCalledWith({
      forceNewSession: true,
    });
    expect(resetShareSessionState).toHaveBeenCalledTimes(1);
    expect(addTemporaryNotification).toHaveBeenCalledWith(
      "Share session expired. Refresh to continue.",
    );
  });
});
