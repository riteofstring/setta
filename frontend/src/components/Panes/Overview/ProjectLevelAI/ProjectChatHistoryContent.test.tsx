/* @vitest-environment jsdom */

import { act, createRef, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ProjectChatHistoryEntry,
  type ThreadGroupSection,
} from "./projectChatHistoryViewModel";

type ContentProps = {
  hasAnyContent: boolean;
  showNoThreadsPlaceholder: boolean;
  emptyStateText: string;
  onStartNewThread: () => void;
  threadListScrollRef: RefObject<HTMLDivElement | null>;
  threadDndSensors: [];
  threadDndContext: {
    isMovingFree: boolean;
    isSorting: boolean;
  };
  onDragStart?: undefined;
  onDragMove?: undefined;
  onDragEnd?: undefined;
  onDragCancel?: undefined;
  searchableGroupSections: Array<ThreadGroupSection>;
  pinnedSearchableGroupSections: Array<ThreadGroupSection>;
  unpinnedSearchableGroupSections: Array<ThreadGroupSection>;
  pinnedSortableGroupDndIds: Array<string>;
  unpinnedSortableGroupDndIds: Array<string>;
  projectConfigId: string;
  chatId: string | null | undefined;
  viewedThreadIdsSet: Set<string>;
  pinnedThreadIdsSet: Set<string>;
  groupSortableEnabledById: Map<string, boolean>;
  threadsSortableEnabled: boolean;
  selectedGroupId: string | null;
  editingGroupId: string | null;
  activeThreadDragId: string | null;
  threadDragHoverGroupId: string | null;
  onStartEditing: (groupId: string | null) => void;
  onFinishEditing: () => void;
  onRenameGroup: (groupId: string, nextName: string) => boolean;
  onToggleGroupPinned: (groupId: string) => void;
  onToggleThreadPinned: (threadId: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onDeleteThread: (threadId: string) => void;
  onSelectThread: (entry: ProjectChatHistoryEntry) => void;
  onSelectGroup: (groupId: string | null) => void;
  onStartThreadInGroup: (groupId: string) => void;
  hasMasterSearch: boolean;
  masterSearchMatchCountByChatId: Map<string, number>;
  activeMasterSearchMatchThreadId: string | null;
  showThreadAgentBadges: boolean;
  threadAgentBadgeLabelByChatId: Map<string, string>;
  activeThreadWaitingForResponse: boolean;
  ungroupedEntries: Array<ProjectChatHistoryEntry>;
  deleteGroupTooltipContent: string;
  deleteThreadTooltipContent: string;
};

function createHistoryEntry(
  overrides: Partial<ProjectChatHistoryEntry> = {},
): ProjectChatHistoryEntry {
  return {
    chatId: "chat-1",
    label: "Thread",
    nameSource: null,
    lastUpdatedMs: 1,
    waitingForResponse: false,
    runType: "llm_chat",
    engineConfigId: null,
    ...overrides,
  };
}

function createGroupSection(
  overrides: Partial<ThreadGroupSection> = {},
): ThreadGroupSection {
  return {
    id: "group-a",
    name: "Alpha",
    collapsed: false,
    pinned: false,
    entries: [createHistoryEntry()],
    ...overrides,
  };
}

function createContentProps(
  overrides: Partial<ContentProps> = {},
): ContentProps {
  return {
    hasAnyContent: false,
    showNoThreadsPlaceholder: false,
    emptyStateText: "Loading threads...",
    onStartNewThread: vi.fn(),
    threadListScrollRef: createRef<HTMLDivElement>(),
    threadDndSensors: [],
    threadDndContext: {
      isMovingFree: false,
      isSorting: false,
    },
    searchableGroupSections: [],
    pinnedSearchableGroupSections: [],
    unpinnedSearchableGroupSections: [],
    pinnedSortableGroupDndIds: [],
    unpinnedSortableGroupDndIds: [],
    projectConfigId: "project-a",
    chatId: null,
    viewedThreadIdsSet: new Set(),
    pinnedThreadIdsSet: new Set(),
    groupSortableEnabledById: new Map(),
    threadsSortableEnabled: false,
    selectedGroupId: null,
    editingGroupId: null,
    activeThreadDragId: null,
    threadDragHoverGroupId: null,
    onStartEditing: vi.fn(),
    onFinishEditing: vi.fn(),
    onRenameGroup: vi.fn(() => true),
    onToggleGroupPinned: vi.fn(),
    onToggleThreadPinned: vi.fn(),
    onDeleteGroup: vi.fn(),
    onDeleteThread: vi.fn(),
    onSelectThread: vi.fn(),
    onSelectGroup: vi.fn(),
    onStartThreadInGroup: vi.fn(),
    hasMasterSearch: false,
    masterSearchMatchCountByChatId: new Map(),
    activeMasterSearchMatchThreadId: null,
    showThreadAgentBadges: false,
    threadAgentBadgeLabelByChatId: new Map(),
    activeThreadWaitingForResponse: false,
    ungroupedEntries: [],
    deleteGroupTooltipContent: "Delete this group.",
    deleteThreadTooltipContent: "Delete this thread.",
    ...overrides,
  };
}

describe("ProjectChatHistoryContent", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    class ResizeObserverStub {
      disconnect() {}
      observe() {}
      unobserve() {}
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    vi.unstubAllGlobals();
    host.remove();
    document.body.innerHTML = "";
  });

  async function renderContent(
    overrides: Partial<ContentProps> = {},
  ): Promise<ContentProps> {
    const props = createContentProps(overrides);
    const { ProjectChatHistoryContent } = await import(
      "./ProjectChatHistoryContent"
    );

    await act(async () => {
      root.render(<ProjectChatHistoryContent {...props} />);
    });

    return props;
  }

  it("renders the start-thread empty state and routes the CTA", async () => {
    const onStartNewThread = vi.fn();

    await renderContent({
      hasAnyContent: false,
      showNoThreadsPlaceholder: true,
      emptyStateText: "No threads yet",
      onStartNewThread,
    });

    const startButton = host.querySelector(
      '[data-testid="project-chat-threads-empty-state-start-thread-button"]',
    );
    if (!(startButton instanceof HTMLButtonElement)) {
      throw new Error("Expected a start-thread empty-state button.");
    }

    await act(async () => {
      startButton.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    // The extracted content surface should keep the no-thread CTA wired to the parent start-thread command.
    expect(
      host.querySelector('[data-testid="project-chat-threads-empty-state"]'),
    ).not.toBeNull();
    expect(onStartNewThread).toHaveBeenCalledTimes(1);
  });

  it("renders the search placeholder copy when the filter hides every thread", async () => {
    await renderContent({
      hasAnyContent: false,
      showNoThreadsPlaceholder: false,
      emptyStateText: "No conversations match this filter.",
    });

    // Search-empty copy should remain a lightweight text placeholder rather than the start-thread card.
    expect(host.textContent).toContain("No conversations match this filter.");
    expect(
      host.querySelector('[data-testid="project-chat-threads-empty-state"]'),
    ).toBeNull();
  });

  it("renders pinned, unpinned, and ungrouped surfaces through the extracted content module", async () => {
    const pinnedGroup = createGroupSection({
      id: "group-pinned",
      name: "Pinned Group",
      pinned: true,
    });
    const unpinnedGroup = createGroupSection({
      id: "group-unpinned",
      name: "Unpinned Group",
      pinned: false,
    });
    const ungroupedEntry = createHistoryEntry({
      chatId: "chat-ungrouped",
      label: "Ungrouped thread",
    });

    await renderContent({
      hasAnyContent: true,
      searchableGroupSections: [pinnedGroup, unpinnedGroup],
      pinnedSearchableGroupSections: [pinnedGroup],
      unpinnedSearchableGroupSections: [unpinnedGroup],
      pinnedSortableGroupDndIds: ["project-chat-thread-group::group-pinned"],
      unpinnedSortableGroupDndIds: [
        "project-chat-thread-group::group-unpinned",
      ],
      groupSortableEnabledById: new Map([
        ["group-pinned", false],
        ["group-unpinned", false],
      ]),
      ungroupedEntries: [ungroupedEntry],
    });

    // This locks the extracted page-level list composition, including the formerly stale pinned-group branch.
    expect(
      host.querySelector('[data-testid="project-chat-pinned-groups-label"]'),
    ).not.toBeNull();
    expect(
      host.querySelector('[data-testid="project-chat-unpinned-groups-label"]'),
    ).not.toBeNull();
    expect(
      host.querySelectorAll('[data-testid="project-chat-thread-group-row"]'),
    ).toHaveLength(2);
    expect(
      host.querySelector('[data-testid="project-chat-ungrouped-label"]'),
    ).not.toBeNull();
  });
});
