import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  registerSectionKinds,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
  SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER,
  type WorkspaceHost,
  type WorkspaceSectionSearchableText,
} from "@setta/workspace";

import { ArtifactSection } from "../sections/ArtifactSection";
import { FacetSection } from "../sections/FacetSection";
import { ObservationTableSection } from "../sections/ObservationTableSection";
import { ParallelSection } from "../sections/ParallelSection";
import { ScatterSection } from "../sections/ScatterSection";
import { SeriesSection } from "../sections/SeriesSection";
import {
  LENS_ARTIFACT_SECTION_KIND,
  LENS_FACETS_SECTION_KIND,
  LENS_PARALLEL_SECTION_KIND,
  LENS_SCATTER_SECTION_KIND,
  LENS_SERIES_SECTION_KIND,
  LENS_TABLE_SECTION_KIND,
} from "./lensProjection";

const searchableText: WorkspaceSectionSearchableText = (section) =>
  section.name;
const interactionBoundaryClassName = `${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} ${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER}`;
const sectionContentClassName = `lens-section-content ${interactionBoundaryClassName}`;

export function registerLensSectionKinds(host: WorkspaceHost): void {
  registerSectionKinds(host, {
    [LENS_ARTIFACT_SECTION_KIND]: {
      contentClassName: sectionContentClassName,
      defaultSize: { height: 380, width: 600 },
      getSectionSearchableText: searchableText,
      renderContent: () => <ArtifactSection />,
      sizeConstraints: {
        maxHeight: 1_200,
        maxWidth: 1_600,
        minHeight: 300,
        minWidth: 360,
      },
    },
    [LENS_FACETS_SECTION_KIND]: {
      contentClassName: sectionContentClassName,
      defaultSize: { height: 190, width: 1_320 },
      getSectionSearchableText: searchableText,
      renderContent: () => <FacetSection />,
      sizeConstraints: {
        maxHeight: 720,
        maxWidth: 2_200,
        minHeight: 150,
        minWidth: 420,
      },
    },
    [LENS_PARALLEL_SECTION_KIND]: {
      contentClassName: `${sectionContentClassName} lens-chart-section-content`,
      defaultSize: { height: 410, width: 630 },
      getSectionSearchableText: searchableText,
      renderContent: () => <ParallelSection />,
      sizeConstraints: {
        maxHeight: 1_200,
        maxWidth: 1_800,
        minHeight: 300,
        minWidth: 420,
      },
    },
    [LENS_SCATTER_SECTION_KIND]: {
      contentClassName: `${sectionContentClassName} lens-chart-section-content`,
      defaultSize: { height: 410, width: 650 },
      getSectionSearchableText: searchableText,
      renderContent: () => <ScatterSection />,
      sizeConstraints: {
        maxHeight: 1_200,
        maxWidth: 1_800,
        minHeight: 300,
        minWidth: 420,
      },
    },
    [LENS_SERIES_SECTION_KIND]: {
      contentClassName: `${sectionContentClassName} lens-chart-section-content`,
      defaultSize: { height: 380, width: 680 },
      getSectionSearchableText: searchableText,
      renderContent: () => <SeriesSection />,
      sizeConstraints: {
        maxHeight: 1_200,
        maxWidth: 1_800,
        minHeight: 310,
        minWidth: 420,
      },
    },
    [LENS_TABLE_SECTION_KIND]: {
      contentClassName: `${sectionContentClassName} lens-table-section-content`,
      defaultSize: { height: 370, width: 1_320 },
      getSectionSearchableText: searchableText,
      renderContent: () => <ObservationTableSection />,
      sizeConstraints: {
        maxHeight: 1_400,
        maxWidth: 2_400,
        minHeight: 260,
        minWidth: 480,
      },
    },
  });
}
