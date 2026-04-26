import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WATCH_CODE_BACKEND_LOCAL_SETTING_FILES,
  WATCH_CODE_BACKEND_ROUTE_BASE_PATH,
  WATCH_CODE_BACKEND_ROUTE_SUFFIX_INPUTS,
} from "../src/generated/watchCodeBackendContract";
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
type ProjectStateListener = Parameters<
  WatchCodePluginHost["subscribeProjectState"]
>[1];
type ProjectStateSelector = Parameters<
  WatchCodePluginHost["subscribeProjectState"]
>[0];

const watchCodeInputsRoute = `${WATCH_CODE_BACKEND_ROUTE_BASE_PATH}/${WATCH_CODE_BACKEND_ROUTE_SUFFIX_INPUTS}`;

const effectiveCapabilities = [
  "registerCanvasControl",
  "registerSettingRevealHandler",
  "registerRouter",
  "readProjectState",
  "subscribeProjectState",
];

function buildHost(overrides: Partial<WatchCodePluginHost> = {}) {
  const configuredEffectiveCapabilities =
    overrides.effectiveCapabilities ?? effectiveCapabilities;
  const requireCapability = (capability: string, methodName: string): void => {
    if (configuredEffectiveCapabilities.includes(capability)) {
      return;
    }
    throw new Error(
      `Plugin setta-watch-code cannot call ${methodName}; missing effective capability ${capability}.`,
    );
  };
  let projectConfig = {
    id: "project-alpha",
  };
  let watchCodeData: unknown = {
    folders: [] as WatchCodeFolder[],
    files: [] as string[],
  };
  const projectStateListeners: Array<{
    selector: ProjectStateSelector;
    listener: ProjectStateListener;
  }> = [];
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
    effectiveCapabilities: configuredEffectiveCapabilities,
    registerCanvasControl: (definition) => {
      requireCapability("registerCanvasControl", "registerCanvasControl");
      registeredControls.push(definition);
    },
    registerSettingRevealHandler: (revealKey, handler) => {
      requireCapability(
        "registerSettingRevealHandler",
        "registerSettingRevealHandler",
      );
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
      const entry = { selector, listener };
      projectStateListeners.push(entry);
      listener(
        selector.kind === "projectConfig" ? projectConfig : watchCodeData,
        null,
      );
      return () => {
        const index = projectStateListeners.indexOf(entry);
        if (index >= 0) {
          projectStateListeners.splice(index, 1);
        }
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
    switchProject(
      nextConfig: typeof projectConfig,
      nextWatchCodeData: unknown,
    ) {
      projectConfig = nextConfig;
      watchCodeData = nextWatchCodeData;
      projectContextListener?.({
        projectConfigId: projectConfig.id,
        serverMode: "ide",
      });
    },
    updateWatchCodeData(nextData: unknown) {
      const previous = watchCodeData;
      watchCodeData = nextData;
      for (const entry of projectStateListeners) {
        if (entry.selector.kind === "pluginData") {
          entry.listener(watchCodeData, previous);
        }
      }
    },
  };
}

function mountCanvasControl(
  registeredControls: RegisteredCanvasControl[],
  pluginId = "setta-watch-code",
): HTMLElement {
  const control = registeredControls[0];
  if (!control) {
    throw new Error("expected registered Watch Code canvas control");
  }
  const mount = document.createElement("div");
  document.body.append(mount);
  control.renderer.mount(mount, {
    pluginId,
    controlId: "watch-code",
    label: "Watch Code",
    placement: "project",
    serverMode: "ide",
    effectiveCapabilities,
  });
  return mount;
}

function openSettingsPortal(mount: HTMLElement): HTMLElement {
  const button = mount.querySelector<HTMLButtonElement>(
    '[data-testid="rf__watch-code-settings"]',
  );
  expect(button).not.toBeNull();
  button?.click();
  const portal = document.querySelector<HTMLElement>(
    '[data-testid="rf__watch-code-settings-portal"]',
  );
  expect(portal).not.toBeNull();
  return portal as HTMLElement;
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
    const portal = openSettingsPortal(mountCanvasControl(registeredControls));

    expect(pluginDataSelectorIds).toContain("setta-watch-code");

    updateWatchCodeData({
      folders: [{ path: "pkg", recursive: true }],
      files: ["pkg/mod.py"],
    });
    const fileInput = document.querySelector<HTMLInputElement>(
      `[data-setting-anchor="plugin::setta-watch-code::${WATCH_CODE_BACKEND_LOCAL_SETTING_FILES}"] input`,
    );
    expect(fileInput?.value).toBe("pkg/mod.py");
    if (fileInput) {
      fileInput.value = "pkg/updated.py";
      fileInput.dispatchEvent(new Event("input", { bubbles: true }));
      fileInput.dispatchEvent(new Event("blur", { bubbles: true }));
    }
    await Promise.resolve();
    expect(fetchBackendRoute).toHaveBeenLastCalledWith(
      watchCodeInputsRoute,
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectConfigId: "project-alpha",
          folders: [{ path: "pkg", recursive: true }],
          files: ["pkg/updated.py"],
        }),
      }),
    );
  });

  it("resets staged input buffers when project context changes without a plugin data notification", async () => {
    const {
      host,
      registeredControls,
      fetchBackendRoute,
      updateWatchCodeData,
      switchProject,
    } = buildHost();
    register(host);
    const portal = openSettingsPortal(mountCanvasControl(registeredControls));
    updateWatchCodeData({
      folders: [{ path: "alpha-src", recursive: true }],
      files: ["alpha.py"],
    });
    const alphaFileInput = portal.querySelector<HTMLInputElement>(
      `[data-setting-anchor="plugin::setta-watch-code::${WATCH_CODE_BACKEND_LOCAL_SETTING_FILES}"] input`,
    );
    expect(alphaFileInput?.value).toBe("alpha.py");
    if (alphaFileInput) {
      alphaFileInput.value = "alpha-unsaved.py";
      alphaFileInput.dispatchEvent(new Event("input", { bubbles: true }));
    }

    switchProject({ id: "project-beta" }, null);

    expect(
      portal.querySelector<HTMLInputElement>(
        `[data-setting-anchor="plugin::setta-watch-code::${WATCH_CODE_BACKEND_LOCAL_SETTING_FILES}"] input`,
      ),
    ).toBeNull();
    const betaFilesGroup = portal.querySelector<HTMLElement>(
      `[data-setting-anchor="plugin::setta-watch-code::${WATCH_CODE_BACKEND_LOCAL_SETTING_FILES}"]`,
    );
    expect(betaFilesGroup?.textContent).toContain("No files yet.");
    betaFilesGroup?.querySelector<HTMLButtonElement>("button")?.click();
    const betaFileInput = portal.querySelector<HTMLInputElement>(
      `[data-setting-anchor="plugin::setta-watch-code::${WATCH_CODE_BACKEND_LOCAL_SETTING_FILES}"] input`,
    );
    expect(betaFileInput).not.toBeNull();
    if (betaFileInput) {
      betaFileInput.value = "beta.py";
      betaFileInput.dispatchEvent(new Event("input", { bubbles: true }));
      betaFileInput.dispatchEvent(new Event("blur", { bubbles: true }));
    }
    await Promise.resolve();

    expect(fetchBackendRoute).toHaveBeenLastCalledWith(
      watchCodeInputsRoute,
      expect.objectContaining({
        body: JSON.stringify({
          projectConfigId: "project-beta",
          folders: [],
          files: ["beta.py"],
        }),
      }),
    );
  });

  it("disables input controls during an inputs save", async () => {
    let resolveSave!: (response: Response) => void;
    const pendingSave = new Promise<Response>((resolve) => {
      resolveSave = resolve;
    });
    const fetchBackendRoute = vi.fn(async (path) => {
      if (path === watchCodeInputsRoute) {
        return pendingSave;
      }
      return new Response(null, { status: 200 });
    });
    const { host, registeredControls, updateWatchCodeData } = buildHost({
      fetchBackendRoute,
    });
    register(host);
    const mount = mountCanvasControl(registeredControls);
    updateWatchCodeData({
      folders: [{ path: "pkg", recursive: true }],
      files: ["pkg/mod.py"],
    });
    const portal = openSettingsPortal(mount);
    const fileInput = portal.querySelector<HTMLInputElement>(
      `[data-setting-anchor="plugin::setta-watch-code::${WATCH_CODE_BACKEND_LOCAL_SETTING_FILES}"] input`,
    );
    expect(fileInput).not.toBeNull();
    if (fileInput) {
      fileInput.value = "pkg/pending.py";
      fileInput.dispatchEvent(new Event("input", { bubbles: true }));
      fileInput.dispatchEvent(new Event("blur", { bubbles: true }));
    }
    await Promise.resolve();

    expect(fetchBackendRoute).toHaveBeenCalledWith(
      watchCodeInputsRoute,
      expect.objectContaining({
        body: JSON.stringify({
          projectConfigId: "project-alpha",
          folders: [{ path: "pkg", recursive: true }],
          files: ["pkg/pending.py"],
        }),
      }),
    );
    const disabledInput = portal.querySelector<HTMLInputElement>(
      `[data-setting-anchor="plugin::setta-watch-code::${WATCH_CODE_BACKEND_LOCAL_SETTING_FILES}"] input`,
    );
    expect(disabledInput?.disabled).toBe(true);
    expect(
      portal.querySelector<HTMLButtonElement>(
        `[data-setting-anchor="plugin::setta-watch-code::${WATCH_CODE_BACKEND_LOCAL_SETTING_FILES}"] button`,
      )?.disabled,
    ).toBe(true);

    resolveSave(new Response(null, { status: 200 }));
    await pendingSave;
    await Promise.resolve();
    updateWatchCodeData({
      folders: [{ path: "pkg", recursive: true }],
      files: ["pkg/pending.py"],
    });
    expect(
      portal.querySelector<HTMLInputElement>(
        `[data-setting-anchor="plugin::setta-watch-code::${WATCH_CODE_BACKEND_LOCAL_SETTING_FILES}"] input`,
      )?.value,
    ).toBe("pkg/pending.py");
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
    mountCanvasControl(registeredControls, "alternate-watch-provider");

    const handled = await revealHandlers.get("watch-code-settings")?.({
      settingId: `plugin::alternate-watch-provider::${WATCH_CODE_BACKEND_LOCAL_SETTING_FILES}`,
      paneId: null,
      durationMs: 100,
      abortSignal: new AbortController().signal,
    });

    expect(handled).toBe(true);
    expect(
      document
        .querySelector(
          `[data-setting-anchor="plugin::alternate-watch-provider::${WATCH_CODE_BACKEND_LOCAL_SETTING_FILES}"]`,
        )
        ?.classList.contains("setta-watch-code-reveal-highlight"),
    ).toBe(true);
  });

  it("fails loudly when required capabilities are unavailable", () => {
    const { host, registeredControls, revealHandlers } = buildHost({
      effectiveCapabilities: [],
    });

    expect(() => register(host)).toThrow(
      "missing effective capability registerCanvasControl",
    );

    expect(registeredControls).toHaveLength(0);
    expect(revealHandlers.size).toBe(0);
  });
});
