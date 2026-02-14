import { describe, expect, it } from "vitest";

import { filterSkills } from "./projectChatSkillsMcpViewerUtils";

describe("projectChatSkillsMcpViewerUtils (perf)", () => {
  it("filters large skill lists quickly", () => {
    const rows = Array.from({ length: 800 }, (_, index) => ({
      skillId: `workspace_skills::skill-${index}`,
      name: `skill-${index}`,
      rootLabel: index % 2 === 0 ? "Workspace skills" : "User ~/.codex/skills",
      rootPath: "/skills",
      relativePath: `skill-${index}`,
      skillPath: `/skills/skill-${index}/SKILL.md`,
      description: `Skill description ${index}`,
    }));

    const start = performance.now();
    for (let i = 0; i < 250; i += 1) {
      filterSkills(rows, "skill-42");
      filterSkills(rows, "workspace");
      filterSkills(rows, "");
    }
    const elapsedMs = performance.now() - start;

    // Guard against accidental quadratic regressions in filtering logic.
    expect(elapsedMs).toBeLessThan(180);
  });
});
