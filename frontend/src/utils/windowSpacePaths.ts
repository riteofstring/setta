import type { WindowSpaceConfig } from "utils/generatedTypes";
import { PROJECT_WINDOW_SPACE_STANDALONE_ROUTE_SEGMENT } from "./constants";

type WindowSpacePathProjectState = {
  projectConfig: {
    windowSpaceSlugsById: Record<string, string>;
    windowSpaceIdsBySlug: Record<string, Array<string>>;
    windowSpaces: Record<string, WindowSpaceConfig>;
  };
};

type StandaloneWindowSpaceSlugResolution =
  | {
      kind: "found";
      windowSpaceId: string;
      windowSpace: WindowSpaceConfig;
    }
  | {
      kind: "not_found";
      windowSpaceSlug: string;
    }
  | {
      kind: "ambiguous";
      windowSpaceSlug: string;
      windowSpaceIds: Array<string>;
    };

export function resolveStandaloneWindowSpaceSlug(
  state: WindowSpacePathProjectState,
  windowSpaceSlug: string,
): StandaloneWindowSpaceSlugResolution {
  const matchingIds =
    state.projectConfig.windowSpaceIdsBySlug?.[windowSpaceSlug] ?? [];
  if (matchingIds.length === 0) {
    return {
      kind: "not_found",
      windowSpaceSlug,
    };
  }
  if (matchingIds.length > 1) {
    return {
      kind: "ambiguous",
      windowSpaceSlug,
      windowSpaceIds: [...matchingIds],
    };
  }
  const windowSpaceId = matchingIds[0];
  if (!windowSpaceId) {
    return {
      kind: "not_found",
      windowSpaceSlug,
    };
  }
  const windowSpace = state.projectConfig.windowSpaces[windowSpaceId];
  if (!windowSpace) {
    return {
      kind: "not_found",
      windowSpaceSlug,
    };
  }
  return {
    kind: "found",
    windowSpaceId,
    windowSpace,
  };
}

export function buildStandaloneWindowSpacePath(
  projectConfigName: string,
  projectConfig: Pick<
    WindowSpacePathProjectState["projectConfig"],
    "windowSpaceSlugsById"
  >,
  windowSpaceId: string,
): string {
  const windowSpaceSlug = projectConfig.windowSpaceSlugsById[windowSpaceId];
  if (!windowSpaceSlug) {
    throw new Error(
      `Missing backend-owned slug for window space ${windowSpaceId}.`,
    );
  }
  return `/${encodeURIComponent(projectConfigName)}/${PROJECT_WINDOW_SPACE_STANDALONE_ROUTE_SEGMENT}/${encodeURIComponent(
    windowSpaceSlug,
  )}`;
}
