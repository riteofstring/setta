/* @vitest-environment jsdom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DesktopLauncherSettingsSection } from "./DesktopLauncherSettingsSection";

const launcherMocks = vi.hoisted(() => ({
  getLauncherStatusMock: vi.fn(),
  removeLauncherMock: vi.fn(),
  repairLauncherMock: vi.fn(),
  setupLauncherMock: vi.fn(),
  updateLauncherMock: vi.fn(),
}));

vi.mock("openapi/http", () => ({
  getLauncherStatus: launcherMocks.getLauncherStatusMock,
  removeLauncher: launcherMocks.removeLauncherMock,
  repairLauncher: launcherMocks.repairLauncherMock,
  setupLauncher: launcherMocks.setupLauncherMock,
  updateLauncher: launcherMocks.updateLauncherMock,
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

type RenderedSection = {
  host: HTMLDivElement;
  root: Root;
};

const originalReactActEnvironment = (
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT;
const originalUserAgent = window.navigator.userAgent;

let renderedSection: RenderedSection | null = null;

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

function setUserAgent(value: string) {
  Object.defineProperty(window.navigator, "userAgent", {
    value,
    configurable: true,
  });
}

function buildSuccessResponse<T>(data: T) {
  return Promise.resolve({
    status: 200,
    hasResponse: true,
    data,
  });
}

function getButtonByText(host: HTMLElement, label: string): HTMLButtonElement {
  const buttons = Array.from(host.querySelectorAll("button"));
  const button = buttons.find(
    (element) => element.textContent?.trim() === label,
  );
  if (!button) {
    throw new Error(`Missing button: ${label}`);
  }
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Expected button for label: ${label}`);
  }
  return button;
}

async function flushLauncherSection(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

async function renderLauncherSection(
  props: Partial<Parameters<typeof DesktopLauncherSettingsSection>[0]> = {},
): Promise<RenderedSection> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(createElement(DesktopLauncherSettingsSection, props));
  });
  await flushLauncherSection();

  const rendered = { host, root };
  renderedSection = rendered;
  return rendered;
}

async function unmountLauncherSection(
  rendered: RenderedSection | null,
): Promise<void> {
  if (!rendered) {
    return;
  }
  await act(async () => {
    rendered.root.unmount();
  });
  rendered.host.remove();
}

describe("DesktopLauncherSettingsSection", () => {
  beforeEach(() => {
    setReactActEnvironment(true);
    setUserAgent(originalUserAgent);
    launcherMocks.getLauncherStatusMock.mockReset();
    launcherMocks.removeLauncherMock.mockReset();
    launcherMocks.repairLauncherMock.mockReset();
    launcherMocks.setupLauncherMock.mockReset();
    launcherMocks.updateLauncherMock.mockReset();
  });

  afterEach(async () => {
    await unmountLauncherSection(renderedSection);
    renderedSection = null;
    setReactActEnvironment(originalReactActEnvironment);
    setUserAgent(originalUserAgent);
    document.body.innerHTML = "";
  });

  it("shows the fresh-install setup state when the launcher is not installed", async () => {
    launcherMocks.getLauncherStatusMock.mockResolvedValue(
      buildSuccessResponse({
        ok: true,
        installed: false,
        updateCapability: "unsupported",
      }),
    );

    const { host } = await renderLauncherSection();

    expect(host.textContent).toContain("Setup Desktop App");
    expect(host.textContent).not.toContain("Update Setta");
  });

  it("reuses the current launcher defaults when rerunning setup", async () => {
    launcherMocks.getLauncherStatusMock.mockResolvedValue(
      buildSuccessResponse({
        ok: true,
        installed: true,
        updateCapability: "in_app",
        channel: "uv-tool",
        openMode: "browser",
        workspaceBehavior: "always_prompt",
        managedArtifacts: {
          desktop: "/tmp/setta.desktop",
        },
        artifactOptions: {
          app_name: "Setta",
        },
      }),
    );
    launcherMocks.setupLauncherMock.mockResolvedValue(
      buildSuccessResponse({
        ok: true,
        installed: true,
        updateCapability: "in_app",
      }),
    );

    const { host } = await renderLauncherSection({
      settaHome: " /tmp/setta-home ",
    });

    expect(host.textContent).toContain("Re-run Setup");

    await act(async () => {
      getButtonByText(host, "Re-run Setup").click();
    });
    await flushLauncherSection();

    expect(launcherMocks.setupLauncherMock).toHaveBeenCalledWith({
      body: {
        settaHome: "/tmp/setta-home",
        installArtifacts: true,
        channel: "uv-tool",
        openMode: "browser",
        workspaceBehavior: "always_prompt",
        artifactOptions: {
          app_name: "Setta",
        },
      },
    });
    expect(host.textContent).toContain("Launcher setup is complete.");
  });

  it("surfaces installer-managed update guidance and OS-specific instructions when update preflight blocks in-app updates", async () => {
    setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2)");
    launcherMocks.getLauncherStatusMock
      .mockResolvedValueOnce(
        buildSuccessResponse({
          ok: true,
          installed: true,
          updateCapability: "in_app",
        }),
      )
      .mockResolvedValueOnce(
        buildSuccessResponse({
          ok: true,
          installed: true,
          updateCapability: "installer_managed",
          updateGuidance: "Use the installer to update Setta.",
        }),
      );

    const { host } = await renderLauncherSection({
      settaHome: "/tmp/setta-home",
    });

    await act(async () => {
      getButtonByText(host, "Update Setta").click();
    });
    await flushLauncherSection();

    expect(launcherMocks.updateLauncherMock).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Use the installer to update Setta.");
    expect(host.textContent).toContain("Installer-managed update steps");
    expect(host.textContent).toContain(
      "Download the latest Setta macOS installer package.",
    );
    expect(host.textContent).toContain(
      "Run the installer again to update launcher bindings.",
    );
    expect(host.textContent).toContain("Update progress: failed");
  });
});
