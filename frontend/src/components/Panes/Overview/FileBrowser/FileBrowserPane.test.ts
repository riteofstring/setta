/* @vitest-environment jsdom */

import {
  getFileBrowserRoot,
  getFolderContents,
  type FilebrowserFolderContentItem,
  type FilebrowserRootResponse,
} from "openapi/http";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useFileBrowserState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileBrowserPane, type FileNode } from "./FileBrowserPane";
import {
  buildFileBrowserLoadingPathOwner,
  forEachWithConcurrencyLimit,
  getResolvedFileBrowserRootState,
  getSettaBadgeRefreshFolderPaths,
  isEditableFileBrowserTarget,
  isOwnedFileBrowserLoadingPath,
  shouldLoadRootWorkspaceInitializationMetadata,
  shouldRefreshMovedExpandedFolder,
  shouldRefreshRootAfterFileBrowserTransfer,
  shouldRefreshSettaBadgeDataOnToggleChange,
  shouldShowSettaInitializedFolderIcon,
  shouldSkipFileBrowserTransfer,
} from "./fileBrowserPaneCore";
import { flattenFileBrowserTree, sortChildPaths } from "./fileBrowserPaneTree";

const openAPI = vi.hoisted(() => ({
  getFileBrowserRoot: vi.fn(),
  getFolderContents: vi.fn(),
  checkWorkspaceInitialized: vi.fn(),
  getFileBrowserDownloadUrls: vi.fn(),
  transferFileBrowserEntry: vi.fn(),
}));

