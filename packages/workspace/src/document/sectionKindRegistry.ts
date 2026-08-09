import type { ComponentType, ReactNode } from "react";
import type { MetaControlKind } from "../controls/meta/metaControlTypes";
import { GROUP_SECTION_KIND } from "./documentSelectors";
import type { SectionSize, WorkspaceSection } from "./types";

// The registration half of the renderer seam: application-owned section kinds map to their
// renderer and either ordinary header/default-size metadata or the direct-on-canvas presentation.
// This replaces the reference's per-type area switch (`SectionContainerCoreResizabe`), header icon
// record (`HeaderIcon`), and generated per-type constructors. Groups are the one package-owned kind
// and never appear in the registry.

export type MetaControlSectionPresentation = {
  type: "meta-control";
  // The host resolves its opaque section data into the package control vocabulary. Keeping
  // this projection on the registered kind lets the package apply control-specific sizing
  // without adding a typed control model to WorkspaceSection.data.
  resolveControlKind: (
    section: Pick<WorkspaceSection, "id" | "kind" | "name" | "data">,
  ) => MetaControlKind;
  // Frozen main's outboard adjustments button opens application-owned configuration. The
  // package owns its placement and interaction boundary; the host owns what editing means.
  onEdit: (section: WorkspaceSection) => void;
};

type SectionKindBaseDefinition = {
  // Rendered as the section body inside the package-owned shell, chrome, and header. The
  // section carries the kind's opaque `data`; the package never interprets it. Ordinary
  // registered content is placed in the package-owned body slot, so renderers never need a
  // private section-grid class.
  renderContent: (section: WorkspaceSection) => ReactNode;
  // Header icon component, rendered with the reference's icon treatment. Kinds without one
  // render the reference's `gg-menu` fallback glyph.
  icon?: ComponentType<{ className?: string }>;
};

export type SectionKindDefinition = SectionKindBaseDefinition &
  (
    | {
        // Applied when an ordinary loaded section omits its size. Kinds without one load at the
        // reference's auto/auto default, exactly like `createSectionSize()` without options.
        defaultSize?: SectionSize;
        // Appended to the package-owned body-slot wrapper. This is for host presentation such as
        // padding or flex layout; the package continues to own the grid placement itself.
        contentClassName?: string;
        presentation?: undefined;
      }
    | {
        // Direct-on-canvas kinds opt into package-owned chrome and per-control default/minimum
        // geometry; a competing registered default would make that contract ambiguous.
        defaultSize?: never;
        contentClassName?: never;
        presentation: MetaControlSectionPresentation;
      }
  );

let registeredSectionKinds: Record<string, SectionKindDefinition> = {};

// Replaces the registered kind set. Hosts register every kind once, before loading or
// rendering documents that use them.
export function registerSectionKinds(kinds: Record<string, SectionKindDefinition>): void {
  if (GROUP_SECTION_KIND in kinds) {
    throw new Error(
      `Section kind ${GROUP_SECTION_KIND} is package-owned and cannot be registered.`,
    );
  }
  for (const [kind, definition] of Object.entries(kinds)) {
    if (definition.presentation && definition.defaultSize !== undefined) {
      throw new Error(
        `Meta-control section kind ${kind} cannot register a defaultSize; ` +
          "the package owns control-specific default geometry.",
      );
    }
    if (definition.presentation && definition.contentClassName !== undefined) {
      throw new Error(
        `Meta-control section kind ${kind} cannot register a contentClassName; ` +
          "the package owns its full-area control placement.",
      );
    }
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

export function getMetaControlPresentation(
  section: WorkspaceSection,
): MetaControlSectionPresentation | null {
  const presentation = getRegisteredSectionKindOrThrow(section.kind).presentation;
  return presentation?.type === "meta-control" ? presentation : null;
}
