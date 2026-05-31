import type { KeyboardEvent } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

import { ComposerButton, ConversationBody, handleComposerKeyDown } from "./chat-panel";

type ConversationBodyProps = Parameters<typeof ConversationBody>[0];

describe("composer keyboard behavior", () => {
  test("queues on Tab", () => {
    const event = keyboardEvent("Tab");
    const queueDraft = vi.fn();
    const sendDraft = vi.fn();
    const stopRun = vi.fn();

    handleComposerKeyDown(event, {
      queueDraft,
      running: false,
      sendDraft,
      stopRun,
    });

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(queueDraft).toHaveBeenCalledOnce();
    expect(sendDraft).not.toHaveBeenCalled();
    expect(stopRun).not.toHaveBeenCalled();
  });

  test("submits once on Enter", () => {
    const event = keyboardEvent("Enter");
    const sendDraft = vi.fn();

    handleComposerKeyDown(event, {
      queueDraft: vi.fn(),
      running: false,
      sendDraft,
      stopRun: vi.fn(),
    });

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(sendDraft).toHaveBeenCalledOnce();
  });

  test("stops an active run on Ctrl+C when no text is selected", () => {
    const event = keyboardEvent("c", { ctrlKey: true });
    const stopRun = vi.fn();

    handleComposerKeyDown(event, {
      queueDraft: vi.fn(),
      running: true,
      sendDraft: vi.fn(),
      stopRun,
    });

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(stopRun).toHaveBeenCalledOnce();
  });
});

describe("composer controls", () => {
  test("hides queue controls while idle", () => {
    const html = renderToString(
      <ComposerButton
        canSend
        chat={composerButtonChat()}
        queueDraft={async () => {}}
        running={false}
      />,
    );

    expect(html).toContain("Send message");
    expect(html).not.toContain("Queue follow-up");
    expect(html).not.toContain("Stop run");
  });

  test("shows separate steering queue and stop controls while running", () => {
    const html = renderToString(
      <ComposerButton canSend chat={composerButtonChat()} queueDraft={async () => {}} running />,
    );

    expect(html).toContain("Send steering message");
    expect(html).toContain("Queue follow-up");
    expect(html).toContain("Stop run");
  });
});

describe("conversation body states", () => {
  test("shows corrupt-state load errors instead of empty chat actions", () => {
    const html = renderToString(
      <ConversationBody
        busy={false}
        chat={
          {
            createConversation: async () => {},
            error: "malformed chat state /tmp/run.json",
            selectedConversation: null,
          } as ConversationBodyProps["chat"]
        }
      />,
    );

    expect(html).toContain('data-testid="chat-load-error"');
    expect(html).toContain("Chat state is corrupt");
    expect(html).toContain("malformed chat state /tmp/run.json");
    expect(html).not.toContain("New Chat");
  });
});

function keyboardEvent(
  key: string,
  options: { ctrlKey?: boolean; selectionEnd?: number; selectionStart?: number } = {},
) {
  return {
    altKey: false,
    ctrlKey: options.ctrlKey ?? false,
    currentTarget: {
      selectionEnd: options.selectionEnd ?? 0,
      selectionStart: options.selectionStart ?? 0,
    },
    key,
    nativeEvent: { isComposing: false },
    preventDefault: vi.fn(),
    shiftKey: false,
  } as unknown as KeyboardEvent<HTMLTextAreaElement>;
}

function composerButtonChat() {
  return {
    operation: null,
    stopActiveRun: async () => {},
  };
}