vi.mock("openapi/http", async () => {
  const actual =
    await vi.importActual<typeof import("openapi/http")>("openapi/http");
  return {
    ...actual,
    getFileBrowserRoot: openAPI.getFileBrowserRoot,
    getFolderContents: openAPI.getFolderContents,
    checkWorkspaceInitialized: openAPI.checkWorkspaceInitialized,
    getFileBrowserDownloadUrls: openAPI.getFileBrowserDownloadUrls,
    transferFileBrowserEntry: openAPI.transferFileBrowserEntry,
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

vi.mock("react-window", async () => {
  const React = await import("react");
  return {
    List: ({
      rowComponent: RowComponent,
      rowCount,
      rowProps,
      style,
      className,
    }: {
      rowComponent: React.ComponentType<Record<string, unknown>>;
      rowCount: number;
      rowProps: Record<string, unknown>;
      style?: React.CSSProperties;
      className?: string;
    }) =>
      React.createElement(
        "div",
        { style, className },
        Array.from({ length: rowCount }, (_value, index) =>
          React.createElement(RowComponent, {
            key: index,
            index,
            style: {},
            ...rowProps,
          }),
        ),
      ),
    useListRef: () => ({ current: { scrollToRow() {} } }),
  };
});

vi.mock("state/hooks/useColumnWidthDrag", () => ({
  useColumnWidthDrag: () => ({
    handleResizeStart() {},
    setNewWidth() {},
    widthRef: { current: { currentWidth: 0 } },
  }),
}));

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

type RenderedFileBrowserPane = {
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

async function renderFileBrowserPane() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(
      createElement(FileBrowserPane, {
        showFilter: false,
      }),
    );
  });

  return { host, root } satisfies RenderedFileBrowserPane;
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

function buildNode(
  name: string,
  type: "folder" | "file",
  mtime: number,
): FileNode {
  return {
    name,
    fullPath: name,
    type,
    parentPath: "/root",
    mtime,
  };
}

describe("sortChildPaths", () => {
  beforeEach(() => {
    resetProjectStores();
    useFileBrowserState.setState({
      rootPath: null,
      selectedPath: null,
      expandedPaths: {},
      filterText: "",
      pathSeparator: "/",
      ignorePatterns: [],
      typeFilters: {
        folder: true,
        file: true,
        image: true,
        audio: true,
        video: true,
        archive: true,
        code: true,
        text: true,
      },
      searchScope: "recursive",
    });
    openAPI.getFileBrowserRoot.mockReset();
    openAPI.getFolderContents.mockReset();
    openAPI.checkWorkspaceInitialized.mockReset();
    openAPI.getFileBrowserDownloadUrls.mockReset();
    openAPI.transferFileBrowserEntry.mockReset();
    openAPI.checkWorkspaceInitialized.mockResolvedValue({
      data: false,
      status: 200,
      hasResponse: true,
    });
    globalThis.ResizeObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
    } as typeof ResizeObserver;
    document.body.innerHTML = "";
  });

  it("sorts by name with folders first", () => {
    const nodesByPath: Record<string, FileNode> = {
      folder: buildNode("folder", "folder", 10),
      "b.txt": buildNode("b.txt", "file", 20),
      "A.txt": buildNode("A.txt", "file", 30),
      "c.txt": buildNode("c.txt", "file", 40),
    };
    const paths = ["b.txt", "folder", "c.txt", "A.txt"];

    expect(
      sortChildPaths({
        paths,
        nodesByPath,
        sortKey: "name",
        sortDirection: "asc",
      }),
    ).toEqual(["folder", "A.txt", "b.txt", "c.txt"]);

    expect(
      sortChildPaths({
        paths,
        nodesByPath,
        sortKey: "name",
        sortDirection: "desc",
      }),
    ).toEqual(["folder", "c.txt", "b.txt", "A.txt"]);
  });

  it("sorts by modified date with folders first", () => {
    const nodesByPath: Record<string, FileNode> = {
      folder: buildNode("folder", "folder", 5),
      "old.txt": buildNode("old.txt", "file", 100),
      "new.txt": buildNode("new.txt", "file", 300),
    };
    const paths = ["old.txt", "new.txt", "folder"];

    expect(
      sortChildPaths({
        paths,
        nodesByPath,
        sortKey: "modified",
        sortDirection: "asc",
      }),
    ).toEqual(["folder", "old.txt", "new.txt"]);

    expect(
      sortChildPaths({
        paths,
        nodesByPath,
        sortKey: "modified",
        sortDirection: "desc",
      }),
    ).toEqual(["folder", "new.txt", "old.txt"]);
  });

  it("does not mutate the input array", () => {
    const nodesByPath: Record<string, FileNode> = {
      "a.txt": buildNode("a.txt", "file", 10),
      "b.txt": buildNode("b.txt", "file", 20),
    };
    const paths = ["b.txt", "a.txt"];
    const original = [...paths];

    sortChildPaths({
      paths,
      nodesByPath,
      sortKey: "name",
      sortDirection: "asc",
    });

    expect(paths).toEqual(original);
  });

  it("loads the Go root and folder contents into the pane", async () => {
    vi.mocked(getFileBrowserRoot).mockResolvedValue({
      data: createRootResponse({
        rootPath: "/workspace",
        pathSeparator: "/",
        ignorePatterns: ["node_modules"],
      }),
      status: 200,
      hasResponse: true,
    });
    vi.mocked(getFolderContents).mockResolvedValue(
      buildFolderContentsResponse("/workspace", [
        createFolderContentItem({
          name: "src",
          type: "folder",
          fullPath: "/workspace/src",
        }),
        createFolderContentItem({
          name: "notes.txt",
          type: "file",
          fullPath: "/workspace/notes.txt",
          mtime: 123,
        }),
      ]),
    );

    const { host, root } = await renderFileBrowserPane();

    try {
      await flushEffects();

      expect(getFileBrowserRoot).toHaveBeenCalledWith();
      expect(getFolderContents).toHaveBeenCalledWith({
        body: {
          folderPath: "/workspace",
          ignorePatterns: ["node_modules"],
          maxEntries: 5000,
          includeMtime: true,
          includeSettaInitialized: false,
          allowOutsideWorkspaceRoot: false,
          missingFolderBehavior: "empty",
        },
      });
      expect(useFileBrowserState.getState().rootPath).toBe("/workspace");
      expect(host.textContent).toContain("workspace");
      expect(host.textContent).toContain("src");
      expect(host.textContent).toContain("notes.txt");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("canonicalizes root state when the backend resolves a different folder path", () => {
    expect(
      getResolvedFileBrowserRootState({
        state: {
          rootPath: "src",
          selectedPath: "src",
          expandedPaths: { src: true, "/workspace/other": true },
        },
        requestedRootPath: "src",
        resolvedRootPath: "/workspace/src",
      }),
    ).toEqual({
      rootPath: "/workspace/src",
      selectedPath: "/workspace/src",
      expandedPaths: {
        "/workspace/src": true,
        "/workspace/other": true,
      },
    });
  });
});

describe("flattenFileBrowserTree", () => {
  it("filters by extension globs like *.jpg (pane browser)", () => {
    const rootPath = "/root";
    const nodesByPath: Record<string, FileNode> = {
      [rootPath]: {
        name: "root",
        fullPath: rootPath,
        type: "folder",
        parentPath: null,
      },
      "/root/images": {
        name: "images",
        fullPath: "/root/images",
        type: "folder",
        parentPath: rootPath,
      },
      "/root/images/cat.jpg": {
        name: "cat.jpg",
        fullPath: "/root/images/cat.jpg",
        type: "file",
        parentPath: "/root/images",
      },
      "/root/images/cat.png": {
        name: "cat.png",
        fullPath: "/root/images/cat.png",
        type: "file",
        parentPath: "/root/images",
      },
      "/root/docs": {
        name: "docs",
        fullPath: "/root/docs",
        type: "folder",
        parentPath: rootPath,
      },
      "/root/docs/README.md": {
        name: "README.md",
        fullPath: "/root/docs/README.md",
        type: "file",
        parentPath: "/root/docs",
      },
    };
    const childrenByPath: Record<string, string[]> = {
      [rootPath]: ["/root/images", "/root/docs"],
      "/root/images": ["/root/images/cat.jpg", "/root/images/cat.png"],
      "/root/docs": ["/root/docs/README.md"],
    };

    const flattened = flattenFileBrowserTree({
      rootPath,
      nodesByPath,
      expandedPaths: {},
      filterText: "*.jpg",
      getChildPaths: (path) => childrenByPath[path] ?? [],
    });

    expect(flattened.map((x) => x.fullPath)).toEqual([
      "/root",
      "/root/images",
      "/root/images/cat.jpg",
    ]);
  });

  it("filters by fuzzy file name matches (pane browser)", () => {
    const rootPath = "/root";
    const nodesByPath: Record<string, FileNode> = {
      [rootPath]: {
        name: "root",
        fullPath: rootPath,
        type: "folder",
        parentPath: null,
      },
      "/root/docs": {
        name: "docs",
        fullPath: "/root/docs",
        type: "folder",
        parentPath: rootPath,
      },
      "/root/docs/README.md": {
        name: "README.md",
        fullPath: "/root/docs/README.md",
        type: "file",
        parentPath: "/root/docs",
      },
      "/root/docs/notes.txt": {
        name: "notes.txt",
        fullPath: "/root/docs/notes.txt",
        type: "file",
        parentPath: "/root/docs",
      },
    };
    const childrenByPath: Record<string, string[]> = {
      [rootPath]: ["/root/docs"],
      "/root/docs": ["/root/docs/README.md", "/root/docs/notes.txt"],
    };

    const flattened = flattenFileBrowserTree({
      rootPath,
      nodesByPath,
      expandedPaths: {},
      filterText: "rdme",
      getChildPaths: (path) => childrenByPath[path] ?? [],
    });

    expect(flattened.map((x) => x.fullPath)).toEqual([
      "/root",
      "/root/docs",
      "/root/docs/README.md",
    ]);
  });

  it("supports local filtering (only the current folder)", () => {
    const rootPath = "/root";
    const nodesByPath: Record<string, FileNode> = {
      [rootPath]: {
        name: "root",
        fullPath: rootPath,
        type: "folder",
        parentPath: null,
      },
      "/root/images": {
        name: "images",
        fullPath: "/root/images",
        type: "folder",
        parentPath: rootPath,
      },
      "/root/images/cat.jpg": {
        name: "cat.jpg",
        fullPath: "/root/images/cat.jpg",
        type: "file",
        parentPath: "/root/images",
      },
      "/root/README.md": {
        name: "README.md",
        fullPath: "/root/README.md",
        type: "file",
        parentPath: rootPath,
      },
    };
    const childrenByPath: Record<string, string[]> = {
      [rootPath]: ["/root/images", "/root/README.md"],
      "/root/images": ["/root/images/cat.jpg"],
    };

    const flattened = flattenFileBrowserTree({
      rootPath,
      nodesByPath,
      expandedPaths: {},
      filterText: "*.jpg",
      searchScope: "local",
      getChildPaths: (path) => childrenByPath[path] ?? [],
    });

    // cat.jpg is nested; local search should not traverse into /root/images.
    expect(flattened.map((x) => x.fullPath)).toEqual([rootPath]);

    const localReadme = flattenFileBrowserTree({
      rootPath,
      nodesByPath,
      expandedPaths: {},
      filterText: "readme",
      searchScope: "local",
      getChildPaths: (path) => childrenByPath[path] ?? [],
    });
    expect(localReadme.map((x) => x.fullPath)).toEqual([
      rootPath,
      "/root/README.md",
    ]);
  });
});

describe("getSettaBadgeRefreshFolderPaths", () => {
  it("includes the root path and expanded folder paths only", () => {
    const nodesByPath: Record<string, FileNode> = {
      "/root": {
        name: "root",
        fullPath: "/root",
        type: "folder",
        parentPath: null,
      },
      "/root/folder-a": {
        name: "folder-a",
        fullPath: "/root/folder-a",
        type: "folder",
        parentPath: "/root",
      },
      "/root/file-a.txt": {
        name: "file-a.txt",
        fullPath: "/root/file-a.txt",
        type: "file",
        parentPath: "/root",
      },
      "/root/folder-b": {
        name: "folder-b",
        fullPath: "/root/folder-b",
        type: "folder",
        parentPath: "/root",
      },
    };
    const expandedPaths = {
      "/root/folder-a": true,
      "/root/file-a.txt": true,
      "/root/folder-b": false,
    };

    expect(
      getSettaBadgeRefreshFolderPaths({
        rootPath: "/root",
        expandedPaths,
        nodesByPath,
      }),
    ).toEqual(["/root", "/root/folder-a"]);
  });
});

describe("shouldRefreshSettaBadgeDataOnToggleChange", () => {
  it("refreshes only when toggling from off to on", () => {
    expect(
      shouldRefreshSettaBadgeDataOnToggleChange({
        previousIncludeSettaInitializedFolders: false,
        nextIncludeSettaInitializedFolders: true,
      }),
    ).toBe(true);
    expect(
      shouldRefreshSettaBadgeDataOnToggleChange({
        previousIncludeSettaInitializedFolders: true,
        nextIncludeSettaInitializedFolders: false,
      }),
    ).toBe(false);
    expect(
      shouldRefreshSettaBadgeDataOnToggleChange({
        previousIncludeSettaInitializedFolders: true,
        nextIncludeSettaInitializedFolders: true,
      }),
    ).toBe(false);
  });
});

describe("shouldShowSettaInitializedFolderIcon", () => {
  it("shows the Setta icon for initialized folders", () => {
    expect(
      shouldShowSettaInitializedFolderIcon({
        isFolder: true,
        isSettaInitialized: true,
      }),
    ).toBe(true);
    expect(
      shouldShowSettaInitializedFolderIcon({
        isFolder: true,
        isSettaInitialized: false,
      }),
    ).toBe(false);
    expect(
      shouldShowSettaInitializedFolderIcon({
        isFolder: false,
        isSettaInitialized: false,
      }),
    ).toBe(false);
  });
});

describe("shouldLoadRootWorkspaceInitializationMetadata", () => {
  it("requires both Setta metadata mode and root folder context", () => {
    expect(
      shouldLoadRootWorkspaceInitializationMetadata({
        includeSettaInitializedFolders: false,
        folderPath: "/workspace",
        rootPath: "/workspace",
      }),
    ).toBe(false);
    expect(
      shouldLoadRootWorkspaceInitializationMetadata({
        includeSettaInitializedFolders: true,
        folderPath: "/workspace",
        rootPath: "/workspace",
      }),
    ).toBe(true);
    expect(
      shouldLoadRootWorkspaceInitializationMetadata({
        includeSettaInitializedFolders: true,
        folderPath: "/workspace/child",
        rootPath: "/workspace",
      }),
    ).toBe(false);
    expect(
      shouldLoadRootWorkspaceInitializationMetadata({
        includeSettaInitializedFolders: true,
        folderPath: "/workspace",
        rootPath: null,
      }),
    ).toBe(false);
  });
});

describe("file browser loading path ownership", () => {
  it("builds an owner token from root and folder request ids", () => {
    expect(
      buildFileBrowserLoadingPathOwner({
        rootRequestId: 7,
        folderRequestId: 3,
      }),
    ).toBe("7:3");
  });

  it("matches ownership only when the latest request owner is unchanged", () => {
    const loadingPathOwnerByPath = { "/root/folder": "2:1" };
    expect(
      isOwnedFileBrowserLoadingPath({
        loadingPathOwnerByPath,
        folderPath: "/root/folder",
        requestOwner: "2:1",
      }),
    ).toBe(true);
    expect(
      isOwnedFileBrowserLoadingPath({
        loadingPathOwnerByPath,
        folderPath: "/root/folder",
        requestOwner: "3:1",
      }),
    ).toBe(false);
  });
});

describe("isEditableFileBrowserTarget", () => {
  it("detects native form fields and contenteditable targets", () => {
    const input = {
      closest: (selector: string) =>
        selector === "input, textarea, select" ? {} : null,
    };
    const textarea = {
      closest: (selector: string) =>
        selector === "input, textarea, select" ? {} : null,
    };
    const editable = {
      closest: (selector: string) =>
        selector === '[contenteditable]:not([contenteditable="false"])'
          ? {}
          : null,
    };
    const editableByProperty = {
      isContentEditable: true,
      closest: () => null,
    };

    expect(isEditableFileBrowserTarget(input)).toBe(true);
    expect(isEditableFileBrowserTarget(textarea)).toBe(true);
    expect(isEditableFileBrowserTarget(editable)).toBe(true);
    expect(isEditableFileBrowserTarget(editableByProperty)).toBe(true);
  });

  it("detects CodeMirror editor descendants", () => {
    const content = {
      closest: (selector: string) => (selector === ".cm-editor" ? {} : null),
    };

    expect(isEditableFileBrowserTarget(content)).toBe(true);
  });

  it("returns false for non-editable targets", () => {
    const node = {
      closest: () => null,
    };
    expect(isEditableFileBrowserTarget(node)).toBe(false);
    expect(isEditableFileBrowserTarget(null)).toBe(false);
  });
});

describe("file browser transfer guards", () => {
  it("skips move requests when source and destination folders are the same", () => {
    expect(
      shouldSkipFileBrowserTransfer({
        operation: "move",
        sourceParentPath: "/root/folder",
        destinationFolderPath: "/root/folder",
      }),
    ).toBe(true);
    expect(
      shouldSkipFileBrowserTransfer({
        operation: "copy",
        sourceParentPath: "/root/folder",
        destinationFolderPath: "/root/folder",
      }),
    ).toBe(false);
  });

  it("refreshes root only when a transfer touches root contents", () => {
    expect(
      shouldRefreshRootAfterFileBrowserTransfer({
        rootPath: "/root",
        sourceParentPath: "/root/folder",
        destinationFolderPath: "/root/other",
      }),
    ).toBe(false);
    expect(
      shouldRefreshRootAfterFileBrowserTransfer({
        rootPath: "/root",
        sourceParentPath: "/root",
        destinationFolderPath: "/root/other",
      }),
    ).toBe(true);
    expect(
      shouldRefreshRootAfterFileBrowserTransfer({
        rootPath: "/root",
        sourceParentPath: "/root/folder",
        destinationFolderPath: "/root",
      }),
    ).toBe(true);
  });

  it("refreshes moved folder contents when the source folder was expanded", () => {
    expect(
      shouldRefreshMovedExpandedFolder({
        operation: "move",
        sourceType: "folder",
        sourcePath: "/root/source-folder",
        destinationPath: "/root/destination/source-folder",
        expandedPaths: {
          "/root/source-folder": true,
        },
      }),
    ).toBe(true);

    expect(
      shouldRefreshMovedExpandedFolder({
        operation: "move",
        sourceType: "folder",
        sourcePath: "/root/source-folder",
        destinationPath: "/root/destination/source-folder",
        expandedPaths: {
          "/root/source-folder": false,
        },
      }),
    ).toBe(false);

    expect(
      shouldRefreshMovedExpandedFolder({
        operation: "copy",
        sourceType: "folder",
        sourcePath: "/root/source-folder",
        destinationPath: "/root/destination/source-folder",
        expandedPaths: {
          "/root/source-folder": true,
        },
      }),
    ).toBe(false);
  });
});

describe("forEachWithConcurrencyLimit", () => {
  it("runs all tasks while capping max in-flight concurrency", async () => {
    const items = [1, 2, 3, 4, 5, 6];
    let activeCount = 0;
    let maxActiveCount = 0;
    const completed: number[] = [];

    await forEachWithConcurrencyLimit({
      items,
      limit: 2,
      run: async (item) => {
        activeCount += 1;
        if (activeCount > maxActiveCount) {
          maxActiveCount = activeCount;
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
        completed.push(item);
        activeCount -= 1;
      },
    });

    expect(maxActiveCount).toBeLessThanOrEqual(2);
    expect([...completed].sort((a, b) => a - b)).toEqual(items);
  });

  it("throws when the concurrency limit is less than one", async () => {
    await expect(
      forEachWithConcurrencyLimit({
        items: [1],
        limit: 0,
        run: async () => {},
      }),
    ).rejects.toThrow("Concurrency limit must be at least 1.");
  });
});
