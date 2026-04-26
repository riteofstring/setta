/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import "testUtils/reactRefreshPreamble";
import { loadWorkspaceHistory } from "utils/workspaceHistory";
import {
  resolveWorkspaceLaunchBackNavigation,
  resolveWorkspaceLaunchReturnUrl,
} from "utils/workspaceLaunchNavigation";
import {
  readWorkspaceSwitcherDraft,
  writePendingWorkspaceLaunch,
  type PendingWorkspaceLaunch,
} from "utils/workspaceSwitcherLaunch";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkspaceLaunchPage } from "./WorkspaceLaunchPage";

const { launchWorkspaceMock } = vi.hoisted(() => ({
  launchWorkspaceMock: vi.fn(),
}));

vi.mock("openapi/http", async () => {
  const actual =
    await vi.importActual<typeof import("openapi/http")>("openapi/http");
  return {
    ...actual,
    launchWorkspace: launchWorkspaceMock,
  };
});

type RenderedPage = {
  host: HTMLDivElement;
  root: Root;
};

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem(key: string): string | null {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      values.set(key, value);
    },
    removeItem(key: string): void {
      values.delete(key);
    },
    clear(): void {
      values.clear();
    },
    key(index: number): string | null {
      return Array.from(values.keys())[index] ?? null;
    },
    get length(): number {
      return values.size;
    },
  };
}

const originalReactActEnvironment = (
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT;
const originalLocalStorage = window.localStorage;
const originalSessionStorage = window.sessionStorage;
const localStorageStub = createMemoryStorage();
const sessionStorageStub = createMemoryStorage();

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

async function flushWorkspaceLaunch(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

async function renderWorkspaceLaunchPage(): Promise<RenderedPage> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(
      <MemoryRouter>
        <WorkspaceLaunchPage />
      </MemoryRouter>,
    );
  });
  await flushWorkspaceLaunch();

  const rendered = { host, root };
  renderedPage = rendered;
  return rendered;
}

