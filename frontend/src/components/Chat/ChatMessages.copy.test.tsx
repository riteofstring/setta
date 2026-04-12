/* @vitest-environment jsdom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { type BaseChatMessageUnion, ChatRoleEnum } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const chatMessagesMocks = vi.hoisted(() => ({
  addTemporaryNotificationMock: vi.fn(),
  requestAttachmentUrlsMock: vi.fn(),
}));

vi.mock("state/actions/notifications", () => ({
  addTemporaryNotification: chatMessagesMocks.addTemporaryNotificationMock,
}));

vi.mock("state/hooks/share", () => ({
  useShareCapabilities: () => ({
    canEditParams: true,
  }),
}));

vi.mock("./useChatMessageAttachmentUrls", () => ({
  useChatMessageAttachmentUrls: () => ({
    attachmentUrlMap: {},
    requestAttachmentUrls: chatMessagesMocks.requestAttachmentUrlsMock,
  }),
}));

import { ChatMessageList } from "./ChatMessages";

type RenderedMessages = {
  host: HTMLDivElement;
  root: Root;
};

const originalReactActEnvironment = (
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT;

let renderedMessages: RenderedMessages | null = null;

function setReactActEnvironment(value: boolean | undefined) {
  const target = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  if (value === undefined) {
    delete target.IS_REACT_ACT_ENVIRONMENT;
    return;
  }
  target.IS_REACT_ACT_ENVIRONMENT = value;
}

async function flushChatMessages(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderMessages(
  messages: BaseChatMessageUnion[],
): Promise<RenderedMessages> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(
      createElement(ChatMessageList, {
        messages,
        waitingForResponse: false,
        toolCallArguments: {},
      }),
    );
  });
  await flushChatMessages();

  const rendered = { host, root };
  renderedMessages = rendered;
  return rendered;
}

async function unmountMessages(
  rendered: RenderedMessages | null,
): Promise<void> {
  if (!rendered) {
    return;
  }
  await act(async () => {
    rendered.root.unmount();
  });
  rendered.host.remove();
}

describe("ChatMessageList copy behavior", () => {
  const clipboardWriteTextMock = vi.fn();

  beforeEach(() => {
    setReactActEnvironment(true);
    resetProjectStores();
    chatMessagesMocks.addTemporaryNotificationMock.mockReset();
    chatMessagesMocks.requestAttachmentUrlsMock.mockReset();
    clipboardWriteTextMock.mockReset();
    Object.defineProperty(window.navigator, "clipboard", {
      value: {
        writeText: clipboardWriteTextMock.mockResolvedValue(undefined),
      },
      configurable: true,
    });
  });

  afterEach(async () => {
    await unmountMessages(renderedMessages);
    renderedMessages = null;
    setReactActEnvironment(originalReactActEnvironment);
    document.body.innerHTML = "";
    resetProjectStores();
  });

  it("copies tool call details when assistant content is empty", async () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "assistant-tool-copy",
        role: ChatRoleEnum.assistant,
        content: [],
        attachments: [],
        tool_calls: [
          {
            id: "tool-copy-1",
            type: "function",
            function: {
              name: "mcp__figma-desktop__get_design_context",
              arguments: { nodeId: "1:2" },
            },
          },
        ],
      },
      {
        role: ChatRoleEnum.tool,
        tool_call_id: "tool-copy-1",
        tool_name: "mcp__figma-desktop__get_design_context",
        arguments: { nodeId: "1:2" },
        result: { ok: true },
        content: [],
        is_error: false,
        started_at: "2026-01-01T00:00:00Z",
        completed_at: null,
        id: "tool-result-1",
      },
    ];

    const { host } = await renderMessages(messages);
    const copyButton = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Copy message"]',
    );
    if (!copyButton) {
      throw new Error("Expected copy button to render.");
    }

    await act(async () => {
      copyButton.click();
      await Promise.resolve();
    });

    expect(clipboardWriteTextMock).toHaveBeenCalledTimes(1);
    const copiedText = clipboardWriteTextMock.mock.calls[0]?.[0];
    expect(copiedText).toContain("mcp__figma-desktop__get_design_context");
    expect(copiedText).toContain("Arguments:");
    expect(copiedText).toContain('"nodeId": "1:2"');
    expect(copiedText).toContain("Result:");
    expect(copiedText).toContain('"ok": true');
  });
});
