import { describe, expect, it } from "vitest";

import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  createProjectChatWindowInstance,
  createProjectChatWindowingState,
} from "utils/generatedTypes";
import { prepareWorkspaceRestoredFloatingWindowing } from "./windowSpaceWorkspaceRestoreRemap";

describe("prepareWorkspaceRestoredFloatingWindowing", () => {
  it("remaps restored floating windows when their instance id collides with a live non-floating host", () => {
    // A saved floating window must not replace a bound canvas host that already uses the same raw instance id.
    const restoredFloatingWindowing = createProjectChatWindowingState({
      order: ["project-chat-window-1"],
      instancesById: {
        "project-chat-window-1": createProjectChatWindowInstance({
          instanceId: "project-chat-window-1",
          placement: ChatWindowPlacementEnum.floating,
          mode: ChatWindowModeEnum.project_ai_mode,
          chatId: "saved-thread",
          title: "Saved Chat",
        }),
      },
      nextInstanceNumber: 2,
    });
    const currentWindowing = createProjectChatWindowingState({
      order: ["project-chat-window-1"],
      instancesById: {
        "project-chat-window-1": createProjectChatWindowInstance({
          instanceId: "project-chat-window-1",
          placement: ChatWindowPlacementEnum.canvas_section,
          mode: ChatWindowModeEnum.section_mode,
          sectionIdOrNull: "section-1",
        }),
      },
      nextInstanceNumber: 2,
    });

    const prepared = prepareWorkspaceRestoredFloatingWindowing(
      restoredFloatingWindowing,
      currentWindowing,
    );

    expect(prepared.restoredWindowing.order).toEqual(["project-chat-window-2"]);
    expect(
      prepared.restoredWindowing.instancesById["project-chat-window-2"],
    ).toMatchObject({
      placement: ChatWindowPlacementEnum.floating,
      chatId: "saved-thread",
    });
    expect(prepared.remappedInstanceIdByOriginalId).toEqual({
      "project-chat-window-1": "project-chat-window-2",
    });
    expect(Array.from(prepared.supersededFloatingInstanceIds)).toEqual([]);
  });

  it("reuses the live floating instance id when the restored window owns the same chat thread", () => {
    // Matching floating project-chat windows should reuse the live id so downstream bindings remain stable.
    const restoredFloatingWindowing = createProjectChatWindowingState({
      order: ["saved-window"],
      instancesById: {
        "saved-window": createProjectChatWindowInstance({
          instanceId: "saved-window",
          placement: ChatWindowPlacementEnum.floating,
          mode: ChatWindowModeEnum.project_ai_mode,
          chatId: "chat-saved",
          title: "Saved Chat",
        }),
      },
      nextInstanceNumber: 2,
    });
    const currentWindowing = createProjectChatWindowingState({
      order: ["project-chat-window-7"],
      instancesById: {
        "project-chat-window-7": createProjectChatWindowInstance({
          instanceId: "project-chat-window-7",
          placement: ChatWindowPlacementEnum.floating,
          mode: ChatWindowModeEnum.project_ai_mode,
          chatId: "chat-saved",
          title: "Live Chat",
        }),
      },
      nextInstanceNumber: 8,
    });

    const prepared = prepareWorkspaceRestoredFloatingWindowing(
      restoredFloatingWindowing,
      currentWindowing,
    );

    expect(prepared.restoredWindowing.order).toEqual(["project-chat-window-7"]);
    expect(
      prepared.restoredWindowing.instancesById["project-chat-window-7"],
    ).toMatchObject({
      title: "Saved Chat",
      chatId: "chat-saved",
    });
    expect(prepared.remappedInstanceIdByOriginalId).toEqual({
      "saved-window": "project-chat-window-7",
    });
    expect(Array.from(prepared.supersededFloatingInstanceIds)).toEqual([
      "project-chat-window-7",
    ]);
  });

  it("drops restored section windows when a non-floating workspace host already owns that section", () => {
    // A saved floating section window should be discarded when the current workspace already has an authoritative bound host.
    const restoredFloatingWindowing = createProjectChatWindowingState({
      order: ["saved-section-window"],
      instancesById: {
        "saved-section-window": createProjectChatWindowInstance({
          instanceId: "saved-section-window",
          placement: ChatWindowPlacementEnum.floating,
          mode: ChatWindowModeEnum.section_mode,
          sectionIdOrNull: "section-1",
        }),
      },
      nextInstanceNumber: 2,
    });
    const currentWindowing = createProjectChatWindowingState({
      order: ["project-chat-window-1"],
      instancesById: {
        "project-chat-window-1": createProjectChatWindowInstance({
          instanceId: "project-chat-window-1",
          placement: ChatWindowPlacementEnum.bottom_docked,
          mode: ChatWindowModeEnum.section_mode,
          sectionIdOrNull: "section-1",
        }),
      },
      nextInstanceNumber: 2,
    });

    const prepared = prepareWorkspaceRestoredFloatingWindowing(
      restoredFloatingWindowing,
      currentWindowing,
    );

    expect(prepared.restoredWindowing.instancesById).toEqual({});
    expect(prepared.restoredWindowing.order).toEqual([]);
    expect(prepared.remappedInstanceIdByOriginalId).toEqual({});
  });
});
