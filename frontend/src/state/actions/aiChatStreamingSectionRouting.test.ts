import {
  isChatStreamActive,
  isSectionStreamActive,
  resetStreamingTracker,
} from "state/aiStreamingTracker";
import {
  AgenticEdgeKindEnum,
  createToolChatMessage,
  SettaNotificationTypeEnum,
  StreamingEventTypeEnum,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const addTemporaryNotificationMock = vi.hoisted(() => vi.fn());
const receiveAgenticScopeViolationEdgesMock = vi.hoisted(() => vi.fn());

vi.mock("state/actions/notifications", () => ({
  addTemporaryNotification: addTemporaryNotificationMock,
}));

vi.mock("state/actions/aiFollowHighlights", () => ({
  receiveAgenticScopeViolationEdges: receiveAgenticScopeViolationEdgesMock,
  SCOPE_VIOLATION_TIMEOUT_MS: 2000,
}));

import {
  applyStreamingChunkRoutingSideEffects,
  handleAgenticScopeViolation,
} from "./aiChatStreamingSectionRouting";

function createScopeViolationResult() {
  return createToolChatMessage({
    tool_call_id: "tool-call-1",
    tool_name: "setta__do_work",
    result: {
      meta: null,
      content: [],
      structuredContent: {
        error: "ScopeViolation",
        message: "Tool blocked by agentic scope.",
        missingEdgesCanonical: [
          {
            sourceSectionId: "section-a",
            targetSectionId: "section-b",
            kind: AgenticEdgeKindEnum.chat_section,
          },
        ],
      },
      isError: true,
    },
  });
}

describe("aiChatStreamingSectionRouting", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetStreamingTracker();
    addTemporaryNotificationMock.mockReset();
    receiveAgenticScopeViolationEdgesMock.mockReset();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    resetStreamingTracker();
  });

  it("tracks stream-active state on start and clears it on stop", () => {
    // The section-routing owner should keep stream-active bookkeeping in sync
    // even when a chunk has no managed section target.
    applyStreamingChunkRoutingSideEffects({
      chatId: "chat-1",
      sectionId: "section-1",
      projectConfigId: "project-1",
      chunk: {
        type: StreamingEventTypeEnum.MESSAGE_START,
        message: {
          id: "assistant-1",
          role: "assistant",
          content: [],
          attachments: [],
          tool_calls: null,
        },
      },
    });

    expect(isChatStreamActive("chat-1")).toBe(true);
    expect(isSectionStreamActive("section-1")).toBe(true);

    applyStreamingChunkRoutingSideEffects({
      chatId: "chat-1",
      sectionId: null,
      projectConfigId: "project-1",
      chunk: {
        type: StreamingEventTypeEnum.MESSAGE_STOP,
        message_id: "assistant-1",
      },
    });

    expect(isChatStreamActive("chat-1")).toBe(false);
    expect(isSectionStreamActive("section-1")).toBe(true);
  });

  it("dedupes scope-violation toasts while refreshing the timeout", () => {
    // Repeated scope-violation tool results should keep highlighting edges,
    // but should only show one warning toast until the timeout fully expires.
    const toolResult = createScopeViolationResult();

    handleAgenticScopeViolation(toolResult, "project-1");
    handleAgenticScopeViolation(toolResult, "project-1");

    expect(receiveAgenticScopeViolationEdgesMock).toHaveBeenCalledTimes(2);
    expect(addTemporaryNotificationMock).toHaveBeenCalledTimes(1);
    expect(addTemporaryNotificationMock).toHaveBeenCalledWith(
      "Tool blocked by agentic scope. Add the missing agentic edge(s) shown on the canvas. Use Project Chat for full access.",
      SettaNotificationTypeEnum.warning,
    );

    vi.advanceTimersByTime(1999);
    handleAgenticScopeViolation(toolResult, "project-1");
    expect(addTemporaryNotificationMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2000);
    handleAgenticScopeViolation(toolResult, "project-1");
    expect(addTemporaryNotificationMock).toHaveBeenCalledTimes(2);
  });
});
