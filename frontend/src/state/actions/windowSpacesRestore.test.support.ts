import { useProjectState } from "state/definitions";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  createProjectChatWindowingState,
  createProjectConfig,
} from "utils/generatedTypes";

export function projectChatWindow(instanceId: string) {
  const instance =
    useProjectState.getState().projectChatWindowing.instancesById[instanceId];
  if (!instance) {
    throw new Error(`Expected project chat window ${instanceId}.`);
  }
  return instance;
}

export function installFocusedWindowRestoreState() {
  useProjectState.setState({
    projectConfig: createProjectConfig({
      id: "project-id",
      name: "demo",
      windowSpaces: {
        "space-1": {
          id: "space-1",
          name: "Focused Layout",
          sortIndex: 0,
          windowsById: {
            "project-chat-window-3": {
              surfaceKind: "project_chat",
              mode: ChatWindowModeEnum.project_ai_mode,
              title: "Saved Chat",
              chatId: "chat-restored",
              zIndex: 4,
              normalizedBounds: {
                x: 0.1,
                y: 0.15,
                width: 0.45,
                height: 0.5,
              },
            },
          },
          order: ["project-chat-window-3"],
        },
      },
    }),
    sections: {},
    projectChatWindowing: createProjectChatWindowingState({
      order: ["project-chat-window-1", "project-chat-window-2"],
      instancesById: {
        "project-chat-window-1": {
          instanceId: "project-chat-window-1",
          placement: ChatWindowPlacementEnum.floating,
          mode: ChatWindowModeEnum.project_ai_mode,
          title: "Live Chat",
          chatId: "chat-live",
          zIndex: 1,
          lastFocusedAt: 10,
          bounds: {
            x: 520,
            y: 160,
            width: 280,
            height: 220,
          },
        },
        "project-chat-window-2": {
          instanceId: "project-chat-window-2",
          placement: ChatWindowPlacementEnum.floating,
          mode: ChatWindowModeEnum.project_ai_mode,
          title: "Peer Chat",
          chatId: "chat-peer",
          zIndex: 2,
          lastFocusedAt: 20,
          bounds: {
            x: 120,
            y: 120,
            width: 280,
            height: 220,
          },
        },
      },
      nextInstanceNumber: 3,
    }),
  });
}
