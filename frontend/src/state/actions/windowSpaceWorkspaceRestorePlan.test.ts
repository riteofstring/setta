import { resetProjectStores } from "state/utils";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  createCore,
  createProjectChatWindowInstance,
  createProjectChatWindowingState,
  createProjectConfig,
  createWindowSpaceConfig,
} from "utils/generatedTypes";
import { afterEach, describe, expect, it } from "vitest";
import { buildWorkspaceRestorePlan } from "./windowSpaceWorkspaceRestorePlan";

describe("buildWorkspaceRestorePlan", () => {
  afterEach(() => {
    resetProjectStores();
  });

  it("remaps restored floating window ids when they collide with live non-floating workspace windows", () => {
    const plan = buildWorkspaceRestorePlan(
      createWindowSpaceConfig({
        id: "space-1",
        name: "Saved Layout",
        sortIndex: 0,
        windowsById: {
          "project-chat-window-1": {
            surfaceKind: "project_chat",
            sectionIdOrNull: null,
            mode: ChatWindowModeEnum.project_ai_mode,
            title: "Saved Chat",
            chatId: "saved-thread",
            zIndex: 5,
            normalizedBounds: {
              x: 0.1,
              y: 0.1,
              width: 0.4,
              height: 0.4,
            },
            embeddedGitPaneVisible: false,
          },
        },
        order: ["project-chat-window-1"],
      }),
      {
        sections: {
          "section-1": createCore({
            id: "section-1",
            name: "Section",
          }),
        },
        projectConfig: createProjectConfig({
          id: "project-id",
          name: "demo",
        }),
        projectChatWindowing: createProjectChatWindowingState({
          order: ["project-chat-window-1"],
          instancesById: {
            "project-chat-window-1": createProjectChatWindowInstance({
              instanceId: "project-chat-window-1",
              placement: ChatWindowPlacementEnum.canvas_section,
              mode: ChatWindowModeEnum.section_mode,
              sectionIdOrNull: "section-1",
            }),
          },
        }),
      },
    );

    expect(plan.nextWindowing.order).toEqual([
      "project-chat-window-1",
      "project-chat-window-2",
    ]);
    expect(
      plan.nextWindowing.instancesById["project-chat-window-1"],
    ).toMatchObject({
      placement: ChatWindowPlacementEnum.canvas_section,
      sectionIdOrNull: "section-1",
    });
    expect(
      plan.nextWindowing.instancesById["project-chat-window-2"],
    ).toMatchObject({
      placement: ChatWindowPlacementEnum.floating,
      mode: ChatWindowModeEnum.project_ai_mode,
      chatId: "saved-thread",
    });
    expect(plan.nextGitPaneVisibleInstanceIds).toEqual([]);
  });
});