async function unmountWorkspaceLaunchPage(
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

function writeTestPendingLaunch(
  pending: PendingWorkspaceLaunch,
): PendingWorkspaceLaunch {
  writePendingWorkspaceLaunch(pending);
  return pending;
}

describe("WorkspaceLaunchPage return URL helpers", () => {
  it("falls back to /home when the value is missing", () => {
    const resolved = resolveWorkspaceLaunchReturnUrl(
      null,
      "http://launcher.local/launching",
    );
    expect(resolved).toBe("http://launcher.local/home");
  });

  it("resolves relative paths against the current launcher origin", () => {
    const resolved = resolveWorkspaceLaunchReturnUrl(
      "/projects/demo",
      "http://launcher.local/launching",
    );
    expect(resolved).toBe("http://launcher.local/projects/demo");
  });

  it("rejects cross-origin pending return URLs until the backend confirms them", () => {
    const resolved = resolveWorkspaceLaunchReturnUrl(
      "https://trusted.example/home?foo=1#top",
      "http://launcher.local/launching",
    );
    expect(resolved).toBe("http://launcher.local/home");
  });

  it("preserves cross-origin backend-validated return URLs", () => {
    const resolved = resolveWorkspaceLaunchReturnUrl(
      "https://trusted.example/home?foo=1#top",
      "http://launcher.local/launching",
      "backend-validated",
    );
    expect(resolved).toBe("https://trusted.example/home?foo=1#top");
  });

  it("rejects non-http(s) schemes", () => {
    const resolved = resolveWorkspaceLaunchReturnUrl(
      "javascript:alert('xss')",
      "http://launcher.local/launching",
    );
    expect(resolved).toBe("http://launcher.local/home");
  });
});

describe("WorkspaceLaunchPage back navigation helpers", () => {
  it("keeps same-origin return URLs in app navigation", () => {
    const resolved = resolveWorkspaceLaunchBackNavigation(
      "/projects/demo?tab=recent#pane",
      "http://launcher.local/launching",
    );

    expect(resolved).toEqual({
      kind: "navigate",
      target:
        "/projects/demo?tab=recent&__setta_open_workspace_switcher=1#pane",
    });
  });

  it("preserves backend-validated cross-origin returns as full redirects", () => {
    const resolved = resolveWorkspaceLaunchBackNavigation(
      "https://trusted.example/home?foo=1#top",
      "https://current.example/launching",
      "backend-validated",
    );

    expect(resolved).toEqual({
      kind: "assign",
      target:
        "https://trusted.example/home?foo=1&__setta_open_workspace_switcher=1#top",
    });
  });

  it("falls back to local navigation for untrusted cross-origin returns", () => {
    const resolved = resolveWorkspaceLaunchBackNavigation(
      "https://trusted.example/home?foo=1#top",
      "https://current.example/launching",
    );

    expect(resolved).toEqual({
      kind: "navigate",
      target: "/home?__setta_open_workspace_switcher=1",
    });
  });

  it("falls back to local home navigation for invalid schemes", () => {
    const resolved = resolveWorkspaceLaunchBackNavigation(
      "javascript:alert('xss')",
      "http://launcher.local/launching",
    );

    expect(resolved).toEqual({
      kind: "navigate",
      target: "/home?__setta_open_workspace_switcher=1",
    });
  });
});

describe("WorkspaceLaunchPage component behavior", () => {
  beforeEach(() => {
    setReactActEnvironment(true);
    launchWorkspaceMock.mockReset();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: localStorageStub,
    });
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: sessionStorageStub,
    });
    localStorageStub.clear();
    sessionStorageStub.clear();
    window.history.replaceState(null, "", "/launching");
  });

  afterEach(async () => {
    await unmountWorkspaceLaunchPage(renderedPage);
    renderedPage = null;
    document.body.innerHTML = "";
    localStorageStub.clear();
    sessionStorageStub.clear();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: originalLocalStorage,
    });
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: originalSessionStorage,
    });
    window.history.replaceState(null, "", "/launching");
    setReactActEnvironment(originalReactActEnvironment);
  });

  it("shows migration guidance for outdated settings launch errors", async () => {
    writeTestPendingLaunch({
      request: {
        launchIntentToken: "launch-outdated-settings",
        workspaceRoot: "/tmp/pending-workspace",
      } as PendingWorkspaceLaunch["request"],
      returnUrl: "http://localhost/home",
      requestedAt: Date.now() - 5_000,
    });
    launchWorkspaceMock.mockResolvedValue({
      data: {
        ok: false,
        error: {
          code: "OutdatedProjectSettings",
          message: "backend detail",
        },
      },
      response: new Response(null, { status: 200 }),
    });

    const rendered = await renderWorkspaceLaunchPage();

    expect(rendered.host.textContent).toContain(
      "older Setta settings/project format",
    );
    expect(rendered.host.textContent).toContain("migrate the project metadata");
    expect(rendered.host.textContent).toContain("/tmp/pending-workspace");
  });

  it("falls back to a generic launch error when the backend message is blank", async () => {
    writeTestPendingLaunch({
      request: {
        launchIntentToken: "launch-blank-error",
        workspaceRoot: "/tmp/pending-workspace",
      } as PendingWorkspaceLaunch["request"],
      returnUrl: "http://localhost/home",
      requestedAt: Date.now() - 1_500,
    });
    launchWorkspaceMock.mockResolvedValue({
      data: {
        ok: false,
        error: {
          code: null,
          message: "   ",
        },
      },
      response: new Response(null, { status: 200 }),
    });

    const rendered = await renderWorkspaceLaunchPage();

    expect(rendered.host.textContent).toContain("Launch failed.");
  });

  it("persists the canonical launched workspace root on successful launches", async () => {
    writeTestPendingLaunch({
      request: {
        launchIntentToken: "launch-success",
        workspaceRoot: "/tmp/pending-workspace",
        sshTarget: "dev@example.com",
        localPort: 4312,
        settaFilesLocation: "local",
      } as PendingWorkspaceLaunch["request"],
      returnUrl: "http://localhost/home",
      requestedAt: Date.now() - 2_500,
    });
    launchWorkspaceMock.mockResolvedValue({
      data: {
        ok: true,
        bootstrapUrlFragment: "#bootstrap=1",
        workspaceRoot: "/tmp/response-workspace",
        session: {
          workspacePathCanonical: "/private/tmp/canonical-workspace",
        },
        settaFilesLocation: "local",
      },
      response: new Response(null, { status: 200 }),
    });

    await renderWorkspaceLaunchPage();

    expect(readWorkspaceSwitcherDraft()).toMatchObject({
      workspaceRoot: "/private/tmp/canonical-workspace",
      localPort: 4312,
      settaFilesLocation: "local",
    });
    expect(loadWorkspaceHistory()).toEqual([
      expect.objectContaining({
        workspaceRoot: "/private/tmp/canonical-workspace",
        sshTarget: "dev@example.com",
        localPort: 4312,
        settaFilesLocation: "local",
      }),
    ]);
    expect(window.location.hash).toContain("bootstrap=1");
  });
});
