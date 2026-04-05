import {
  RunStatusEnum,
  SectionTypeEnum,
  createAgentRun,
  createChatSectionImpl,
  createTextBlockSectionImpl,
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
        status: RunStatusEnum.running,
        inputs: { sectionId: "section-a" },
      }),
      createAgentRun({
        status: RunStatusEnum.completed,
        inputs: { sectionId: "section-b" },
      }),
      createAgentRun({
        status: RunStatusEnum.running,
        inputs: { sectionId: "section-c" },
      }),
      createAgentRun({
        status: RunStatusEnum.running,
        inputs: null,
      }),
    ];

    const activeSectionIds = getActiveSectionIdsFromRuns(runs);

    expect([...activeSectionIds].sort()).toEqual(["section-a", "section-c"]);
  });

  it("scopes running section activity to the active project config", () => {
    // Running runs from other project configs should not activate this overview.
    const runs = [
      createAgentRun({
        status: RunStatusEnum.running,
        inputs: { sectionId: "section-a", projectConfigId: "project-a" },
      }),
      createAgentRun({
        status: RunStatusEnum.running,
        inputs: { sectionId: "section-b", projectConfigId: "project-b" },
      }),
      createAgentRun({
        status: RunStatusEnum.completed,
        inputs: { sectionId: "section-c", projectConfigId: "project-a" },
      }),
    ];

    const activeSectionIds = getActiveSectionIdsFromRuns(runs, "project-a");

    expect([...activeSectionIds]).toEqual(["section-a"]);
  });

  it("maps chat waiting state to overview activity", () => {
    // Chat sections with a pending response should show active work immediately.
    const waitingChat = createChatSectionImpl({ waitingForResponse: true });
    const idleChat = createChatSectionImpl({ waitingForResponse: false });
    const textSection = createTextBlockSectionImpl({
      type: SectionTypeEnum.TextBlock,
    });

    expect(isChatSectionWaitingForResponse(waitingChat)).toBe(true);
    expect(isChatSectionWaitingForResponse(idleChat)).toBe(false);
    expect(isChatSectionWaitingForResponse(textSection)).toBe(false);
  });
});
