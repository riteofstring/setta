import type { ComponentType, ReactNode } from "react";
import { GROUP_SECTION_KIND } from "./documentSelectors";
import type { SectionSize, WorkspaceSection } from "./types";

// The registration half of the Phase 2 renderer seam: application-owned section kinds map to
// their renderer, header icon, and default size. This replaces the reference's per-type area
// switch (`SectionContainerCoreResizabe`), header icon record (`HeaderIcon`), and generated
// per-type size constructors (`createSectionSize` at each `create*SectionImpl`). Groups are the
// one package-owned kind and never appear in the registry.

export type SectionKindDefinition = {
  // Rendered as the section body inside the package-owned shell, chrome, and header. The
  // section carries the kind's opaque `data`; the package never interprets it.
  renderContent: (section: WorkspaceSection) => ReactNode;
  // Header icon component, rendered with the reference's icon treatment. Kinds without one
  // render the reference's `gg-menu` fallback glyph.
  icon?: ComponentType<{ className?: string }>;
  // Applied when a loaded section omits its size. Kinds without one load at the reference's
  // auto/auto default, exactly like `createSectionSize()` without options.
  defaultSize?: SectionSize;
};

let registeredSectionKinds: Record<string, SectionKindDefinition> = {};

// Replaces the registered kind set. Hosts register every kind once, before loading or
// rendering documents that use them.
export function registerSectionKinds(kinds: Record<string, SectionKindDefinition>): void {
  if (GROUP_SECTION_KIND in kinds) {
    throw new Error(
      `Section kind ${GROUP_SECTION_KIND} is package-owned and cannot be registered.`,
    );
  }
  registeredSectionKinds = kinds;
}

export function getRegisteredSectionKindOrThrow(kind: string): SectionKindDefinition {
  const definition = registeredSectionKinds[kind];
  if (!definition) {
    throw new Error(
      `Section kind ${kind} is not registered. Call registerSectionKinds with it before ` +
        `loading or rendering documents that use it.`,
    );
  }
  return definition;
}
