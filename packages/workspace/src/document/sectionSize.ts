import { getMetaControlDefaultSize } from "../controls/meta/metaControlTypes";
import { isGroupSection } from "./documentSelectors";
import { getRegisteredSectionKindOrThrow } from "./sectionKindRegistry";
import type { SectionSize, WorkspaceSectionInput } from "./types";

// The reference's `createSectionSize()` default: sections materialized without an explicit
// size are auto-sized in both dimensions.
const DEFAULT_SECTION_SIZE: SectionSize = { width: "auto", height: "auto" };

// Every non-group kind must be registered before its documents load. An omitted ordinary size
// resolves through its registered default; an omitted meta size resolves through the projected
// package control policy — the load-time equivalent of the reference's generated constructors.
// Creation resolves the same way, so a section's size has one owner whether it arrives through a
// loaded document or through a creation command that has not been placed on the canvas yet.
export function resolveWorkspaceSectionSize(
  section: WorkspaceSectionInput,
): SectionSize {
  if (section.size) {
    return section.size;
  }
  const definition = isGroupSection(section)
    ? null
    : getRegisteredSectionKindOrThrow(section.kind);
  const metaControlDefaultSize = definition?.presentation
    ? getMetaControlDefaultSize(
        definition.presentation.resolveControlKind(section),
      )
    : null;
  return (
    metaControlDefaultSize ?? definition?.defaultSize ?? DEFAULT_SECTION_SIZE
  );
}
