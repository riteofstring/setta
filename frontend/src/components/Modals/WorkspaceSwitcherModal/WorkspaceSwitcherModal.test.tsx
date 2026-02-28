import * as Dialog from "@radix-ui/react-dialog";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createPendingWorkspaceLaunchFromIntent,
  WorkspaceSwitcherModal,
} from "./WorkspaceSwitcherModal";

vi.mock("state/actions/modal", () => ({
  closeModal: vi.fn(),
}));

const { routeCreateWorkspaceLaunchIntentMock, routeGetSettaHomeInfoMock } =
  vi.hoisted(() => ({
    routeCreateWorkspaceLaunchIntentMock: vi.fn(),
    routeGetSettaHomeInfoMock: vi.fn(),
  }));

vi.mock("utils/generatedEndpoints", () => ({
  route_create_workspace_launch_intent: routeCreateWorkspaceLaunchIntentMock,
  route_get_setta_home_info: routeGetSettaHomeInfoMock,
}));

describe("WorkspaceSwitcherModal", () => {
  beforeEach(() => {
    routeCreateWorkspaceLaunchIntentMock.mockReset();
  });

  it("renders desktop launcher management controls", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <Dialog.Root open>
          <Dialog.Content>
            <WorkspaceSwitcherModal />
          </Dialog.Content>
        </Dialog.Root>
      </MemoryRouter>,
    );

    expect(markup).toContain("Desktop Launcher");
    expect(markup).toContain("Setup Desktop App");
    expect(markup).toContain("Repair Desktop App");
    expect(markup).toContain("Remove Desktop App");
  });

  it("creates tokenized pending launch data from launch intent response", async () => {
    routeCreateWorkspaceLaunchIntentMock.mockResolvedValue({
      status: 200,
      data: {
        ok: true,
        launchIntentToken: "intent-token-123",
        requestedAt: 456,
      },
    });
    const launchRequest = {
      workspaceRoot: "/tmp/workspace",
      settaFilesLocation: "auto",
      sshTarget: null,
      sshArgs: null,
      remoteCmd: null,
      localPort: null,
    };

    const result = await createPendingWorkspaceLaunchFromIntent({
      launchRequest,
      returnUrl: "http://launcher.local/home",
    });

    expect(routeCreateWorkspaceLaunchIntentMock).toHaveBeenCalledWith({
      launchRequest,
      returnUrl: "http://launcher.local/home",
    });
    expect(result).toEqual({
      ok: true,
      pendingLaunch: {
        request: {
          launchIntentToken: "intent-token-123",
        },
        returnUrl: "http://launcher.local/home",
        requestedAt: 456,
        sshTarget: null,
        settaFilesLocation: "auto",
      },
    });
  });

  it("surfaces launch-intent endpoint errors", async () => {
    routeCreateWorkspaceLaunchIntentMock.mockResolvedValue({
      status: 503,
      data: {
        detail: "Launch intent store unavailable.",
      },
    });

    const result = await createPendingWorkspaceLaunchFromIntent({
      launchRequest: {
        workspaceRoot: "/tmp/workspace",
      },
      returnUrl: "http://launcher.local/home",
    });

    expect(result).toEqual({
      ok: false,
      message: "Launch intent store unavailable.",
    });
  });
});
