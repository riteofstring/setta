import { useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { restartLanguageServer } from "./lsp";

const { routeRestartLanguageServer, addTemporaryNotification } = vi.hoisted(
  () => ({
    routeRestartLanguageServer: vi.fn(),
    addTemporaryNotification: vi.fn(),
  }),
);

vi.mock("utils/generatedGoEndpoints", () => ({
  route_restart_language_server: routeRestartLanguageServer,
}));

vi.mock("./notifications", () => ({
  addTemporaryNotification,
}));

describe("restartLanguageServer", () => {
  beforeEach(() => {
    resetProjectStores();
    routeRestartLanguageServer.mockReset();
    addTemporaryNotification.mockReset();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("uses the Go-generated restart helper outside deployment mode", () => {
    restartLanguageServer();

    expect(addTemporaryNotification).toHaveBeenCalledWith(
      "Restarting Language Server",
    );
    expect(routeRestartLanguageServer).toHaveBeenCalledTimes(1);
  });

  it("does nothing in deployment mode", () => {
    useShareSession.setState({ isDeploymentMode: true });

    restartLanguageServer();

    expect(addTemporaryNotification).not.toHaveBeenCalled();
    expect(routeRestartLanguageServer).not.toHaveBeenCalled();
  });
});
