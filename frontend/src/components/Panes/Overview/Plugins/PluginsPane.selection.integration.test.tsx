/* @vitest-environment jsdom */

import {
  disablePlugin,
  enablePlugin,
  restartLanguageServer,
  setLanguageServerSelection,
} from "openapi/http";
import { usePluginRuntimeStore } from "plugins/runtime";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { addTemporaryNotification } from "state/actions/notifications";
import { useProjectState, useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import {
  createLanguageServerSelectionStatus,
  createPluginListEntry,
  createPluginListResponse,
  createPluginRuntimeResponse,
  createPluginStatusEntry,
  createPluginStatusResponse,
  createProjectConfig,
  LanguageServerSelectionSeverityEnum,
  LanguageServerSelectionStateEnum,
  LanguageServerSelectionStatusKindEnum,
  PluginRuntimeStateEnum,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncStoreInitialState } from "../../paneTestUtils";
import { PluginsPane } from "./PluginsPane";

vi.mock("state/actions/notifications", () => ({
  addTemporaryNotification: vi.fn(),
}));

vi.mock("openapi/http", async () => {
  const actual = await import("openapi/http");
  return {
    ...actual,
    disablePlugin: vi.fn(),
    enablePlugin: vi.fn(),
    restartLanguageServer: vi.fn(),
    setLanguageServerSelection: vi.fn(),
  };
});

type RenderedPluginsPane = {
  host: HTMLDivElement;
  root: Root;
};

function buildPluginListEntry() {
  return createPluginListEntry({
    pluginId: "setta-basedpyright",
    name: "Setta Basedpyright",
    version: "0.1.0",
    sourceScope: "setta_files",
    sourceScopeLabel: "setta_files",
    sourceManager: "package_manager",
    sourceManagerHint:
      "Managed by Python package manager in active environment. Use uv/pip/Poetry to install, update, or remove.",
    canonicalSourceKey: "pypi:setta-basedpyright",
    sourceDigestSha256: "sha256-digest",
    frontend: {
      entrypointUrl: null,
      styleUrl: null,
    },
    content: {
      hasBlueprints: false,
      hasProjectTemplates: false,
      hasPrompts: false,
    },
    config: {
      hasSchema: false,
      schemaJson: {},
      schemaJsonDigestSha256: null,
      currentConfig: {},
      currentConfigDigestSha256: null,
    },
    effectiveCapabilities: ["registerLanguageServer"],
    enablementSource: "manifest_default",
    restartRequired: false,
  });
}

function buildPluginStatusEntry({
  appliedLanguageServerLanguages = [],
}: {
  appliedLanguageServerLanguages?: string[];
} = {}) {
  return createPluginStatusEntry({
    pluginId: "setta-basedpyright",
    name: "Setta Basedpyright",
    version: "0.1.0",
    state: PluginRuntimeStateEnum.active,
    sourceScope: "setta_files",
    sourceScopeLabel: "setta_files",
    sourceManager: "package_manager",
    sourceManagerHint:
      "Managed by Python package manager in active environment. Use uv/pip/Poetry to install, update, or remove.",
    sourcePath: "/tmp/setta-basedpyright",
    canonicalSourceKey: "pypi:setta-basedpyright",
    sourceDigestSha256: "sha256-digest",
    shadowedBySourcePath: null,
    requestedCapabilities: ["registerLanguageServer"],
    effectiveCapabilities: ["registerLanguageServer"],
    blockedCapabilities: [],
    components: ["backend"],
    registeredCodegenTargets: [],
    registeredLanguageServers: [
      {
        pluginId: "setta-basedpyright",
        name: "basedpyright",
        language: "python",
        command: "/tmp/.venv/bin/python",
        args: [
          "-c",
          "from basedpyright.langserver import main; main()",
          "--stdio",
        ],
        settingsKey: "basedpyright",
      },
    ],
    appliedLanguageServerLanguages,
    registeredBackendRoutes: [],
    registeredStaticDirs: [],
    registeredListenerEndpoints: [],
    enablementSource: "manifest_default",
    restartRequired: false,
    runtimePayloadDigestSha256: "runtime-digest",
    errors: [],
  });
}

function buildPythonSelectionStatus(options?: {
  message?: string;
  restartRequired?: boolean;
  selectedPluginId?: string | null;
  severity?:
    | typeof LanguageServerSelectionSeverityEnum.default
    | typeof LanguageServerSelectionSeverityEnum.warning
    | typeof LanguageServerSelectionSeverityEnum.success;
  selectionState?:
    | typeof LanguageServerSelectionStateEnum.unset
    | typeof LanguageServerSelectionStateEnum.disabled
    | typeof LanguageServerSelectionStateEnum.selected;
  status?:
    | typeof LanguageServerSelectionStatusKindEnum.unselected
    | typeof LanguageServerSelectionStatusKindEnum.disabled
    | typeof LanguageServerSelectionStatusKindEnum.no_available_providers
    | typeof LanguageServerSelectionStatusKindEnum.selected_unavailable
    | typeof LanguageServerSelectionStatusKindEnum.selected_incompatible
    | typeof LanguageServerSelectionStatusKindEnum.pending_restart
    | typeof LanguageServerSelectionStatusKindEnum.active;
}) {
  const selectedPluginId = options?.selectedPluginId ?? null;
  return createLanguageServerSelectionStatus({
    language: "python",
    selectionState:
      options?.selectionState ?? LanguageServerSelectionStateEnum.unset,
    severity: options?.severity ?? LanguageServerSelectionSeverityEnum.warning,
    status: options?.status ?? LanguageServerSelectionStatusKindEnum.unselected,
    message:
      options?.message ??
      "No Python language server is selected for this workspace. Choose one below, then restart the language server to apply it.",
    selectedPluginId,
    appliedPluginId: null,
    availableProviders: [
      {
        pluginId: "setta-basedpyright",
        name: "Setta Basedpyright (setta-basedpyright)",
        available: true,
      },
      ...(selectedPluginId && selectedPluginId !== "setta-basedpyright"
        ? [
            {
              pluginId: selectedPluginId,
              name: selectedPluginId,
              available: false,
            },
          ]
        : []),
    ],
    restartRequired: options?.restartRequired ?? false,
  });
}

function buildRuntimeResponse(selectionStatus = buildPythonSelectionStatus()) {
  const pluginListEntry = buildPluginListEntry();
  const pluginStatusEntry = buildPluginStatusEntry();
  return createPluginRuntimeResponse({
    schemaVersion: 1,
    list: createPluginListResponse({
      schemaVersion: 1,
      serverMode: "ide",
      restartCapability: {
        mode: "programmatic",
        command: null,
        reason: null,
      },
      plugins: [pluginListEntry],
    }),
    status: createPluginStatusResponse({
      schemaVersion: 1,
      serverMode: "ide",
      restartCapability: {
        mode: "programmatic",
        command: null,
        reason: null,
      },
      plugins: [pluginStatusEntry],
      languageServerSelections: [selectionStatus],
    }),
  });
}

async function renderPluginsPane(): Promise<RenderedPluginsPane> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(<PluginsPane />);
  });

  return { host, root };
}

