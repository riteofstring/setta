import * as Dialog from "@radix-ui/react-dialog";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { useServerMode } from "state/definitions";
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

vi.mock("openapi/http", () => ({
  createWorkspaceLaunchIntent: routeCreateWorkspaceLaunchIntentMock,
  getSettaHomeInfo: routeGetSettaHomeInfoMock,
}));

function syncStoreInitialState(store: {
  getState: () => Record<string, unknown>;
  getInitialState?: () => Record<string, unknown>;
}) {
  if (!store.getInitialState) {
    return;
  }
  const initial = store.getInitialState();
  Object.assign(initial, store.getState());
}

describe("WorkspaceSwitcherModal", () => {
  beforeEach(() => {
    routeCreateWorkspaceLaunchIntentMock.mockReset();
    routeGetSettaHomeInfoMock.mockReset();
    useServerMode.setState({
      mode: "ide",
      modeResolved: true,
      modeError: null,
    });
    syncStoreInitialState(useServerMode);
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

  it("hides desktop launcher management controls in launcher mode", () => {
    useServerMode.setState({
      mode: "launcher",
      modeResolved: true,
      modeError: null,
    });
    syncStoreInitialState(useServerMode);

    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <Dialog.Root open>
          <Dialog.Content>
            <WorkspaceSwitcherModal />
          </Dialog.Content>
        </Dialog.Root>
      </MemoryRouter>,
    );

    expect(markup).not.toContain("Desktop Launcher");
    expect(markup).not.toContain("Setup Desktop App");
  });

  it("creates tokenized pending launch data from launch intent response", async () => {
    routeCreateWorkspaceLaunchIntentMock.mockResolvedValue({
      data: {
        ok: true,
        launchIntentToken: "intent-token-123",
        requestedAt: 456,
      },
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
    const launchRequest = {
      workspaceRoot: "/tmp/workspace",
      settaFilesLocation: "auto",
    };

    const result = await createPendingWorkspaceLaunchFromIntent({
      launchRequest,
      returnUrl: "http://launcher.local/home",
    });

    expect(routeCreateWorkspaceLaunchIntentMock).toHaveBeenCalledWith({
      body: {
        launchRequest,
        returnUrl: "http://launcher.local/home",
      },
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
      data: undefined,
      error: {
        detail: "Launch intent store unavailable.",
      },
      response: new Response(null, { status: 503 }),
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
