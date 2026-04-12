import type {
  MutableRefObject,
  KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { isEditableFileBrowserTarget } from "./fileBrowserPaneCore";
import type {
  FileBrowserClipboardEntry,
  FlattenedNode,
  NodeKind,
} from "./fileBrowserPaneShared";

type ListRefShape = {
  current?: {
    scrollToRow: (args: { index: number; align: "smart" }) => void;
  } | null;
};

function selectIndex(args: {
  index: number;
  displayedItems: FlattenedNode[];
  onSelect: (path: string) => void;
  listRef: ListRefShape;
}): void {
  const item = args.displayedItems[args.index];
  if (!item) {
    return;
  }
  args.onSelect(item.fullPath);
  args.listRef.current?.scrollToRow({ index: args.index, align: "smart" });
}

function handleClipboardShortcut(args: {
  event: ReactKeyboardEvent<HTMLDivElement>;
  selectedIndex: number;
  displayedItems: FlattenedNode[];
  rootPath: string | null;
  clipboardEntryRef: MutableRefObject<FileBrowserClipboardEntry | null>;
  handlePasteClipboard: () => void;
}): boolean {
  const lowerKey = args.event.key.toLowerCase();
  const hasModifier = args.event.metaKey || args.event.ctrlKey;
  if (!hasModifier || !["c", "v", "x"].includes(lowerKey)) {
    return false;
  }
  if (isEditableFileBrowserTarget(args.event.target)) {
    return false;
  }
  if (lowerKey === "v") {
    args.event.preventDefault();
    args.handlePasteClipboard();
    return true;
  }
  if (args.selectedIndex < 0) {
    return true;
  }
  const selectedItem = args.displayedItems[args.selectedIndex];
  if (!selectedItem || selectedItem.fullPath === args.rootPath) {
    return true;
  }
  args.event.preventDefault();
  args.clipboardEntryRef.current = {
    sourcePath: selectedItem.fullPath,
    sourceType: selectedItem.type as NodeKind,
    operation: lowerKey === "x" ? "move" : "copy",
  };
  return true;
}

function handleEmptySelectionNavigation(args: {
  event: ReactKeyboardEvent<HTMLDivElement>;
  displayedItems: FlattenedNode[];
  onSelect: (path: string) => void;
  listRef: ListRefShape;
}): boolean {
  if (args.event.key !== "ArrowDown" && args.event.key !== "ArrowUp") {
    return false;
  }
  args.event.preventDefault();
  selectIndex({
    index: args.event.key === "ArrowDown" ? 0 : args.displayedItems.length - 1,
    displayedItems: args.displayedItems,
    onSelect: args.onSelect,
    listRef: args.listRef,
  });
  return true;
}

function handleArrowNavigation(args: {
  event: ReactKeyboardEvent<HTMLDivElement>;
  selectedIndex: number;
  displayedItems: FlattenedNode[];
  onSelect: (path: string) => void;
  listRef: ListRefShape;
}): boolean {
  if (args.event.key !== "ArrowDown" && args.event.key !== "ArrowUp") {
    return false;
  }
  args.event.preventDefault();
  const delta = args.event.key === "ArrowDown" ? 1 : -1;
  const nextIndex = Math.min(
    Math.max(args.selectedIndex + delta, 0),
    args.displayedItems.length - 1,
  );
  selectIndex({
    index: nextIndex,
    displayedItems: args.displayedItems,
    onSelect: args.onSelect,
    listRef: args.listRef,
  });
  return true;
}

function handleHorizontalNavigation(args: {
  event: ReactKeyboardEvent<HTMLDivElement>;
  currentItem: FlattenedNode;
  expandedPaths: Record<string, boolean>;
  childrenByPath: Record<string, string[]>;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
}): boolean {
  if (args.event.key === "ArrowRight" && args.currentItem.type === "folder") {
    args.event.preventDefault();
    if (args.expandedPaths[args.currentItem.fullPath] !== true) {
      args.onToggle(args.currentItem.fullPath);
      return true;
    }
    const firstChild = args.childrenByPath[args.currentItem.fullPath]?.[0];
    if (firstChild) {
      args.onSelect(firstChild);
    }
    return true;
  }
  if (args.event.key !== "ArrowLeft") {
    return false;
  }
  args.event.preventDefault();
  if (
    args.currentItem.type === "folder" &&
    args.expandedPaths[args.currentItem.fullPath] === true
  ) {
    args.onToggle(args.currentItem.fullPath);
    return true;
  }
  if (args.currentItem.parentPath) {
    args.onSelect(args.currentItem.parentPath);
  }
  return true;
}

export function handleFileBrowserKeyDown(args: {
  event: ReactKeyboardEvent<HTMLDivElement>;
  displayedItems: FlattenedNode[];
  selectedIndex: number;
  rootPath: string | null;
  expandedPaths: Record<string, boolean>;
  childrenByPath: Record<string, string[]>;
  clipboardEntryRef: MutableRefObject<FileBrowserClipboardEntry | null>;
  handlePasteClipboard: () => void;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  onOpen: (path: string) => void;
  listRef: ListRefShape;
}): void {
  if (args.displayedItems.length === 0) {
    return;
  }
  if (
    handleClipboardShortcut({
      event: args.event,
      selectedIndex: args.selectedIndex,
      displayedItems: args.displayedItems,
      rootPath: args.rootPath,
      clipboardEntryRef: args.clipboardEntryRef,
      handlePasteClipboard: args.handlePasteClipboard,
    })
  ) {
    return;
  }
  if (args.selectedIndex < 0) {
    void handleEmptySelectionNavigation({
      event: args.event,
      displayedItems: args.displayedItems,
      onSelect: args.onSelect,
      listRef: args.listRef,
    });
    return;
  }
  const currentItem = args.displayedItems[args.selectedIndex];
  if (!currentItem) {
    return;
  }
  if (
    handleArrowNavigation({
      event: args.event,
      selectedIndex: args.selectedIndex,
      displayedItems: args.displayedItems,
      onSelect: args.onSelect,
      listRef: args.listRef,
    }) ||
    handleHorizontalNavigation({
      event: args.event,
      currentItem,
      expandedPaths: args.expandedPaths,
      childrenByPath: args.childrenByPath,
      onToggle: args.onToggle,
      onSelect: args.onSelect,
    })
  ) {
    return;
  }
  if (args.event.key === "Enter") {
    args.event.preventDefault();
    args.onOpen(currentItem.fullPath);
  }
}
