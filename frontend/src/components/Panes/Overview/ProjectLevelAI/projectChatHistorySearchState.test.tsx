/* @vitest-environment jsdom */

import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import {
  ChatRoleEnum,
  createAgentRun,
  createMessageTextContent,
  type AgentRun,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useProjectChatHistorySearchNavigation,
  useProjectChatHistorySearchQueryState,
} from "./projectChatHistorySearchState";
import { type ProjectChatHistoryEntry } from "./projectChatHistoryViewModel";

function createHistoryEntry(
  overrides: Partial<ProjectChatHistoryEntry> = {},
): ProjectChatHistoryEntry {
  return {
    chatId: "thread-1",
    label: "Thread",
    nameSource: null,
    lastUpdatedMs: 1,
    waitingForResponse: false,
    runType: "llm_chat",
    engineConfigId: null,
    ...overrides,
  };
}

function SearchQueryHarness({
  agentRuns,
  displayEntries,
}: {
  agentRuns: Array<AgentRun>;
  displayEntries: Array<ProjectChatHistoryEntry>;
}) {
  const {
    masterSearchInput,
    setMasterSearchInput,
    hasMasterSearch,
    sortedEntries,
  } = useProjectChatHistorySearchQueryState({
    agentRuns,
    displayEntries,
    syntheticDraftThreadEntry: null,
  });

  return (
    <div>
      <input
        data-testid="search-query-input"
        value={masterSearchInput}
        onChange={(event) => {
          setMasterSearchInput(event.target.value);
        }}
      />
      <span data-testid="search-query-active">
        {hasMasterSearch ? "active" : "idle"}
      </span>
      <span data-testid="search-query-results">
        {sortedEntries.map((entry) => entry.chatId).join(",")}
      </span>
    </div>
  );
}

function SearchNavigationHarness({
  orderedVisibleThreadIds,
}: {
  orderedVisibleThreadIds: Array<string>;
}) {
  const threadListScrollRef = createRef<HTMLDivElement>();
  const {
    activeMasterSearchMatchThreadId,
    masterSearchCounterText,
    handleStepMasterSearch,
  } = useProjectChatHistorySearchNavigation({
    hasMasterSearch: true,
    normalizedMasterSearchTerms: ["deploy"],
    orderedVisibleThreadIds,
    threadListScrollRef,
  });

  return (
    <div>
      <div ref={threadListScrollRef}>
        {orderedVisibleThreadIds.map((threadId) => (
          <div key={threadId} data-thread-id={threadId}>
            {threadId}
          </div>
        ))}
      </div>
      <span data-testid="search-navigation-active">
        {activeMasterSearchMatchThreadId ?? "none"}
      </span>
      <span data-testid="search-navigation-counter">
        {masterSearchCounterText}
      </span>
      <button
        type="button"
        data-testid="search-navigation-next"
        onClick={() => {
          handleStepMasterSearch("next");
        }}
      >
        Next
      </button>
      <button
        type="button"
        data-testid="search-navigation-previous"
        onClick={() => {
          handleStepMasterSearch("previous");
        }}
      >
        Previous
      </button>
    </div>
  );
}

describe("projectChatHistorySearchState", () => {
  let host: HTMLDivElement;
  let root: Root;
  let scrollIntoViewSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    scrollIntoViewSpy = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoViewSpy,
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("owns the search input state and returns the filtered ordered results", async () => {
    await act(async () => {
      root.render(
        <SearchQueryHarness
          agentRuns={[
            createAgentRun({
              id: "run-1",
              inputs: {
                chatId: "thread-2",
                projectConfigId: "project-1",
                messages: [
                  {
                    id: "message-1",
                    role: ChatRoleEnum.user,
                    content: [
                      createMessageTextContent({
                        text: "Deploy the release pipeline",
                      }),
                    ],
                    attachments: [],
                  },
                ],
              },
            }),
          ]}
          displayEntries={[
            createHistoryEntry({
              chatId: "thread-1",
              label: "Architecture notes",
            }),
            createHistoryEntry({
              chatId: "thread-2",
              label: "Release notes",
            }),
          ]}
        />,
      );
    });

    const input = host.querySelector('[data-testid="search-query-input"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Expected a search query input.");
    }

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      if (!valueSetter) {
        throw new Error("Expected an input value setter.");
      }
      valueSetter.call(input, "deploy");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // The extracted query hook should keep the input state and the match derivation together.
    expect(
      host.querySelector('[data-testid="search-query-active"]')?.textContent,
    ).toBe("active");
    expect(
      host.querySelector('[data-testid="search-query-results"]')?.textContent,
    ).toBe("thread-2");
  });

  it("owns match navigation, wrapping, and scroll targeting for the active search result", async () => {
    await act(async () => {
      root.render(
        <SearchNavigationHarness
          orderedVisibleThreadIds={["thread-1", "thread-2", "thread-3"]}
        />,
      );
    });

    const nextButton = host.querySelector(
      '[data-testid="search-navigation-next"]',
    );
    const previousButton = host.querySelector(
      '[data-testid="search-navigation-previous"]',
    );
    if (
      !(nextButton instanceof HTMLButtonElement) ||
      !(previousButton instanceof HTMLButtonElement)
    ) {
      throw new Error("Expected search navigation buttons.");
    }

    // The hook should start on the first result and publish the counter text.
    expect(
      host.querySelector('[data-testid="search-navigation-active"]')
        ?.textContent,
    ).toBe("thread-1");
    expect(
      host.querySelector('[data-testid="search-navigation-counter"]')
        ?.textContent,
    ).toBe("1/3");
    expect(scrollIntoViewSpy).toHaveBeenCalled();

    await act(async () => {
      nextButton.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    expect(
      host.querySelector('[data-testid="search-navigation-active"]')
        ?.textContent,
    ).toBe("thread-2");
    expect(
      host.querySelector('[data-testid="search-navigation-counter"]')
        ?.textContent,
    ).toBe("2/3");

    await act(async () => {
      previousButton.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    expect(
      host.querySelector('[data-testid="search-navigation-active"]')
        ?.textContent,
    ).toBe("thread-1");
  });
});
