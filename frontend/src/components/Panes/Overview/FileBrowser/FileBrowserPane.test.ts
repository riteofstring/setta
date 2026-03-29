import { describe, expect, it } from "vitest";
import {
  buildFileBrowserLoadingPathOwner,
  flattenFileBrowserTree,
  forEachWithConcurrencyLimit,
  getSettaBadgeRefreshFolderPaths,
  isEditableFileBrowserTarget,
  isOwnedFileBrowserLoadingPath,
  shouldCheckRootWorkspaceInitialization,
  shouldLoadRootWorkspaceInitializationMetadata,
  shouldRefreshMovedExpandedFolder,
  shouldRefreshRootAfterFileBrowserTransfer,
  shouldRefreshSettaBadgeDataOnToggleChange,
  shouldShowSettaInitializedFolderIcon,
  shouldSkipFileBrowserTransfer,
  sortChildPaths,
  type FileNode,
} from "./FileBrowserPane";

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

describe("shouldCheckRootWorkspaceInitialization", () => {
  it("checks initialization only for the active root", () => {
    expect(
      shouldCheckRootWorkspaceInitialization({
        folderPath: "/workspace",
        rootPath: "/workspace",
      }),
    ).toBe(true);
    expect(
      shouldCheckRootWorkspaceInitialization({
        folderPath: "/workspace/child",
        rootPath: "/workspace",
      }),
    ).toBe(false);
    expect(
      shouldCheckRootWorkspaceInitialization({
        folderPath: "/workspace",
        rootPath: null,
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
