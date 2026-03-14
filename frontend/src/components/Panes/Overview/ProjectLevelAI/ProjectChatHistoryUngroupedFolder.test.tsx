/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ProjectChatHistoryEntry } from "./projectChatHistoryViewModel";

type UngroupedFolderProps = {
  entries: Array<ProjectChatHistoryEntry>;
  hasGroupsAbove: boolean;
  chatId: string | null | undefined;
  threadSortableEnabled: boolean;
  viewedThreadIdsSet: Set<string>;
  pinnedThreadIdsSet: Set<string>;
  hasMasterSearch: boolean;
  masterSearchMatchCountByChatId: Map<string, number>;
  activeMasterSearchMatchThreadId: string | null;
  showThreadAgentBadges: boolean;
  threadAgentBadgeLabelByChatId: Map<string, string>;
  activeThreadWaitingForResponse: boolean;
  deleteTooltipContent: string;
  onToggleThreadPinned: (threadId: string) => void;
  onDeleteThread: (threadId: string) => void;
  onSelectThread: (entry: ProjectChatHistoryEntry) => void;
  onSelectGroup: (groupId: string | null) => void;
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

function createUngroupedFolderProps(
  overrides: Partial<UngroupedFolderProps> = {},
): UngroupedFolderProps {
  return {
    entries: [createHistoryEntry()],
    hasGroupsAbove: false,
    chatId: null,
    threadSortableEnabled: true,
    viewedThreadIdsSet: new Set(),
    pinnedThreadIdsSet: new Set(),
    hasMasterSearch: false,
    masterSearchMatchCountByChatId: new Map(),
    activeMasterSearchMatchThreadId: null,
    showThreadAgentBadges: false,
    threadAgentBadgeLabelByChatId: new Map(),
    activeThreadWaitingForResponse: false,
    deleteTooltipContent: "Remove this chat from history.",
    onToggleThreadPinned: vi.fn(),
    onDeleteThread: vi.fn(),
    onSelectThread: vi.fn(),
    onSelectGroup: vi.fn(),
    ...overrides,
  };
}

describe("ProjectChatHistoryUngroupedFolder", () => {
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

  async function renderUngroupedFolder(
    overrides: Partial<UngroupedFolderProps> = {},
  ): Promise<UngroupedFolderProps> {
    const props = createUngroupedFolderProps(overrides);
    const [{ DragDropProvider }, { ProjectChatHistoryUngroupedFolder }] =
      await Promise.all([
        import("forks/dnd-kit/adapter"),
        import("./ProjectChatHistoryUngroupedFolder"),
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
          <ProjectChatHistoryUngroupedFolder {...props} />
        </DragDropProvider>,
      );
    });

    return props;
  }

  it("renders pinned and unpinned sections and routes selection through the ungrouped scope", async () => {
    const pinnedEntry = createHistoryEntry({
      chatId: "chat-pinned",
      label: "Pinned thread",
    });
    const unpinnedEntry = createHistoryEntry({
      chatId: "chat-unpinned",
      label: "Ungrouped thread",
    });
    const onSelectThread = vi.fn();
    const onSelectGroup = vi.fn();

    await renderUngroupedFolder({
      entries: [pinnedEntry, unpinnedEntry],
      hasGroupsAbove: true,
      pinnedThreadIdsSet: new Set(["chat-pinned"]),
      onSelectThread,
      onSelectGroup,
    });

    // The extracted folder should preserve the divider, grouped labels, and null-group selection flow.
    expect(
      host.querySelector('[data-testid="project-chat-ungrouped-divider"]'),
    ).not.toBeNull();
    expect(
      host.querySelector('[data-testid="project-chat-ungrouped-label"]')
        ?.textContent,
    ).toContain("Ungrouped");
    expect(
      host.querySelectorAll(
        '[data-testid="project-chat-thread-pinned-section-label"]',
      ),
    ).toHaveLength(1);
    expect(
      host.querySelectorAll(
        '[data-testid="project-chat-thread-unpinned-section-label"]',
      ),
    ).toHaveLength(1);

    const unpinnedRow = host.querySelector(
      '[data-testid="project-chat-thread-entry"][data-thread-id="chat-unpinned"]',
    );
    if (!(unpinnedRow instanceof HTMLDivElement)) {
      throw new Error("Expected an ungrouped thread row.");
    }

    await act(async () => {
      unpinnedRow.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          button: 0,
        }),
      );
    });

    expect(onSelectGroup).toHaveBeenCalledWith(null);
    expect(onSelectThread).toHaveBeenCalledWith(unpinnedEntry);
  });

  it("shows the unpinned empty state when only pinned ungrouped threads remain", async () => {
    await renderUngroupedFolder({
      entries: [
        createHistoryEntry({
          chatId: "chat-pinned",
          label: "Pinned thread",
        }),
      ],
      pinnedThreadIdsSet: new Set(["chat-pinned"]),
    });

    // Pinned-only ungrouped lists should keep the explicit empty-state copy for the missing unpinned section.
    expect(
      host.querySelector(
        '[data-testid="project-chat-thread-unpinned-empty-state"]',
      )?.textContent,
    ).toContain("No unpinned threads.");
  });
});
