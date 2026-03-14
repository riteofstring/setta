/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DRAFT_THREAD_ENTRY_ID,
  PINNED_THREAD_DOMAIN,
  type ThreadPinDomain,
  toThreadDndId,
} from "./projectChatHistoryDragUtils";
import { type ProjectChatHistoryEntry } from "./projectChatHistoryViewModel";

type ThreadEntryProps = {
  entry: ProjectChatHistoryEntry;
  threadGroupId: string | null;
  pinDomain: ThreadPinDomain;
  sortableEnabled: boolean;
  isActive: boolean;
  isViewed: boolean;
  searchMatchCount: number | null;
  isSearchMatchActive: boolean;
  isPinned: boolean;
  isDraft: boolean;
  showAgentBadges: boolean;
  agentBadgeLabel: string | null;
  activeThreadWaitingForResponse: boolean;
  deleteTooltipContent: string;
  onTogglePinned: (threadId: string) => void;
  onDelete: (threadId: string) => void;
  onSelect: (entry: ProjectChatHistoryEntry) => void;
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

function createThreadEntryProps(
  overrides: Partial<ThreadEntryProps> = {},
): ThreadEntryProps {
  return {
    entry: createHistoryEntry(),
    threadGroupId: "group-a",
    pinDomain: PINNED_THREAD_DOMAIN,
    sortableEnabled: true,
    isActive: false,
    isViewed: true,
    searchMatchCount: null,
    isSearchMatchActive: false,
    isPinned: false,
    isDraft: false,
    showAgentBadges: false,
    agentBadgeLabel: null,
    activeThreadWaitingForResponse: false,
    deleteTooltipContent: "Remove this chat from history.",
    onTogglePinned: vi.fn(),
    onDelete: vi.fn(),
    onSelect: vi.fn(),
    ...overrides,
  };
}

describe("ProjectChatHistoryThreadEntry", () => {
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

  async function renderThreadEntry(
    overrides: Partial<ThreadEntryProps> = {},
  ): Promise<ThreadEntryProps> {
    const props = createThreadEntryProps(overrides);
    const [{ SortableListProvider }, { ProjectChatHistoryThreadEntry }] =
      await Promise.all([
        import("components/Pages/Project/ViewModeDnd"),
        import("./ProjectChatHistoryThreadEntry"),
      ]);

    await act(async () => {
      root.render(
        <SortableListProvider
          id="project-chat-history-thread-entry-test"
          items={[toThreadDndId(props.entry.chatId)]}
          direction="vertical"
          enabled={props.sortableEnabled}
          onReorder={() => undefined}
        >
          <ProjectChatHistoryThreadEntry {...props} />
        </SortableListProvider>,
      );
    });

    return props;
  }

  it("renders the draft row without thread actions and still selects it", async () => {
    const onSelect = vi.fn();
    const entry = createHistoryEntry({
      chatId: DRAFT_THREAD_ENTRY_ID,
      label: "New thread...",
    });

    await renderThreadEntry({
      entry,
      isDraft: true,
      onSelect,
    });

    // Draft rows should keep the lightweight pending-thread surface without pin or delete controls.
    const row = host.querySelector(
      '[data-testid="project-chat-thread-draft-entry"]',
    );
    expect(row).not.toBeNull();
    expect(
      host.querySelector('[data-testid="project-chat-thread-pin-button"]'),
    ).toBeNull();
    expect(
      host.querySelector('[data-testid="project-chat-thread-delete-button"]'),
    ).toBeNull();

    await act(async () => {
      row?.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          button: 0,
        }),
      );
    });

    expect(onSelect).toHaveBeenCalledWith(entry);
  });

  it("switches between working and unread indicators based on thread state", async () => {
    await renderThreadEntry({
      isActive: true,
      isViewed: false,
      activeThreadWaitingForResponse: true,
    });

    // The active thread should show the working spinner while a response is still in flight.
    expect(
      host.querySelector(
        '[data-testid="project-chat-thread-working-indicator"]',
      ),
    ).not.toBeNull();
    expect(
      host.querySelector('[data-testid="project-chat-thread-unread-dot"]'),
    ).toBeNull();

    await renderThreadEntry({
      isActive: false,
      isViewed: false,
      activeThreadWaitingForResponse: false,
      entry: createHistoryEntry({
        chatId: "chat-2",
        label: "Unread thread",
        waitingForResponse: false,
      }),
    });

    // A completed but unopened thread should fall back to the unread dot.
    expect(
      host.querySelector(
        '[data-testid="project-chat-thread-working-indicator"]',
      ),
    ).toBeNull();
    expect(
      host.querySelector('[data-testid="project-chat-thread-unread-dot"]'),
    ).not.toBeNull();
  });

  it("renders search match counts and agent badges when the view model exposes them", async () => {
    await renderThreadEntry({
      searchMatchCount: 3,
      isSearchMatchActive: true,
      showAgentBadges: true,
      agentBadgeLabel: "Claude",
    });

    // Search and agent metadata should stay visible after moving the row out of the parent surface.
    expect(
      host.querySelector(
        '[data-testid="project-chat-thread-search-match-count"]',
      )?.textContent,
    ).toBe("3");
    expect(
      host.querySelector('[data-testid="project-chat-thread-agent-badge"]')
        ?.textContent,
    ).toBe("Claude");
  });

  it("routes pin and delete actions without also selecting the row", async () => {
    const onTogglePinned = vi.fn();
    const onDelete = vi.fn();
    const onSelect = vi.fn();

    await renderThreadEntry({
      onTogglePinned,
      onDelete,
      onSelect,
    });

    const pinButton = host.querySelector(
      '[data-testid="project-chat-thread-pin-button"]',
    );
    const deleteButton = host.querySelector(
      '[data-testid="project-chat-thread-delete-button"]',
    );
    const row = host.querySelector('[data-testid="project-chat-thread-entry"]');

    if (!(pinButton instanceof HTMLButtonElement)) {
      throw new Error("Expected a thread pin button.");
    }
    if (!(deleteButton instanceof HTMLButtonElement)) {
      throw new Error("Expected a thread delete button.");
    }
    if (!(row instanceof HTMLDivElement)) {
      throw new Error("Expected a thread entry row.");
    }

    await act(async () => {
      pinButton.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    await act(async () => {
      deleteButton.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    // Hover actions should remain isolated from the row-selection path.
    expect(onTogglePinned).toHaveBeenCalledWith("chat-1");
    expect(onDelete).toHaveBeenCalledWith("chat-1");
    expect(onSelect).not.toHaveBeenCalled();

    await act(async () => {
      row.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          button: 0,
        }),
      );
    });

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: "chat-1" }),
    );
  });
});
