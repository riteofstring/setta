/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useServerMode } from "state/definitions";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LauncherHomePage } from "./LauncherHomePage";

const {
  getLauncherFilesystemRootsMock,
  getLauncherRecentWorkspacesMock,
  listLauncherDirectoryMock,
  openLauncherWorkspaceMock,
  pinLauncherRecentWorkspaceMock,
  removeLauncherRecentWorkspaceMock,
} = vi.hoisted(() => ({
  getLauncherFilesystemRootsMock: vi.fn(),
  getLauncherRecentWorkspacesMock: vi.fn(),
  listLauncherDirectoryMock: vi.fn(),
  openLauncherWorkspaceMock: vi.fn(),
  pinLauncherRecentWorkspaceMock: vi.fn(),
  removeLauncherRecentWorkspaceMock: vi.fn(),
}));

vi.mock("components/Launcher/DesktopLauncherSettingsSection", () => ({
  DesktopLauncherSettingsSection: () => null,
}));

vi.mock("openapi/http", () => ({
  getLauncherFilesystemRoots: getLauncherFilesystemRootsMock,
  getLauncherRecentWorkspaces: getLauncherRecentWorkspacesMock,
  listLauncherDirectory: listLauncherDirectoryMock,
  openLauncherWorkspace: openLauncherWorkspaceMock,
  pinLauncherRecentWorkspace: pinLauncherRecentWorkspaceMock,
  removeLauncherRecentWorkspace: removeLauncherRecentWorkspaceMock,
}));

vi.mock("@setta/app-subsystem-frontend-sdk", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@setta/app-subsystem-frontend-sdk")>();
  return {
    ...actual,
    callOpenAPI: async function <T>(request: Promise<T>) {
      return request;
    },
  };
});

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

type RenderedPage = {
  host: HTMLDivElement;
  root: Root;
};

const originalReactActEnvironment = (
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT;

let renderedPage: RenderedPage | null = null;

function setReactActEnvironment(value: boolean | undefined) {
  const target = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  if (value === undefined) {
    delete target.IS_REACT_ACT_ENVIRONMENT;
    return;
  }
  target.IS_REACT_ACT_ENVIRONMENT = value;
}

function setServerMode(mode: "ide" | "launcher") {
  useServerMode.setState({
    mode,
    modeResolved: true,
    modeError: null,
  });
  syncStoreInitialState(useServerMode);
}

async function flushLauncherHome(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

async function renderLauncherHomePage(): Promise<RenderedPage> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(<LauncherHomePage />);
  });
  await flushLauncherHome();

  const rendered = { host, root };
  renderedPage = rendered;
  return rendered;
}

async function unmountLauncherHomePage(
  rendered: RenderedPage | null,
): Promise<void> {
  if (!rendered) {
    return;
  }
  await act(async () => {
    rendered.root.unmount();
  });
  rendered.host.remove();
}

function getElementByTestId<T extends HTMLElement>(
  host: HTMLElement,
  testId: string,
): T {
  const element = host.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  if (!element) {
    throw new Error(`Missing element with data-testid=${testId}`);
  }
  return element as T;
}

function setNativeInputValue(element: HTMLInputElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  );
  descriptor?.set?.call(element, value);
}

async function updateInputValue(
  element: HTMLInputElement,
  value: string,
): Promise<void> {
  await act(async () => {
    setNativeInputValue(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("LauncherHomePage component behavior", () => {
  beforeEach(() => {
    setReactActEnvironment(true);
    setServerMode("launcher");
    getLauncherFilesystemRootsMock.mockReset();
    getLauncherRecentWorkspacesMock.mockReset();
    listLauncherDirectoryMock.mockReset();
    openLauncherWorkspaceMock.mockReset();
    pinLauncherRecentWorkspaceMock.mockReset();
    removeLauncherRecentWorkspaceMock.mockReset();
    getLauncherRecentWorkspacesMock.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        ok: true,
        workspaces: [],
      },
    });
    getLauncherFilesystemRootsMock.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        ok: true,
        roots: ["/workspaces"],
      },
    });
    window.history.replaceState(null, "", "/launcher-home");
  });

  afterEach(async () => {
    await unmountLauncherHomePage(renderedPage);
    renderedPage = null;
    setReactActEnvironment(originalReactActEnvironment);
  });

  it("sanitizes created project paths through the live page flow and rejects reserved names", async () => {
    listLauncherDirectoryMock.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        ok: true,
        currentPath: "/workspaces",
        parentPath: "/",
        entries: [],
        hasMore: false,
        nextCursor: null,
        truncated: false,
        error: null,
      },
    });
    openLauncherWorkspaceMock.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        ok: true,
        bootstrapUrlFragment: null,
        error: null,
      },
    });

    const { host } = await renderLauncherHomePage();
    const newProjectInput = getElementByTestId<HTMLInputElement>(
      host,
      "launcher-new-project-name-input",
    );
    const createProjectButton = getElementByTestId<HTMLButtonElement>(
      host,
      "launcher-create-project-button",
    );

    await updateInputValue(newProjectInput, "..");
    await act(async () => {
      createProjectButton.click();
    });
    await flushLauncherHome();

    expect(openLauncherWorkspaceMock).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Project name cannot be '.' or '..'.");

    await updateInputValue(newProjectInput, " demo/child ");
    await act(async () => {
      createProjectButton.click();
    });
    await flushLauncherHome();

    expect(openLauncherWorkspaceMock).toHaveBeenCalledWith({
      body: {
        workspaceRoot: "/workspaces/demochild",
        createIfMissing: true,
        settaFilesLocation: "auto",
        settaHome: null,
      },
    });
    expect(host.textContent).toContain(
      "Workspace opened but no bootstrap URL was returned.",
    );
  });

  it("surfaces directory pagination invariants through the rendered directory picker", async () => {
    listLauncherDirectoryMock.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        ok: true,
        currentPath: "/workspaces",
        parentPath: "/",
        entries: [],
        hasMore: true,
        nextCursor: null,
        truncated: false,
        error: null,
      },
    });

    const { host } = await renderLauncherHomePage();

    expect(host.textContent).toContain(
      "Directory listing reported more results without a continuation cursor.",
    );
  });

  it("surfaces backend directory load errors through the rendered directory picker", async () => {
    listLauncherDirectoryMock.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        ok: false,
        currentPath: "/workspaces",
        parentPath: "/",
        entries: [],
        hasMore: false,
        nextCursor: null,
        truncated: false,
        error: {
          message: "Directory access denied.",
        },
      },
    });

    const { host } = await renderLauncherHomePage();

    expect(host.textContent).toContain("Directory access denied.");
  });
});
