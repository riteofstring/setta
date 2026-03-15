/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { ChatRoleEnum, type ToolChatMessage } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildActivityTimelineEntries } from "./chatAssistantActivity";
import { AssistantActivityCard } from "./chatAssistantActivityCard";

function buildTimelineFixture() {
  const assistantMessage = {
    id: "activity-card-message",
    role: ChatRoleEnum.assistant,
    content: [
      {
        type: "thinking",
        thinking:
          "The focused chat tests passed, so I can keep the grouped activity card and the bubble summary aligned.",
        summary: "Summarizing the passing chat tests.",
        signature: null,
      },
    ],
    attachments: [],
    tool_calls: [
      {
        id: "activity-card-tool-call",
        type: "function",
        function: {
          name: "command_execution",
          arguments: { command: "pnpm exec vitest run src/components/Chat" },
        },
      },
    ],
    createdAt: Date.parse("2026-01-01T09:17:00Z"),
  } as const;

  const toolResultsById: Record<string, ToolChatMessage> = {
    "activity-card-tool-call": {
      id: "activity-card-tool-result",
      role: ChatRoleEnum.tool,
      tool_call_id: "activity-card-tool-call",
      tool_name: "command_execution",
      arguments: { command: "pnpm exec vitest run src/components/Chat" },
      result: "PASS src/components/Chat/chatAssistantActivityCard.test.tsx",
      content: [],
      is_error: false,
      started_at: "2026-01-01T09:16:05Z",
      completed_at: "2026-01-01T09:16:08Z",
    },
  };

  const timelineEntries = buildActivityTimelineEntries(
    [
      {
        message: assistantMessage,
        isStreaming: false,
        wasInterrupted: false,
      },
    ],
    toolResultsById,
  );

  return { timelineEntries, toolResultsById };
}

describe("AssistantActivityCard", () => {
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

  it("renders the activity header and expands its thought and action rows", async () => {
    const { timelineEntries, toolResultsById } = buildTimelineFixture();

    await act(async () => {
      root.render(
        <AssistantActivityCard
          timelineEntries={timelineEntries}
          toolResultsById={toolResultsById}
          toolCallArguments={{}}
          runKey="activity-card-run"
        />,
      );
    });

    const activityTrigger = host.querySelector(
      '[data-chat-assistant-activity-trigger="true"]',
    );
    expect(activityTrigger).not.toBeNull();
    expect(activityTrigger?.textContent).toContain(
      "pnpm exec vitest run src/components/Chat",
    );
    expect(
      host.querySelector('[data-chat-assistant-activity-count-badge="true"]'),
    ).not.toBeNull();

    // Expanding the card should reveal the direct child activity rows.
    await act(async () => {
      activityTrigger?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(host.querySelector('[data-chat-action-item="true"]')).not.toBeNull();
    expect(
      host.querySelector('[data-chat-thinking-section="true"]'),
    ).not.toBeNull();
  });

  it("opens child rows from the header control and hides the floating thought preview", async () => {
    const { timelineEntries, toolResultsById } = buildTimelineFixture();

    await act(async () => {
      root.render(
        <AssistantActivityCard
          timelineEntries={timelineEntries}
          toolResultsById={toolResultsById}
          toolCallArguments={{}}
          runKey="activity-card-open-all-run"
        />,
      );
    });

    const openAllButton = host.querySelector(
      '[data-chat-assistant-activity-open-all-button="true"]',
    );
    expect(openAllButton).not.toBeNull();

    // The header-level control should open each child accordion in one shot.
    await act(async () => {
      openAllButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const actionTrigger = host.querySelector(
      '[data-chat-action-item-trigger="true"]',
    );
    const thoughtTrigger = host.querySelector(
      '[data-chat-thinking-trigger="true"]',
    );
    expect(actionTrigger?.getAttribute("aria-expanded")).toBe("true");
    expect(thoughtTrigger?.getAttribute("aria-expanded")).toBe("true");
    expect(
      host
        .querySelector(
          '[data-chat-assistant-activity-thought-preview-shell="true"]',
        )
        ?.getAttribute("data-chat-assistant-activity-thought-preview-visible"),
    ).toBe("false");
  });
});
