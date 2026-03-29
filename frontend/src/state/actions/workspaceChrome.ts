import {
  createProjectChatWindowInstance,
  createProjectChatWindowingState,
} from "utils/generatedTypes";
import { resetOverviewPaneToDefaultLayout } from "./localStorage";
import { replaceProjectChatWindowingState } from "./projectChatWindowing";

const HIDDEN_PROJECT_CHAT_WINDOW_ID = "project-chat-window-1";

export function resetProjectWorkspaceChromeToDefaultLayout() {
  // Keep a single closed window record so the dock does not immediately
  // auto-create a fresh visible chat surface when layout normalization clears
  // the existing workspace state.
  replaceProjectChatWindowingState(
    createProjectChatWindowingState({
      order: [HIDDEN_PROJECT_CHAT_WINDOW_ID],
      nextInstanceNumber: 2,
      instancesById: {
        [HIDDEN_PROJECT_CHAT_WINDOW_ID]: createProjectChatWindowInstance({
          instanceId: HIDDEN_PROJECT_CHAT_WINDOW_ID,
          isClosed: true,
        }),
      },
    }),
  );
  resetOverviewPaneToDefaultLayout();
}