async function flushEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("PluginsPane Python language-server selection", () => {
  beforeEach(() => {
    resetProjectStores();
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({
        id: "project-alpha",
        name: "Project Alpha",
      });
    });
    useShareSession.setState({ isDeploymentMode: false });

    const pluginListEntry = buildPluginListEntry();
    const pluginStatusEntry = buildPluginStatusEntry();
    const selectionStatus = buildPythonSelectionStatus();
    const initialRuntimeState =
      usePluginRuntimeStore.getInitialState?.() ??
      usePluginRuntimeStore.getState();
    usePluginRuntimeStore.setState(
      {
        ...initialRuntimeState,
        status: "loaded",
        statusMessage: null,
        serverMode: "ide",
        restartCapability: {
          mode: "programmatic",
          command: null,
          reason: null,
        },
        sortedPluginListEntries: [pluginListEntry],
        pluginListById: {
          [pluginListEntry.pluginId]: pluginListEntry,
        },
        statusEntries: [pluginStatusEntry],
        pluginStatusById: {
          [pluginStatusEntry.pluginId]: pluginStatusEntry,
        },
        languageServerSelections: [selectionStatus],
        languageServerSelectionsByLanguage: {
          python: selectionStatus,
        },
      },
      true,
    );

    syncStoreInitialState(useProjectState);
    syncStoreInitialState(useShareSession);
    syncStoreInitialState(usePluginRuntimeStore);

    vi.mocked(addTemporaryNotification).mockReset();
    vi.mocked(enablePlugin).mockReset();
    vi.mocked(disablePlugin).mockReset();
    vi.mocked(restartLanguageServer).mockReset();
    vi.mocked(setLanguageServerSelection).mockReset();
    vi.mocked(setLanguageServerSelection).mockResolvedValue({
      data: null as never,
      response: new Response(null, { status: 200 }),
    } as Awaited<ReturnType<typeof setLanguageServerSelection>>);
  });

  afterEach(() => {
    resetProjectStores();
    document.body.innerHTML = "";
  });

  it("shows explicit Python selection actions for active Python plugins", async () => {
    const { host, root } = await renderPluginsPane();

    try {
      expect(
        host.querySelector(
          '[data-testid="python-language-server-selection-summary"]',
        )?.textContent,
      ).toContain("No Python language server is selected for this workspace");

      expect(
        host.querySelector(
          '[data-testid="plugin-card-toggle-setta-basedpyright"]',
        )?.textContent,
      ).toBe("Disable");
      expect(
        host.querySelector(
          '[data-testid="plugin-card-use-python-setta-basedpyright"]',
        )?.textContent,
      ).toBe("Use for Python");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("selects a Python language server without routing through enable", async () => {
    const { host, root } = await renderPluginsPane();

    try {
      const useForPythonButton = host.querySelector(
        '[data-testid="plugin-card-use-python-setta-basedpyright"]',
      );
      if (!(useForPythonButton instanceof HTMLButtonElement)) {
        throw new Error("Expected Use for Python button.");
      }

      await act(async () => {
        useForPythonButton.dispatchEvent(
          new MouseEvent("click", { bubbles: true }),
        );
      });
      await flushEffects();

      expect(enablePlugin).not.toHaveBeenCalled();
      expect(setLanguageServerSelection).toHaveBeenCalledTimes(1);
      expect(
        vi.mocked(setLanguageServerSelection).mock.calls[0]?.[0]?.body,
      ).toMatchObject({
        language: "python",
        pluginId: "setta-basedpyright",
      });
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
