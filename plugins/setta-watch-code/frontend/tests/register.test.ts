import { afterEach, describe, expect, it, vi } from "vitest";
import { apiVersion, register } from "../src/index";
import type {
  WatchCodeFolder,
  WatchCodePluginHost,
} from "../src/watchCodeControl";

type RegisteredCanvasControl = Parameters<
  WatchCodePluginHost["registerCanvasControl"]
>[0];
type RevealHandler = Parameters<
  WatchCodePluginHost["registerSettingRevealHandler"]
>[1];

const effectiveCapabilities = [
  "registerCanvasControl",
  "registerSettingRevealHandler",
  "registerRouter",
  "readProjectState",
  "subscribeProjectState",
];

function buildHost(overrides: Partial<WatchCodePluginHost> = {}) {
  let projectConfig = {
    id: "project-alpha",
  };
  let watchCodeData = {
    enabled: false,
    folders: [] as WatchCodeFolder[],
    files: [] as string[],
  };
  let projectStateListener:
    | ((nextValue: unknown, prevValue: unknown | null) => void)
    | null = null;
  let projectContextListener:
    | Parameters<WatchCodePluginHost["subscribeProjectContext"]>[0]
    | null = null;
  const registeredControls: RegisteredCanvasControl[] = [];
  const revealHandlers = new Map<string, RevealHandler>();
  const pluginDataSelectorIds: string[] = [];
  const fetchBackendRoute = vi.fn(
    async (_path: string, _init?: RequestInit) =>
      new Response(null, { status: 200 }),
  );
  const host: WatchCodePluginHost = {
    apiVersion,
    pluginId: "setta-watch-code",
    serverMode: "ide",
    effectiveCapabilities,
    registerCanvasControl: (definition) => {
      registeredControls.push(definition);
    },
    registerSettingRevealHandler: (revealKey, handler) => {
      revealHandlers.set(revealKey, handler);
    },
    getProjectContext: () => ({
      projectConfigId: projectConfig.id,
      serverMode: "ide",
    }),
    subscribeProjectContext: (listener) => {
      projectContextListener = listener;
      return () => {
        projectContextListener = null;
      };
    },
    readProjectState: (selector) => {
      if (selector.kind === "pluginData") {
        pluginDataSelectorIds.push(selector.pluginId);
        return watchCodeData;
      }
      return projectConfig;
    },
    subscribeProjectState: (selector, listener) => {
      if (selector.kind === "pluginData") {
        pluginDataSelectorIds.push(selector.pluginId);
      }
      projectStateListener = listener;
      listener(
        selector.kind === "projectConfig" ? projectConfig : watchCodeData,
        null,
      );
      return () => {
        projectStateListener = null;
      };
    },
    fetchBackendRoute,
    ...overrides,
  };
  return {
    host,
    registeredControls,
    revealHandlers,
    pluginDataSelectorIds,
    fetchBackendRoute,
    updateProjectConfig(nextConfig: typeof projectConfig) {
      const previous = projectConfig;
      projectConfig = nextConfig;
      projectContextListener?.({
        projectConfigId: projectConfig.id,
        serverMode: "ide",
      });
      projectStateListener?.(projectConfig, previous);
    },
    updateWatchCodeData(nextData: typeof watchCodeData) {
      const previous = watchCodeData;
      watchCodeData = nextData;
      projectStateListener?.(watchCodeData, previous);
    },
  };
}

describe("setta-watch-code frontend registration", () => {
  afterEach(() => {
    document.body.textContent = "";
    vi.restoreAllMocks();
  });

  it("exports the current plugin frontend API version", () => {
    expect(apiVersion).toBe(1);
  });

  it("registers the plugin-owned canvas control and reveal handler", () => {
    const { host, registeredControls, revealHandlers } = buildHost();

    register(host);

    expect(registeredControls).toHaveLength(1);
    expect(registeredControls[0]?.id).toBe("watch-code");
    expect(registeredControls[0]?.placement).toBe("project");
    expect(revealHandlers.has("watch-code-settings")).toBe(true);
  });

  it("renders the control, opens settings, and saves through plugin backend routes", async () => {
    const {
      host,
      registeredControls,
      fetchBackendRoute,
      pluginDataSelectorIds,
      updateWatchCodeData,
    } = buildHost();
    register(host);
    const mount = document.createElement("div");
    document.body.append(mount);
    registeredControls[0]?.renderer.mount(mount, {
      pluginId: "setta-watch-code",
      controlId: "watch-code",
      label: "Watch Code",
      placement: "project",
      serverMode: "ide",
      effectiveCapabilities,
    });

    const button = mount.querySelector<HTMLButtonElement>(
      '[data-testid="rf__watch-code-settings"]',
    );
    expect(button).not.toBeNull();
    button?.click();
    const portal = document.querySelector<HTMLElement>(
      '[data-testid="rf__watch-code-settings-portal"]',
    );
    expect(portal).not.toBeNull();

    portal
      ?.querySelector<HTMLButtonElement>(
        '[data-setting-anchor="plugin::setta-watch-code::enabled"] button',
      )
      ?.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(pluginDataSelectorIds).toContain("setta-watch-code");
    expect(fetchBackendRoute).toHaveBeenCalledWith(
      "/watch-code/enabled",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectConfigId: "project-alpha",
          enabled: true,
        }),
      }),
    );

    updateWatchCodeData({
      enabled: true,
      folders: [{ path: "pkg", recursive: true }],
      files: ["pkg/mod.py"],
    });
    const fileInput = document.querySelector<HTMLInputElement>(
      '[data-setting-anchor="plugin::setta-watch-code::files"] input',
    );
    expect(fileInput?.value).toBe("pkg/mod.py");
    if (fileInput) {
      fileInput.value = "pkg/updated.py";
      fileInput.dispatchEvent(new Event("input", { bubbles: true }));
      fileInput.dispatchEvent(new Event("blur", { bubbles: true }));
    }
    await Promise.resolve();
    expect(fetchBackendRoute).toHaveBeenLastCalledWith(
      "/watch-code/inputs",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectConfigId: "project-alpha",
          watchCodeFolders: [{ path: "pkg", recursive: true }],
          watchCodeFiles: ["pkg/updated.py"],
        }),
      }),
    );
  });

  it("opens and highlights the plugin setting from the reveal handler", async () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    HTMLElement.prototype.scrollIntoView = vi.fn();
    const { host, registeredControls, revealHandlers } = buildHost({
      pluginId: "alternate-watch-provider",
    });
    register(host);
    const mount = document.createElement("div");
    document.body.append(mount);
    registeredControls[0]?.renderer.mount(mount, {
      pluginId: "alternate-watch-provider",
      controlId: "watch-code",
      label: "Watch Code",
      placement: "project",
      serverMode: "ide",
      effectiveCapabilities,
    });

    const handled = await revealHandlers.get("watch-code-settings")?.({
      settingId: "plugin::alternate-watch-provider::files",
      paneId: null,
      durationMs: 100,
      abortSignal: new AbortController().signal,
    });

    expect(handled).toBe(true);
    expect(
      document
        .querySelector(
          '[data-setting-anchor="plugin::alternate-watch-provider::files"]',
        )
        ?.classList.contains("setta-watch-code-reveal-highlight"),
    ).toBe(true);
  });

  it("does not register when required capabilities are unavailable", () => {
    const { host, registeredControls, revealHandlers } = buildHost({
      effectiveCapabilities: ["registerCanvasControl"],
    });

    register(host);

    expect(registeredControls).toHaveLength(0);
    expect(revealHandlers.size).toBe(0);
  });
});
