import { describe, expect, it } from "vitest";

import {
  filterSkills,
  groupSkillsByRootPath,
} from "./projectChatSkillsMcpViewerUtils";

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

  it("groups large filtered lists without regressions", () => {
    const rows = Array.from({ length: 1200 }, (_, index) => ({
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
      skillPath: `/skills/skill-${index}/SKILL.md`,
      description: `Skill description ${index}`,
    }));

    const filtered = filterSkills(rows, "skill-1");
    const start = performance.now();
    for (let i = 0; i < 250; i += 1) {
      groupSkillsByRootPath(filtered);
    }
    const elapsedMs = performance.now() - start;

    // Guard against accidental regressions while grouping by root path.
    expect(elapsedMs).toBeLessThan(170);
  });
});
