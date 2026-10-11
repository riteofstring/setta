import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  registerSectionKinds,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
  SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER,
  type SectionKindDefinition,
  type WorkspaceHost,
  type WorkspaceSectionSearchableText,
} from "@riteofstring/setta";
import type { ReactNode } from "react";

import { GallerySection } from "../sections/ArtifactSection";
import { FacetSection } from "../sections/FacetSection";
import { HeatmapSection } from "../sections/HeatmapSection";
import { HistogramSection } from "../sections/HistogramSection";
import { MetricsSection } from "../sections/MetricsSection";
import { ObservationTableSection } from "../sections/ObservationTableSection";
import { ParallelSection } from "../sections/ParallelSection";
import { ScatterSection } from "../sections/ScatterSection";
import { TimelineSection } from "../sections/SeriesSection";
import { LENS_SECTION_KINDS } from "./lensProjection";
import { presentationSectionDataId } from "./presentationSection";

const searchableText: WorkspaceSectionSearchableText = (section) =>
  section.name;
const interactionBoundaryClassName = `${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} ${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER}`;
const sectionContentClassName = `lens-section-content ${interactionBoundaryClassName}`;
const sizeConstraints = {
  maxHeight: 3_000,
  maxWidth: 4_000,
  minHeight: 220,
  minWidth: 320,
};

function definition(
  render: (sectionId: string) => ReactNode,
  className = sectionContentClassName,
): SectionKindDefinition {
  return {
    assertValidData: (section) => {
      presentationSectionDataId(section.data);
    },
    contentClassName: className,
    defaultSize: { height: 360, width: 640 },
    getSectionSearchableText: searchableText,
    renderContent: (section) => render(presentationSectionDataId(section.data)),
    sizeConstraints,
  };
}

const chartClassName = `${sectionContentClassName} lens-chart-section-content`;

export function registerLensSectionKinds(host: WorkspaceHost): void {
  registerSectionKinds(host, {
    [LENS_SECTION_KINDS.facets]: definition((sectionId) => (
      <FacetSection sectionId={sectionId} />
    )),
    [LENS_SECTION_KINDS.gallery]: definition((sectionId) => (
      <GallerySection sectionId={sectionId} />
    )),
    [LENS_SECTION_KINDS.heatmap]: definition(
      (sectionId) => <HeatmapSection sectionId={sectionId} />,
      chartClassName,
    ),
    [LENS_SECTION_KINDS.histogram]: definition(
      (sectionId) => <HistogramSection sectionId={sectionId} />,
      chartClassName,
    ),
    [LENS_SECTION_KINDS.metrics]: definition((sectionId) => (
      <MetricsSection sectionId={sectionId} />
    )),
    [LENS_SECTION_KINDS.parallel]: definition(
      (sectionId) => <ParallelSection sectionId={sectionId} />,
      chartClassName,
    ),
    [LENS_SECTION_KINDS.scatter]: definition(
      (sectionId) => <ScatterSection sectionId={sectionId} />,
      chartClassName,
    ),
    [LENS_SECTION_KINDS.table]: definition(
      (sectionId) => <ObservationTableSection sectionId={sectionId} />,
      `${sectionContentClassName} lens-table-section-content`,
    ),
    [LENS_SECTION_KINDS.timeline]: definition(
      (sectionId) => <TimelineSection sectionId={sectionId} />,
      chartClassName,
    ),
  });
}
