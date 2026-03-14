/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useLocalStorage } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toThreadGroupDndId } from "./projectChatHistoryDragUtils";
import {
  type ProjectChatHistoryEntry,
  type ThreadGroupSection,
} from "./projectChatHistoryViewModel";

type GroupFolderProps = {
  section: ThreadGroupSection;
  groupDndId: string;
  chatId: string | null | undefined;
  projectConfigId: string;
  viewedThreadIdsSet: Set<string>;
  pinnedThreadIdsSet: Set<string>;
  groupSortableEnabled: boolean;
  threadSortableEnabled: boolean;
  isSelected: boolean;
  isEditing: boolean;
  isThreadDragActive: boolean;
  isThreadDragHovering: boolean;
  deleteGroupTooltipContent: string;
  deleteThreadTooltipContent: string;
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

function createGroupFolderProps(
  overrides: Partial<GroupFolderProps> = {},
): GroupFolderProps {
  const section = overrides.section ?? createGroupSection();

  return {
    section,
    groupDndId: toThreadGroupDndId(section.id),
    chatId: null,
    projectConfigId: "project-a",
    viewedThreadIdsSet: new Set(),
    pinnedThreadIdsSet: new Set(),
    groupSortableEnabled: false,
    threadSortableEnabled: false,
    isSelected: false,
    isEditing: false,
    isThreadDragActive: false,
    isThreadDragHovering: false,
    deleteGroupTooltipContent: "Delete this group.",
    deleteThreadTooltipContent: "Delete this thread.",
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
    ...overrides,
  };
}

describe("ProjectChatHistoryGroupFolder", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    class ResizeObserverStub {
      disconnect() {}
      observe() {}
      unobserve() {}
    }

    resetProjectStores();
    useLocalStorage.setState({
      projectChatThreadGroupsByProjectConfigId: {},
    });
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

  async function renderGroupFolder(
    overrides: Partial<GroupFolderProps> = {},
  ): Promise<GroupFolderProps> {
    const props = createGroupFolderProps(overrides);
    const [{ DragDropProvider }, { ProjectChatHistoryGroupFolder }] =
      await Promise.all([
        import("forks/dnd-kit/adapter"),
        import("./ProjectChatHistoryGroupFolder"),
      ]);

    await act(async () => {
      root.render(
        <DragDropProvider
          sensors={[]}
          dndContext={{
            isMovingFree: false,
            isSorting: false,
          }}
        >
          <ProjectChatHistoryGroupFolder {...props} />
        </DragDropProvider>,
      );
    });

    return props;
  }

  it("routes group selection and toggles the persisted collapsed state", async () => {
    const section = createGroupSection({
      id: "group-a",
      name: "Alpha",
    });
    const onSelectGroup = vi.fn();
    useLocalStorage.setState({
      projectChatThreadGroupsByProjectConfigId: {
        "project-a": [
          {
            id: "group-a",
            name: "Alpha",
            collapsed: false,
            pinned: false,
          },
        ],
      },
    });

    await renderGroupFolder({
      section,
      onSelectGroup,
    });

    const selectRow = host.querySelector(
      '[data-testid="project-chat-thread-group-select"]',
    );
    if (!(selectRow instanceof HTMLDivElement)) {
      throw new Error("Expected a thread group select row.");
    }

    await act(async () => {
      selectRow.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          button: 0,
        }),
      );
    });

    // The extracted group surface should keep selection publication tied to the real collapsed-state store update.
    expect(onSelectGroup).toHaveBeenCalledWith("group-a");
    expect(
      useLocalStorage.getState().projectChatThreadGroupsByProjectConfigId[
        "project-a"
      ]?.[0]?.collapsed,
    ).toBe(true);
  });

  it("starts a new group chat without bubbling into the collapse toggle", async () => {
    const section = createGroupSection({
      id: "group-a",
      name: "Alpha",
    });
    const onSelectGroup = vi.fn();
    const onStartThreadInGroup = vi.fn();
    useLocalStorage.setState({
      projectChatThreadGroupsByProjectConfigId: {
        "project-a": [
          {
            id: "group-a",
            name: "Alpha",
            collapsed: false,
            pinned: false,
          },
        ],
      },
    });

    await renderGroupFolder({
      section,
      onSelectGroup,
      onStartThreadInGroup,
    });

    const newChatButton = host.querySelector(
      '[data-testid="project-chat-thread-group-new-chat-button"]',
    );
    if (!(newChatButton instanceof HTMLButtonElement)) {
      throw new Error("Expected a thread group new-chat button.");
    }

    await act(async () => {
      newChatButton.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    // Group actions should stay isolated from the row-select collapse handler.
    expect(onSelectGroup).toHaveBeenCalledWith("group-a");
    expect(onStartThreadInGroup).toHaveBeenCalledWith("group-a");
    expect(
      useLocalStorage.getState().projectChatThreadGroupsByProjectConfigId[
        "project-a"
      ]?.[0]?.collapsed,
    ).toBe(false);
  });

  it("commits normalized rename text when the inline editor blurs", async () => {
    const onRenameGroup = vi.fn(() => true);
    const onFinishEditing = vi.fn();

    await renderGroupFolder({
      isEditing: true,
      onRenameGroup,
      onFinishEditing,
    });

    const input = host.querySelector(
      '[data-testid="project-chat-thread-group-name-input"]',
    );
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Expected a thread group name input.");
    }

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      if (!valueSetter) {
        throw new Error("Expected an input value setter.");
      }
      valueSetter.call(input, "  Renamed   Group  ");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => {
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });

    // Inline rename should keep the same normalization and finish-edit flow after extraction.
    expect(onRenameGroup).toHaveBeenCalledWith("group-a", "Renamed Group");
    expect(onFinishEditing).toHaveBeenCalled();
  });
});
