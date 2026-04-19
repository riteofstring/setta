/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { OverviewTabNameEnum } from "utils/constants";
import {
  PluginRuntimeStateEnum,
  type PluginStatusEntry,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageServerStatusBanner } from "./LanguageServerStatusBanner";

let selectedPythonPlugin: string | null | undefined;
let runtimeStatus: "idle" | "loading" | "loaded" | "error";
let serverMode: "ide" | "launcher" | "share" | "app" | null;
let pluginStatusById: Record<string, PluginStatusEntry>;
let statusEntries: PluginStatusEntry[];
let isDeploymentMode: boolean;

const onOverviewTabClickMock = vi.fn();

vi.mock("components/Panes/paneFns", () => ({
  onOverviewTabClick: (...args: unknown[]) => onOverviewTabClickMock(...args),
}));

vi.mock("plugins/runtime", () => ({
  usePluginRuntimeStore: (
    selector: (state: {
      status: "idle" | "loading" | "loaded" | "error";
      serverMode: "ide" | "launcher" | "share" | "app" | null;
      pluginStatusById: Record<string, PluginStatusEntry>;
      statusEntries: PluginStatusEntry[];
    }) => unknown,
  ) =>
    selector({
      status: runtimeStatus,
      serverMode,
      pluginStatusById,
      statusEntries,
    }),
}));

