/* @vitest-environment jsdom */

import { act, type Dispatch, type SetStateAction } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  clearProjectChatThreadStorageUndoStackForTests,
  createProjectChatThreadGroup,
} from "state/actions/projectChatThreads";
import { useLocalStorage } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ProjectChatHistoryEntry } from "./projectChatHistoryViewModel";
import { useProjectChatHistoryCommandController } from "./useProjectChatHistoryCommandController";

function createHistoryEntry(
  overrides: Partial<ProjectChatHistoryEntry>,
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

type HarnessProps = {
  projectConfigId: string;
  selectedGroupId?: string | null;
  chatId?: string | null | undefined;
  onSelectedGroupChange?: (groupId: string | null) => void;
  onStartNewThread?: () => void;
  onStartNewThreadInGroup?: (groupId: string) => void;
  closeOnSelect?: boolean;
  onCloseThreadsView?: () => void;
  setChatId?: Dispatch<SetStateAction<string | null | undefined>>;
};

let latestController: ReturnType<
  typeof useProjectChatHistoryCommandController
> | null = null;

function StoreBackedHarness({
  projectConfigId,
  selectedGroupId = null,
  chatId = null,
  onSelectedGroupChange,
  onStartNewThread,
  onStartNewThreadInGroup,
  closeOnSelect = true,
  onCloseThreadsView,
  setChatId = () => undefined,
}: HarnessProps) {
  const { threadGroups, threadAssignments, threadOrderIds, pinnedThreadIds } =
    useLocalStorage((state) => ({
      threadGroups:
        state.projectChatThreadGroupsByProjectConfigId[projectConfigId] ?? [],
      threadAssignments:
        state.projectChatThreadAssignmentsByProjectConfigId[projectConfigId] ??
        {},
      threadOrderIds:
        state.projectChatThreadOrderByProjectConfigId[projectConfigId] ?? [],
      pinnedThreadIds:
        state.pinnedProjectChatThreadIdsByProjectConfigId[projectConfigId] ??
        [],
    }));

  const orderedVisibleThreadIds = Array.from(
    new Set([...threadOrderIds, ...Object.keys(threadAssignments)]),
  );
  const pinnedThreadIdsSet = new Set(pinnedThreadIds);
  const threadGroupById = new Map<string, string | null>();
  const threadPinnedById = new Map<string, boolean>();
  for (const threadId of orderedVisibleThreadIds) {
    threadGroupById.set(threadId, threadAssignments[threadId] ?? null);
    threadPinnedById.set(threadId, pinnedThreadIdsSet.has(threadId));
  }

  latestController = useProjectChatHistoryCommandController({
    projectConfigId,
    threadGroups,
    selectedGroupId,
    onSelectedGroupChange,
    onStartNewThread,
    onStartNewThreadInGroup,
    closeOnSelect,
    onCloseThreadsView,
    setChatId,
    chatId,
    pinnedThreadIdsSet,
    threadOrderIds,
    orderedVisibleThreadIds,
    threadGroupById,
    threadPinnedById,
  });

  return null;
}

describe("useProjectChatHistoryCommandController", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetProjectStores();
    clearProjectChatThreadStorageUndoStackForTests();
    useLocalStorage.setState({
      viewedProjectChatThreadIdsByProjectConfigId: {},
      projectChatThreadGroupsByProjectConfigId: {},
      projectChatThreadAssignmentsByProjectConfigId: {},
      projectChatThreadOrderByProjectConfigId: {},
      pinnedProjectChatThreadIdsByProjectConfigId: {},
      trashedProjectChatThreadIdsByProjectConfigId: {},
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    latestController = null;
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    latestController = null;
    vi.restoreAllMocks();
  });

  it("owns group creation, editing cleanup, and thread-badge toggle state", async () => {
    const selectedGroupIds: Array<string | null> = [];

    await act(async () => {
      root.render(
        <StoreBackedHarness
          projectConfigId="project-a"
          onSelectedGroupChange={(groupId) => {
            selectedGroupIds.push(groupId);
          }}
        />,
      );
    });

    if (!latestController) {
      throw new Error("Expected a command controller.");
    }

    expect(latestController.showThreadAgentBadges).toBe(true);

    await act(async () => {
      latestController?.handleCreateGroup();
    });

    const groups =
      useLocalStorage.getState().projectChatThreadGroupsByProjectConfigId[
        "project-a"
      ] ?? [];
    const createdGroupId = groups[0]?.id;
    if (!createdGroupId) {
      throw new Error("Expected a created thread group.");
    }

    // The extracted controller should keep group creation/edit mode and badge toggles out of the surface component.
    expect(selectedGroupIds).toEqual([createdGroupId]);
    expect(latestController.editingGroupId).toBe(createdGroupId);

    await act(async () => {
      latestController?.handleToggleThreadAgentBadges();
    });
    expect(latestController.showThreadAgentBadges).toBe(false);

    await act(async () => {
      useLocalStorage.setState({
        projectChatThreadGroupsByProjectConfigId: {
          "project-a": [],
        },
      });
    });
    expect(latestController.editingGroupId).toBeNull();
  });

  it("routes selection, start, pin, delete, restore, and rename commands through the persisted thread state", async () => {
    const groupId = createProjectChatThreadGroup("project-a", "Alpha");
    if (!groupId) {
      throw new Error("Expected a thread group id.");
    }
    useLocalStorage.setState({
      projectChatThreadAssignmentsByProjectConfigId: {
        "project-a": {
          "chat-1": groupId,
        },
      },
      projectChatThreadOrderByProjectConfigId: {
        "project-a": ["chat-1"],
      },
      pinnedProjectChatThreadIdsByProjectConfigId: {
        "project-a": [],
      },
      trashedProjectChatThreadIdsByProjectConfigId: {
        "project-a": [],
      },
    });

    const selectedGroupIds: Array<string | null> = [];
    const startedGroupIds: Array<string> = [];
    const selectedChatIds: Array<string | null | undefined> = [];

    await act(async () => {
      root.render(
        <StoreBackedHarness
          projectConfigId="project-a"
          selectedGroupId={groupId}
          chatId="chat-1"
          onSelectedGroupChange={(nextGroupId) => {
            selectedGroupIds.push(nextGroupId);
          }}
          onStartNewThreadInGroup={(nextGroupId) => {
            startedGroupIds.push(nextGroupId);
          }}
          setChatId={(nextChatId) => {
            selectedChatIds.push(nextChatId);
          }}
        />,
      );
    });

    if (!latestController) {
      throw new Error("Expected a command controller.");
    }

    await act(async () => {
      latestController?.handleSelectThread(
        createHistoryEntry({
          chatId: "chat-1",
        }),
      );
      latestController?.handleStartNewThread();
      latestController?.handleToggleThreadPinned("chat-1");
      latestController?.handleToggleGroupPinned(groupId);
    });

    // Selection/start flows should stay wired to the real controller/storage paths after extraction.
    expect(selectedChatIds).toContain("chat-1");
    expect(selectedGroupIds).toContain(groupId);
    expect(startedGroupIds).toEqual([groupId]);
    expect(
      useLocalStorage.getState().pinnedProjectChatThreadIdsByProjectConfigId[
        "project-a"
      ],
    ).toEqual(["chat-1"]);
    expect(
      useLocalStorage.getState().projectChatThreadGroupsByProjectConfigId[
        "project-a"
      ][0]?.pinned,
    ).toBe(true);

    await act(async () => {
      latestController?.handleDeleteThread("chat-1");
    });
    expect(
      useLocalStorage.getState().trashedProjectChatThreadIdsByProjectConfigId[
        "project-a"
      ],
    ).toEqual(["chat-1"]);

    await act(async () => {
      root.render(
        <StoreBackedHarness
          projectConfigId="project-a"
          selectedGroupId={groupId}
          chatId="chat-1"
          onSelectedGroupChange={(nextGroupId) => {
            selectedGroupIds.push(nextGroupId);
          }}
          onStartNewThreadInGroup={(nextGroupId) => {
            startedGroupIds.push(nextGroupId);
          }}
          setChatId={(nextChatId) => {
            selectedChatIds.push(nextChatId);
          }}
        />,
      );
    });
    expect(latestController.canUndoDeletedThreadOrGroup).toBe(true);

    await act(async () => {
      latestController?.handleRestoreDeletedThreadOrGroup();
      latestController?.handleRenameGroup(groupId, "Renamed");
    });
    expect(
      useLocalStorage.getState().trashedProjectChatThreadIdsByProjectConfigId[
        "project-a"
      ],
    ).toEqual([]);
    expect(
      useLocalStorage.getState().projectChatThreadGroupsByProjectConfigId[
        "project-a"
      ][0]?.name,
    ).toBe("Renamed");
  });
});
