import { describe, expect, it } from "vitest";

import {
  filterSkills,
  groupSkillsByRootPath,
} from "./projectChatSkillsMcpViewerUtils";

function makeRows(size: number) {
  return Array.from({ length: size }, (_, index) => ({
    skillId: `workspace_skills::skill-${index}`,
    name: `skill-${index}`,
    rootLabel:
      index % 3 === 0
        ? "Workspace skills"
        : index % 3 === 1
          ? "User ~/.codex/skills"
          : "User ~/.agents/skills",
    rootPath:
      index % 3 === 0
        ? "/workspace/skills"
        : index % 3 === 1
          ? "/home/.codex/skills"
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
});
