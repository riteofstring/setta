function normalizeProjectChatSurfaceSegment(
  segment: string,
  label: string,
): string {
  const normalized = segment.trim();
  if (!normalized) {
    throw new Error(`Project chat surface ${label} is required.`);
  }
  return normalized;
}

export function buildWorkspaceProjectChatWindowSurfaceId(
  instanceId: string,
): string {
  return `workspace:${normalizeProjectChatSurfaceSegment(instanceId, "instance id")}`;
}

export function buildWorkspaceSectionProjectChatSurfaceId(
  sectionId: string,
): string {
  return `workspace-section:${normalizeProjectChatSurfaceSegment(sectionId, "section id")}`;
}

export function buildStandaloneWindowSpaceProjectChatSurfaceId(
  windowSpaceId: string,
  instanceId: string,
): string {
  const normalizedWindowSpaceId = normalizeProjectChatSurfaceSegment(
    windowSpaceId,
    "window space id",
  );
  const normalizedInstanceId = normalizeProjectChatSurfaceSegment(
    instanceId,
    "instance id",
  );
  return `standalone-window-space:${normalizedWindowSpaceId}:${normalizedInstanceId}`;
}

export function buildStandalonePageProjectChatSurfaceId(): string {
  return "standalone-page:project-chat";
}

export function buildStandalonePageSectionProjectChatSurfaceId(
  sectionId: string,
): string {
  return `standalone-page:section:${normalizeProjectChatSurfaceSegment(sectionId, "section id")}`;
}
