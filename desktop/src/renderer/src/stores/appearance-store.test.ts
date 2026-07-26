import type { AppearanceSettings } from "@generated/backend";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { useAppearanceStore } from "./appearance-store";

describe("appearance store", () => {
  beforeEach(() => {
    useAppearanceStore.setState({
      defaultPresetId: null,
      draft: null,
      error: null,
      presets: [],
      settings: null,
      status: "idle",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  test("applies settings without waiting for presets", async () => {
    const settings = testAppearanceSettings();
    const read = vi.fn().mockResolvedValue(settings);
    const presets = vi.fn(() => new Promise<never>(() => {}));
    installAppearanceAPI({ presets, read });

    await useAppearanceStore.getState().load();

    expect(read).toHaveBeenCalledOnce();
    expect(presets).toHaveBeenCalledOnce();
    expect(useAppearanceStore.getState().status).toBe("ready");
    expect(useAppearanceStore.getState().settings).toBe(settings);
    expect(useAppearanceStore.getState().draft).toBe(settings);
    expect(useAppearanceStore.getState().presets).toEqual([]);
  });

  test("fails a hung settings read instead of staying loading", async () => {
    vi.useFakeTimers();
    const read = vi.fn(() => new Promise<never>(() => {}));
    const presets = vi.fn();
    installAppearanceAPI({ presets, read });

    const load = useAppearanceStore.getState().load();
    await vi.advanceTimersByTimeAsync(5_000);
    await load;

    expect(useAppearanceStore.getState().status).toBe("error");
    expect(useAppearanceStore.getState().error).toBe(
      "Appearance settings request timed out after 5000ms",
    );
    expect(presets).not.toHaveBeenCalled();
  });

  test("updates the draft performance stats setting", () => {
    const settings = testAppearanceSettings();
    useAppearanceStore.setState({
      draft: settings,
      settings,
      status: "ready",
    });

    useAppearanceStore.getState().setShowPerformanceStats(true);

    expect(useAppearanceStore.getState().draft?.developer.showPerformanceStats).toBe(true);
    expect(settings.developer.showPerformanceStats).toBe(false);
  });

  test("updates the draft resized pane viewport clamp setting", () => {
    const settings = testAppearanceSettings();
    useAppearanceStore.setState({
      draft: settings,
      settings,
      status: "ready",
    });

    useAppearanceStore.getState().setClampResizedPanesToViewport(false);

    expect(useAppearanceStore.getState().draft?.developer.allowResizedPanesToOverflowViewport).toBe(
      true,
    );
    expect(settings.developer.allowResizedPanesToOverflowViewport).toBe(false);
  });

  test("updates the draft overview card width bounds", () => {
    const settings = testAppearanceSettings();
    useAppearanceStore.setState({
      draft: settings,
      settings,
      status: "ready",
    });

    useAppearanceStore.getState().setOverviewCardWidthBounds(320, 540);

    expect(useAppearanceStore.getState().draft?.developer.overviewCardMinWidthPx).toBe(320);
    expect(useAppearanceStore.getState().draft?.developer.overviewCardMaxWidthPx).toBe(540);
    expect(settings.developer.overviewCardMinWidthPx).toBe(280);
    expect(settings.developer.overviewCardMaxWidthPx).toBe(460);
  });

  test("updates the draft workspace navigation shortcut", () => {
    const settings = testAppearanceSettings();
    useAppearanceStore.setState({
      draft: settings,
      settings,
      status: "ready",
    });

    useAppearanceStore.getState().setWorkspaceNavigationShortcut("ctrl_alt_arrows");

    expect(useAppearanceStore.getState().draft?.shortcuts.workspaceNavigation).toBe(
      "ctrl_alt_arrows",
    );
    expect(settings.shortcuts.workspaceNavigation).toBe("mod_alt_arrows");
  });

  test("updates the draft master voice shortcut", () => {
    const settings = testAppearanceSettings();
    useAppearanceStore.setState({
      draft: settings,
      settings,
      status: "ready",
    });

    useAppearanceStore.getState().setMasterVoiceShortcut("alt_shift_k");

    expect(useAppearanceStore.getState().draft?.shortcuts.masterVoice).toBe("alt_shift_k");
    expect(settings.shortcuts.masterVoice).toBe("mod_shift_k");
  });
});

function installAppearanceAPI({
  presets,
  read,
}: {
  presets: () => Promise<never>;
  read: () => Promise<AppearanceSettings>;
}) {
  vi.stubGlobal("window", {
    setta: {
      appearance: {
        presets,
        read,
        update: vi.fn(),
      },
    },
  });
}

function testAppearanceSettings(): AppearanceSettings {
  return {
    fonts: {
      heading: "Inter, sans-serif",
      mono: "Menlo, monospace",
      sans: "Inter, sans-serif",
    },
    developer: {
      allowResizedPanesToOverflowViewport: false,
      overviewCardMaxWidthPx: 460,
      overviewCardMinWidthPx: 280,
      showPerformanceStats: false,
    },
    shortcuts: {
      workspaceNavigation: "mod_alt_arrows",
      masterVoice: "mod_shift_k",
    },
    mode: "dark",
    schemaVersion: 3,
  } as AppearanceSettings;
}
