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
    route_get_file_browser_root: vi.fn(),
    route_get_folder_contents: vi.fn(),
  };
});

import { useBrowserSectionFileBrowserState } from "state/stores/fileBrowserStores";
import {
  route_get_file_browser_root,
  route_get_folder_contents,
} from "utils/generatedEndpoints";
import {
  BrowserAreaViewModeEnum,
  type FolderContentItem,
} from "utils/generatedTypes";
import { useBrowserAreaFolderSession } from "./useBrowserAreaFolderSession";

function BrowserAreaFolderSessionHarness({
  viewMode = BrowserAreaViewModeEnum.thumbnail,
}: {
  viewMode?: BrowserAreaViewModeEnum;
}) {
  const session = useBrowserAreaFolderSession({
    sectionId: "section-1",
    viewMode,
    folder: "",
    savedSearches: [],
    isFrozen: false,
  });
  const displayedItems = session.isListView
    ? session.items
    : session.filteredVisibleItems;

  return (
    <div>
      <button
        type="button"
        data-testid="navigate-beta"
        onClick={() => session.handlePathCommit("/workspace/beta")}
      >
        Navigate beta
      </button>
      <button
        type="button"
        data-testid="navigate-gamma"
        onClick={() => session.handlePathCommit("/workspace/gamma")}
      >
        Navigate gamma
      </button>
      <button
        type="button"
        data-testid="go-back"
        onClick={session.handleGoBack}
      >
        Back
      </button>
      <button
        type="button"
        data-testid="go-forward"
        onClick={session.handleGoForward}
      >
        Forward
      </button>
      <button
        type="button"
        data-testid="search-match"
        onClick={() => {
          useBrowserSectionFileBrowserState.setState({
            filterText: "match",
            searchScope: "recursive",
          });
        }}
      >
        Search
      </button>
      <div data-testid="effective-folder">{session.effectiveFolder}</div>
      <div data-testid="can-go-back">{String(session.canGoBack)}</div>
      <div data-testid="can-go-forward">{String(session.canGoForward)}</div>
      <div data-testid="items">
        {displayedItems.map((item) => item.fullPath).join("|")}
      </div>
    </div>
  );
}

describe("useBrowserAreaFolderSession", () => {
  let host: HTMLDivElement;
  let root: Root;

  function getByTestId(testId: string): HTMLElement {
    const element = host.querySelector(`[data-testid="${testId}"]`);
    if (!(element instanceof HTMLElement)) {
      throw new Error(`Missing element for test id: ${testId}`);
    }
    return element;
  }

  function clickByTestId(testId: string): void {
    getByTestId(testId).click();
  }

  function getItemsText(): string {
    return getByTestId("items").textContent ?? "";
  }

  beforeEach(() => {
    vi.clearAllMocks();
    useBrowserSectionFileBrowserState.getState().reset?.();

    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    useBrowserSectionFileBrowserState.getState().reset?.();
  });

  it("ignores stale folder responses after folder navigation advances", async () => {
    let resolveWorkspaceRoot:
      | ((value: {
          data: FolderContentItem[];
          hasResponse: boolean;
          status: number;
        }) => void)
      | null = null;

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
          return await new Promise((resolve) => {
            resolveWorkspaceRoot = resolve;
          });
        }
        if (folderPath === "/workspace/beta") {
          return {
            data: [
              {
                fullPath: "/workspace/beta/b.txt",
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
      root.render(<BrowserAreaFolderSessionHarness />);
    });

    // Keep the initial root listing unresolved so the follow-up navigation can
    // prove stale folder responses are discarded.
    await vi.waitFor(() => {
      expect(route_get_folder_contents).toHaveBeenCalledWith(
        expect.objectContaining({ folderPath: "/workspace" }),
      );
    });

    await act(async () => {
      clickByTestId("navigate-beta");
    });

    await vi.waitFor(() => {
      expect(route_get_folder_contents).toHaveBeenCalledWith(
        expect.objectContaining({ folderPath: "/workspace/beta" }),
      );
    });
    await vi.waitFor(() => {
      expect(getByTestId("effective-folder").textContent).toBe(
        "/workspace/beta",
      );
      expect(getItemsText()).toContain("/workspace/beta/b.txt");
    });

    if (!resolveWorkspaceRoot) {
      throw new Error(
        "Expected the initial workspace root load to stay pending.",
      );
    }
    resolveWorkspaceRoot({
      data: [
        {
          fullPath: "/workspace/a.txt",
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

    expect(getByTestId("effective-folder").textContent).toBe("/workspace/beta");
    expect(getItemsText()).toContain("/workspace/beta/b.txt");
    expect(getItemsText()).not.toContain("/workspace/a.txt");
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
      root.render(<BrowserAreaFolderSessionHarness />);
    });

    // Toggle recursive filtering after the root listing loads so the extracted
    // folder-session owner has to crawl the uncached nested folder itself.
    await vi.waitFor(() => {
      expect(getItemsText()).toContain("/workspace/nested");
    });

    await act(async () => {
      clickByTestId("search-match");
    });

    await vi.waitFor(() => {
      expect(route_get_folder_contents).toHaveBeenCalledWith(
        expect.objectContaining({ folderPath: "/workspace/nested" }),
      );
    });
    await vi.waitFor(() => {
      expect(getItemsText()).toContain("/workspace/nested/match.txt");
    });
  });

  it("tracks folder history so back and forward restore prior locations", async () => {
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
            data: [],
            hasResponse: true,
            status: 200,
          };
        }
        if (folderPath === "/workspace/beta") {
          return {
            data: [
              {
                fullPath: "/workspace/beta/b.txt",
                mtime: 10,
                name: "b.txt",
                type: "file",
              },
            ],
            hasResponse: true,
            status: 200,
          };
        }
        if (folderPath === "/workspace/gamma") {
          return {
            data: [
              {
                fullPath: "/workspace/gamma/c.txt",
                mtime: 20,
                name: "c.txt",
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
      root.render(<BrowserAreaFolderSessionHarness />);
    });

    // Visit two folders so the extracted history owner has real back/forward
    // entries to replay.
    await act(async () => {
      clickByTestId("navigate-beta");
    });
    await vi.waitFor(() => {
      expect(getByTestId("effective-folder").textContent).toBe(
        "/workspace/beta",
      );
      expect(getItemsText()).toContain("/workspace/beta/b.txt");
    });

    await act(async () => {
      clickByTestId("navigate-gamma");
    });
    await vi.waitFor(() => {
      expect(getByTestId("effective-folder").textContent).toBe(
        "/workspace/gamma",
      );
      expect(getItemsText()).toContain("/workspace/gamma/c.txt");
      expect(getByTestId("can-go-back").textContent).toBe("true");
    });

    await act(async () => {
      clickByTestId("go-back");
    });
    await vi.waitFor(() => {
      expect(getByTestId("effective-folder").textContent).toBe(
        "/workspace/beta",
      );
      expect(getItemsText()).toContain("/workspace/beta/b.txt");
      expect(getByTestId("can-go-forward").textContent).toBe("true");
    });

    await act(async () => {
      clickByTestId("go-forward");
    });
    await vi.waitFor(() => {
      expect(getByTestId("effective-folder").textContent).toBe(
        "/workspace/gamma",
      );
      expect(getItemsText()).toContain("/workspace/gamma/c.txt");
    });
  });
});
