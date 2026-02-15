import {
  AgentRunStatusEnum,
  SectionTypeEnum,
  createAgentRun,
  createChatSectionImpl,
  createTextBlockSectionImpl,
  createUserDefaultChatSectionImpl,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  getActiveSectionIdsFromRuns,
  isChatSectionWaitingForResponse,
} from "./aiActivity";

describe("aiActivity", () => {
  it("collects section ids for running runs only", () => {
    // Only running runs with a section id should activate an overview indicator.
    const runs = [
      createAgentRun({
        status: AgentRunStatusEnum.running,
        inputs: { sectionId: "section-a" },
      }),
      createAgentRun({
        status: AgentRunStatusEnum.completed,
        inputs: { sectionId: "section-b" },
      }),
      createAgentRun({
        status: AgentRunStatusEnum.running,
        inputs: { sectionId: "section-c" },
      }),
      createAgentRun({
        status: AgentRunStatusEnum.running,
        inputs: null,
      }),
    ];

    const activeSectionIds = getActiveSectionIdsFromRuns(runs);

    expect([...activeSectionIds].sort()).toEqual(["section-a", "section-c"]);
  });

  it("maps chat waiting state to overview activity", () => {
    // Chat sections with a pending response should show active work immediately.
    const waitingChat = createChatSectionImpl(
      createUserDefaultChatSectionImpl({ waitingForResponse: true }),
    );
    const idleChat = createChatSectionImpl(
      createUserDefaultChatSectionImpl({ waitingForResponse: false }),
    );
    const textSection = createTextBlockSectionImpl({
      type: SectionTypeEnum.TextBlock,
    });

    expect(isChatSectionWaitingForResponse(waitingChat)).toBe(true);
    expect(isChatSectionWaitingForResponse(idleChat)).toBe(false);
    expect(isChatSectionWaitingForResponse(textSection)).toBe(false);
  });
});
