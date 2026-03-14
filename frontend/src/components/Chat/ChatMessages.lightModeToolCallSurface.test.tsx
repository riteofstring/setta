/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useLocalStorage } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { BaseChatMessageUnion, ChatRoleEnum } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChatMessageList } from "./ChatMessages";

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

describe("ChatMessages light-mode tool row surfaces", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetProjectStores();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    resetProjectStores();
  });

  it("uses a light result surface for expanded tool-call output panels", async () => {
    useLocalStorage.setState({
      colorMode: "light",
      darkMode: false,
    });
    syncStoreInitialState(useLocalStorage);

    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-light-tool-surface",
        role: ChatRoleEnum.assistant,
        content: [],
        attachments: [],
        tool_calls: [
          {
            id: "light-tool-surface-call",
            type: "function",
            function: {
              name: "setta__get_setta_docs",
              arguments: { docId: "examples" },
            },
          },
        ],
      },
      {
        id: "tool-result-light-surface",
        role: ChatRoleEnum.tool,
        tool_call_id: "light-tool-surface-call",
        tool_name: "setta__get_setta_docs",
        arguments: { docId: "examples" },
        result: { docs: [{ doc_id: "examples", path: "docs/reference.md" }] },
        content: [],
        is_error: false,
        started_at: "2026-01-01T00:00:00Z",
        completed_at: "2026-01-01T00:00:05Z",
      },
    ];

    await act(async () => {
      root.render(
        <ChatMessageList messages={messages} waitingForResponse={false} />,
      );
    });

    const activityTrigger = host.querySelector(
      '[data-chat-assistant-activity-trigger="true"]',
    );
    expect(activityTrigger).not.toBeNull();
    await act(async () => {
      activityTrigger?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    const toolCallTrigger = host.querySelector(
      '[data-chat-tool-call-item-trigger="true"]',
    );
    expect(toolCallTrigger).not.toBeNull();
    await act(async () => {
      toolCallTrigger?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    const toolCallPanels = Array.from(
      host.querySelectorAll('[data-chat-tool-call-item-content="true"] > div'),
    );
    const toolCallResultPanel = toolCallPanels[1];
    expect(toolCallResultPanel).toBeDefined();
    expect(toolCallResultPanel?.className).toContain("bg-white/95");
    expect(toolCallResultPanel?.className).not.toContain("bg-setta-200");
  });
});
