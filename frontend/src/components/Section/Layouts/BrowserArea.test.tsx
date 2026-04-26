/* @vitest-environment jsdom */

import {
  getFileBrowserRoot,
  getFolderContents,
  type FilebrowserFolderContentItem,
  type FilebrowserRootResponse,
} from "openapi/http";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import {
  useBrowserSectionFileBrowserState,
  useProjectState,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import {
  BrowserAreaViewModeEnum,
  SectionTypeEnum,
  createProjectConfig,
  type BrowserAreaViewMode,
  type Core,
  type Variant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserArea } from "./BrowserArea";

const openAPI = vi.hoisted(() => ({
  getFileBrowserRoot: vi.fn(),
  getFolderContents: vi.fn(),
}));

vi.mock("openapi/http", async () => {
  const actual =
    await vi.importActual<typeof import("openapi/http")>("openapi/http");
  return {
    ...actual,
    getFileBrowserRoot: openAPI.getFileBrowserRoot,
    getFolderContents: openAPI.getFolderContents,
  };
});

vi.mock("@setta/app-subsystem-frontend-sdk", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@setta/app-subsystem-frontend-sdk")>();
  return {
    ...actual,
    callOpenAPI: function <T>(promise: Promise<T>) {
      return promise;
    },
  };
});

vi.mock("components/Utils/CodeMirror/InlineCodeMirrorInput", async () => {
  const React = await import("react");
  return {
    InlineCodeMirrorInput: ({
      id,
      value,
      placeholder,
      className,
      dummyClassName,
    }: {
      id: string;
      value: string;
      placeholder?: string;
      className?: string;
      dummyClassName?: string;
    }) =>
      React.createElement(
        "span",
        { id, className: dummyClassName ?? className },
        value || placeholder || "",
      ),
  };
});

type RenderedBrowserArea = {
  host: HTMLDivElement;
  root: Root;
};

function buildFolderContentsResponse(
  folderPath: string,
  items: FilebrowserFolderContentItem[],
) {
  return {
    data: {
      folderPath,
      items,
    },
    status: 200,
    hasResponse: true,
  };
}

function createFolderContentItem(
  options: Partial<FilebrowserFolderContentItem> = {},
): FilebrowserFolderContentItem {
  return {
    fullPath: "",
    name: "",
    type: "file",
    ...options,
  };
}

function createRootResponse(
  options: Partial<FilebrowserRootResponse> = {},
): FilebrowserRootResponse {
  return {
    ignorePatterns: [],
    pathSeparator: "/",
    rootPath: "",
    ...options,
  };
}

function syncStoreInitialState(store: {
  getState: () => Record<string, unknown>;
  getInitialState?: () => Record<string, unknown>;
}) {
  if (!store.getInitialState) {
    return;
  }
  const initial = store.getInitialState();
  Object.assign(initial, store.getState());
}

const sectionId = "section-1";
const variantId = "variant-1";
const implId = "impl-1";

const sectionCore: Core = {
  id: sectionId,
  name: "Browser",
  displayName: "",
  variants: [variantId],
  defaultVariant: variantId,
  sharedModifier: {},
  unsharedKeys: [],
};

const sectionVariant: Variant = {
  id: variantId,
  name: "Variant",
  impl: implId,
  nonPresetImpls: [],
  modifier: {},
  isFrozen: false,
};

const baseImpl = {
  type: SectionTypeEnum.Browser,
  id: implId,
  name: "Browser",
  isFrozen: false,
  isInOtherProjectConfigs: false,
  tagColor: null,
  size: { width: 640, height: 360 },
  aspectRatio: false,
  aspectRatioExtraHeight: 0,
  aspectRatioExtraWidth: 0,
  isMinimized: false,
  positionAndSizeLocked: false,
  isPreset: false,
  folder: "",
  hideColumn: false,
  columnWidth: null,
  typesColumnWidth: null,
  viewMode: BrowserAreaViewModeEnum.list,
};

function setBrowserSectionState(viewMode: BrowserAreaViewMode) {
  const projectConfig = createProjectConfig({
    id: "project-1",
    sectionVariantMap: { [sectionId]: variantId },
    topLevelSections: {
      [sectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
    },
  });

  useProjectState.setState((state) => {
    state.projectConfig = projectConfig;
    state.sections = { [sectionId]: sectionCore };
    state.sectionVariants = { [variantId]: sectionVariant };
    state.sectionImpls = {
      [implId]: {
        ...baseImpl,
        viewMode,
      },
    };
    state.previewSectionVariantMap = {};
  });
  syncStoreInitialState(useProjectState);
}

async function renderBrowserArea() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(createElement(BrowserArea, { sectionId }));
  });

  return { host, root } satisfies RenderedBrowserArea;
}

