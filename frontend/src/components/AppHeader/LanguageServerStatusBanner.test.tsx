/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { OverviewTabNameEnum } from "utils/constants";
import {
  createLanguageServerSelectionStatus,
  LanguageServerSelectionSeverityEnum,
  LanguageServerSelectionStatusKindEnum,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageServerStatusBanner } from "./LanguageServerStatusBanner";

let runtimeStatus: "idle" | "loading" | "loaded" | "error";
let serverMode: "ide" | "launcher" | "share" | "app" | null;
let pythonSelectionStatus:
  | ReturnType<typeof createLanguageServerSelectionStatus>
  | undefined;
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
      languageServerSelectionsByLanguage: Record<string, unknown>;
    }) => unknown,
  ) =>
    selector({
      status: runtimeStatus,
      serverMode,
      languageServerSelectionsByLanguage: pythonSelectionStatus
        ? { python: pythonSelectionStatus }
        : {},
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

function buildPythonSelectionStatus(
  status: string,
  message: string,
  severity:
    | typeof LanguageServerSelectionSeverityEnum.default
    | typeof LanguageServerSelectionSeverityEnum.warning
    | typeof LanguageServerSelectionSeverityEnum.success = LanguageServerSelectionSeverityEnum.warning,
) {
  return createLanguageServerSelectionStatus({
    language: "python",
    selectionState: "unset",
    severity,
    status,
    message,
    selectedPluginId: null,
    appliedPluginId: null,
    availableProviders: [],
    restartRequired: false,
  });
}

async function renderBanner(): Promise<RenderedBanner> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(<LanguageServerStatusBanner />);
  });

  return { host, root };
}

describe("LanguageServerStatusBanner", () => {
  beforeEach(() => {
    runtimeStatus = "loaded";
    serverMode = "ide";
    pythonSelectionStatus = buildPythonSelectionStatus(
      LanguageServerSelectionStatusKindEnum.unselected,
      "No Python language server is selected for this workspace.",
    );
    isDeploymentMode = false;
    onOverviewTabClickMock.mockReset();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("renders the backend-owned Python status message", async () => {
    const { host, root } = await renderBanner();

    try {
      expect(
        host.querySelector(
          '[data-testid="python-language-server-status-banner"]',
        )?.textContent,
      ).toContain("No Python language server is selected for this workspace.");
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

  it("stays hidden when backend reports Python active", async () => {
    pythonSelectionStatus = buildPythonSelectionStatus(
      LanguageServerSelectionStatusKindEnum.active,
      '"setta-basedpyright" is active for Python in this workspace.',
      LanguageServerSelectionSeverityEnum.success,
    );

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

  it("opens Plugins when Configure is clicked", async () => {
    const { host, root } = await renderBanner();

    try {
      const button = host.querySelector("button");
      if (!(button instanceof HTMLButtonElement)) {
        throw new Error("Expected Configure button.");
      }

      await act(async () => {
        button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
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
});
