/* @vitest-environment jsdom */

import "testUtils/reactRefreshPreamble";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await vi.importActual<
    typeof import("utils/generatedEndpoints")
  >("utils/generatedEndpoints");
  return {
    ...actual,
    route_check_workspace_initialized: vi.fn(),
    route_get_file_browser_download_urls: vi.fn(),
    route_get_file_browser_root: vi.fn(),
    route_get_folder_contents: vi.fn(),
  };
});

import { useHomeFileBrowserState } from "state/stores/fileBrowserStores";
import {
  route_check_workspace_initialized,
  route_get_file_browser_root,
  route_get_folder_contents,
} from "utils/generatedEndpoints";
import { useFileBrowserPaneTreeData } from "./useFileBrowserPaneTreeData";

function FileBrowserTreeDataHarness() {
  const { displayedItems, handleNavigateToPath, rootPath } =
    useFileBrowserPaneTreeData({
      allowOutsideWorkspaceRoot: true,
      fileBrowserState: useHomeFileBrowserState,
      includeSettaInitializedFolders: false,
      showPathNavigation: true,
    });

  return (
    <div>
      <button
        type="button"
        data-testid="navigate-workspace-b"
        onClick={() => handleNavigateToPath("/workspace-b")}
      >
        Navigate
      </button>
      <button
        type="button"
        data-testid="search-match"
        onClick={() => {
          useHomeFileBrowserState.setState({
            filterText: "match",
            searchScope: "recursive",
          });
        }}
      >
        Search
      </button>
      <div data-testid="root-path">{rootPath ?? ""}</div>
      <div data-testid="items">
        {displayedItems.map((item) => item.fullPath).join("|")}
      </div>
    </div>
  );
}

describe("useFileBrowserPaneTreeData", () => {
  let host: HTMLDivElement;
  let root: Root;

  function getByTestId(testId: string): HTMLElement {
    const element = host.querySelector(`[data-testid="${testId}"]`);
    if (!(element instanceof HTMLElement)) {
      throw new Error(`Missing element for test id: ${testId}`);
    }
    return element;
  }

  function getItemsText(): string {
    return getByTestId("items").textContent ?? "";
  }

  beforeEach(() => {
    vi.clearAllMocks();
    useHomeFileBrowserState.getState().reset?.();

    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    vi.mocked(route_check_workspace_initialized).mockResolvedValue({
      data: false,
      hasResponse: true,
      status: 200,
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    useHomeFileBrowserState.getState().reset?.();
  });

  it("ignores stale folder responses after the root changes", async () => {
    let resolveWorkspaceA:
      | ((value: {
          data: Array<{
            fullPath: string;
            isSettaInitialized?: boolean;
            mtime?: number;
            name: string;
            type: "file" | "folder";
          }>;
          hasResponse: boolean;
          status: number;
        }) => void)
      | null = null;

    vi.mocked(route_get_file_browser_root).mockResolvedValue({
      data: {
        ignorePatterns: [],
        pathSeparator: "/",
        rootPath: "/workspace-a",
      },
      hasResponse: true,
      status: 200,
    });
    vi.mocked(route_get_folder_contents).mockImplementation(
      async ({ folderPath }) => {
        if (folderPath === "/workspace-a") {
          return await new Promise((resolve) => {
            resolveWorkspaceA = resolve;
          });
        }
        if (folderPath === "/workspace-b") {
          return {
            data: [
              {
                fullPath: "/workspace-b/b.txt",
                mtime: 10,
                name: "b.txt",
                type: "file",
              },
            ],
            hasResponse: true,
            status: 200,
          };
        }
        return {
          data: [],
          hasResponse: true,
          status: 200,
        };
      },
    );

    await act(async () => {
      root.render(<FileBrowserTreeDataHarness />);
    });

    // The initial root load intentionally stays pending so the follow-up
    // navigation can prove stale responses are discarded.
    await vi.waitFor(() => {
      expect(route_get_folder_contents).toHaveBeenCalledWith(
        expect.objectContaining({ folderPath: "/workspace-a" }),
      );
    });

    await act(async () => {
      getByTestId("navigate-workspace-b").click();
    });

    await vi.waitFor(() => {
      expect(route_get_folder_contents).toHaveBeenCalledWith(
        expect.objectContaining({ folderPath: "/workspace-b" }),
      );
    });
    await vi.waitFor(() => {
      expect(getByTestId("root-path").textContent).toBe("/workspace-b");
      expect(getItemsText()).toContain("/workspace-b/b.txt");
    });

    if (!resolveWorkspaceA) {
      throw new Error("Expected the initial workspace-a load to be pending.");
    }
    resolveWorkspaceA({
      data: [
        {
          fullPath: "/workspace-a/a.txt",
          mtime: 5,
          name: "a.txt",
          type: "file",
        },
      ],
      hasResponse: true,
      status: 200,
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(getByTestId("root-path").textContent).toBe("/workspace-b");
    expect(getItemsText()).toContain("/workspace-b/b.txt");
    expect(getItemsText()).not.toContain("/workspace-a/a.txt");
  });

  it("crawls uncached nested folders when recursive search becomes active", async () => {
    vi.mocked(route_get_file_browser_root).mockResolvedValue({
      data: {
        ignorePatterns: [],
        pathSeparator: "/",
        rootPath: "/workspace",
      },
      hasResponse: true,
      status: 200,
    });
    vi.mocked(route_get_folder_contents).mockImplementation(
      async ({ folderPath }) => {
        if (folderPath === "/workspace") {
          return {
            data: [
              {
                fullPath: "/workspace/nested",
                mtime: 12,
                name: "nested",
                type: "folder",
              },
            ],
            hasResponse: true,
            status: 200,
          };
        }
        if (folderPath === "/workspace/nested") {
          return {
            data: [
              {
                fullPath: "/workspace/nested/match.txt",
                mtime: 20,
                name: "match.txt",
                type: "file",
              },
            ],
            hasResponse: true,
            status: 200,
          };
        }
        return {
          data: [],
          hasResponse: true,
          status: 200,
        };
      },
    );

    await act(async () => {
      root.render(<FileBrowserTreeDataHarness />);
    });

    // Before the search starts, the hook should stop at the loaded root folder.
    await vi.waitFor(() => {
      expect(route_get_folder_contents).toHaveBeenCalledTimes(1);
      expect(getItemsText()).toContain("/workspace/nested");
    });

    await act(async () => {
      getByTestId("search-match").click();
    });

    // Recursive search should fetch the uncached nested folder and surface the match.
    await vi.waitFor(() => {
      expect(route_get_folder_contents).toHaveBeenCalledWith(
        expect.objectContaining({ folderPath: "/workspace/nested" }),
      );
      expect(getItemsText()).toContain("/workspace/nested/match.txt");
    });
  });
});
