import { OverviewTabUIConfig } from "utils/generatedTypes";
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
let runtimeStatus = "loaded";
let runtimeStatusMessage: string | null = null;
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
const routeGetLatestProjectStateMock = vi.fn();
const onOverviewTabClickMock = vi.fn();
const usePluginSectionKindMock = vi.fn(() => pluginSectionKind);
const usePluginSectionFallbackReasonMock = vi.fn(() => fallbackReason);
const usePluginRuntimeStoreMock = vi.fn(
  (
    selector: (state: {
      status: string;
      statusMessage: string | null;
    }) => unknown,
  ) =>
    selector({
      status: runtimeStatus,
      statusMessage: runtimeStatusMessage,
    }),
);
const getCurrEffectiveSectionImplOfTypeMock = vi.fn(() => pluginImpl);
const getCurrProjectConfigIdMock = vi.fn(() => currentProjectConfigId);
const processProjectStateUpdateFromBackendMock = vi.fn();
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
  usePluginSectionFallbackReason: (...args: unknown[]) =>
    usePluginSectionFallbackReasonMock(...args),
  usePluginRuntimeStore: (...args: unknown[]) =>
    usePluginRuntimeStoreMock(...args),
  usePluginSectionKind: (...args: unknown[]) =>
    usePluginSectionKindMock(...args),
}));
vi.mock("components/Panes/paneFns", () => ({
  onOverviewTabClick: (...args: unknown[]) => onOverviewTabClickMock(...args),
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
  processProjectStateUpdateFromBackend: (...args: unknown[]) =>
    processProjectStateUpdateFromBackendMock(...args),
}));
vi.mock("state/definitions", () => ({
  useProjectState: (...args: unknown[]) => useProjectStateMock(...args),
}));
vi.mock("openapi/http", () => ({
  deleteSections: (...args: unknown[]) => routeDeleteSectionsMock(...args),
  getLatestProjectState: (...args: unknown[]) =>
    routeGetLatestProjectStateMock(...args),
}));
function isElementNode(value: unknown): value is ElementNode {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as {
    type?: unknown;
    props?: unknown;
  };
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
function renderFallbackCard(
  sectionId = "section-1",
  isUserView = false,
): ElementNode {
  const root = PluginArea({ sectionId, isUserView });
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
    runtimeStatus = "loaded";
    runtimeStatusMessage = null;
    currentProjectConfigId = "project-config-1";
    routeGetLatestProjectStateMock.mockResolvedValue({
      data: { projectState: "latest" },
      response: { status: 200 } as Response,
    });
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
      delete (
        globalThis as {
          navigator?: unknown;
        }
      ).navigator;
    }
    vi.clearAllMocks();
  });
  it("opens Plugins tab from fallback action", async () => {
    // Open action should set overview state to the Plugins tab.
    const fallbackCard = renderFallbackCard("section-open");
    const openPluginsButton = findButtonByLabel(fallbackCard, "Open Plugins");
    const event = buildClickEvent();
    await (
      openPluginsButton.props.onClick as (event: unknown) => Promise<void>
    )(event);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(onOverviewTabClickMock).toHaveBeenCalledWith(
      OverviewTabUIConfig.names.Plugins,
    );
  });
  it("shows section-kind-missing fallback wording", () => {
    // Section fallback should provide a specific reason when plugin kind is missing.
    fallbackReason = "section_kind_missing";
    const fallbackCard = renderFallbackCard("section-missing-kind");
    expect(collectText(fallbackCard)).toContain(
      "Plugin section kind is no longer registered by this plugin.",
    );
  });
  it("shows neutral loading card before plugin runtime is ready", () => {
    // Bootstrap rendering should stay in loading state until runtime reports loaded.
    runtimeStatus = "loading";
    const fallbackCard = renderFallbackCard("section-loading");
    expect(collectText(fallbackCard)).toContain("Loading Plugin Section");
    expect(collectText(fallbackCard)).toContain(
      "Waiting for plugin runtime initialization.",
    );
    expect(collectText(fallbackCard)).not.toContain(
      "Plugin Section Unavailable",
    );
  });
  it("shows runtime error card when plugin runtime fails to load", () => {
    // Runtime failures should render explicit error fallback instead of perpetual loading.
    runtimeStatus = "error";
    runtimeStatusMessage = "Failed to fetch plugins runtime: status 503.";
    const fallbackCard = renderFallbackCard("section-runtime-error");
    expect(collectText(fallbackCard)).toContain("Plugin Runtime Error");
    expect(collectText(fallbackCard)).toContain(
      "Failed to fetch plugins runtime: status 503.",
    );
    expect(collectText(fallbackCard)).toContain("Open Plugins");
  });
  it("prefers runtime error card over stale plugin section renderer state", () => {
    // Runtime errors should suppress stale renderer mounts from previous successful loads.
    runtimeStatus = "error";
    runtimeStatusMessage = "Failed to fetch plugins runtime: status 500.";
    pluginSectionKind = {
      pluginId: "setta-fixture-plugin",
      kind: "fixture-kind",
      title: "Fixture Kind",
      renderer: {
        mount: () => undefined,
      },
    };
    const fallbackCard = renderFallbackCard("section-runtime-error-stale");
    expect(collectText(fallbackCard)).toContain("Plugin Runtime Error");
    expect(collectText(fallbackCard)).toContain(
      "Failed to fetch plugins runtime: status 500.",
    );
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
      data: null,
      response: { status: 200 } as Response,
    });
    const fallbackCard = renderFallbackCard("section-delete");
    const deleteButton = findButtonByLabel(fallbackCard, "Delete Section");
    const event = buildClickEvent();
    await (deleteButton.props.onClick as (event: unknown) => Promise<void>)(
      event,
    );
    expect(routeDeleteSectionsMock).toHaveBeenCalledWith({
      body: {
        projectConfigId: "project-config-1",
        sectionIds: ["section-delete"],
      },
    });
    expect(routeGetLatestProjectStateMock).toHaveBeenCalledWith({
      body: {
        projectConfigId: "project-config-1",
      },
    });
    expect(processProjectStateUpdateFromBackendMock).toHaveBeenCalledWith({
      projectState: "latest",
    });
    expect(addTemporaryNotificationMock).toHaveBeenCalledWith(
      "Plugin section deleted.",
      "info",
    );
  });
  it("reports delete failure when backend request is not 200", async () => {
    // Non-200 delete responses should surface error notification and avoid success messaging.
    routeDeleteSectionsMock.mockResolvedValue({
      data: null,
      response: { status: 500 } as Response,
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
  it("hides delete action in user view fallback mode", () => {
    // Read-only user view should not expose destructive fallback actions.
    const fallbackCard = renderFallbackCard("section-read-only", true);
    expect(() =>
      findButtonByLabel(fallbackCard, "Delete Section"),
    ).toThrowError();
  });
});
