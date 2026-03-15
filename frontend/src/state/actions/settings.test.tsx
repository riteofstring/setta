/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useSettings } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { createSettingsState } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routeLoadSettingsMock = vi.fn();

vi.mock("utils/generatedEndpoints", () => ({
  route_load_settings: (...args: unknown[]) => routeLoadSettingsMock(...args),
}));

import { useLoadSettings } from "./settings";

type RenderedSettingsLoader = {
  host: HTMLDivElement;
  root: Root;
};

function SettingsLoader({ enabled = true }: { enabled?: boolean }) {
  const settingsLoaded = useLoadSettings({ enabled });
  return <div data-testid="settings-loader">{String(settingsLoaded)}</div>;
}

async function renderSettingsLoader(
  options: { enabled?: boolean } = {},
): Promise<RenderedSettingsLoader> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(<SettingsLoader enabled={options.enabled} />);
  });

  return { host, root };
}

async function flushEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useLoadSettings", () => {
  beforeEach(() => {
    resetProjectStores();
    routeLoadSettingsMock.mockReset();
    useSettings.setState(createSettingsState());
  });

  afterEach(async () => {
    resetProjectStores();
    routeLoadSettingsMock.mockReset();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("hydrates the settings store from the Go load-settings response", async () => {
    const loadedSettings = createSettingsState({
      backend: {
        showDefaultConfigOnLoad: false,
        saveRenderedValues: true,
      },
    });
    routeLoadSettingsMock.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: loadedSettings,
    });

    const { host, root } = await renderSettingsLoader();

    try {
      await flushEffects();

      // A successful Go-owned settings response should hydrate the store and
      // flip the loader into its ready state.
      expect(routeLoadSettingsMock).toHaveBeenCalledOnce();
      expect(useSettings.getState()).toEqual(loadedSettings);
      expect(host.textContent).toContain("true");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("retries failed settings loads until the Go route succeeds", async () => {
    vi.useFakeTimers();
    const loadedSettings = createSettingsState({
      backend: {
        completionGuardEnabled: true,
      },
    });
    routeLoadSettingsMock
      .mockResolvedValueOnce({
        status: 500,
        hasResponse: true,
        data: null,
      })
      .mockResolvedValueOnce({
        status: 200,
        hasResponse: true,
        data: loadedSettings,
      });

    const { host, root } = await renderSettingsLoader();

    try {
      await flushEffects();

      // The first failed fetch should leave the loader pending and schedule the
      // documented retry instead of mutating settings state.
      expect(routeLoadSettingsMock).toHaveBeenCalledOnce();
      expect(useSettings.getState()).not.toEqual(loadedSettings);
      expect(host.textContent).toContain("false");

      await act(async () => {
        vi.advanceTimersByTime(500);
      });
      await flushEffects();

      // Once the retry succeeds, the hook should hydrate the store and report
      // the settings as loaded.
      expect(routeLoadSettingsMock).toHaveBeenCalledTimes(2);
      expect(useSettings.getState()).toEqual(loadedSettings);
      expect(host.textContent).toContain("true");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
