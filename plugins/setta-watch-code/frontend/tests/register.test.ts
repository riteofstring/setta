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
  "readProjectState",
  "subscribeProjectState",
  "mutateWatchCodeSettings",
];

function buildHost(overrides: Partial<WatchCodePluginHost> = {}) {
  let projectConfig = {
    id: "project-alpha",
    watchCodeEnabled: false,
    watchCodeFolders: [] as WatchCodeFolder[],
    watchCodeFiles: [] as string[],
  };
  let projectListener:
    | ((nextValue: unknown, prevValue: unknown | null) => void)
    | null = null;
  const registeredControls: RegisteredCanvasControl[] = [];
  const revealHandlers = new Map<string, RevealHandler>();
  const setWatchCodeEnabled = vi.fn(async () => true);
  const setWatchCodeInputs = vi.fn(async () => true);
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
    readProjectState: () => projectConfig,
    subscribeProjectState: (_selector, listener) => {
      projectListener = listener;
      listener(projectConfig, null);
      return () => {
        projectListener = null;
      };
    },
    setWatchCodeEnabled,
    setWatchCodeInputs,
    ...overrides,
  };
  return {
    host,
    registeredControls,
    revealHandlers,
    setWatchCodeEnabled,
    setWatchCodeInputs,
    updateProjectConfig(nextConfig: typeof projectConfig) {
      const previous = projectConfig;
      projectConfig = nextConfig;
      projectListener?.(projectConfig, previous);
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

  it("renders the control, opens settings, and delegates mutations to the host", async () => {
    const {
      host,
      registeredControls,
      setWatchCodeEnabled,
      setWatchCodeInputs,
      updateProjectConfig,
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
    expect(setWatchCodeEnabled).toHaveBeenCalledWith({
      projectConfigId: "project-alpha",
      enabled: true,
    });

    updateProjectConfig({
      id: "project-alpha",
      watchCodeEnabled: true,
      watchCodeFolders: [{ path: "pkg", recursive: true }],
      watchCodeFiles: ["pkg/mod.py"],
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
    expect(setWatchCodeInputs).toHaveBeenCalledWith({
      projectConfigId: "project-alpha",
      watchCodeFolders: [{ path: "pkg", recursive: true }],
      watchCodeFiles: ["pkg/updated.py"],
    });
  });

  it("opens and highlights the plugin setting from the reveal handler", async () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    HTMLElement.prototype.scrollIntoView = vi.fn();
    const { host, registeredControls, revealHandlers } = buildHost();
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

    const handled = await revealHandlers.get("watch-code-settings")?.({
      settingId: "plugin::setta-watch-code::files",
      paneId: null,
      durationMs: 100,
      abortSignal: new AbortController().signal,
    });

    expect(handled).toBe(true);
    expect(
      document
        .querySelector('[data-setting-anchor="plugin::setta-watch-code::files"]')
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
