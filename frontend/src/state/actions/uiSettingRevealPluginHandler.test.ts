// @vitest-environment jsdom

import type { UISettingRevealTarget } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invokePluginSettingRevealHandlerMock = vi.hoisted(() => vi.fn());

vi.mock("plugins/runtime", async () => {
  const actual =
    await vi.importActual<typeof import("plugins/runtime")>("plugins/runtime");
  return {
    ...actual,
    invokePluginSettingRevealHandler: invokePluginSettingRevealHandlerMock,
  };
});

import { usePluginRuntimeStore } from "plugins/runtime";
import { revealWithPluginHandler } from "./uiSettingRevealPluginHandler";

function createRevealTarget(
  overrides: Partial<UISettingRevealTarget>,
): UISettingRevealTarget {
  return {
    settingId: "plugin::plugin-a::label",
    side: "left",
    overviewTabKey: "PluginPane:plugin-a:pane-1",
    uiEditorTabName: null,
    pluginId: "plugin-a",
    paneId: "pane-1",
    strategy: "plugin_handler",
    anchorId: null,
    pluginRevealKey: "pane-reveal",
    revealActivationSteps: [],
    ...overrides,
  };
}

describe("uiSettingRevealPluginHandler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    usePluginRuntimeStore.setState({ sortedPaneTabs: [] });
  });

  afterEach(() => {
    usePluginRuntimeStore.setState({ sortedPaneTabs: [] });
    vi.useRealTimers();
  });

  it("waits for the plugin tab to appear before invoking the reveal handler", async () => {
    // Plugin reveals must keep polling until the requested pane tab actually
    // mounts, then invoke the plugin-owned reveal handler once.
    invokePluginSettingRevealHandlerMock.mockResolvedValue({
      ok: true,
      message: null,
    });
    window.setTimeout(() => {
      usePluginRuntimeStore.setState({
        sortedPaneTabs: [
          {
            tabKey: "PluginPane:plugin-a:pane-1",
            pluginId: "plugin-a",
            paneId: "pane-1",
            title: "Plugin Pane",
            description: "Plugin pane description",
          },
        ],
      });
    }, 150);

    const resultPromise = revealWithPluginHandler(
      createRevealTarget({}),
      Date.now() + 500,
      null,
    );
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toEqual({
      ok: true,
      errorMessage: null,
    });
    expect(invokePluginSettingRevealHandlerMock).toHaveBeenCalledTimes(1);
  });

  it("returns the mount-timeout detail when the plugin tab never appears", async () => {
    // When the pane never mounts, the plugin handler must not run and the
    // reveal result should explain that the tab never became available.
    const resultPromise = revealWithPluginHandler(
      createRevealTarget({}),
      Date.now() + 200,
      null,
    );
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toEqual({
      ok: false,
      errorMessage:
        "Plugin pane for plugin::plugin-a::label did not become available before reveal timeout.",
    });
    expect(invokePluginSettingRevealHandlerMock).not.toHaveBeenCalled();
  });
});
