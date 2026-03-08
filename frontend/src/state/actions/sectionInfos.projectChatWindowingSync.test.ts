import { useReactFlow } from "forks/xyflow/core/store";
import {
  useNodeInternals,
  usePendingOperations,
  useProjectState,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  createProjectChatWindowInstance,
  createProjectChatWindowingState,
  createProjectConfig,
  createProjectStateSingleConfig,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it } from "vitest";
import { processProjectStateUpdateFromBackend } from "./sectionInfos";

function buildProjectState(
  projectChatWindowing = createProjectChatWindowingState(),
) {
  return createProjectStateSingleConfig({
    projectConfig: createProjectConfig({
      id: "project-config-1",
    }),
    projectChatWindowing,
  });
}

function setLocalProjectState(
  projectChatWindowing = createProjectChatWindowingState(),
) {
  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({
      id: "project-config-1",
    });
    state.projectChatWindowing = projectChatWindowing;
  });
}

describe("processProjectStateUpdateFromBackend project chat windowing sync", () => {
  beforeEach(() => {
    resetProjectStores();
    usePendingOperations.setState({ pending: [] });
    useNodeInternals.setState({ x: new Map() });
    useReactFlow.setState({
      transform: [0, 0, 1],
      fitViewOnInit: false,
      fitViewOnInitDone: true,
    });
  });

  it("replaces stale local project chat windowing with the backend snapshot when there are no pending ops", () => {
    const localWindow = createProjectChatWindowInstance({
      instanceId: "project-chat-window-1",
      title: "Local title",
      isClosed: true,
    });
    const backendWindow = createProjectChatWindowInstance({
      instanceId: "project-chat-window-1",
      title: "Server title",
      isClosed: false,
    });

    setLocalProjectState(
      createProjectChatWindowingState({
        instancesById: {
          [localWindow.instanceId]: localWindow,
        },
        order: [localWindow.instanceId],
        nextInstanceNumber: 2,
      }),
    );

    expect(() =>
      processProjectStateUpdateFromBackend({
        projectState: buildProjectState(
          createProjectChatWindowingState({
            instancesById: {
              [backendWindow.instanceId]: backendWindow,
            },
            order: [backendWindow.instanceId],
            nextInstanceNumber: 2,
          }),
        ),
        completedOpIds: [],
        pendingOpIds: [],
      }),
    ).not.toThrow();

    expect(useProjectState.getState().projectChatWindowing).toEqual(
      createProjectChatWindowingState({
        instancesById: {
          [backendWindow.instanceId]: backendWindow,
        },
        order: [backendWindow.instanceId],
        nextInstanceNumber: 2,
      }),
    );
  });

  it("reapplies a still-pending optimistic windowing update on top of the backend snapshot", () => {
    const backendWindow = createProjectChatWindowInstance({
      instanceId: "project-chat-window-1",
      title: "Server title",
    });

    setLocalProjectState(
      createProjectChatWindowingState({
        instancesById: {
          [backendWindow.instanceId]: backendWindow,
        },
        order: [backendWindow.instanceId],
        nextInstanceNumber: 2,
      }),
    );
    usePendingOperations.setState({
      pending: [
        {
          opId: "frontend-op-1",
          acknowledged: false,
          apply: (state) => {
            state.projectChatWindowing.instancesById["project-chat-window-1"] =
              createProjectChatWindowInstance({
                instanceId: "project-chat-window-1",
                title: "Optimistic title",
              });
          },
        },
      ],
    });

    processProjectStateUpdateFromBackend({
      projectState: buildProjectState(
        createProjectChatWindowingState({
          instancesById: {
            [backendWindow.instanceId]: backendWindow,
          },
          order: [backendWindow.instanceId],
          nextInstanceNumber: 2,
        }),
      ),
      completedOpIds: [],
      pendingOpIds: ["frontend-op-1"],
    });

    expect(
      useProjectState.getState().projectChatWindowing.instancesById[
        "project-chat-window-1"
      ]?.title,
    ).toBe("Optimistic title");
  });
});