vi.mock("state/definitions", () => ({
  useSettings: (
    selector: (state: {
      languageServer: {
        selectedByLanguage: {
          python?: string | null;
        };
      };
    }) => unknown,
  ) =>
    selector({
      languageServer: {
        selectedByLanguage:
          selectedPythonPlugin === undefined
            ? {}
            : { python: selectedPythonPlugin },
      },
    }),
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

function buildPluginStatusEntry(
  overrides: Partial<PluginStatusEntry>,
): PluginStatusEntry {
  return {
    pluginId: "setta-example-plugin",
    name: "Example Plugin",
    version: "1.0.0",
    state: PluginRuntimeStateEnum.active,
    sourceScope: "workspace",
    sourceScopeLabel: "workspace",
    sourceManager: "setta",
    sourceManagerHint: null,
    sourcePath: "/tmp/setta-example-plugin",
    canonicalSourceKey: "github:example/plugin",
    sourceDigestSha256: null,
    shadowedBySourcePath: null,
    requestedCapabilities: [],
    effectiveCapabilities: [],
    blockedCapabilities: [],
    components: [],
    registeredCodegenTargets: [],
    registeredLanguageServers: [],
    appliedLanguageServerLanguages: [],
    registeredBackendRoutes: [],
    registeredStaticDirs: [],
    registeredListenerEndpoints: [],
    enablementSource: null,
    restartRequired: false,
    runtimePayloadDigestSha256: "digest",
    errors: [],
    ...overrides,
  };
}

describe("LanguageServerStatusBanner", () => {
  beforeEach(() => {
    selectedPythonPlugin = undefined;
    runtimeStatus = "loaded";
    serverMode = "ide";
    pluginStatusById = {};
    statusEntries = [];
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

  it("stays hidden while plugin runtime is unresolved", async () => {
    runtimeStatus = "idle";
    serverMode = null;

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

  it("stays hidden in launcher mode", async () => {
    serverMode = "launcher";

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

  it("warns when Python language-server selection is explicitly cleared", async () => {
    selectedPythonPlugin = null;

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

  it("warns when Python remains applied after the selection is cleared", async () => {
    selectedPythonPlugin = null;
    statusEntries = [
      buildPluginStatusEntry({
        pluginId: "setta-basedpyright",
        appliedLanguageServerLanguages: ["python"],
        registeredLanguageServers: [
          {
            pluginId: "setta-basedpyright",
            name: "Python LSP",
            language: "python",
            command: "/bin/pyright",
            args: ["--stdio"],
            settingsKey: "basedpyright",
          },
        ],
      }),
    ];

    const { host, root } = await renderBanner();

    try {
      expect(
        host.querySelector(
          '[data-testid="python-language-server-status-banner"]',
        )?.textContent,
      ).toContain("Restart is still required before it is turned off");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("warns when a same-id replacement copy is active but the old one is still applied", async () => {
    selectedPythonPlugin = "setta-basedpyright";
    statusEntries = [
      buildPluginStatusEntry({
        pluginId: "setta-basedpyright",
        state: PluginRuntimeStateEnum.invalid,
        sourceScope: "workspace",
        sourceScopeLabel: "workspace",
        sourcePath: "/workspace/setta-basedpyright",
        canonicalSourceKey: "local:/workspace/setta-basedpyright",
        appliedLanguageServerLanguages: ["python"],
      }),
      buildPluginStatusEntry({
        pluginId: "setta-basedpyright",
        state: PluginRuntimeStateEnum.active,
        sourceScope: "setta_files",
        sourceScopeLabel: "setta_files",
        sourcePath: "/setta-files/plugins/setta-basedpyright",
        canonicalSourceKey: "local:/setta-files/plugins/setta-basedpyright",
        registeredLanguageServers: [
          {
            pluginId: "setta-basedpyright",
            name: "basedpyright",
            language: "python",
            command: "/bin/python",
            args: ["-c", "from basedpyright.langserver import main; main()"],
            settingsKey: "basedpyright",
          },
        ],
      }),
    ];
    pluginStatusById = {
      "setta-basedpyright": statusEntries[0],
    };

    const { host, root } = await renderBanner();

    try {
      expect(
        host.querySelector(
          '[data-testid="python-language-server-status-banner"]',
        )?.textContent,
      ).toContain(
        'Selected Python language server plugin "setta-basedpyright" is still applied, but restart is still required before the current workspace/plugin state takes effect.',
      );
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("stays hidden when the selected plugin is active for Python", async () => {
    selectedPythonPlugin = "setta-python-lsp";
    pluginStatusById = {
      "setta-python-lsp": buildPluginStatusEntry({
        pluginId: "setta-python-lsp",
        appliedLanguageServerLanguages: ["python"],
        registeredLanguageServers: [
          {
            pluginId: "setta-python-lsp",
            name: "Python LSP",
            language: "python",
            command: "/bin/pyright",
            args: ["--stdio"],
            settingsKey: "pythonLanguageServer",
          },
        ],
      }),
    };
    statusEntries = Object.values(pluginStatusById);

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

  it("warns when the selected plugin is available but still pending application", async () => {
    selectedPythonPlugin = "setta-python-lsp";
    pluginStatusById = {
      "setta-python-lsp": buildPluginStatusEntry({
        pluginId: "setta-python-lsp",
        registeredLanguageServers: [
          {
            pluginId: "setta-python-lsp",
            name: "Python LSP",
            language: "python",
            command: "/bin/pyright",
            args: ["--stdio"],
            settingsKey: "pythonLanguageServer",
          },
        ],
      }),
    };
    statusEntries = Object.values(pluginStatusById);

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
    selectedPythonPlugin = "setta-missing-python-lsp";

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
    selectedPythonPlugin = "setta-fixturedsl";
    pluginStatusById = {
      "setta-fixturedsl": buildPluginStatusEntry({
        pluginId: "setta-fixturedsl",
        registeredLanguageServers: [
          {
            pluginId: "setta-fixturedsl",
            name: "Fixture DSL LSP",
            language: "fixturedsl",
            command: "/bin/fixture-lsp",
            args: ["--stdio"],
            settingsKey: "fixtureLanguageServer",
          },
        ],
      }),
    };
    statusEntries = Object.values(pluginStatusById);

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

  it("uses the primary plugin status entry from the runtime store", async () => {
    selectedPythonPlugin = "setta-shadowed-python";
    pluginStatusById = {
      "setta-shadowed-python": buildPluginStatusEntry({
        pluginId: "setta-shadowed-python",
        registeredLanguageServers: [
          {
            pluginId: "setta-shadowed-python",
            name: "Fixture DSL LSP",
            language: "fixturedsl",
            command: "/bin/fixture-lsp",
            args: ["--stdio"],
            settingsKey: "fixtureLanguageServer",
          },
        ],
      }),
    };
    statusEntries = Object.values(pluginStatusById);

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

  it("warns when the selected plugin is invalid instead of calling it non-Python", async () => {
    selectedPythonPlugin = "setta-basedpyright";
    pluginStatusById = {
      "setta-basedpyright": buildPluginStatusEntry({
        pluginId: "setta-basedpyright",
        state: PluginRuntimeStateEnum.invalid,
        registeredLanguageServers: [],
        errors: [
          {
            code: "backend_runtime_invalid",
            message: "probe failed",
          },
        ],
      }),
    };
    statusEntries = Object.values(pluginStatusById);

    const { host, root } = await renderBanner();

    try {
      const bannerText =
        host.querySelector(
          '[data-testid="python-language-server-status-banner"]',
        )?.textContent ?? "";
      expect(bannerText).toContain("is unavailable");
      expect(bannerText).not.toContain("does not provide Python");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("warns when the selected plugin is invalid but still applied until restart", async () => {
    selectedPythonPlugin = "setta-basedpyright";
    pluginStatusById = {
      "setta-basedpyright": buildPluginStatusEntry({
        pluginId: "setta-basedpyright",
        state: PluginRuntimeStateEnum.invalid,
        appliedLanguageServerLanguages: ["python"],
        registeredLanguageServers: [],
      }),
    };
    statusEntries = Object.values(pluginStatusById);

    const { host, root } = await renderBanner();

    try {
      const bannerText =
        host.querySelector(
          '[data-testid="python-language-server-status-banner"]',
        )?.textContent ?? "";
      expect(bannerText).toContain("is still applied");
      expect(bannerText).toContain("restart is still required");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
