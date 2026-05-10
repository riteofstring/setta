import { OverviewTabUIConfig } from "utils/generatedTypes";
import type { ServerModeValue } from "utils/serverModeTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PluginRestartBanner } from "./PluginRestartBanner";

type ElementNode = {
  type: unknown;
  props: {
    children?: unknown;
    onClick?: (...args: unknown[]) => unknown;
    [key: string]: unknown;
  };
};

let restartRequiredPluginIds: string[] = ["plugin.a"];
let restartActionPlan: {
  mode: "programmatic" | "manual" | "unavailable";
  command: string | null;
  reason: string | null;
  message: string | null;
} = {
  mode: "programmatic",
  command: null,
  reason: null,
  message: null,
};
let restartCapability: Record<string, unknown> | null = {
  mode: "programmatic",
  command: null,
  reason: null,
};
let runtimeServerMode: ServerModeValue = "ide";
let isDeploymentMode = false;

const {
  addTemporaryNotificationMock,
  routePluginsRestartMock,
  onOverviewTabClickMock,
  refreshPluginRuntimeMock,
  usePluginListEntriesMock,
  usePluginStatusEntriesMock,
  usePluginRuntimeStoreMock,
  getRestartRequiredPluginIdsMock,
  buildPluginRestartActionPlanMock,
} = vi.hoisted(() => ({
  addTemporaryNotificationMock: vi.fn(),
  routePluginsRestartMock: vi.fn(),
  onOverviewTabClickMock: vi.fn(),
  refreshPluginRuntimeMock: vi.fn(async () => undefined),
  usePluginListEntriesMock: vi.fn(() => []),
  usePluginStatusEntriesMock: vi.fn(() => []),
  usePluginRuntimeStoreMock: vi.fn(
    (
      selector?: (state: {
        restartCapability: unknown;
        serverMode: ServerModeValue;
      }) => unknown,
    ) => {
      const state = { restartCapability, serverMode: runtimeServerMode };
      if (typeof selector === "function") {
        return selector(state);
      }
      return state;
    },
  ),
  getRestartRequiredPluginIdsMock: vi.fn(() => restartRequiredPluginIds),
  buildPluginRestartActionPlanMock: vi.fn(() => restartActionPlan),
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useMemo: <T,>(factory: () => T) => factory(),
    useState: <T,>(initial: T | (() => T)) => {
      let value =
        typeof initial === "function" ? (initial as () => T)() : initial;
      const setValue = (next: T | ((prev: T) => T)) => {
        value =
          typeof next === "function" ? (next as (prev: T) => T)(value) : next;
      };
      return [value, setValue] as const;
    },
  };
});

vi.mock("components/Panes/paneFns", () => ({
  onOverviewTabClick: (...args: unknown[]) => onOverviewTabClickMock(...args),
}));

vi.mock("plugins/restart", async () => {
  const actual =
    await vi.importActual<typeof import("plugins/restart")>("plugins/restart");
  return {
    ...actual,
    getRestartRequiredPluginIds: getRestartRequiredPluginIdsMock,
    buildPluginRestartActionPlan: buildPluginRestartActionPlanMock,
  };
});

vi.mock("plugins/runtime", () => ({
  refreshPluginRuntime: refreshPluginRuntimeMock,
  usePluginListEntries: usePluginListEntriesMock,
  usePluginStatusEntries: usePluginStatusEntriesMock,
  usePluginRuntimeStore: usePluginRuntimeStoreMock,
}));

vi.mock("state/actions/notifications", () => ({
  addTemporaryNotification: addTemporaryNotificationMock,
}));

vi.mock("state/definitions", () => ({
  useShareSession: (
    selector: (state: { isDeploymentMode: boolean }) => unknown,
  ) =>
    selector({
      isDeploymentMode,
    }),
}));

vi.mock("openapi/http", () => ({
  restartPlugins: routePluginsRestartMock,
}));

function isElementNode(value: unknown): value is ElementNode {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as { type?: unknown; props?: unknown };
  return "type" in record && "props" in record;
}

function collectText(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map((child) => collectText(child)).join("");
  }
  if (isElementNode(node)) {
    return collectText(node.props.children);
  }
  return "";
}

