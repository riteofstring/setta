/* @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => {
  (
    globalThis as typeof globalThis & {
      ResizeObserver?: typeof ResizeObserver;
    }
  ).ResizeObserver = class ResizeObserver {
    disconnect() {}
    observe() {}
    unobserve() {}
  };
  const rendererMount = vi.fn((target: HTMLElement) => {
    target.textContent = "app route loaded";
  });
  return {
    appModeRoute: {
      renderer: {
        mount: rendererMount,
        unmount: vi.fn(),
      },
    },
    appSubsystemStatus: "loaded",
    appSubsystemStatusMessage: null as string | null,
    initializeAppSessionFromCurrentDeployment: vi.fn(),
    openWebSocket: vi.fn(),
    rendererMount,
    runtimeStore: {
      appSubsystemCapabilities: {
        appAuthoringUi: true,
        appDeploymentRuntime: true,
        appGenerationChatModes: true,
        appPreviewUi: true,
        pluginEnabled: true,
        pluginId: "setta-json-render-app-gen",
      },
      status: "loaded",
      statusMessage: null as string | null,
    },
    shareSessionId: "app-session-1" as string | null,
  };
});

vi.mock("plugins/appSubsystem", () => ({
  getAppSubsystemDeploymentRuntimeUnavailableMessage: () =>
    "App mode is unavailable.",
  initializeAppSessionFromCurrentDeployment: (...args: unknown[]) =>
    routeMocks.initializeAppSessionFromCurrentDeployment(...args),
  useAppSubsystemAppModeRoute: () => routeMocks.appModeRoute,
  useAppSubsystemFrontendStatus: () => routeMocks.appSubsystemStatus,
  useAppSubsystemFrontendStatusMessage: () =>
    routeMocks.appSubsystemStatusMessage,
}));

vi.mock("components/AppHeader/Header", () => ({
  HeaderContainer: () => <div />,
}));

vi.mock("components/Modals/ModalContainer", () => ({
  ModalContainer: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("components/Pages/AppShell", () => ({
  AppShell: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("components/Pages/Home/HomePage", () => ({
  HomePage: () => <div />,
}));

vi.mock("components/Pages/Launch/WorkspaceLaunchPage", () => ({
  WorkspaceLaunchPage: () => <div />,
}));

vi.mock("components/Pages/Launcher/LauncherHomePage", () => ({
  LauncherHomePage: () => <div />,
}));

vi.mock("components/Pages/LoadingSpinner", () => ({
  LoadingSpinner: () => <div>loading</div>,
}));

vi.mock("components/Pages/NotFound/NotFound", () => ({
  NotFound: () => <div>not found</div>,
}));

vi.mock("components/Pages/Share/ShareMainContainer", () => ({
  ShareMainContainer: () => <div />,
}));

vi.mock("components/Pages/Share/ShareWrapper", () => ({
  ShareWrapper: ({
    children,
  }: {
    children?:
      | ReactNode
      | ((state: { doneLoading: boolean; is404: boolean }) => ReactNode);
  }) => (
    <div>
      {typeof children === "function"
        ? children({ doneLoading: true, is404: false })
        : children}
    </div>
  ),
}));

vi.mock("plugins/appSubsystemFrontendHost", () => ({
  createRuntimeAppSubsystemFrontendHost: () => ({ apiVersion: 1 }),
}));

vi.mock("plugins/runtime", () => ({
  usePluginRuntimeBootstrap: vi.fn(),
  usePluginRuntimeStore: (selector: (state: unknown) => unknown) =>
    selector(routeMocks.runtimeStore),
}));

vi.mock("state/actions/websocketReceive", () => ({
  openWebSocket: (...args: unknown[]) => routeMocks.openWebSocket(...args),
}));

vi.mock("state/definitions", () => ({
  useAllProjectMetadata: () => null,
  useServerMode: () => null,
  useSettings: () => null,
  useShareSession: (
    selector: (state: { shareSessionId: string | null }) => unknown,
  ) => selector({ shareSessionId: routeMocks.shareSessionId }),
}));

vi.mock("./GlobalWrapper", () => ({
  GlobalWrapper: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  IndexRouteComponent: () => <div />,
}));

vi.mock("./Project/MainContainer", () => ({
  MainContainer: () => <div />,
}));

vi.mock("./Project/ShareStandaloneProjectSurfacePage", () => ({
  ShareStandaloneProjectSurfacePage: () => <div />,
}));

vi.mock("./Project/StandaloneProjectSurfacePage", () => ({
  StandaloneProjectSurfacePage: () => <div />,
}));

import { AppModeRouteElement } from "./router";

type Deferred<T> = {
  promise: Promise<T>;
  reject: (error: unknown) => void;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}

describe("AppModeRouteElement", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    document.body.innerHTML = "";
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    routeMocks.initializeAppSessionFromCurrentDeployment.mockReset();
    routeMocks.openWebSocket.mockReset();
    routeMocks.rendererMount.mockClear();
    routeMocks.shareSessionId = "app-session-1";
    routeMocks.runtimeStore.status = "loaded";
    routeMocks.runtimeStore.statusMessage = null;
    routeMocks.appSubsystemStatus = "loaded";
    routeMocks.appSubsystemStatusMessage = null;
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    document.body.innerHTML = "";
  });

  it("waits for app deployment initialization before rendering the provider route", async () => {
    const initialized = deferred<boolean>();
    routeMocks.initializeAppSessionFromCurrentDeployment.mockReturnValue(
      initialized.promise,
    );

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/app"]}>
          <AppModeRouteElement />
        </MemoryRouter>,
      );
    });

    expect(
      routeMocks.initializeAppSessionFromCurrentDeployment,
    ).toHaveBeenCalledTimes(1);
    expect(routeMocks.rendererMount).not.toHaveBeenCalled();

    await act(async () => {
      initialized.resolve(true);
      await initialized.promise;
    });

    expect(routeMocks.rendererMount).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("app route loaded");
    expect(routeMocks.openWebSocket).toHaveBeenCalledWith(
      "/app",
      "app-session-1",
    );
  });

  it("keeps the provider route hidden when app deployment initialization fails", async () => {
    routeMocks.initializeAppSessionFromCurrentDeployment.mockResolvedValue(
      false,
    );

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/app"]}>
          <AppModeRouteElement />
        </MemoryRouter>,
      );
    });

    expect(routeMocks.rendererMount).not.toHaveBeenCalled();
    expect(host.textContent).toContain(
      "Unable to load the current app deployment.",
    );
    expect(routeMocks.openWebSocket).not.toHaveBeenCalled();
  });
});
