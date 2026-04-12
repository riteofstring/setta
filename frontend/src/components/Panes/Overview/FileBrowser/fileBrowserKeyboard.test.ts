import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { handleFileBrowserKeyDown } from "./fileBrowserKeyboard";
import type {
  FileBrowserClipboardEntry,
  FlattenedNode,
} from "./fileBrowserPaneShared";

function buildNode(
  overrides: Partial<FlattenedNode> & Pick<FlattenedNode, "fullPath" | "name">,
): FlattenedNode {
  return {
    depth: 0,
    type: "file",
    parentPath: "/root",
    ...overrides,
  };
}

function buildKeyboardEvent(
  overrides: Partial<ReactKeyboardEvent<HTMLDivElement>> = {},
) {
  const event = {
    key: "",
    metaKey: false,
    ctrlKey: false,
    preventDefault: vi.fn(),
    target: {
      closest: () => null,
      isContentEditable: false,
    },
    ...overrides,
  };
  return event as ReactKeyboardEvent<HTMLDivElement> & {
    preventDefault: ReturnType<typeof vi.fn>;
  };
}

function runKeyDown(args: {
  event: ReactKeyboardEvent<HTMLDivElement>;
  displayedItems: FlattenedNode[];
  selectedIndex: number;
  rootPath: string | null;
  expandedPaths?: Record<string, boolean>;
  childrenByPath?: Record<string, string[]>;
  clipboardEntryRef?: { current: FileBrowserClipboardEntry | null };
  handlePasteClipboard?: () => void;
  onToggle?: (path: string) => void;
  onSelect?: (path: string) => void;
  onOpen?: (path: string) => void;
}) {
  handleFileBrowserKeyDown({
    event: args.event,
    displayedItems: args.displayedItems,
    selectedIndex: args.selectedIndex,
    rootPath: args.rootPath,
    expandedPaths: args.expandedPaths ?? {},
    childrenByPath: args.childrenByPath ?? {},
    clipboardEntryRef: args.clipboardEntryRef ?? ({ current: null } as const),
    handlePasteClipboard: args.handlePasteClipboard ?? vi.fn(),
    onToggle: args.onToggle ?? vi.fn(),
    onSelect: args.onSelect ?? vi.fn(),
    onOpen: args.onOpen ?? vi.fn(),
    listRef: {
      current: {
        scrollToRow: vi.fn(),
      },
    },
  });
}

describe("handleFileBrowserKeyDown", () => {
  it("stores clipboard copy data for the selected non-root item", () => {
    const clipboardEntryRef = {
      current: null as FileBrowserClipboardEntry | null,
    };
    const event = buildKeyboardEvent({ key: "c", metaKey: true });

    runKeyDown({
      event,
      displayedItems: [
        buildNode({
          fullPath: "/root",
          name: "root",
          type: "folder",
          parentPath: null,
        }),
        buildNode({
          fullPath: "/root/file.txt",
          name: "file.txt",
        }),
      ],
      selectedIndex: 1,
      rootPath: "/root",
      clipboardEntryRef,
    });

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(clipboardEntryRef.current).toEqual({
      sourcePath: "/root/file.txt",
      sourceType: "file",
      operation: "copy",
    });
  });

  it("runs paste from the keyboard shortcut", () => {
    const handlePasteClipboard = vi.fn();
    const event = buildKeyboardEvent({ key: "v", ctrlKey: true });

    runKeyDown({
      event,
      displayedItems: [
        buildNode({
          fullPath: "/root/file.txt",
          name: "file.txt",
        }),
      ],
      selectedIndex: 0,
      rootPath: "/root",
      handlePasteClipboard,
    });

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(handlePasteClipboard).toHaveBeenCalledOnce();
  });

  it("expands a collapsed folder on ArrowRight and selects its first child when already expanded", () => {
    const onToggle = vi.fn();
    const onSelect = vi.fn();
    const currentItem = buildNode({
      fullPath: "/root/folder",
      name: "folder",
      type: "folder",
    });

    runKeyDown({
      event: buildKeyboardEvent({ key: "ArrowRight" }),
      displayedItems: [currentItem],
      selectedIndex: 0,
      rootPath: "/root",
      onToggle,
      onSelect,
    });
    expect(onToggle).toHaveBeenCalledWith("/root/folder");
    expect(onSelect).not.toHaveBeenCalled();

    runKeyDown({
      event: buildKeyboardEvent({ key: "ArrowRight" }),
      displayedItems: [currentItem],
      selectedIndex: 0,
      rootPath: "/root",
      expandedPaths: { "/root/folder": true },
      childrenByPath: { "/root/folder": ["/root/folder/child.txt"] },
      onToggle,
      onSelect,
    });
    expect(onSelect).toHaveBeenCalledWith("/root/folder/child.txt");
  });

  it("ignores ArrowRight for files", () => {
    const onToggle = vi.fn();
    const onSelect = vi.fn();
    const event = buildKeyboardEvent({ key: "ArrowRight" });

    runKeyDown({
      event,
      displayedItems: [
        buildNode({
          fullPath: "/root/file.txt",
          name: "file.txt",
        }),
      ],
      selectedIndex: 0,
      rootPath: "/root",
      onToggle,
      onSelect,
    });

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(onToggle).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("selects the parent folder on ArrowLeft when the current item is not an expanded folder", () => {
    const onSelect = vi.fn();

    runKeyDown({
      event: buildKeyboardEvent({ key: "ArrowLeft" }),
      displayedItems: [
        buildNode({
          fullPath: "/root/folder/file.txt",
          name: "file.txt",
          parentPath: "/root/folder",
        }),
      ],
      selectedIndex: 0,
      rootPath: "/root",
      onSelect,
    });

    expect(onSelect).toHaveBeenCalledWith("/root/folder");
  });

  it("collapses an expanded folder on ArrowLeft", () => {
    const onToggle = vi.fn();
    const onSelect = vi.fn();
    const event = buildKeyboardEvent({ key: "ArrowLeft" });

    runKeyDown({
      event,
      displayedItems: [
        buildNode({
          fullPath: "/root/folder",
          name: "folder",
          type: "folder",
          parentPath: "/root",
        }),
      ],
      selectedIndex: 0,
      rootPath: "/root",
      expandedPaths: { "/root/folder": true },
      onToggle,
      onSelect,
    });

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(onToggle).toHaveBeenCalledWith("/root/folder");
    expect(onSelect).not.toHaveBeenCalled();
  });
});
