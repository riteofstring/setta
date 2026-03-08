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

function normalizeProjectConfigId(projectConfigId: string): string {
  return normalizeProjectChatSurfaceSegment(
    projectConfigId,
    "project config id",
  );
}

export function buildOverviewProjectChatSurfaceId(
  projectConfigId: string,
): string {
  return `overview:${normalizeProjectConfigId(projectConfigId)}:project-chat`;
}

export function buildWorkspaceProjectChatWindowSurfaceId(
  projectConfigId: string,
  instanceId: string,
): string {
  return `workspace:${normalizeProjectConfigId(projectConfigId)}:${normalizeProjectChatSurfaceSegment(instanceId, "instance id")}`;
}

export function buildWorkspaceSectionProjectChatSurfaceId(
  projectConfigId: string,
  sectionId: string,
): string {
  return `workspace-section:${normalizeProjectConfigId(projectConfigId)}:${normalizeProjectChatSurfaceSegment(sectionId, "section id")}`;
}

export function buildStandaloneWindowSpaceProjectChatSurfaceId(
  projectConfigId: string,
  windowSpaceId: string,
  instanceId: string,
): string {
  const normalizedProjectConfigId = normalizeProjectConfigId(projectConfigId);
  const normalizedWindowSpaceId = normalizeProjectChatSurfaceSegment(
    windowSpaceId,
    "window space id",
  );
  const normalizedInstanceId = normalizeProjectChatSurfaceSegment(
    instanceId,
    "instance id",
  );
  return `standalone-window-space:${normalizedProjectConfigId}:${normalizedWindowSpaceId}:${normalizedInstanceId}`;
}

export function buildStandalonePageProjectChatSurfaceId(
  projectConfigId: string,
): string {
  return `standalone-page:${normalizeProjectConfigId(projectConfigId)}:project-chat`;
}

export function buildStandalonePageSectionProjectChatSurfaceId(
  projectConfigId: string,
  sectionId: string,
): string {
  return `standalone-page:${normalizeProjectConfigId(projectConfigId)}:section:${normalizeProjectChatSurfaceSegment(sectionId, "section id")}`;
}
