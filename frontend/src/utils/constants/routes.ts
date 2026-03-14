import { C } from "../c";

export const INDEX_ROUTER_PATH = "/";
export const HOME_ROUTER_PATH = "/home";
export const PROJECT_CONFIG_ROUTER_PATH = "/:projectConfigName";

const PROJECT_CHAT_STANDALONE_ROUTE_SEGMENT = "chat";
const PROJECT_SECTION_STANDALONE_ROUTE_SEGMENT = "section";

export const PROJECT_WINDOW_SPACE_STANDALONE_ROUTE_SEGMENT = "windowspace";
export const PROJECT_CHAT_STANDALONE_ROUTER_PATH = `/:projectConfigName/${PROJECT_CHAT_STANDALONE_ROUTE_SEGMENT}`;
export const PROJECT_CHAT_THREAD_STANDALONE_ROUTER_PATH = `/:projectConfigName/${PROJECT_CHAT_STANDALONE_ROUTE_SEGMENT}/:chatId`;
export const SECTION_STANDALONE_ROUTER_PATH = `/:projectConfigName/${PROJECT_SECTION_STANDALONE_ROUTE_SEGMENT}/:sectionSlug`;
export const WINDOW_SPACE_STANDALONE_ROUTER_PATH = `/:projectConfigName/${PROJECT_WINDOW_SPACE_STANDALONE_ROUTE_SEGMENT}/:windowSpaceSlug`;
export const VIEW_MODE_ROUTER_PATH = "/:projectConfigName/view/:viewModeName";
export const WORKSPACE_LAUNCH_ROUTER_PATH = "/launching";
export const SETTINGS_ROUTER_PATH = `/${C.SETTINGS_PROJECT_NAME}`;

export function buildSharePath(
  targetProjectConfigName: string | null | undefined,
): string {
  if (targetProjectConfigName) {
    return `/${targetProjectConfigName}`;
  }
  return INDEX_ROUTER_PATH;
}

export function resolveHomePath(_pathname: string): string {
  return HOME_ROUTER_PATH;
}

export function pathRelativeToProject(projectConfigName: string): string {
  return `../${projectConfigName}`;
}

export const PAGE_LOAD_TYPES = {
  LOAD_PROJECT_CONFIG: "LOAD_PROJECT_CONFIG",
  CHANGE_PROJECT_CONFIG_NAME: "CHANGE_PROJECT_CONFIG_NAME",
} as const;
