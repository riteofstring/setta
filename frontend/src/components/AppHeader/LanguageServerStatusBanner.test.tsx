/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { OverviewTabNameEnum } from "utils/constants";
import {
  SelectedLanguageServerStateEnum,
  type SelectedLanguageServerStatus,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageServerStatusBanner } from "./LanguageServerStatusBanner";

let runtimeStatus: "idle" | "loading" | "loaded" | "error";
let serverMode: "ide" | "share" | "app" | null;
let selectedLanguageServers: SelectedLanguageServerStatus[];
let isDeploymentMode: boolean;

const onOverviewTabClickMock = vi.fn();

vi.mock("components/Panes/paneFns", () => ({
  onOverviewTabClick: (...args: unknown[]) => onOverviewTabClickMock(...args),
}));

vi.mock("plugins/runtime", () => ({
  usePluginRuntimeStore: (
    selector: (state: {
      status: "idle" | "loading" | "loaded" | "error";
      serverMode: "ide" | "share" | "app" | null;
      selectedLanguageServers: SelectedLanguageServerStatus[];
    }) => unknown,
  ) =>
    selector({
      status: runtimeStatus,
      serverMode,
      selectedLanguageServers,
    }),
}));

vi.mock("state/definitions", () => ({
  useShareSession: (
    selector: (state: { isDeploymentMode: boolean }) => unknown,
  ) =>
    selector({
      isDeploymentMode,
    }),
}));

type RenderedBanner = {
  host: HTMLDivElement;
  root: Root;
};

async function renderBanner(): Promise<RenderedBanner> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(<LanguageServerStatusBanner />);
  });

  return { host, root };
}

function buildPythonStatus(
  overrides: Partial<SelectedLanguageServerStatus>,
): SelectedLanguageServerStatus {
  return {
    languageId: "python",
    selectedPluginId: null,
    state: SelectedLanguageServerStateEnum.not_selected,
    applied: true,
    ...overrides,
  };
}

describe("LanguageServerStatusBanner", () => {
  beforeEach(() => {
    runtimeStatus = "loaded";
    serverMode = "ide";
    selectedLanguageServers = [buildPythonStatus({})];
    isDeploymentMode = false;
    onOverviewTabClickMock.mockReset();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("warns when Python has never been selected for the workspace", async () => {
    const { host, root } = await renderBanner();

    try {
      expect(
        host.querySelector(
          '[data-testid="python-language-server-status-banner"]',
        )?.textContent,
      ).toContain("Python language server is not selected");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("warns when Python language-server selection is explicitly cleared", async () => {
    selectedLanguageServers = [
      buildPythonStatus({
        state: SelectedLanguageServerStateEnum.disabled,
      }),
    ];

    const { host, root } = await renderBanner();

    try {
      expect(
        host.querySelector(
          '[data-testid="python-language-server-status-banner"]',
        )?.textContent,
      ).toContain("turned off for this workspace");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("stays hidden when the selected plugin is active for Python", async () => {
    selectedLanguageServers = [
      buildPythonStatus({
        selectedPluginId: "setta-python-lsp",
        state: SelectedLanguageServerStateEnum.ready,
        applied: true,
      }),
    ];

    const { host, root } = await renderBanner();

    try {
      expect(
        host.querySelector(
          '[data-testid="python-language-server-status-banner"]',
        ),
      ).toBeNull();
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("warns when the selected plugin is ready but not yet applied", async () => {
    selectedLanguageServers = [
      buildPythonStatus({
        selectedPluginId: "setta-python-lsp",
        state: SelectedLanguageServerStateEnum.ready,
        applied: false,
      }),
    ];

    const { host, root } = await renderBanner();

    try {
      expect(
        host.querySelector(
          '[data-testid="python-language-server-status-banner"]',
        )?.textContent,
      ).toContain("restart is still required");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("warns when the selected plugin is missing and opens Plugins on click", async () => {
    selectedLanguageServers = [
      buildPythonStatus({
        selectedPluginId: "setta-missing-python-lsp",
        state: SelectedLanguageServerStateEnum.selected_plugin_missing,
      }),
    ];

    const { host, root } = await renderBanner();

    try {
      const banner = host.querySelector(
        '[data-testid="python-language-server-status-banner"]',
      );
      expect(banner?.textContent).toContain("setta-missing-python-lsp");

      const pluginsButton = banner?.querySelector("button");
      if (!(pluginsButton instanceof HTMLButtonElement)) {
        throw new Error("Expected Plugins button.");
      }

      await act(async () => {
        pluginsButton.click();
      });

      expect(onOverviewTabClickMock).toHaveBeenCalledWith(
        OverviewTabNameEnum.Plugins,
      );
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("warns when the selected plugin does not provide Python", async () => {
    selectedLanguageServers = [
      buildPythonStatus({
        selectedPluginId: "setta-fixturedsl",
        state: SelectedLanguageServerStateEnum.selected_plugin_wrong_language,
      }),
    ];

    const { host, root } = await renderBanner();

    try {
      expect(
        host.querySelector(
          '[data-testid="python-language-server-status-banner"]',
        )?.textContent,
      ).toContain("does not provide Python");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
