import { describe, expect, it } from "vitest";

import {
  type BaseChatMessageUnion,
  EngineTypeEnum,
  ExternalAgentToolTypeEnum,
} from "utils/generatedTypes";
import {
  buildSkillStatusBySkillId,
  filterSkills,
  groupSkillsByRootPath,
} from "./projectChatSkillsMcpViewerUtils";

function makeRows(size: number) {
  return Array.from({ length: size }, (_, index) => ({
    skillId: `workspace_agents_skills::skill-${index}`,
    name: `skill-${index}`,
    rootLabel:
      index % 3 === 0
        ? "Workspace .agents/skills"
        : index % 3 === 1
          ? "User ~/.claude/skills"
          : "User ~/.agents/skills",
    rootPath:
      index % 3 === 0
        ? "/workspace/.agents/skills"
        : index % 3 === 1
          ? "/home/.claude/skills"
          : "/home/.agents/skills",
    relativePath: `skill-${index}`,
    description: `Skill description ${index}`,
  }));
}

function averageRunTimeMs(iterations: number, fn: () => void): number {
  const start = performance.now();
  for (let index = 0; index < iterations; index += 1) {
    fn();
  }
  return (performance.now() - start) / iterations;
}

function makeSkillActivityMessages(size: number): BaseChatMessageUnion[] {
  const skillTokens = Array.from(
    { length: size },
    (_, index) => `$skill-${index}`,
  ).join(" ");
  return [
    {
      id: "user-1",
      role: "user",
      content: [{ type: "text", text: `Use ${skillTokens}` }],
      attachments: [],
    },
  ];
}

describe("projectChatSkillsMcpViewerUtils (perf)", () => {
  it("filtering scales roughly linearly between small and large lists", () => {
    const smallRows = makeRows(200);
    const largeRows = makeRows(800);

    // Warm up JIT before measuring.
    filterSkills(smallRows, "skill-42");
    filterSkills(largeRows, "skill-42");

    const smallAverageMs = averageRunTimeMs(250, () => {
      filterSkills(smallRows, "skill-42");
      filterSkills(smallRows, "workspace");
      filterSkills(smallRows, "");
    });
    const largeAverageMs = averageRunTimeMs(250, () => {
      filterSkills(largeRows, "skill-42");
      filterSkills(largeRows, "workspace");
      filterSkills(largeRows, "");
    });

    // 4x input should stay below a clear superlinear blow-up.
    expect(largeAverageMs / smallAverageMs).toBeLessThan(14);
  });

  it("grouping scales roughly linearly between small and large lists", () => {
    const smallRows = filterSkills(makeRows(300), "skill-");
    const largeRows = filterSkills(makeRows(1200), "skill-");

    groupSkillsByRootPath(smallRows);
    groupSkillsByRootPath(largeRows);

    const smallAverageMs = averageRunTimeMs(300, () => {
      groupSkillsByRootPath(smallRows);
    });
    const largeAverageMs = averageRunTimeMs(300, () => {
      groupSkillsByRootPath(largeRows);
    });

    // Keep a strict superlinear guard but allow timing variance in shared CI hosts.
    expect(largeAverageMs / smallAverageMs).toBeLessThan(10);
  });

  it("active skill mapping scales roughly linearly with large active token sets", () => {
    const smallRows = makeRows(250);
    const largeRows = makeRows(1000);
    const smallMessages = makeSkillActivityMessages(50);
    const largeMessages = makeSkillActivityMessages(200);

    buildSkillStatusBySkillId({
      skills: smallRows,
      engineType: EngineTypeEnum.external_agent,
      externalAgentToolType: ExternalAgentToolTypeEnum.codex,
      messages: smallMessages,
    });
    buildSkillStatusBySkillId({
      skills: largeRows,
      engineType: EngineTypeEnum.external_agent,
      externalAgentToolType: ExternalAgentToolTypeEnum.codex,
      messages: largeMessages,
    });

    const smallAverageMs = averageRunTimeMs(120, () => {
      buildSkillStatusBySkillId({
        skills: smallRows,
        engineType: EngineTypeEnum.external_agent,
        externalAgentToolType: ExternalAgentToolTypeEnum.codex,
        messages: smallMessages,
      });
    });
    const largeAverageMs = averageRunTimeMs(120, () => {
      buildSkillStatusBySkillId({
        skills: largeRows,
        engineType: EngineTypeEnum.external_agent,
        externalAgentToolType: ExternalAgentToolTypeEnum.codex,
        messages: largeMessages,
      });
    });

    // 4x scale on skills/messages should avoid quadratic blow-up.
    expect(largeAverageMs / smallAverageMs).toBeLessThan(12);
  });
});
