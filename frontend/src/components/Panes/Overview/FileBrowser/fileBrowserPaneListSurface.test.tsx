/* @vitest-environment jsdom */

import "testUtils/reactRefreshPreamble";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useListRef } from "react-window";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FileBrowserPaneListSurface,
  type FileBrowserPaneListSurfaceProps,
} from "./fileBrowserPaneListSurface";
import type { FlattenedNode } from "./fileBrowserPaneTreeModel";

function FileBrowserPaneListSurfaceHarness(
  props: Omit<FileBrowserPaneListSurfaceProps, "listRef">,
) {
  const listRef = useListRef();
  return <FileBrowserPaneListSurface {...props} listRef={listRef} />;
}

function buildNode({
  name,
  fullPath,
  type,
  depth,
  mtime,
  parentPath,
  isSettaInitialized,
}: {
  name: string;
  fullPath: string;
  type: "folder" | "file";
  depth: number;
  mtime?: number;
  parentPath: string | null;
  isSettaInitialized?: boolean;
}): FlattenedNode {
  return {
    name,
    fullPath,
    type,
    depth,
    mtime,
    parentPath,
    isSettaInitialized,
  };
}

describe("FileBrowserPaneListSurface", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("routes sort actions and preloads image preview urls for visible rows", async () => {
    const onSort = vi.fn();
    const requestFileUrls = vi.fn();

    await act(async () => {
      root.render(
        <FileBrowserPaneListSurfaceHarness
          displayedItems={[
            buildNode({
              name: "workspace",
              fullPath: "/root",
              type: "folder",
              depth: 0,
              parentPath: null,
            }),
            buildNode({
              name: "photo.png",
              fullPath: "/root/photo.png",
              type: "file",
              depth: 1,
              parentPath: "/root",
              mtime: 5,
            }),
            buildNode({
              name: "notes.txt",
              fullPath: "/root/notes.txt",
              type: "file",
              depth: 1,
              parentPath: "/root",
              mtime: 4,
            }),
          ]}
          expandedPaths={{ "/root": true }}
          selectedPath={null}
          rootPath="/root"
          fileUrlMap={{}}
          showSearchPathTooltips={false}
          loadingPaths={{}}
          errorByPath={{}}
          showSettaInitializedBadge={false}
          sortKey="name"
          sortDirection="asc"
          requestFileUrls={requestFileUrls}
          onKeyDown={() => {}}
          onToggle={() => {}}
          onSelect={() => {}}
          onOpen={() => {}}
          onDropIntoFolder={() => {}}
          onSort={onSort}
        />,
      );
    });

    await vi.waitFor(() => {
      expect(requestFileUrls).toHaveBeenCalledWith(["/root/photo.png"]);
    });

    const sortByName = host.querySelector(
      'button[aria-label="Sort by name (A to Z)"]',
    );
    const sortByDate = host.querySelector(
      'button[aria-label="Sort by date modified (newest to oldest)"]',
    );
    if (!(sortByName instanceof HTMLButtonElement)) {
      throw new Error("Missing sort-by-name button.");
    }
    if (!(sortByDate instanceof HTMLButtonElement)) {
      throw new Error("Missing sort-by-date button.");
    }

    await act(async () => {
      sortByName.click();
      sortByDate.click();
    });

    expect(onSort).toHaveBeenNthCalledWith(1, "name");
    expect(onSort).toHaveBeenNthCalledWith(2, "modified");
  });

  it("routes row selection, folder toggle, and file open actions", async () => {
    const onSelect = vi.fn();
    const onToggle = vi.fn();
    const onOpen = vi.fn();

    await act(async () => {
      root.render(
        <FileBrowserPaneListSurfaceHarness
          displayedItems={[
            buildNode({
              name: "workspace",
              fullPath: "/root",
              type: "folder",
              depth: 0,
              parentPath: null,
            }),
            buildNode({
              name: "docs",
              fullPath: "/root/docs",
              type: "folder",
              depth: 1,
              parentPath: "/root",
            }),
            buildNode({
              name: "notes.md",
              fullPath: "/root/notes.md",
              type: "file",
              depth: 1,
              parentPath: "/root",
              mtime: 8,
            }),
          ]}
          expandedPaths={{ "/root": true }}
          selectedPath={null}
          rootPath="/root"
          fileUrlMap={{}}
          showSearchPathTooltips={false}
          loadingPaths={{}}
          errorByPath={{}}
          showSettaInitializedBadge={false}
          sortKey="name"
          sortDirection="asc"
          requestFileUrls={() => {}}
          onKeyDown={() => {}}
          onToggle={onToggle}
          onSelect={onSelect}
          onOpen={onOpen}
          onDropIntoFolder={() => {}}
          onSort={() => {}}
        />,
      );
    });

    const rows = Array.from(
      host.querySelectorAll<HTMLElement>('[data-testid="file-browser-row"]'),
    );
    const docsRow = rows.find((row) => row.dataset.path === "/root/docs");
    const notesRow = rows.find((row) => row.dataset.path === "/root/notes.md");
    if (!docsRow || !notesRow) {
      throw new Error("Missing expected file browser rows.");
    }

    await act(async () => {
      docsRow.click();
    });
    expect(onSelect).toHaveBeenCalledWith("/root/docs");

    const docsToggle = docsRow.querySelector(
      '[data-filebrowser-toggle="true"]',
    );
    if (!(docsToggle instanceof HTMLElement)) {
      throw new Error("Missing folder toggle button.");
    }

    await act(async () => {
      docsToggle.click();
    });
    expect(onToggle).toHaveBeenCalledWith("/root/docs");

    const notesPrimaryCell = notesRow.firstElementChild;
    if (!(notesPrimaryCell instanceof HTMLElement)) {
      throw new Error("Missing row content cell.");
    }

    await act(async () => {
      notesPrimaryCell.dispatchEvent(
        new MouseEvent("dblclick", { bubbles: true, cancelable: true }),
      );
    });

    expect(onSelect).toHaveBeenCalledWith("/root/notes.md");
    expect(onOpen).toHaveBeenCalledWith("/root/notes.md");
  });
});
