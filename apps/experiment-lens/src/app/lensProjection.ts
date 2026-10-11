import {
  parseWorkspaceSavedViewsState,
  type TopLevelSectionLayout,
  type WorkspaceDocumentInput,
  type WorkspaceSectionInput,
} from "@riteofstring/setta";

import type {
  LensSnapshot,
  PresentationPlacement,
  PresentationSection,
} from "../api/generatedContract";

export const LENS_COMPACT_VIEWPORT_QUERY = "(max-width: 720px)";

const KIND_BY_TYPE: Record<PresentationSection["type"], string> = {
  facets: "experiment-lens.facets",
  gallery: "experiment-lens.gallery",
  heatmap: "experiment-lens.heatmap",
  histogram: "experiment-lens.histogram",
  metrics: "experiment-lens.metrics",
  parallel: "experiment-lens.parallel",
  scatter: "experiment-lens.scatter",
  table: "experiment-lens.table",
  timeline: "experiment-lens.timeline",
};

export const LENS_SECTION_KINDS = KIND_BY_TYPE;

function layout(
  placement: PresentationPlacement,
  zIndex: number,
): TopLevelSectionLayout {
  return {
    h: placement.height,
    w: placement.width,
    x: placement.x,
    y: placement.y,
    zIndex,
  };
}

function firstPlacements(snapshot: LensSnapshot) {
  const placements = new Map<string, PresentationPlacement>();
  for (const view of snapshot.experiment.presentation.views) {
    for (const placement of view.placements) {
      if (!placements.has(placement.sectionId)) {
        placements.set(placement.sectionId, placement);
      }
    }
  }
  return placements;
}

function workspaceSection(
  definition: PresentationSection,
  placement: PresentationPlacement,
): WorkspaceSectionInput {
  return {
    children: [],
    data: { presentationSectionId: definition.id },
    id: definition.id,
    isHorizontalOrientation: false,
    isMinimized: false,
    kind: KIND_BY_TYPE[definition.type],
    name: definition.title,
    overflowMode: false,
    positionAndSizeLocked: false,
    size: { height: placement.height, width: placement.width },
    styleColor: null,
    tagColor: null,
  };
}

export function projectLensDocument(
  snapshot: LensSnapshot,
): WorkspaceDocumentInput {
  const presentation = snapshot.experiment.presentation;
  const placements = firstPlacements(snapshot);
  const sectionIds = presentation.sections.map((section) => section.id);
  const sections = Object.fromEntries(
    presentation.sections.map((definition) => {
      const placement = placements.get(definition.id);
      if (!placement) {
        throw new Error(
          `Presentation section ${definition.id} has no placement.`,
        );
      }
      return [definition.id, workspaceSection(definition, placement)];
    }),
  );
  const fallbackLayouts = Object.fromEntries(
    sectionIds.map((sectionId, index) => {
      const placement = placements.get(sectionId);
      if (!placement) {
        throw new Error(`Presentation section ${sectionId} has no placement.`);
      }
      return [sectionId, layout(placement, index)];
    }),
  );
  const views = Object.fromEntries(
    presentation.views.map((view, viewIndex) => {
      const visible = new Set(
        view.placements.map((placement) => placement.sectionId),
      );
      const viewLayouts = { ...fallbackLayouts };
      for (const [index, placement] of view.placements.entries()) {
        viewLayouts[placement.sectionId] = layout(placement, index);
      }
      return [
        view.id,
        {
          id: view.id,
          isTab: true,
          name: view.name,
          sectionVisibility: Object.fromEntries(
            sectionIds.map((sectionId) => [sectionId, visible.has(sectionId)]),
          ),
          sortIndex: viewIndex,
          topLevelSections: viewLayouts,
          viewport: view.viewport,
        },
      ];
    }),
  );
  const initialView = views[presentation.initialViewId];
  if (!initialView) {
    throw new Error(
      `Initial presentation view ${presentation.initialViewId} is unknown.`,
    );
  }
  return {
    activeIds: [],
    savedViews: parseWorkspaceSavedViewsState({
      activeViewId: presentation.initialViewId,
      views,
    }),
    sections,
    topLevelSections: initialView.topLevelSections,
    viewport: initialView.viewport,
  };
}

export function presentationSectionIds(
  snapshot: LensSnapshot,
  types: readonly PresentationSection["type"][],
): string[] {
  return snapshot.experiment.presentation.sections
    .filter((section) => types.includes(section.type))
    .map((section) => section.id);
}
