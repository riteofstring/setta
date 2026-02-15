import { OverviewTabNameEnum } from "utils/constants";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PluginArea } from "./PluginArea";

type ElementNode = {
  type: unknown;
  props: {
    children?: unknown;
    onClick?: (...args: unknown[]) => unknown;
    [key: string]: unknown;
  };
};

type PluginImplShape = {
  pluginId: string;
  kind: string;
  data: Record<string, unknown>;
  schemaVersion: number | null;
};

let pluginSectionKind: Record<string, unknown> | null = null;
let fallbackReason = "frontend_load_failed";
let currentProjectConfigId = "project-config-1";
let pluginImpl: PluginImplShape = {
  pluginId: "setta-fixture-plugin",
  kind: "fixture-kind",
  schemaVersion: 2,
  data: {
    text: "fixture payload",
  },
};

const addTemporaryNotificationMock = vi.fn();
const routeDeleteSectionsMock = vi.fn();
const routePluginsStatusMock = vi.fn();
const useLocalStorageSetStateMock = vi.fn();
const usePluginSectionKindMock = vi.fn(() => pluginSectionKind);
const getPluginSectionFallbackReasonMock = vi.fn(() => fallbackReason);
const getCurrEffectiveSectionImplOfTypeMock = vi.fn(() => pluginImpl);
const getCurrProjectConfigIdMock = vi.fn(() => currentProjectConfigId);
const useProjectStateMock = vi.fn(
  (selector: (state: Record<string, unknown>) => unknown) => selector({}),
);

let clipboardWriteTextMock = vi.fn();
const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "navigator",
);

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

vi.mock("plugins/runtime", () => ({
  getPluginSectionFallbackReason: (...args: unknown[]) =>
    getPluginSectionFallbackReasonMock(...args),
  usePluginRuntimeStore: vi.fn(),
  usePluginSectionKind: (...args: unknown[]) =>
    usePluginSectionKindMock(...args),
}));

vi.mock("state/actions/notifications", () => ({
  addTemporaryNotification: (...args: unknown[]) =>
    addTemporaryNotificationMock(...args),
}));

vi.mock("state/actions/sectionInfos", () => ({
  getCurrEffectiveSectionImplOfType: (...args: unknown[]) =>
    getCurrEffectiveSectionImplOfTypeMock(...args),
  getCurrProjectConfigId: (...args: unknown[]) =>
    getCurrProjectConfigIdMock(...args),
}));

vi.mock("state/definitions", () => ({
  useLocalStorage: {
    setState: (...args: unknown[]) => useLocalStorageSetStateMock(...args),
  },
  useProjectState: (...args: unknown[]) => useProjectStateMock(...args),
}));

