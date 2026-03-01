import { type ComponentProps, type CSSProperties } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { type SharePolicy } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  areSlashSuggestionsPortalStylesEqual,
  ChatInput,
  cycleQueuedDraftSelection,
  cycleSubmittedMessageHistorySelection,
  enqueueQueuedDraft,
  isRestoreClearedDraftKey,
  isStopEscapeKey,
  resolveEscapeComposerAction,
} from "./ChatInput";

function buildSharePolicy(overrides: Partial<SharePolicy> = {}): SharePolicy {
  return {
    allowParamChanges: true,
    allowVariantChanges: true,
    allowLayoutChanges: true,
    allowRun: false,
    allowLLM: false,
    allowExternalLinks: false,
    allowFileDownloads: false,
    allowMultipleRuns: false,
    runSnapshotMode: "ephemeral",
    ...overrides,
  };
}

function syncStoreInitialState(store: {
  getState: () => Record<string, unknown>;
  getInitialState?: () => Record<string, unknown>;
}) {
  if (!store.getInitialState) {
    return;
  }
  const initial = store.getInitialState();
  Object.assign(initial, store.getState());
}

function renderChatInput(
  overrides: Partial<ComponentProps<typeof ChatInput>> = {},
) {
  return renderToStaticMarkup(
    <ChatInput
      placeholderText="Type a message..."
      waitingForResponse={false}
      onSubmit={() => false}
      {...overrides}
    />,
  );
}

function getTextareaClassName(markup: string): string | null {
  const marker = "<textarea";
  const startIndex = markup.indexOf(marker);
  if (startIndex < 0) {
    return null;
  }
  const classIndex = markup.indexOf('class="', startIndex);
  if (classIndex < 0) {
    return null;
  }
  const valueStart = classIndex + 'class="'.length;
  const valueEnd = markup.indexOf('"', valueStart);
  if (valueEnd < 0) {
    return null;
  }
  return markup.slice(valueStart, valueEnd);
}

function getButtonTagByAriaLabel(
  markup: string,
  ariaLabel: string,
): string | null {
  const marker = `aria-label=\"${ariaLabel}\"`;
  const labelIndex = markup.indexOf(marker);
  if (labelIndex < 0) {
    return null;
  }
  const buttonStart = markup.lastIndexOf("<button", labelIndex);
  if (buttonStart < 0) {
    return null;
  }
  const buttonEnd = markup.indexOf(">", buttonStart);
  if (buttonEnd < 0) {
    return null;
  }
  return markup.slice(buttonStart, buttonEnd);
}

function getButtonTagByText(markup: string, text: string): string | null {
  const marker = `>${text}`;
  const textIndex = markup.indexOf(marker);
  if (textIndex < 0) {
    return null;
  }
  const buttonStart = markup.lastIndexOf("<button", textIndex);
  if (buttonStart < 0) {
    return null;
  }
  const buttonEnd = markup.indexOf(">", buttonStart);
  if (buttonEnd < 0) {
    return null;
  }
  return markup.slice(buttonStart, buttonEnd);
}

describe("ChatInput attachment gating", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("shows share policy block when param changes are disallowed", () => {
    useShareSession.setState({
      isDeploymentMode: true,
      sharePolicy: buildSharePolicy({ allowParamChanges: false }),
    });
    syncStoreInitialState(useShareSession);

    const markup = renderChatInput();

    expect(markup).toContain("Attachments blocked by share policy");
    expect(markup).not.toContain("Slots:");
    const menuButton = getButtonTagByAriaLabel(markup, "Attachment options");
    expect(menuButton).not.toBeNull();
    expect(menuButton).toContain("disabled");
  });

  it("shows slots when param changes are allowed", () => {
    useShareSession.setState({
      isDeploymentMode: true,
      sharePolicy: buildSharePolicy({ allowParamChanges: true }),
    });
    syncStoreInitialState(useShareSession);

    const markup = renderChatInput();

    expect(markup).not.toContain("Attachments blocked by share policy");
    expect(markup).not.toContain("Slots:");
    const menuButton = getButtonTagByAriaLabel(markup, "Attachment options");
    expect(menuButton).not.toBeNull();
    expect(menuButton).not.toContain("disabled");
  });

  it("renders a full-width textarea for wide layouts", () => {
    useShareSession.setState({
      isDeploymentMode: false,
      sharePolicy: buildSharePolicy(),
    });
    syncStoreInitialState(useShareSession);

    const markup = renderChatInput();
    const className = getTextareaClassName(markup);

    expect(className).not.toBeNull();
    expect(className).toContain("w-full");
    expect(className).toContain("max-w-none");
  });

  it("uses an inset focus ring so focus styles are not clipped", () => {
    const markup = renderChatInput();
    const className = getTextareaClassName(markup);

    expect(className).not.toBeNull();
    expect(className).toContain("focus:ring-inset");
    expect(className).toContain("focus:border-blue-500");
  });
});

