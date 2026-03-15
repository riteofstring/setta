/* @vitest-environment jsdom */

import { act, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CHAT_SLASH_COMMANDS } from "./chatComposerControls";
import {
  buildChatInputSubmittedMessageHistoryEntries,
  isRestoreClearedDraftKey,
  isStopEscapeKey,
  resolveEscapeComposerAction,
  useChatInputDraftSession,
} from "./chatInputDraftSession";

function getRequiredElement<T extends Element>(
  host: ParentNode,
  selector: string,
): T {
  const element = host.querySelector(selector);
  if (!element) {
    throw new Error(`Expected element for selector: ${selector}`);
  }
  return element as T;
}

function clickButton(host: HTMLDivElement, selector: string): void {
  const button = getRequiredElement<HTMLButtonElement>(host, selector);
  button.click();
}

function getComposerValue(host: HTMLDivElement): string {
  return getRequiredElement<HTMLTextAreaElement>(
    host,
    '[data-testid="draft-session-composer"]',
  ).value;
}

function getOutputValue(host: HTMLDivElement, selector: string): string {
  return (
    getRequiredElement<HTMLOutputElement>(host, selector).textContent ?? ""
  );
}

function DraftSessionHarness({
  submittedMessageHistory,
}: {
  submittedMessageHistory: string[];
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [slashFeedback, setSlashFeedback] = useState<string | null>(null);
  const {
    clearComposerByEscape,
    handleComposerValueChange,
    inputValue,
    restoreEscClearedComposerDraft,
    selectedSubmittedMessageIndex,
    stepSubmittedMessageHistorySelection,
    submittedMessageHistoryEntries,
  } = useChatInputDraftSession({
    attachments: [],
    clearAttachments: () => {},
    hasRetainedImageAttachmentForImageMode: false,
    isSubmitDisabled: false,
    onSubmit: () => false,
    recognizedSlashCommands: CHAT_SLASH_COMMANDS,
    replaceAttachments: () => {},
    setSlashFeedback,
    slashCommands: CHAT_SLASH_COMMANDS,
    submitReadinessKey: null,
    submittedMessageHistory,
    textareaRef,
    waitingForResponse: false,
  });

  return (
    <div>
      <textarea
        ref={textareaRef}
        data-testid="draft-session-composer"
        readOnly
        value={inputValue}
      />
      <output data-testid="draft-session-history-entries">
        {submittedMessageHistoryEntries.join("|")}
      </output>
      <output data-testid="draft-session-selected-index">
        {selectedSubmittedMessageIndex === null
          ? "none"
          : String(selectedSubmittedMessageIndex)}
      </output>
      <output data-testid="draft-session-feedback">
        {slashFeedback ?? "none"}
      </output>
      <button
        type="button"
        data-testid="draft-session-set-draft"
        onClick={() => handleComposerValueChange("draft message")}
      >
        Set draft
      </button>
      <button
        type="button"
        data-testid="draft-session-history-older"
        onClick={() => {
          stepSubmittedMessageHistorySelection("older");
        }}
      >
        Older
      </button>
      <button
        type="button"
        data-testid="draft-session-history-newer"
        onClick={() => {
          stepSubmittedMessageHistorySelection("newer");
        }}
      >
        Newer
      </button>
      <button
        type="button"
        data-testid="draft-session-clear"
        onClick={() => {
          clearComposerByEscape();
        }}
      >
        Clear
      </button>
      <button
        type="button"
        data-testid="draft-session-restore"
        onClick={() => {
          restoreEscClearedComposerDraft();
        }}
      >
        Restore
      </button>
    </div>
  );
}

describe("buildChatInputSubmittedMessageHistoryEntries", () => {
  it("trims empty values and keeps the first occurrence of each submitted prompt", () => {
    expect(
      buildChatInputSubmittedMessageHistoryEntries([
        "  latest prompt  ",
        "",
        "older prompt",
        "latest prompt",
        "   ",
      ]),
    ).toEqual(["latest prompt", "older prompt"]);
  });
});

describe("useChatInputDraftSession", () => {
  let host: HTMLDivElement;
  let root: Root;
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    };
  });

  afterEach(async () => {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it("cycles through submitted history and restores the pre-history draft", async () => {
    await act(async () => {
      root.render(
        <DraftSessionHarness
          submittedMessageHistory={[
            "  latest prompt  ",
            "older prompt",
            "latest prompt",
          ]}
        />,
      );
    });

    expect(
      getOutputValue(host, '[data-testid="draft-session-history-entries"]'),
    ).toBe("latest prompt|older prompt");

    await act(async () => {
      clickButton(host, '[data-testid="draft-session-set-draft"]');
    });
    expect(getComposerValue(host)).toBe("draft message");

    await act(async () => {
      clickButton(host, '[data-testid="draft-session-history-older"]');
    });
    expect(getComposerValue(host)).toBe("latest prompt");
    expect(
      getOutputValue(host, '[data-testid="draft-session-selected-index"]'),
    ).toBe("0");

    await act(async () => {
      clickButton(host, '[data-testid="draft-session-history-older"]');
    });
    expect(getComposerValue(host)).toBe("older prompt");
    expect(
      getOutputValue(host, '[data-testid="draft-session-selected-index"]'),
    ).toBe("1");

    await act(async () => {
      clickButton(host, '[data-testid="draft-session-history-newer"]');
    });
    expect(getComposerValue(host)).toBe("latest prompt");
    expect(
      getOutputValue(host, '[data-testid="draft-session-selected-index"]'),
    ).toBe("0");

    await act(async () => {
      clickButton(host, '[data-testid="draft-session-history-newer"]');
    });
    expect(getComposerValue(host)).toBe("draft message");
    expect(
      getOutputValue(host, '[data-testid="draft-session-selected-index"]'),
    ).toBe("none");
  });

  it("clears and restores the composer draft through the escape session helpers", async () => {
    await act(async () => {
      root.render(<DraftSessionHarness submittedMessageHistory={[]} />);
    });

    await act(async () => {
      clickButton(host, '[data-testid="draft-session-set-draft"]');
    });
    expect(getComposerValue(host)).toBe("draft message");

    await act(async () => {
      clickButton(host, '[data-testid="draft-session-clear"]');
    });
    expect(getComposerValue(host)).toBe("");
    expect(getOutputValue(host, '[data-testid="draft-session-feedback"]')).toBe(
      "none",
    );

    await act(async () => {
      clickButton(host, '[data-testid="draft-session-restore"]');
    });
    expect(getComposerValue(host)).toBe("draft message");
    expect(getOutputValue(host, '[data-testid="draft-session-feedback"]')).toBe(
      "Restored cleared draft.",
    );
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