vi.mock("utils/generatedEndpoints", () => ({
  route_delete_sections: (...args: unknown[]) =>
    routeDeleteSectionsMock(...args),
  route_plugins_status: (...args: unknown[]) => routePluginsStatusMock(...args),
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
    if (match || element.type !== "button") {
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

function renderFallbackCard(sectionId = "section-1"): ElementNode {
  const root = PluginArea({ sectionId, isUserView: false });
  if (!isElementNode(root)) {
    throw new Error("Expected PluginArea to return a React element.");
  }
  if (typeof root.type !== "function") {
    throw new Error("Expected fallback branch to return function component.");
  }
  const fallbackElement = (
    root.type as (props: Record<string, unknown>) => unknown
  )(root.props as Record<string, unknown>);
  if (!isElementNode(fallbackElement)) {
    throw new Error("Expected fallback card to render a React element.");
  }
  return fallbackElement;
}

function buildClickEvent() {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
}

describe("PluginArea fallback actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pluginSectionKind = null;
    fallbackReason = "frontend_load_failed";
    currentProjectConfigId = "project-config-1";
    pluginImpl = {
      pluginId: "setta-fixture-plugin",
      kind: "fixture-kind",
      schemaVersion: 2,
      data: {
        text: "fixture payload",
      },
    };
    clipboardWriteTextMock = vi.fn(async () => undefined);
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        clipboard: {
          writeText: (...args: unknown[]) => clipboardWriteTextMock(...args),
        },
      },
    });
  });

  afterEach(() => {
    if (originalNavigatorDescriptor) {
      Object.defineProperty(
        globalThis,
        "navigator",
        originalNavigatorDescriptor,
      );
    } else {
      delete (globalThis as { navigator?: unknown }).navigator;
    }
    vi.clearAllMocks();
  });

  it("opens Plugins tab and refreshes plugin status from fallback action", async () => {
    // Open action should set overview state and trigger immediate plugin status refresh.
    routePluginsStatusMock.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: { plugins: [] },
    });
    const fallbackCard = renderFallbackCard("section-open");
    const openPluginsButton = findButtonByLabel(fallbackCard, "Open Plugins");
    const event = buildClickEvent();

    await (
      openPluginsButton.props.onClick as (event: unknown) => Promise<void>
    )(event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(useLocalStorageSetStateMock).toHaveBeenCalledWith({
      overviewVis: true,
      overviewTab: OverviewTabNameEnum.Plugins,
    });
    expect(routePluginsStatusMock).toHaveBeenCalledTimes(1);
  });

  it("copies plugin section JSON payload and notifies success", async () => {
    // Copy action should serialize the current plugin section snapshot to clipboard.
    const fallbackCard = renderFallbackCard("section-copy");
    const copyButton = findButtonByLabel(fallbackCard, "Copy Section JSON");
    const event = buildClickEvent();

    await (copyButton.props.onClick as (event: unknown) => Promise<void>)(
      event,
    );

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(clipboardWriteTextMock).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(
      clipboardWriteTextMock.mock.calls[0][0] as string,
    );
    expect(payload.sectionId).toBe("section-copy");
    expect(payload.pluginId).toBe("setta-fixture-plugin");
    expect(payload.kind).toBe("fixture-kind");
    expect(payload.schemaVersion).toBe(2);
    expect(payload.data).toEqual({
      text: "fixture payload",
    });
    expect(addTemporaryNotificationMock).toHaveBeenCalledWith(
      "Copied plugin section JSON.",
      "info",
    );
  });

  it("notifies copy failure when clipboard write throws", async () => {
    // Clipboard write errors should show deterministic error notification.
    clipboardWriteTextMock.mockRejectedValue(new Error("clipboard denied"));
    const fallbackCard = renderFallbackCard("section-copy-fail");
    const copyButton = findButtonByLabel(fallbackCard, "Copy Section JSON");
    const event = buildClickEvent();

    await (copyButton.props.onClick as (event: unknown) => Promise<void>)(
      event,
    );

    expect(addTemporaryNotificationMock).toHaveBeenCalledWith(
      "Failed to copy plugin section JSON.",
      "error",
    );
  });

  it("deletes section and shows success notification", async () => {
    // Successful delete should call backend delete endpoint with exact section payload.
    routeDeleteSectionsMock.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });
    const fallbackCard = renderFallbackCard("section-delete");
    const deleteButton = findButtonByLabel(fallbackCard, "Delete Section");
    const event = buildClickEvent();

    await (deleteButton.props.onClick as (event: unknown) => Promise<void>)(
      event,
    );

    expect(routeDeleteSectionsMock).toHaveBeenCalledWith({
      projectConfigId: "project-config-1",
      sectionIds: ["section-delete"],
    });
    expect(addTemporaryNotificationMock).toHaveBeenCalledWith(
      "Plugin section deleted.",
      "info",
    );
  });

  it("reports delete failure when backend request is not 200", async () => {
    // Non-200 delete responses should surface error notification and avoid success messaging.
    routeDeleteSectionsMock.mockResolvedValue({
      status: 500,
      hasResponse: true,
      data: null,
    });
    const fallbackCard = renderFallbackCard("section-delete-fail");
    const deleteButton = findButtonByLabel(fallbackCard, "Delete Section");
    const event = buildClickEvent();

    await (deleteButton.props.onClick as (event: unknown) => Promise<void>)(
      event,
    );

    expect(addTemporaryNotificationMock).toHaveBeenCalledWith(
      "Failed to delete plugin section.",
      "error",
    );
  });

  it("uses canonical scope wording for not-installed plugin fallback reason", () => {
    // Not-installed fallback copy should reference workspace/setta_files terminology.
    fallbackReason = "plugin_not_installed";

    const fallbackCard = renderFallbackCard("section-scope-wording");

    expect(collectText(fallbackCard)).toContain(
      "Plugin is not installed in this workspace or setta_files scope.",
    );
  });
});