describe("ChatInput composer controls", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("renders execution controls when provided", () => {
    const markup = renderChatInput({
      executionControls: {
        thinkingEnabled: true,
        onThinkingEnabledChange: vi.fn(),
        permissionMode: "minimal",
        searchEnabled: true,
        onPermissionModeChange: vi.fn(),
        onSearchEnabledChange: vi.fn(),
      },
    });

    expect(markup).toContain('aria-label="Thinking"');
    expect(markup).toContain("minimal");
    expect(markup).toContain("Search");
    expect(markup).not.toContain("Skills");
  });

  it("renders the thinking control to the left of permissions", () => {
    const markup = renderChatInput({
      executionControls: {
        thinkingEnabled: false,
        onThinkingEnabledChange: vi.fn(),
        permissionMode: "minimal",
        searchEnabled: false,
        onPermissionModeChange: vi.fn(),
        onSearchEnabledChange: vi.fn(),
      },
    });

    const thinkingIndex = markup.indexOf('aria-label="Thinking"');
    const permissionIndex = markup.indexOf('aria-label="minimal permissions"');
    expect(thinkingIndex).toBeGreaterThan(-1);
    expect(permissionIndex).toBeGreaterThan(-1);
    expect(thinkingIndex).toBeLessThan(permissionIndex);
  });

  it("renders a context-left badge when context limits are provided", () => {
    const markup = renderChatInput({
      contextWindowTokens: 200,
      contextUsedTokens: 150,
      value: "1234",
      onChange: vi.fn(),
    });

    expect(markup).toContain("context left");
    expect(markup).toContain("context");
    expect(markup).toContain("25%");
    expect(markup).toContain('aria-label="context left 25%"');
  });

  it("renders estimated context label when usage is estimated", () => {
    const markup = renderChatInput({
      contextWindowTokens: 200,
      contextUsedTokens: 150,
      contextUsageIsEstimated: true,
      value: "1234",
      onChange: vi.fn(),
    });

    expect(markup).toContain("est. context left");
    expect(markup).toContain("est. context");
    expect(markup).toContain("25%");
  });

  it("renders non-estimated context percentages from large token windows", () => {
    const markup = renderChatInput({
      contextWindowTokens: 258_400,
      contextUsedTokens: 24_766,
      value: "run commands",
      onChange: vi.fn(),
    });

    expect(markup).toContain("context left");
    expect(markup).not.toContain("est. context left");
    expect(markup).toContain("90%");
    expect(markup).toContain('aria-label="context left 90%"');
  });

  it("does not render context badge when used tokens are unavailable", () => {
    const markup = renderChatInput({
      contextWindowTokens: 200,
      contextUsedTokens: null,
      value: "1234",
      onChange: vi.fn(),
    });

    expect(markup).not.toContain("context left");
    expect(markup).not.toContain("est. context left");
  });

  it("renders an unavailable badge when context telemetry is unavailable", () => {
    const markup = renderChatInput({
      contextWindowTokens: null,
      contextUsedTokens: null,
      contextUsageUnavailable: true,
      value: "1234",
      onChange: vi.fn(),
    });

    expect(markup).toContain("context unavailable");
    expect(markup).toContain('aria-label="context unavailable"');
  });

  it("does not render slash buttons above the composer", () => {
    const markup = renderChatInput();

    expect(markup).not.toContain(">/new<");
    expect(markup).not.toContain(">/resume<");
    expect(markup).not.toContain(">/model<");
  });

  it("disables execution controls when the composer is disabled", () => {
    const markup = renderChatInput({
      disabled: true,
      executionControls: {
        permissionMode: "minimal",
        searchEnabled: true,
        onPermissionModeChange: vi.fn(),
        onSearchEnabledChange: vi.fn(),
      },
    });

    const permissionButton = getButtonTagByAriaLabel(
      markup,
      "minimal permissions",
    );
    const searchButton = getButtonTagByText(markup, "Search");
    expect(permissionButton).not.toBeNull();
    expect(searchButton).not.toBeNull();
    expect(permissionButton).toContain("disabled");
    expect(searchButton).toContain("disabled");
  });

  it("keeps attachment controls inside the textarea", () => {
    const markup = renderChatInput();
    const attachmentButton = getButtonTagByAriaLabel(
      markup,
      "Attachment options",
    );
    const textareaClassName = getTextareaClassName(markup);

    expect(markup).not.toContain('data-chat-composer-side-rail="true"');
    expect(attachmentButton).not.toBeNull();
    expect(attachmentButton).toContain("absolute left-1.5 top-1.5");
    expect(textareaClassName).not.toBeNull();
    expect(textareaClassName).toContain("pl-9");
    expect(textareaClassName).not.toContain("pl-3");
  });

  it("defaults slash suggestions to below placement", () => {
    const markup = renderChatInput({
      value: "/res",
      onChange: vi.fn(),
    });

    expect(markup).toContain("top-[calc(100%+4px)]");
    expect(markup).toContain("overflow-x-hidden");
  });

  it("supports explicit above placement for slash suggestions", () => {
    const markup = renderChatInput({
      value: "/res",
      onChange: vi.fn(),
      slashSuggestionsPlacement: "above",
    });

    expect(markup).toContain("bottom-[calc(100%+4px)]");
    expect(markup).toContain("overflow-x-hidden");
  });

  it("renders runtime counters for active background terminals and subagents", () => {
    const markup = renderChatInput({
      runtimeActivityCounts: {
        activeBackgroundTerminals: 3,
        activeSubagents: 2,
      },
    });

    expect(markup).toContain(
      'data-chat-runtime-active-background-terminals="true"',
    );
    expect(markup).toContain('aria-label="3 background terminals active"');
    expect(markup).toContain('data-chat-runtime-active-subagents="true"');
    expect(markup).toContain('aria-label="2 subagents active"');
  });

  it("normalizes invalid runtime counter values to non-negative numbers", () => {
    const markup = renderChatInput({
      runtimeActivityCounts: {
        activeBackgroundTerminals: -2,
        activeSubagents: 1,
      },
    });

    expect(markup).toContain('aria-label="0 background terminals active"');
    expect(markup).toContain('aria-label="1 subagent active"');
  });
});

