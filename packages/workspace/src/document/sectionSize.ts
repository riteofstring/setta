import { getMetaControlDefaultSize } from "../controls/meta/metaControlTypes";
import {
  clampWorkspaceSectionSize,
  getWorkspaceSectionSizeBounds,
} from "../section/resize/sectionSizingBounds";
import { isGroupSection } from "./documentSelectors";
import {
  getRegisteredSectionKindOrThrow,
  type SectionKindDefinition,
} from "./sectionKindRegistry";
import type { SectionSize, WorkspaceSectionInput } from "./types";
import type { WorkspaceHost } from "../workspaceHost";

const DEFAULT_SECTION_SIZE: SectionSize = { width: "auto", height: "auto" };

function getSectionKindDefinition(
  host: WorkspaceHost,
  section: WorkspaceSectionInput,
): SectionKindDefinition | null {
  if (isGroupSection(section)) {
    return null;
  }
  return getRegisteredSectionKindOrThrow(host, section.kind);
}

function resolveSectionSizeDefault(
  section: WorkspaceSectionInput,
  definition: SectionKindDefinition | null,
): SectionSize {
  if (section.size) {
    return section.size;
  }
  if (definition?.presentation) {
    return getMetaControlDefaultSize(
      definition.presentation.resolveControlKind(section),
    );
  }
  return definition?.defaultSize ?? DEFAULT_SECTION_SIZE;
}

function getOrdinarySizeConstraints(definition: SectionKindDefinition | null) {
  if (definition === null) {
    return null;
  }
  if (definition.presentation !== undefined) {
    return null;
  }
  return definition.sizeConstraints ?? null;
}

export function resolveWorkspaceSectionSize(
  host: WorkspaceHost,
  section: WorkspaceSectionInput,
): SectionSize {
  const definition = getSectionKindDefinition(host, section);
  const constraints = getOrdinarySizeConstraints(definition);
  const size = resolveSectionSizeDefault(section, definition);
  if (!constraints) {
    return size;
  }
  return clampWorkspaceSectionSize(
    size,
    getWorkspaceSectionSizeBounds(constraints),
  );
}
