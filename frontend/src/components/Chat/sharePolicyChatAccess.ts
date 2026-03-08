import {
  isManagedChatSection,
  type ManagedChatSectionAuthorityState,
} from "state/actions/sectionInfos";
import {
  ChatWindowModeEnum,
  type ChatWindowMode,
  type WindowSpaceConfig,
} from "utils/generatedTypes";
import type { ChatSlashCommandDefinition } from "./chatComposerControls";

type ManagedChatShareAccess = {
  isDeploymentMode: boolean;
  allowLLM: boolean;
};

export function canUseManagedChatLLM({
  isDeploymentMode,
  allowLLM,
}: ManagedChatShareAccess): boolean {
  return !isDeploymentMode || allowLLM;
}

export function filterManagedChatThreadSlashCommands(
  slashCommands: ChatSlashCommandDefinition[],
  canUseManagedChat: boolean,
): ChatSlashCommandDefinition[] {
  if (canUseManagedChat) {
    return slashCommands;
  }
  return slashCommands.filter(
    (command) => command.action !== "new" && command.action !== "resume",
  );
}

type StandaloneWindowSpaceWindowConfig = NonNullable<
  WindowSpaceConfig["windowsById"][string]
>;

type ManagedChatSurfaceWindow = {
  mode: ChatWindowMode;
  sectionIdOrNull: string | null;
};

export type ManagedChatSurfaceAuthorityState = ManagedChatSectionAuthorityState;

export function standaloneSectionRequiresManagedChat(
  state: ManagedChatSurfaceAuthorityState,
  sectionId: string,
): boolean {
  return isManagedChatSection(state, sectionId);
}

export function windowSurfaceRequiresManagedChat(
  window: ManagedChatSurfaceWindow,
  state: ManagedChatSurfaceAuthorityState,
): boolean {
  if (window.mode === ChatWindowModeEnum.project_ai_mode) {
    return true;
  }
  if (window.mode === ChatWindowModeEnum.git_graph_mode) {
    return false;
  }
  const sectionId = window.sectionIdOrNull;
  if (sectionId === null) {
    return false;
  }
  return standaloneSectionRequiresManagedChat(state, sectionId);
}

export function standaloneWindowRequiresManagedChat(
  window: StandaloneWindowSpaceWindowConfig,
  state: ManagedChatSurfaceAuthorityState,
): boolean {
  return windowSurfaceRequiresManagedChat(window, state);
}

export function standaloneWindowSpaceHasAllowedWindows(
  windowSpace: Pick<WindowSpaceConfig, "windowsById">,
  state: ManagedChatSurfaceAuthorityState,
  canUseManagedChat: boolean,
): boolean {
  for (const window of Object.values(windowSpace.windowsById)) {
    if (
      canUseManagedChat ||
      !standaloneWindowRequiresManagedChat(window, state)
    ) {
      return true;
    }
  }
  return false;
}
