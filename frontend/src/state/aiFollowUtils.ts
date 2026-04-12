import type { AIFollowMode } from "state/types/aiFollow";
import {
  SectionTypeEnum,
  type BaseSectionImplUnion,
  type ChatSectionImpl,
  type Variant,
} from "utils/generatedTypes";

type AIFollowIdsByProject = Record<
  string,
  Record<string, Record<string, Array<string>>>
>;
type SelectedIdsByProjectConfigId = Record<string, Array<string>>;

function getSectionIdsFromIdsByType(
  idsByType: Record<string, Array<string>> | undefined,
): Array<string> {
  return idsByType?.section ?? [];
}

export function getSectionIdsForProject(
  idsByProject: AIFollowIdsByProject,
  projectConfigId: string,
  allowedChatIds?: Set<string> | null,
): Array<string> {
  const projectEntries = idsByProject[projectConfigId];
  if (!projectEntries) {
    return [];
  }
  const sectionIds = new Set<string>();
  for (const [chatId, idsByType] of Object.entries(projectEntries)) {
    if (allowedChatIds && !allowedChatIds.has(chatId)) {
      continue;
    }
    for (const sectionId of getSectionIdsFromIdsByType(idsByType)) {
      sectionIds.add(sectionId);
    }
  }
  return Array.from(sectionIds);
}

type SectionVariantMap = Record<string, string>;
type SectionVariantEntry = Pick<Variant, "impl">;
type SectionImplEntry = Pick<BaseSectionImplUnion, "type"> &
  Partial<Pick<ChatSectionImpl, "chatId">>;
type SectionChatLookup = {
  sectionVariantMap: SectionVariantMap;
  sectionVariants: Record<string, SectionVariantEntry | undefined>;
  sectionImpls: Record<string, SectionImplEntry | undefined>;
};
type AllowedChatIdsArgs = [
  mode: AIFollowMode,
  selectedChatIdsByProjectConfigId: SelectedIdsByProjectConfigId,
  selectedSectionIdsByProjectConfigId: SelectedIdsByProjectConfigId,
  projectConfigId: string,
  sectionVariantMap: SectionVariantMap,
  sectionVariants: Record<string, SectionVariantEntry | undefined>,
  sectionImpls: Record<string, SectionImplEntry | undefined>,
];

function getSelectedIdsForProject(
  idsByProjectConfigId: SelectedIdsByProjectConfigId,
  projectConfigId: string,
): Array<string> {
  return idsByProjectConfigId[projectConfigId] ?? [];
}

function resolveChatIdForSection(
  sectionId: string,
  { sectionVariantMap, sectionVariants, sectionImpls }: SectionChatLookup,
): string | null {
  const variantId = sectionVariantMap[sectionId];
  if (!variantId) {
    return null;
  }
  const variant = sectionVariants[variantId];
  if (!variant) {
    return null;
  }
  const impl = sectionImpls[variant.impl];
  if (!impl || impl.type !== SectionTypeEnum.Chat) {
    return null;
  }
  const chatId = impl.chatId;
  if (typeof chatId === "string" && chatId.trim()) {
    return chatId;
  }
  return null;
}

export function getAllowedChatIdsForProject(
  ...[
    mode,
    selectedChatIdsByProjectConfigId,
    selectedSectionIdsByProjectConfigId,
    projectConfigId,
    sectionVariantMap,
    sectionVariants,
    sectionImpls,
  ]: AllowedChatIdsArgs
): Set<string> | null {
  if (mode === "off") {
    return new Set();
  }
  if (mode === "all") {
    return null;
  }
  const merged = new Set(
    getSelectedIdsForProject(selectedChatIdsByProjectConfigId, projectConfigId),
  );
  const selectedSectionIds = getSelectedIdsForProject(
    selectedSectionIdsByProjectConfigId,
    projectConfigId,
  );
  for (const sectionId of selectedSectionIds) {
    const chatId = resolveChatIdForSection(sectionId, {
      sectionVariantMap,
      sectionVariants,
      sectionImpls,
    });
    if (chatId) {
      merged.add(chatId);
    }
  }
  return merged;
}

export function hasSectionIdInProject(
  idsByProject: AIFollowIdsByProject,
  projectConfigId: string,
  sectionId: string,
  allowedChatIds?: Set<string> | null,
): boolean {
  const projectEntries = idsByProject[projectConfigId];
  if (!projectEntries) {
    return false;
  }
  for (const [chatId, idsByType] of Object.entries(projectEntries)) {
    if (allowedChatIds && !allowedChatIds.has(chatId)) {
      continue;
    }
    const sectionIds = getSectionIdsFromIdsByType(idsByType);
    if (sectionIds.includes(sectionId)) {
      return true;
    }
  }
  return false;
}
