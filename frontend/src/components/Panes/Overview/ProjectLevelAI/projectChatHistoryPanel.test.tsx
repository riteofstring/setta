/* @vitest-environment jsdom */

import "testUtils/reactRefreshPreamble";

import { act, createRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { toThreadGroupDndId } from "./projectChatHistoryDnd";
import {
  type ProjectChatHistoryEntry,
  type ThreadGroupSection,
} from "./projectChatHistoryViewModel";

type ProjectChatHistoryPanelType =
  typeof import("./projectChatHistoryPanel").ProjectChatHistoryPanel;
type ProjectChatHistoryPanelProps = Parameters<ProjectChatHistoryPanelType>[0];

type PanelHarnessProps = Omit<
  ProjectChatHistoryPanelProps,
  | "editingGroupId"
  | "masterSearchInput"
  | "setMasterSearchInput"
  | "onStartEditingGroup"
  | "onFinishEditingGroup"
> & {
  initialEditingGroupId?: string | null;
  initialMasterSearchInput?: string;
  onStartEditingGroup?: ProjectChatHistoryPanelProps["onStartEditingGroup"];
  onFinishEditingGroup?: ProjectChatHistoryPanelProps["onFinishEditingGroup"];
};

let ProjectChatHistoryPanel: ProjectChatHistoryPanelType;

function buildHistoryEntry(
  overrides: Partial<ProjectChatHistoryEntry> = {},
): ProjectChatHistoryEntry {
  return {
    chatId: "thread-1",
    label: "Thread 1",
    nameSource: "deterministic",
    lastUpdatedMs: 1,
    waitingForResponse: false,
    runType: "llm_chat",
    engineConfigId: "engine-1",
    ...overrides,
  };
}

function buildThreadGroupSection(
  overrides: Partial<ThreadGroupSection> = {},
): ThreadGroupSection {
  return {
    id: "group-1",
    name: "Alpha Group",
    collapsed: false,
    pinned: false,
    entries: [],
    ...overrides,
  };
}

function buildPanelProps(
  overrides: Partial<ProjectChatHistoryPanelProps> = {},
): ProjectChatHistoryPanelProps {
  const setMasterSearchInput: ProjectChatHistoryPanelProps["setMasterSearchInput"] =
    () => undefined;
  const threadDndSensors: ProjectChatHistoryPanelProps["threadDndSensors"] = [];
  const threadDndContext: ProjectChatHistoryPanelProps["threadDndContext"] = {
    isMovingFree: false,
    isSorting: false,
  };

  return {
    chatId: null,
    inline: false,
    selectedGroupId: null,
    editingGroupId: null,
    activeThreadDragId: null,
    threadDragHoverGroupId: null,
    headerPortalTarget: null,
    projectConfigId: "project-1",
    threadListScrollRef: createRef<HTMLDivElement>(),
    masterSearchInput: "",
    setMasterSearchInput,
    hasMasterSearch: false,
    masterSearchCounterText: "0/0",
    masterSearchMatchCount: 0,
    searchableGroupSections: [],
    pinnedSearchableGroupSections: [],
    unpinnedSearchableGroupSections: [],
    ungroupedEntries: [],
    pinnedSortableGroupDndIds: [],
    unpinnedSortableGroupDndIds: [],
    viewedThreadIdsSet: new Set<string>(),
    pinnedThreadIdsSet: new Set<string>(),
    groupSortableEnabledById: new Map<string, boolean>(),
    threadsSortableEnabled: false,
    masterSearchMatchCountByChatId: new Map<string, number>(),
    activeMasterSearchMatchThreadId: null,
    showThreadAgentBadges: true,
    threadAgentBadgeLabelByChatId: new Map<string, string>(),
    activeThreadWaitingForResponse: false,
    placeholderText: "No threads yet",
    canUndoDeletedThreadOrGroup: false,
    threadDndSensors,
    threadDndContext,
    onStepMasterSearch: () => undefined,
    onToggleThreadAgentBadges: () => undefined,
    onRestoreDeletedThreadOrGroup: () => undefined,
    onCreateGroup: () => undefined,
    onStartEditingGroup: () => undefined,
    onFinishEditingGroup: () => undefined,
    onRenameGroup: () => true,
    onToggleGroupPinned: () => undefined,
    onToggleThreadPinned: () => undefined,
    onDeleteGroup: () => undefined,
    onDeleteThread: () => undefined,
    onSelectThread: () => undefined,
    onSelectGroup: () => undefined,
    onStartThreadInGroup: () => undefined,
    onStartNewThread: () => undefined,
    onDragStart: () => undefined,
    onDragMove: () => undefined,
    onDragEnd: () => undefined,
    onDragCancel: () => undefined,
    ...overrides,
  };
}

function PanelHarness({
  initialEditingGroupId = null,
  initialMasterSearchInput = "",
  onStartEditingGroup,
  onFinishEditingGroup,
  ...props
}: PanelHarnessProps) {
  const [editingGroupId, setEditingGroupId] = useState<string | null>(
    initialEditingGroupId,
  );
  const [masterSearchInput, setMasterSearchInput] = useState(
    initialMasterSearchInput,
  );

  return (
    <ProjectChatHistoryPanel
      {...props}
      editingGroupId={editingGroupId}
      masterSearchInput={masterSearchInput}
      setMasterSearchInput={setMasterSearchInput}
      onStartEditingGroup={(groupId) => {
        setEditingGroupId(groupId);
        onStartEditingGroup?.(groupId);
      }}
      onFinishEditingGroup={() => {
        setEditingGroupId(null);
        onFinishEditingGroup?.();
      }}
    />
  );
}

describe("ProjectChatHistoryPanel", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeAll(async () => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    ({ ProjectChatHistoryPanel } = await import("./projectChatHistoryPanel"));
  });

  function getByTestId(testId: string): HTMLElement {
    const element = host.querySelector(`[data-testid="${testId}"]`);
    if (!(element instanceof HTMLElement)) {
      throw new Error(`Missing element for test id: ${testId}`);
    }
    return element;
  }

  function getThreadEntry(label: string): HTMLElement {
    const match = Array.from(
      host.querySelectorAll<HTMLElement>(
        '[data-testid="project-chat-thread-entry"]',
      ),
    ).find((element) => element.textContent?.includes(label));
    if (!match) {
      throw new Error(`Missing thread entry for label: ${label}`);
    }
    return match;
  }

  function getInputByTestId(testId: string): HTMLInputElement {
    const element = getByTestId(testId);
    if (!(element instanceof HTMLInputElement)) {
      throw new Error(`Expected input element for test id: ${testId}`);
    }
    return element;
  }

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("renders the empty state while moving the toolbar into the header portal", async () => {
    const portalTarget = document.createElement("div");
    document.body.appendChild(portalTarget);
    const onStartNewThread = vi.fn();
    const props = buildPanelProps({
      headerPortalTarget: portalTarget,
      onStartNewThread,
    });

    try {
      await act(async () => {
        root.render(<PanelHarness {...props} />);
      });

      const toolbarInPortal = portalTarget.querySelector(
        '[data-testid="project-chat-threads-toolbar"]',
      );

      // The extracted panel should keep the toolbar in the external header slot when one is provided.
      expect(toolbarInPortal).not.toBeNull();
      expect(getByTestId("project-chat-threads-empty-state")).toBeTruthy();

      await act(async () => {
        getByTestId(
          "project-chat-threads-empty-state-start-thread-button",
        ).click();
      });

      // The empty-state CTA must still trigger the same coordinator callback after the render extraction.
      expect(onStartNewThread).toHaveBeenCalledTimes(1);
    } finally {
      portalTarget.remove();
    }
  });

  it("keeps grouped and ungrouped thread actions routed through the extracted render owners", async () => {
    const groupedEntry = buildHistoryEntry({
      chatId: "group-thread",
      label: "Grouped Thread",
    });
    const ungroupedEntry = buildHistoryEntry({
      chatId: "ungrouped-thread",
      label: "Loose Thread",
    });
    const groupSection = buildThreadGroupSection({
      entries: [groupedEntry],
    });
    const onRenameGroup = vi.fn((groupId: string, nextName: string) => {
      return groupId.length > 0 && nextName.length > 0;
    });
    const onSelectGroup = vi.fn();
    const onSelectThread = vi.fn();
    const props = buildPanelProps({
      searchableGroupSections: [groupSection],
      unpinnedSearchableGroupSections: [groupSection],
      ungroupedEntries: [ungroupedEntry],
      unpinnedSortableGroupDndIds: [toThreadGroupDndId(groupSection.id)],
      groupSortableEnabledById: new Map([[groupSection.id, false]]),
      onRenameGroup,
      onSelectGroup,
      onSelectThread,
    });

    await act(async () => {
      root.render(<PanelHarness {...props} />);
    });

    // The panel should still render the extracted group and ungrouped sections together.
    expect(getByTestId("project-chat-thread-group-row").textContent).toContain(
      "Alpha Group",
    );
    expect(getByTestId("project-chat-ungrouped-label").textContent).toContain(
      "Ungrouped",
    );

    await act(async () => {
      getByTestId("project-chat-thread-group-edit-button").click();
    });

    const renameInput = getInputByTestId(
      "project-chat-thread-group-name-input",
    );
    const setInputValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    if (!setInputValue) {
      throw new Error("Expected HTMLInputElement.value setter.");
    }
    await act(async () => {
      setInputValue.call(renameInput, "  Renamed   Group  ");
      renameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      renameInput.blur();
    });

    // Inline group rename still normalizes spacing before dispatching to the coordinator callback.
    expect(onRenameGroup).toHaveBeenCalledWith("group-1", "Renamed Group");

    onSelectGroup.mockClear();
    onSelectThread.mockClear();
    await act(async () => {
      getThreadEntry("Grouped Thread").click();
    });

    // Grouped thread clicks should keep selecting both the owning group and the thread entry.
    expect(onSelectGroup).toHaveBeenCalledWith("group-1");
    expect(onSelectThread).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: "group-thread" }),
    );

    onSelectGroup.mockClear();
    onSelectThread.mockClear();
    await act(async () => {
      getThreadEntry("Loose Thread").click();
    });

    // Ungrouped threads should still clear the selected group before routing thread selection upward.
    expect(onSelectGroup).toHaveBeenCalledWith(null);
    expect(onSelectThread).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: "ungrouped-thread" }),
    );
  });
});
