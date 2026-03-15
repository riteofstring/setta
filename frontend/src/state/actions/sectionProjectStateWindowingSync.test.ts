import {
  buildProjectChatEphemeralWindowInstanceKey,
  getTrackedGitPaneGraphWindowInstanceIdForProject,
} from "state/actions/projectChatWindowingEphemeral";
import { useMisc } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  ChatWindowModeEnum,
  createProjectChatWindowInstance,
  createProjectChatWindowingState,
  createProjectConfig,
  createProjectStateSingleConfig,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getAuthoritativeProjectChatWindowingState,
  resetAuthoritativeProjectChatWindowingState,
} from "./projectChatWindowingAuthoritative";
import {
  reconcileProjectStateWindowingEphemeral,
  recordProjectStateWindowingAuthoritativeSnapshot,
} from "./sectionProjectStateWindowingSync";

function createProjectState(
  projectChatWindowing = createProjectChatWindowingState(),
) {
  return createProjectStateSingleConfig({
    projectConfig: createProjectConfig({
      id: "project-config-1",
    }),
    projectChatWindowing,
  });
}

describe("sectionProjectStateWindowingSync", () => {
  beforeEach(() => {
    resetProjectStores();
    resetAuthoritativeProjectChatWindowingState();
  });

  afterEach(() => {
    resetProjectStores();
    resetAuthoritativeProjectChatWindowingState();
  });

  it("records the authoritative project-chat windowing snapshot before optimistic replay", () => {
    const backendWindow = createProjectChatWindowInstance({
      instanceId: "project-chat-window-1",
      title: "Server title",
    });
    const projectState = createProjectState(
      createProjectChatWindowingState({
        instancesById: {
          [backendWindow.instanceId]: backendWindow,
        },
        order: [backendWindow.instanceId],
        nextInstanceNumber: 2,
      }),
    );

    recordProjectStateWindowingAuthoritativeSnapshot(projectState);

    expect(
      getAuthoritativeProjectChatWindowingState("project-config-1"),
    ).toEqual(projectState.projectChatWindowing);
  });

  it("prunes stale git-graph misc state when the backend repurposes an instance id", () => {
    useMisc.setState({
      projectChatTrackedGitPaneGraphWindowInstanceId:
        buildProjectChatEphemeralWindowInstanceKey(
          "project-config-1",
          "graph-window-1",
        ),
      projectChatGitGraphEmbeddedPaneVisibleByInstanceId: {
        [buildProjectChatEphemeralWindowInstanceKey(
          "project-config-1",
          "graph-window-1",
        )]: true,
      },
    });

    reconcileProjectStateWindowingEphemeral(
      createProjectState(
        createProjectChatWindowingState({
          instancesById: {
            "graph-window-1": createProjectChatWindowInstance({
              instanceId: "graph-window-1",
              mode: ChatWindowModeEnum.project_ai_mode,
            }),
          },
          order: ["graph-window-1"],
          nextInstanceNumber: 2,
        }),
      ),
    );

    expect(
      getTrackedGitPaneGraphWindowInstanceIdForProject("project-config-1"),
    ).toBeNull();
    expect(
      useMisc.getState().projectChatGitGraphEmbeddedPaneVisibleByInstanceId,
    ).toEqual({});
  });
});
