import { describe, expect, it } from "vitest";

import { resolveProjectChatAuxViewByProjectConfigIdUpdate } from "./ProjectChat";

describe("resolveProjectChatAuxViewByProjectConfigIdUpdate", () => {
  it("returns null when the active project aux view does not change", () => {
    // No mutation should occur when the active project is already on the requested view.
    const next = resolveProjectChatAuxViewByProjectConfigIdUpdate({
      projectChatAuxViewByProjectConfigId: {
        "project-a": "skills",
      },
      projectConfigId: "project-a",
      nextAuxView: "skills",
    });

    expect(next).toBeNull();
  });

  it("updates only the targeted project entry when opening an aux view", () => {
    // Switching the active project entry must preserve every other project's state.
    const next = resolveProjectChatAuxViewByProjectConfigIdUpdate({
      projectChatAuxViewByProjectConfigId: {
        "project-a": "skills",
      },
      projectConfigId: "project-b",
      nextAuxView: "mcp",
    });

    expect(next).toEqual({
      "project-a": "skills",
      "project-b": "mcp",
    });
  });

  it("removes only the targeted project entry when clearing aux view", () => {
    // Clearing a project view should not clear other project keys.
    const next = resolveProjectChatAuxViewByProjectConfigIdUpdate({
      projectChatAuxViewByProjectConfigId: {
        "project-a": "skills",
        "project-b": "slash_commands",
      },
      projectConfigId: "project-b",
      nextAuxView: "none",
    });

    expect(next).toEqual({
      "project-a": "skills",
    });
  });
});