describe("areSlashSuggestionsPortalStylesEqual", () => {
  it("returns true when both styles are null", () => {
    expect(areSlashSuggestionsPortalStylesEqual(null, null)).toBe(true);
  });

  it("returns true for equal geometry values", () => {
    const first: CSSProperties = {
      left: "12px",
      width: "340px",
      maxHeight: "180px",
      top: "44px",
      bottom: undefined,
    };
    const second: CSSProperties = {
      left: "12px",
      width: "340px",
      maxHeight: "180px",
      top: "44px",
      bottom: undefined,
    };

    expect(areSlashSuggestionsPortalStylesEqual(first, second)).toBe(true);
  });

  it("returns false when any tracked value changes", () => {
    const first: CSSProperties = {
      left: "12px",
      width: "340px",
      maxHeight: "180px",
      top: "44px",
      bottom: undefined,
    };
    const second: CSSProperties = {
      left: "14px",
      width: "340px",
      maxHeight: "180px",
      top: "44px",
      bottom: undefined,
    };

    expect(areSlashSuggestionsPortalStylesEqual(first, second)).toBe(false);
  });
});

describe("isStopEscapeKey", () => {
  it("returns true for Escape without modifiers", () => {
    expect(
      isStopEscapeKey({
        key: "Escape",
        shiftKey: false,
        altKey: false,
        metaKey: false,
        ctrlKey: false,
      }),
    ).toBe(true);
  });

  it("returns false when Escape includes modifiers", () => {
    expect(
      isStopEscapeKey({
        key: "Escape",
        shiftKey: true,
        altKey: false,
        metaKey: false,
        ctrlKey: false,
      }),
    ).toBe(false);
    expect(
      isStopEscapeKey({
        key: "Escape",
        shiftKey: false,
        altKey: false,
        metaKey: true,
        ctrlKey: false,
      }),
    ).toBe(false);
  });

  it("returns false for non-Escape keys", () => {
    expect(
      isStopEscapeKey({
        key: "Enter",
        shiftKey: false,
        altKey: false,
        metaKey: false,
        ctrlKey: false,
      }),
    ).toBe(false);
  });
});

