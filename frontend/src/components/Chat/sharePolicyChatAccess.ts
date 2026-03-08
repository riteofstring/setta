import {
  ChatWindowModeEnum,
  SectionTypeEnum,
  WindowSpaceSurfaceKindEnum,
  type SectionType,
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

export function standaloneSectionRequiresManagedChat(
  sectionType: SectionType,
): boolean {
  return sectionType === SectionTypeEnum.Chat;
}

export function standaloneWindowRequiresManagedChat(
  window: StandaloneWindowSpaceWindowConfig,
  sectionTypesById: Record<string, SectionType>,
): boolean {
  if (window.surfaceKind === WindowSpaceSurfaceKindEnum.project_chat) {
    return window.mode !== ChatWindowModeEnum.git_graph_mode;
  }
  const sectionId = window.sectionIdOrNull;
  if (sectionId === null) {
    return false;
  }
  const sectionType = sectionTypesById[sectionId];
  if (sectionType === undefined) {
    return false;
  }
  return standaloneSectionRequiresManagedChat(sectionType);
}

export function standaloneWindowSpaceRequiresManagedChat(
  windowSpace: Pick<WindowSpaceConfig, "windowsById">,
  sectionTypesById: Record<string, SectionType>,
): boolean {
  for (const window of Object.values(windowSpace.windowsById)) {
    if (standaloneWindowRequiresManagedChat(window, sectionTypesById)) {
      return true;
    }
  }
  return false;
}
