import {
  createProjectChatWindowInstance,
  createProjectChatWindowingState,
  createProjectStateSingleConfig,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { mergeProjectChatWindowingFromCurrentState } from "./sectionInfos";

function buildProjectState(
  projectChatWindowing = createProjectChatWindowingState(),
) {
  return createProjectStateSingleConfig({
    projectConfig: {
      id: "project-config-1",
    },
    projectChatWindowing,
  });
}

describe("mergeProjectChatWindowingFromCurrentState", () => {
  it("preserves local chat windowing when an unrelated backend update arrives without window data", () => {
    // Section deletes and view-mode changes should not wipe the locally open chat windows.
    const localWindow = createProjectChatWindowInstance({
      instanceId: "project-chat-window-1",
      isClosed: false,
      isMinimized: false,
    });
    const currentState = buildProjectState(
      createProjectChatWindowingState({
        instancesById: {
          [localWindow.instanceId]: localWindow,
        },
        order: [localWindow.instanceId],
        nextInstanceNumber: 2,
      }),
    );
    const incomingState = buildProjectState();

    mergeProjectChatWindowingFromCurrentState(incomingState, currentState);

    expect(incomingState.projectChatWindowing.order).toEqual([
      localWindow.instanceId,
    ]);
    expect(
      incomingState.projectChatWindowing.instancesById[localWindow.instanceId],
    ).toEqual(localWindow);
    expect(incomingState.projectChatWindowing.nextInstanceNumber).toBe(2);
  });

  it("keeps the local version of matching windows when the backend snapshot is older", () => {
    // A stale backend payload must not reopen or reset an already-changed local window.
    const incomingWindow = createProjectChatWindowInstance({
      instanceId: "project-chat-window-1",
      isClosed: false,
      isMinimized: false,
      title: "Old title",
    });
    const currentWindow = createProjectChatWindowInstance({
      instanceId: "project-chat-window-1",
      isClosed: true,
      isMinimized: false,
      title: "New title",
    });
    const currentState = buildProjectState(
      createProjectChatWindowingState({
        instancesById: {
          [currentWindow.instanceId]: currentWindow,
        },
        order: [currentWindow.instanceId],
        nextInstanceNumber: 2,
      }),
    );
    const incomingState = buildProjectState(
      createProjectChatWindowingState({
        instancesById: {
          [incomingWindow.instanceId]: incomingWindow,
        },
        order: [incomingWindow.instanceId],
        nextInstanceNumber: 2,
      }),
    );

    mergeProjectChatWindowingFromCurrentState(incomingState, currentState);

    expect(
      incomingState.projectChatWindowing.instancesById[
        currentWindow.instanceId
      ],
    ).toEqual(currentWindow);
  });

  it("retains backend-only windows while preferring local ordering for shared ones", () => {
    // Merging should preserve unseen backend windows without letting them displace the local dock order.
    const currentWindow = createProjectChatWindowInstance({
      instanceId: "project-chat-window-2",
    });
    const incomingWindow = createProjectChatWindowInstance({
      instanceId: "project-chat-window-3",
    });
    const currentState = buildProjectState(
      createProjectChatWindowingState({
        instancesById: {
          [currentWindow.instanceId]: currentWindow,
        },
        order: [currentWindow.instanceId],
        nextInstanceNumber: 3,
      }),
    );
    const incomingState = buildProjectState(
      createProjectChatWindowingState({
        instancesById: {
          [incomingWindow.instanceId]: incomingWindow,
        },
        order: [incomingWindow.instanceId],
        nextInstanceNumber: 4,
      }),
    );

    mergeProjectChatWindowingFromCurrentState(incomingState, currentState);

    expect(incomingState.projectChatWindowing.order).toEqual([
      currentWindow.instanceId,
      incomingWindow.instanceId,
    ]);
    expect(
      incomingState.projectChatWindowing.instancesById[
        incomingWindow.instanceId
      ],
    ).toEqual(incomingWindow);
    expect(incomingState.projectChatWindowing.nextInstanceNumber).toBe(4);
  });
});
