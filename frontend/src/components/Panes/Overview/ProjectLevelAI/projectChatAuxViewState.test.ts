import { useLocalStorage, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  resolveProjectChatDraftMessageByProjectConfigIdUpdate,
  setProjectChatAuxViewForActiveProject,
} from "./projectChatAuxViewState";

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

  it("keeps the active project entry unchanged when the requested view matches", () => {
    useLocalStorage.setState({
      projectChatAuxViewByProjectConfigId: {
        "project-a": "skills",
      },
    });

    const previous =
      useLocalStorage.getState().projectChatAuxViewByProjectConfigId;

    setProjectChatAuxViewForActiveProject("skills");

    expect(useLocalStorage.getState().projectChatAuxViewByProjectConfigId).toBe(
      previous,
    );
  });

  it("updates only the active project entry when opening an aux view", () => {
    useLocalStorage.setState({
      projectChatAuxViewByProjectConfigId: {
        "project-a": "skills",
      },
    });
    useProjectState.setState((state) => {
      state.projectConfig.id = "project-b";
    });

    setProjectChatAuxViewForActiveProject("mcp");

    expect(
      useLocalStorage.getState().projectChatAuxViewByProjectConfigId,
    ).toEqual({
      "project-a": "skills",
      "project-b": "mcp",
    });
  });

  it("removes only the active project entry when clearing aux view", () => {
    useLocalStorage.setState({
      projectChatAuxViewByProjectConfigId: {
        "project-a": "skills",
        "project-b": "slash_commands",
      },
    });
    useProjectState.setState((state) => {
      state.projectConfig.id = "project-b";
    });

    setProjectChatAuxViewForActiveProject("none");

    expect(
      useLocalStorage.getState().projectChatAuxViewByProjectConfigId,
    ).toEqual({
      "project-a": "skills",
    });
  });
});

describe("resolveProjectChatDraftMessageByProjectConfigIdUpdate", () => {
  it("stores composer drafts per project id", () => {
    const next = resolveProjectChatDraftMessageByProjectConfigIdUpdate({
      draftMessageByProjectConfigId: {
        "project-a": "alpha",
      },
      projectConfigId: "project-b",
      nextDraftMessage: "beta",
    });

    expect(next).toEqual({
      "project-a": "alpha",
      "project-b": "beta",
    });
  });

  it("removes only the targeted project draft when that composer is cleared", () => {
    const next = resolveProjectChatDraftMessageByProjectConfigIdUpdate({
      draftMessageByProjectConfigId: {
        "project-a": "alpha",
        "project-b": "beta",
      },
      projectConfigId: "project-b",
      nextDraftMessage: "",
    });

    expect(next).toEqual({
      "project-a": "alpha",
    });
  });
});
