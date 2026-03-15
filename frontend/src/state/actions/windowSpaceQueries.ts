import { useShareSession, type ZustandProjectState } from "state/definitions";
import { type WindowSpaceConfig } from "utils/generatedTypes";
import { createRandomName } from "utils/idNameCreation";
import { sanitizeNameForSlug } from "utils/nameValidation";

export function sortWindowSpaces(
  windowSpaces: Array<WindowSpaceConfig>,
): Array<WindowSpaceConfig> {
  return [...windowSpaces].sort((a, b) => {
    if (a.sortIndex !== b.sortIndex) {
      return a.sortIndex - b.sortIndex;
    }
    const nameComparison = a.name.localeCompare(b.name, undefined, {
      sensitivity: "base",
    });
    if (nameComparison !== 0) {
      return nameComparison;
    }
    return a.id.localeCompare(b.id);
  });
}

export function getProjectWindowSpaces(
  projectConfig: Pick<ZustandProjectState["projectConfig"], "windowSpaces">,
): Record<string, WindowSpaceConfig> {
  return projectConfig.windowSpaces;
}

export function canMutateWindowSpaceLayout(): boolean {
  const shareSession = useShareSession.getState();
  return (
    !shareSession.isDeploymentMode ||
    shareSession.sharePolicy?.allowLayoutChanges !== false
  );
}

export function resolveNextWindowSpaceName(
  windowSpaces: Record<string, WindowSpaceConfig>,
): string {
  const existingSlugs = new Set(
    Object.values(windowSpaces).map((windowSpace) =>
      sanitizeNameForSlug(windowSpace.name),
    ),
  );
  let nextName = createRandomName();
  while (existingSlugs.has(sanitizeNameForSlug(nextName))) {
    nextName = createRandomName();
  }
  return nextName;
}
