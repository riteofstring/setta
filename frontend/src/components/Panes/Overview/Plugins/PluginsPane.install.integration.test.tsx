/* @vitest-environment jsdom */

import { installPlugin } from "openapi/http";
import { usePluginRuntimeStore } from "plugins/runtime";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { addTemporaryNotification } from "state/actions/notifications";
import { useProjectState, useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { createProjectConfig } from "utils/generatedTypes";
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
    installPlugin: vi.fn(),
  };
});

type RenderedPluginsPane = {
  host: HTMLDivElement;
  root: Root;
};

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

describe("PluginsPane install flow", () => {
  beforeEach(() => {
    resetProjectStores();
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({
        id: "project-alpha",
        name: "Project Alpha",
      });
    });
    useShareSession.setState({ isDeploymentMode: false });
    const initialRuntimeState =
      usePluginRuntimeStore.getInitialState?.() ??
      usePluginRuntimeStore.getState();
    usePluginRuntimeStore.setState(
      {
        ...initialRuntimeState,
        status: "loaded",
        statusMessage: null,
        serverMode: "ide",
      },
      true,
    );
    syncStoreInitialState(useProjectState);
    syncStoreInitialState(useShareSession);
    syncStoreInitialState(usePluginRuntimeStore);
    vi.mocked(installPlugin).mockReset();
    vi.mocked(addTemporaryNotification).mockReset();
  });

  afterEach(() => {
    resetProjectStores();
    document.body.innerHTML = "";
  });

  it("submits invalid source specs to the Go route and surfaces the backend error", async () => {
    vi.mocked(installPlugin).mockResolvedValue({
      data: {
        detail: "Unsupported plugin source scheme: file",
      } as never,
      response: new Response(null, { status: 400 }),
    } as unknown as Awaited<ReturnType<typeof installPlugin>>);

    const { host, root } = await renderPluginsPane();

    try {
      const sourceInput = host.querySelector(
        'input[placeholder="github:owner/repo[#ref] or pypi:package[==version]"]',
      );
      if (!(sourceInput instanceof HTMLInputElement)) {
        throw new Error("Expected plugin source input.");
      }
      const installButton = Array.from(host.querySelectorAll("button")).find(
        (button) => button.textContent?.trim() === "Install",
      );
      if (!(installButton instanceof HTMLButtonElement)) {
        throw new Error("Expected install button.");
      }

      await act(async () => {
        const valueSetter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )?.set;
        valueSetter?.call(sourceInput, "  file:/tmp/plugin  ");
        sourceInput.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => {
        installButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await flushEffects();

      expect(installPlugin).toHaveBeenCalledWith({
        body: {
          sourceSpec: "file:/tmp/plugin",
          scope: "workspace",
          installer: "auto",
          enable: true,
          force: false,
        },
      });
      expect(host.textContent).toContain(
        "Install plugin failed: Unsupported plugin source scheme: file",
      );
      expect(addTemporaryNotification).toHaveBeenCalledWith(
        "Install plugin failed: Unsupported plugin source scheme: file",
        "error",
      );
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