async function flushEffects(): Promise<void> {
  for (let index = 0; index < 3; index += 1) {
    await vi.dynamicImportSettled();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }
}

describe("BrowserArea list view", () => {
  beforeEach(() => {
    resetProjectStores();
    useBrowserSectionFileBrowserState.getState().reset?.();
    openAPI.getFileBrowserRoot.mockReset();
    openAPI.getFolderContents.mockReset();
    globalThis.ResizeObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
    } as typeof ResizeObserver;
    document.body.innerHTML = "";
  });

  afterEach(() => {
    resetProjectStores();
    useBrowserSectionFileBrowserState.getState().reset?.();
  });

  it("renders the explorer pane in list view", () => {
    setBrowserSectionState(BrowserAreaViewModeEnum.list);
    const markup = renderToStaticMarkup(<BrowserArea sectionId={sectionId} />);

    expect(markup).toContain("Filter");
    expect(markup).toContain("Files");
    expect(markup).toContain("Date modified");
    expect(markup).toContain("CodeMirror-FileBrowserFilter");
    expect(markup).toContain(`CodeMirror-${sectionId}-browser-path`);
  });

  it("does not render the explorer pane in thumbnail view", () => {
    setBrowserSectionState(BrowserAreaViewModeEnum.thumbnail);
    const markup = renderToStaticMarkup(<BrowserArea sectionId={sectionId} />);

    expect(markup).not.toContain("Files");
    expect(markup).toContain("Filter");
    expect(markup).toContain("CodeMirror-FileBrowserFilter");
  });

  it("renders history controls in non-list views", () => {
    setBrowserSectionState(BrowserAreaViewModeEnum.thumbnail);
    const markup = renderToStaticMarkup(<BrowserArea sectionId={sectionId} />);

    expect(markup).toContain('aria-label="Go back"');
    expect(markup).toContain('aria-label="Go forward"');
    expect(markup).toContain(`CodeMirror-${sectionId}-browser-path`);
  });

  it("renders history controls in list view", () => {
    setBrowserSectionState(BrowserAreaViewModeEnum.list);
    const markup = renderToStaticMarkup(<BrowserArea sectionId={sectionId} />);

    expect(markup).toContain('aria-label="Go back"');
    expect(markup).toContain('aria-label="Go forward"');
  });

  it("loads the Go root and folder contents into thumbnail view", async () => {
    setBrowserSectionState(BrowserAreaViewModeEnum.thumbnail);
    vi.mocked(getFileBrowserRoot).mockResolvedValue({
      data: createRootResponse({
        rootPath: "/workspace",
        ignorePatterns: ["node_modules"],
        pathSeparator: "/",
      }),
      status: 200,
      hasResponse: true,
    });
    vi.mocked(getFolderContents).mockResolvedValue(
      buildFolderContentsResponse("/workspace", [
        createFolderContentItem({
          name: "assets",
          fullPath: "/workspace/assets",
          type: "folder",
        }),
        createFolderContentItem({
          name: "notes.txt",
          fullPath: "/workspace/notes.txt",
          type: "file",
          size: 12,
        }),
      ]),
    );

    const { host, root } = await renderBrowserArea();

    try {
      await flushEffects();

      expect(getFileBrowserRoot).toHaveBeenCalledTimes(1);
      expect(getFolderContents).toHaveBeenCalledWith({
        body: {
          baseFolderPath: "/workspace",
          folderPath: "/workspace",
          ignorePatterns: ["node_modules"],
          includeSize: true,
          missingFolderBehavior: "empty",
        },
      });
      expect(host.textContent).toContain("assets");
      expect(host.textContent).toContain("notes.txt");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("loads the Go root and folder contents into list view with outside-workspace access", async () => {
    setBrowserSectionState(BrowserAreaViewModeEnum.list);
    vi.mocked(getFileBrowserRoot).mockResolvedValue({
      data: createRootResponse({
        rootPath: "/workspace",
        ignorePatterns: ["node_modules"],
        pathSeparator: "/",
      }),
      status: 200,
      hasResponse: true,
    });
    vi.mocked(getFolderContents).mockResolvedValue(
      buildFolderContentsResponse("/workspace", [
        createFolderContentItem({
          name: "assets",
          fullPath: "/workspace/assets",
          type: "folder",
        }),
      ]),
    );

    const { host, root } = await renderBrowserArea();

    try {
      await flushEffects();

      expect(getFileBrowserRoot).toHaveBeenCalled();
      expect(getFolderContents).toHaveBeenCalledWith({
        body: {
          folderPath: "/workspace",
          ignorePatterns: ["node_modules"],
          maxEntries: 5000,
          includeMtime: true,
          includeSettaInitialized: false,
          allowOutsideWorkspaceRoot: true,
          missingFolderBehavior: "empty",
        },
      });
      expect(host.textContent).toContain("assets");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