describe("isRestoreClearedDraftKey", () => {
  it("returns true for Command+Z without extra modifiers", () => {
    expect(
      isRestoreClearedDraftKey({
        key: "z",
        shiftKey: false,
        altKey: false,
        metaKey: true,
        ctrlKey: false,
      }),
    ).toBe(true);
  });

  it("returns true for Control+Z without extra modifiers", () => {
    expect(
      isRestoreClearedDraftKey({
        key: "Z",
        shiftKey: false,
        altKey: false,
        metaKey: false,
        ctrlKey: true,
      }),
    ).toBe(true);
  });

  it("returns false for unsupported combinations", () => {
    expect(
      isRestoreClearedDraftKey({
        key: "z",
        shiftKey: true,
        altKey: false,
        metaKey: true,
        ctrlKey: false,
      }),
    ).toBe(false);
    expect(
      isRestoreClearedDraftKey({
        key: "z",
        shiftKey: false,
        altKey: false,
        metaKey: true,
        ctrlKey: true,
      }),
    ).toBe(false);
    expect(
      isRestoreClearedDraftKey({
        key: "x",
        shiftKey: false,
        altKey: false,
        metaKey: true,
        ctrlKey: false,
      }),
    ).toBe(false);
  });
});

describe("resolveEscapeComposerAction", () => {
  it("returns stop for the first escape while a response is running", () => {
    expect(
      resolveEscapeComposerAction({
        waitingForResponse: true,
        onStopAvailable: true,
        stopRequestedForCurrentResponse: false,
        selectedSubmittedMessageIndex: null,
        hasComposerDraft: true,
      }),
    ).toBe("stop");
  });

  it("returns clear once stop has already been requested and a draft exists", () => {
    expect(
      resolveEscapeComposerAction({
        waitingForResponse: true,
        onStopAvailable: true,
        stopRequestedForCurrentResponse: true,
        selectedSubmittedMessageIndex: null,
        hasComposerDraft: true,
      }),
    ).toBe("clear");
  });

  it("restores pre-history draft before considering generic clear", () => {
    expect(
      resolveEscapeComposerAction({
        waitingForResponse: false,
        onStopAvailable: true,
        stopRequestedForCurrentResponse: false,
        selectedSubmittedMessageIndex: 0,
        hasComposerDraft: true,
      }),
    ).toBe("restore_history_draft");
  });

  it("returns none when there is no running response and no draft", () => {
    expect(
      resolveEscapeComposerAction({
        waitingForResponse: false,
        onStopAvailable: true,
        stopRequestedForCurrentResponse: false,
        selectedSubmittedMessageIndex: null,
        hasComposerDraft: false,
      }),
    ).toBe("none");
  });
});

describe("queued draft helpers", () => {
  const draftA = {
    id: "queued-a",
    message: "First queued message",
    attachments: [],
    queuedAtMs: 1,
  };
  const draftB = {
    id: "queued-b",
    message: "Second queued message",
    attachments: [],
    queuedAtMs: 2,
  };

  it("adds prioritized drafts at the front of the queue", () => {
    const queue = enqueueQueuedDraft([draftA], draftB, true);
    expect(queue.map((draft) => draft.id)).toEqual(["queued-b", "queued-a"]);
  });

  it("adds non-prioritized drafts at the end of the queue", () => {
    const queue = enqueueQueuedDraft([draftA], draftB, false);
    expect(queue.map((draft) => draft.id)).toEqual(["queued-a", "queued-b"]);
  });

  it("cycles queue selection forward and backward", () => {
    const queue = [draftA, draftB];
    expect(cycleQueuedDraftSelection(queue, null, "next")).toBe("queued-a");
    expect(cycleQueuedDraftSelection(queue, "queued-a", "next")).toBe(
      "queued-b",
    );
    expect(cycleQueuedDraftSelection(queue, "queued-b", "next")).toBe(
      "queued-a",
    );
    expect(cycleQueuedDraftSelection(queue, "queued-a", "prev")).toBe(
      "queued-b",
    );
  });
});

describe("submitted message history helpers", () => {
  it("starts selection at the newest message when no selection exists", () => {
    // Arrow history should always begin at the newest entry.
    const history = ["Most recent", "Older", "Oldest"];
    expect(cycleSubmittedMessageHistorySelection(history, null, "prev")).toBe(
      0,
    );
    expect(cycleSubmittedMessageHistorySelection(history, null, "next")).toBe(
      0,
    );
  });

  it("cycles backward and forward through history entries", () => {
    // Up/down traversal should wrap to keep cycling through available prompts.
    const history = ["Most recent", "Older", "Oldest"];
    expect(cycleSubmittedMessageHistorySelection(history, 0, "prev")).toBe(2);
    expect(cycleSubmittedMessageHistorySelection(history, 2, "next")).toBe(0);
    expect(cycleSubmittedMessageHistorySelection(history, 1, "prev")).toBe(0);
    expect(cycleSubmittedMessageHistorySelection(history, 1, "next")).toBe(2);
  });

  it("returns null when history is empty", () => {
    expect(cycleSubmittedMessageHistorySelection([], null, "prev")).toBeNull();
    expect(cycleSubmittedMessageHistorySelection([], 0, "next")).toBeNull();
  });
});
