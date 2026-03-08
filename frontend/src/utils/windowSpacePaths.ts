import type { WindowSpaceConfig } from "utils/generatedTypes";
import { PROJECT_WINDOW_SPACE_STANDALONE_ROUTE_SEGMENT } from "./constants";
import { sanitizeNameForSlug } from "./nameValidation";

type WindowSpacePathProjectState = {
  projectConfig: {
    windowSpaces?: Record<string, WindowSpaceConfig> | null;
  };
};

type WindowSpaceSlugIndex = Record<string, Array<string>>;

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

function getWindowSpaceSlugIndex(
  state: WindowSpacePathProjectState,
): WindowSpaceSlugIndex {
  const windowSpaces = state.projectConfig.windowSpaces ?? {};
  const slugToIds: WindowSpaceSlugIndex = {};
  for (const [windowSpaceId, windowSpace] of Object.entries(windowSpaces)) {
    const slug = sanitizeNameForSlug(windowSpace.name);
    if (!slugToIds[slug]) {
      slugToIds[slug] = [];
    }
    slugToIds[slug].push(windowSpaceId);
  }
  return slugToIds;
}

export function resolveStandaloneWindowSpaceSlug(
  state: WindowSpacePathProjectState,
  windowSpaceSlug: string,
): StandaloneWindowSpaceSlugResolution {
  const matchingIds = getWindowSpaceSlugIndex(state)[windowSpaceSlug] ?? [];
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
  const windowSpaces = state.projectConfig.windowSpaces ?? {};
  const windowSpace = windowSpaces[windowSpaceId];
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
  windowSpaceName: string,
): string {
  return `/${encodeURIComponent(projectConfigName)}/${PROJECT_WINDOW_SPACE_STANDALONE_ROUTE_SEGMENT}/${encodeURIComponent(
    sanitizeNameForSlug(windowSpaceName),
  )}`;
}
