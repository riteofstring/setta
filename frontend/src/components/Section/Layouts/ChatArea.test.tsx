import { createAgentRun } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  getManagedChatRunRefreshKey,
  shouldExitManagedChatHistory,
} from "./ChatArea";

describe("shouldExitManagedChatHistory", () => {
  it("closes history when the managed chat binding changes", () => {
    expect(
      shouldExitManagedChatHistory({
        previousChatId: "chat-before",
        nextChatId: "chat-after",
        previousWaitingForResponse: false,
        nextWaitingForResponse: false,
      }),
    ).toBe(true);
  });

  it("closes history when the current managed chat starts a new response", () => {
    expect(
      shouldExitManagedChatHistory({
        previousChatId: "chat-current",
        nextChatId: "chat-current",
        previousWaitingForResponse: false,
        nextWaitingForResponse: true,
      }),
    ).toBe(true);
  });

  it("keeps history open when there is no new external chat activity", () => {
    expect(
      shouldExitManagedChatHistory({
        previousChatId: "chat-current",
        nextChatId: "chat-current",
        previousWaitingForResponse: true,
        nextWaitingForResponse: true,
      }),
    ).toBe(false);
  });
});

describe("getManagedChatRunRefreshKey", () => {
  it("returns the newest matching run for the section, chat, and run type", () => {
    const refreshKey = getManagedChatRunRefreshKey({
      agentRuns: [
        createAgentRun({
          id: "other-section",
          status: "running",
          startedAt: "2026-03-13T16:00:00Z",
          inputs: {
            runType: "external_agent",
            sectionId: "section-other",
            chatId: "chat-current",
          },
        }),
        createAgentRun({
          id: "current-running",
          status: "running",
          startedAt: "2026-03-13T16:10:00Z",
          inputs: {
            runType: "external_agent",
            sectionId: "section-current",
            chatId: "chat-current",
          },
        }),
        createAgentRun({
          id: "current-completed",
          status: "completed",
          startedAt: "2026-03-13T16:20:00Z",
          finishedAt: "2026-03-13T16:21:00Z",
          inputs: {
            runType: "external_agent",
            sectionId: "section-current",
            chatId: "chat-current",
          },
        }),
      ],
      sectionId: "section-current",
      chatId: "chat-current",
      runType: "external_agent",
    });

    expect(refreshKey).toBe(
      `current-completed:completed:${Date.parse("2026-03-13T16:21:00Z")}`,
    );
  });

  it("returns null when there is no matching current-thread run", () => {
    expect(
      getManagedChatRunRefreshKey({
        agentRuns: [
          createAgentRun({
            id: "llm-run",
            status: "running",
            startedAt: "2026-03-13T16:10:00Z",
            inputs: {
              runType: "llm_chat",
              sectionId: "section-current",
              chatId: "chat-current",
            },
          }),
        ],
        sectionId: "section-current",
        chatId: "chat-current",
        runType: "external_agent",
      }),
    ).toBeNull();
  });
});