function traverseElements(
  node: unknown,
  visitor: (element: ElementNode) => void,
): void {
  if (Array.isArray(node)) {
    for (const child of node) {
      traverseElements(child, visitor);
    }
    return;
  }
  if (!isElementNode(node)) {
    return;
  }
  visitor(node);
  traverseElements(node.props.children, visitor);
}

function findButtonByLabel(root: unknown, label: string): ElementNode {
  let match: ElementNode | null = null;
  traverseElements(root, (element) => {
    if (match) {
      return;
    }
    if (element.type !== "button") {
      return;
    }
    if (collectText(element.props.children).trim() === label) {
      match = element;
    }
  });
  if (!match) {
    throw new Error(`Unable to find button with label '${label}'.`);
  }
  return match;
}

async function drainMicrotasks(iterations = 8): Promise<void> {
  for (let index = 0; index < iterations; index += 1) {
    await Promise.resolve();
  }
}

describe("PluginRestartBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restartRequiredPluginIds = ["plugin.a"];
    restartActionPlan = {
      mode: "programmatic",
      command: null,
      reason: null,
      message: null,
    };
    restartCapability = {
      mode: "programmatic",
      command: null,
      reason: null,
    };
    runtimeServerMode = "ide";
    isDeploymentMode = false;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when no plugins require restart", () => {
    // The banner should not render when runtime reports no restart-required plugins.
    restartRequiredPluginIds = [];

    expect(PluginRestartBanner()).toBeNull();
  });

  it("sends restart request and refreshes runtime when restart is accepted", async () => {
    // Accepted in-process restarts should rehydrate plugin runtime so pending banners clear.
    routePluginsRestartMock.mockResolvedValue({
      data: {
        accepted: true,
        command: null,
      },
      response: new Response(null, { status: 200 }),
    });

    const banner = PluginRestartBanner();
    const restartButton = findButtonByLabel(banner, "Restart");
    (restartButton.props.onClick as () => void)();
    await drainMicrotasks();

    expect(routePluginsRestartMock).toHaveBeenCalledTimes(1);
    expect(addTemporaryNotificationMock).toHaveBeenCalledWith(
      "Restart request accepted.",
      "info",
    );
    expect(refreshPluginRuntimeMock).toHaveBeenCalledTimes(1);
  });

  it("shows manual restart warning when restart endpoint rejects request", async () => {
    // A non-accepted programmatic response should fall back to manual command guidance.
    routePluginsRestartMock.mockResolvedValue({
      data: {
        accepted: false,
        command: "setta --restart",
      },
      response: new Response(null, { status: 200 }),
    });

    const banner = PluginRestartBanner();
    const restartButton = findButtonByLabel(banner, "Restart");
    (restartButton.props.onClick as () => void)();
    await drainMicrotasks();

    expect(addTemporaryNotificationMock).toHaveBeenCalledWith(
      "Manual restart required: setta --restart",
      "warning",
    );
    expect(refreshPluginRuntimeMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces restart request failure and still refreshes runtime", async () => {
    // Failed restart responses must notify the user and still trigger runtime refresh in finally.
    routePluginsRestartMock.mockResolvedValue({
      data: {
        detail: "restart failed",
      },
      response: new Response(null, { status: 500 }),
    });

    const banner = PluginRestartBanner();
    const restartButton = findButtonByLabel(banner, "Restart");
    (restartButton.props.onClick as () => void)();
    await drainMicrotasks();

    expect(addTemporaryNotificationMock).toHaveBeenCalledWith(
      "Restart request failed: restart failed",
      "error",
    );
    expect(refreshPluginRuntimeMock).toHaveBeenCalledTimes(1);
  });

  it("does not render banner outside IDE mode", () => {
    // Operator restart controls should stay hidden in non-IDE runtime modes.
    runtimeServerMode = "share";

    expect(PluginRestartBanner()).toBeNull();
  });

  it("does not render banner in deployment mode", () => {
    // Deployment contexts should not expose restart controls in the header.
    isDeploymentMode = true;

    expect(PluginRestartBanner()).toBeNull();
  });

  it("opens Plugins overview tab from banner action", () => {
    // Header shortcut should always route users directly to the Plugins overview tab.
    const banner = PluginRestartBanner();
    const pluginsButton = findButtonByLabel(banner, "Plugins");
    (pluginsButton.props.onClick as () => void)();

    expect(onOverviewTabClickMock).toHaveBeenCalledWith(
      OverviewTabUIConfig.names.Plugins,
    );
  });
});
