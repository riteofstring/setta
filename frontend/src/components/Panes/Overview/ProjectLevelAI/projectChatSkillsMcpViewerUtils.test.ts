import { describe, expect, it } from "vitest";

import {
  filterSkills,
  groupSkillsByRootPath,
} from "./projectChatSkillsMcpViewerUtils";

describe("projectChatSkillsMcpViewerUtils", () => {
  it("filters skills by name/path/root/description", () => {
    const rows = [
      {
        skillId: "workspace_skills::ui-layout",
        name: "ui-layout",
        rootLabel: "Workspace skills",
        rootPath: "/workspace/skills",
        relativePath: "ui-layout",
        description: "Create dense dashboard layouts.",
      },
      {
        skillId: "user_agents_skills::build-tools",
        name: "build-tools",
        rootLabel: "User ~/.agents/skills",
        rootPath: "/home/.agents/skills",
        relativePath: "build-tools",
        description: "Automate builds and releases.",
      },
    ];

    expect(filterSkills(rows, "dashboard")).toHaveLength(1);
    expect(filterSkills(rows, "build-tools")[0]?.skillId).toBe(
      "user_agents_skills::build-tools",
    );
    expect(filterSkills(rows, "")).toHaveLength(2);
  });

  it("groups filtered skills by root path", () => {
    const rows = [
      {
        skillId: "user_codex_skills::frontend-design",
        name: "frontend-design",
        rootLabel: "User ~/.codex/skills",
        rootPath: "/home/.codex/skills",
        relativePath: "frontend-design",
        description: "Create polished frontend interfaces.",
      },
      {
        skillId: "workspace_skills::setta-cli",
        name: "setta-cli",
        rootLabel: "Workspace skills",
        rootPath: "/workspace/skills",
        relativePath: "setta-cli",
        description: "Project-local CLI helpers.",
      },
      {
        skillId: "user_codex_skills::.system/skill-installer",
        name: "skill-installer",
        rootLabel: "User ~/.codex/skills",
        rootPath: "/home/.codex/skills",
        relativePath: ".system/skill-installer",
        description: "Install curated skills.",
      },
    ];

    const groups = groupSkillsByRootPath(rows);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.rootPath).toBe("/home/.codex/skills");
    expect(groups[0]?.skills.map((skill) => skill.skillId)).toEqual([
      "user_codex_skills::.system/skill-installer",
      "user_codex_skills::frontend-design",
    ]);
    expect(groups[1]?.rootPath).toBe("/workspace/skills");
  });
});
