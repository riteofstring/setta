import { type SectionType } from "utils/generatedTypes";
import { resolveStandaloneSectionSlug } from "utils/sectionSlugPaths";
import { resolveStandaloneWindowSpaceSlug } from "utils/windowSpacePaths";

export type StandaloneSurfaceTarget =
  | {
      kind: "project_chat";
    }
  | {
      kind: "project_chat_thread";
      chatId: string;
    }
  | {
      kind: "project_chat_thread_not_found";
    }
  | {
      kind: "section";
      sectionId: string;
      sectionName: string;
      sectionType: SectionType;
    }
  | {
      kind: "window_space";
      windowSpaceId: string;
      windowSpaceName: string;
    }
  | {
      kind: "section_not_found";
    }
  | {
      kind: "window_space_not_found";
    };

export type StandaloneSurfaceErrorCode = "chat_not_found" | "llm_disallowed";

export type StandaloneSurfaceRouteState = Parameters<
  typeof resolveStandaloneSectionSlug
>[0] &
  Parameters<typeof resolveStandaloneWindowSpaceSlug>[0];

export function normalizeStandaloneChatId(
  chatId: string | null | undefined,
): string | null {
  const normalizedChatId = chatId?.trim() ?? "";
  if (!normalizedChatId) {
    return null;
  }
  return normalizedChatId;
}

export function buildStandaloneProjectChatPath(
  projectConfigName: string,
  chatId: string | null,
): string {
  const basePath = `/${encodeURIComponent(projectConfigName)}/chat`;
  if (chatId === null) {
    return basePath;
  }
  return `${basePath}/${encodeURIComponent(chatId)}`;
}

export function resolveStandaloneSurfaceTarget(
  state: StandaloneSurfaceRouteState,
  sectionSlug: string | undefined,
  chatId: string | undefined,
  windowSpaceSlug: string | undefined,
): StandaloneSurfaceTarget {
  const normalizedChatId = normalizeStandaloneChatId(chatId);
  if (normalizedChatId) {
    return {
      kind: "project_chat_thread",
      chatId: normalizedChatId,
    };
  }
  if (chatId !== undefined) {
    return { kind: "project_chat_thread_not_found" };
  }
  if (windowSpaceSlug) {
    const resolution = resolveStandaloneWindowSpaceSlug(state, windowSpaceSlug);
    if (resolution.kind !== "found") {
      return { kind: "window_space_not_found" };
    }
    return {
      kind: "window_space",
      windowSpaceId: resolution.windowSpaceId,
      windowSpaceName: resolution.windowSpace.name,
    };
  }
  if (!sectionSlug) {
    return { kind: "project_chat" };
  }
  const resolution = resolveStandaloneSectionSlug(state, sectionSlug);
  if (resolution.kind !== "found") {
    return { kind: "section_not_found" };
  }
  return {
    kind: "section",
    sectionId: resolution.sectionId,
    sectionName: resolution.sectionName,
    sectionType: resolution.sectionType,
  };
}

export function resolveStandaloneDocumentTitle(
  projectConfigName: string | undefined,
  target: StandaloneSurfaceTarget,
  is404: boolean,
  projectChatThreadTitle: string | null,
): string {
  if (is404) {
    return "Not Found";
  }
  if (!projectConfigName) {
    return "setta.dev";
  }
  if (target.kind === "project_chat") {
    return `${projectConfigName} Chat`;
  }
  if (target.kind === "project_chat_thread") {
    if (projectChatThreadTitle) {
      return `${projectConfigName} · ${projectChatThreadTitle}`;
    }
    return `${projectConfigName} Chat`;
  }
  if (target.kind === "project_chat_thread_not_found") {
    return `${projectConfigName} · Thread Not Found`;
  }
  if (target.kind === "section") {
    return `${projectConfigName} · ${target.sectionName}`;
  }
  if (target.kind === "window_space") {
    return `${projectConfigName} · ${target.windowSpaceName}`;
  }
  if (target.kind === "window_space_not_found") {
    return `${projectConfigName} · Window Space Not Found`;
  }
  return `${projectConfigName} · Section Not Found`;
}

export function normalizeStandaloneSurfaceErrorCode(
  errorCode: string | null,
): StandaloneSurfaceErrorCode | null {
  if (errorCode === "chat_not_found" || errorCode === "llm_disallowed") {
    return errorCode;
  }
  return null;
}

export function buildStandaloneSurfaceOwnerKey(
  projectConfigId: string,
  target: StandaloneSurfaceTarget,
): string | null {
  if (target.kind === "project_chat") {
    return `${projectConfigId}:project-chat`;
  }
  if (target.kind === "project_chat_thread") {
    return `${projectConfigId}:project-chat:${target.chatId}`;
  }
  if (target.kind === "section") {
    return `${projectConfigId}:section:${target.sectionId}`;
  }
  if (target.kind === "window_space") {
    return `${projectConfigId}:window-space:${target.windowSpaceId}`;
  }
  return null;
}
