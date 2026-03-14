import {
  HOME_ROUTER_PATH,
  INDEX_ROUTER_PATH,
  PROJECT_CHAT_STANDALONE_ROUTER_PATH,
  PROJECT_CHAT_THREAD_STANDALONE_ROUTER_PATH,
  PROJECT_CONFIG_ROUTER_PATH,
  SECTION_STANDALONE_ROUTER_PATH,
  VIEW_MODE_ROUTER_PATH,
  WINDOW_SPACE_STANDALONE_ROUTER_PATH,
  WORKSPACE_LAUNCH_ROUTER_PATH,
} from "utils/constants/routes";

export const APP_ROUTE_IDS = {
  index: "index",
  home: "home",
  workspaceLaunch: "workspace-launch",
  projectChatThreadStandalone: "project-chat-thread-standalone",
  projectChatStandalone: "project-chat-standalone",
  windowSpaceStandalone: "window-space-standalone",
  viewMode: "view-mode",
  sectionStandalone: "section-standalone",
  project: "project",
  catchAll: "catch-all",
} as const;

export const APP_ROUTE_PATTERNS = [
  { id: APP_ROUTE_IDS.index, path: INDEX_ROUTER_PATH },
  { id: APP_ROUTE_IDS.home, path: HOME_ROUTER_PATH },
  { id: APP_ROUTE_IDS.workspaceLaunch, path: WORKSPACE_LAUNCH_ROUTER_PATH },
  {
    id: APP_ROUTE_IDS.projectChatThreadStandalone,
    path: PROJECT_CHAT_THREAD_STANDALONE_ROUTER_PATH,
  },
  {
    id: APP_ROUTE_IDS.projectChatStandalone,
    path: PROJECT_CHAT_STANDALONE_ROUTER_PATH,
  },
  {
    id: APP_ROUTE_IDS.windowSpaceStandalone,
    path: WINDOW_SPACE_STANDALONE_ROUTER_PATH,
  },
  { id: APP_ROUTE_IDS.viewMode, path: VIEW_MODE_ROUTER_PATH },
  {
    id: APP_ROUTE_IDS.sectionStandalone,
    path: SECTION_STANDALONE_ROUTER_PATH,
  },
  { id: APP_ROUTE_IDS.project, path: PROJECT_CONFIG_ROUTER_PATH },
  { id: APP_ROUTE_IDS.catchAll, path: "*" },
] as const;
