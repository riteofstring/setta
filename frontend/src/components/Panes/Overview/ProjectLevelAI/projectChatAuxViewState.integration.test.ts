import { useLocalStorage, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setProjectChatAuxViewForActiveProject } from "./ProjectChat";

describe("setProjectChatAuxViewForActiveProject", () => {
  beforeEach(() => {
    resetProjectStores();
    useProjectState.setState((state) => {
      state.projectConfig.id = "project-a";
    });
    useLocalStorage.setState({
      projectChatAuxViewByProjectConfigId: {},
    });
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("writes to the active project even when handlers are reused across project switches", () => {
    // Simulate handlers that were created before a project switch and reused afterwards.
    const openSkillsAuxView = () => {
      setProjectChatAuxViewForActiveProject("skills");
    };
    const openMcpAuxView = () => {
      setProjectChatAuxViewForActiveProject("mcp");
    };

    openSkillsAuxView();
    useProjectState.setState((state) => {
      state.projectConfig.id = "project-b";
    });
    openMcpAuxView();

    expect(
      useLocalStorage.getState().projectChatAuxViewByProjectConfigId,
    ).toEqual({
      "project-a": "skills",
      "project-b": "mcp",
    });
  });

  it("clears only the active project aux entry after switching projects", () => {
    // "Return to chat/new chat" style clears should only affect the active project.
    useLocalStorage.setState({
      projectChatAuxViewByProjectConfigId: {
        "project-a": "skills",
        "project-b": "ai_settings",
      },
    });

    const clearAuxView = () => {
      setProjectChatAuxViewForActiveProject("none");
    };

    useProjectState.setState((state) => {
      state.projectConfig.id = "project-b";
    });
    clearAuxView();

    expect(
      useLocalStorage.getState().projectChatAuxViewByProjectConfigId,
    ).toEqual({
      "project-a": "skills",
    });
  });
});
