import {
  parseWorkspaceSavedViewsState,
  type TopLevelSectionLayout,
  type WorkspaceDocumentInput,
  type WorkspaceSectionInput,
} from "@setta/workspace";

import type { LensSnapshot } from "../backend/generatedContract";

export const LENS_FACETS_SECTION_KIND = "experiment-lens.facets";
export const LENS_SCATTER_SECTION_KIND = "experiment-lens.scatter";
export const LENS_PARALLEL_SECTION_KIND = "experiment-lens.parallel";
export const LENS_TABLE_SECTION_KIND = "experiment-lens.table";
export const LENS_SERIES_SECTION_KIND = "experiment-lens.series";
export const LENS_ARTIFACT_SECTION_KIND = "experiment-lens.artifact";

const LENS_FACETS_SECTION_ID = "lens:facets";
const LENS_SCATTER_SECTION_ID = "lens:scatter";
const LENS_PARALLEL_SECTION_ID = "lens:parallel";
export const LENS_TABLE_SECTION_ID = "lens:table";
export const LENS_SERIES_SECTION_ID = "lens:series";
export const LENS_ARTIFACT_SECTION_ID = "lens:artifact";
export const LENS_COMPACT_VIEWPORT_QUERY = "(max-width: 720px)";

const SECTION_IDS = [
  LENS_FACETS_SECTION_ID,
  LENS_SCATTER_SECTION_ID,
  LENS_PARALLEL_SECTION_ID,
  LENS_TABLE_SECTION_ID,
  LENS_SERIES_SECTION_ID,
  LENS_ARTIFACT_SECTION_ID,
] as const;

function section(
  id: string,
  kind: string,
  name: string,
  size: { height: number; width: number },
  tagColor: string,
): WorkspaceSectionInput {
  return {
    children: [],
    data: { viewId: id },
    id,
    isHorizontalOrientation: false,
    isMinimized: false,
    kind,
    name,
    overflowMode: false,
    positionAndSizeLocked: false,
    size,
    styleColor: null,
    tagColor,
  };
}

function layout(
  x: number,
  y: number,
  width: number,
  height: number,
  zIndex: number,
): TopLevelSectionLayout {
  return { h: height, w: width, x, y, zIndex };
}

function visibility(
  present: readonly string[],
  visible: ReadonlySet<string>,
): Record<string, boolean> {
  return Object.fromEntries(present.map((id) => [id, visible.has(id)]));
}

function relatedArtifactKinds(snapshot: LensSnapshot): {
  artifact: boolean;
  series: boolean;
} {
  const related = new Set(
    snapshot.experiment.relations.map((relation) => relation.artifactId),
  );
  let artifact = false;
  let series = false;
  for (const reference of snapshot.experiment.artifacts) {
    if (!related.has(reference.id)) {
      continue;
    }
    if (reference.mediaType === "application/vnd.setta.series+json") {
      series = true;
    } else {
      artifact = true;
    }
  }
  return {
    artifact,
    series,
  };
}

function atlasLayoutFor(
  present: ReadonlySet<string>,
): Record<string, TopLevelSectionLayout> {
  const result: Record<string, TopLevelSectionLayout> = {};
  let y = 64;
  let zIndex = 0;
  if (present.has(LENS_FACETS_SECTION_ID)) {
    result[LENS_FACETS_SECTION_ID] = layout(64, y, 1_320, 190, zIndex++);
    y += 230;
  }
  const charts = [LENS_SCATTER_SECTION_ID, LENS_PARALLEL_SECTION_ID].filter(
    (id) => present.has(id),
  );
  if (charts.length === 1 && charts[0]) {
    result[charts[0]] = layout(64, y, 1_320, 410, zIndex++);
    y += 450;
  } else if (charts.length === 2) {
    result[LENS_SCATTER_SECTION_ID] = layout(64, y, 650, 410, zIndex++);
    result[LENS_PARALLEL_SECTION_ID] = layout(754, y, 630, 410, zIndex++);
    y += 450;
  }
  result[LENS_TABLE_SECTION_ID] = layout(64, y, 1_320, 370, zIndex++);
  y += 410;
  const details = [LENS_SERIES_SECTION_ID, LENS_ARTIFACT_SECTION_ID].filter(
    (id) => present.has(id),
  );
  if (details.length === 1 && details[0]) {
    result[details[0]] = layout(64, y, 1_320, 380, zIndex);
  } else if (details.length === 2) {
    result[LENS_SERIES_SECTION_ID] = layout(64, y, 680, 380, zIndex++);
    result[LENS_ARTIFACT_SECTION_ID] = layout(784, y, 600, 380, zIndex);
  }
  return result;
}

function inspectLayoutFor(
  present: ReadonlySet<string>,
  atlas: Record<string, TopLevelSectionLayout>,
): Record<string, TopLevelSectionLayout> {
  const result = { ...atlas };
  result[LENS_TABLE_SECTION_ID] = layout(64, 64, 1_320, 340, 0);
  const details = [LENS_SERIES_SECTION_ID, LENS_ARTIFACT_SECTION_ID].filter(
    (id) => present.has(id),
  );
  if (details.length === 1 && details[0]) {
    result[details[0]] = layout(64, 444, 1_320, 380, 1);
  } else if (details.length === 2) {
    result[LENS_SERIES_SECTION_ID] = layout(64, 444, 680, 380, 1);
    result[LENS_ARTIFACT_SECTION_ID] = layout(784, 444, 600, 380, 2);
  }
  return result;
}

function projectLensSections(snapshot: LensSnapshot) {
  const numericFactors = snapshot.experiment.fields.filter(
    (field) => field.role === "factor" && field.valueType === "number",
  );
  const numericMetrics = snapshot.experiment.fields.filter(
    (field) => field.role === "metric" && field.valueType === "number",
  );
  const factors = snapshot.experiment.fields.filter(
    (field) => field.role === "factor",
  );
  const artifactKinds = relatedArtifactKinds(snapshot);
  const sections: WorkspaceDocumentInput["sections"] = {};
  if (factors.length > 0) {
    sections[LENS_FACETS_SECTION_ID] = section(
      LENS_FACETS_SECTION_ID,
      LENS_FACETS_SECTION_KIND,
      "Cohort",
      { height: 190, width: 1_320 },
      "#5d7cff",
    );
  }
  if (numericFactors.length > 0 && numericMetrics.length > 0) {
    sections[LENS_SCATTER_SECTION_ID] = section(
      LENS_SCATTER_SECTION_ID,
      LENS_SCATTER_SECTION_KIND,
      "Population",
      { height: 410, width: 650 },
      "#5d7cff",
    );
  }
  if (numericFactors.length + numericMetrics.length >= 2) {
    sections[LENS_PARALLEL_SECTION_ID] = section(
      LENS_PARALLEL_SECTION_ID,
      LENS_PARALLEL_SECTION_KIND,
      "Relationships",
      { height: 410, width: 630 },
      "#51d6c7",
    );
  }
  sections[LENS_TABLE_SECTION_ID] = section(
    LENS_TABLE_SECTION_ID,
    LENS_TABLE_SECTION_KIND,
    "Observations",
    { height: 370, width: 1_320 },
    "#6680ad",
  );
  if (artifactKinds.series) {
    sections[LENS_SERIES_SECTION_ID] = section(
      LENS_SERIES_SECTION_ID,
      LENS_SERIES_SECTION_KIND,
      "Recorded series",
      { height: 380, width: 680 },
      "#4ade80",
    );
  }
  if (artifactKinds.artifact) {
    sections[LENS_ARTIFACT_SECTION_ID] = section(
      LENS_ARTIFACT_SECTION_ID,
      LENS_ARTIFACT_SECTION_KIND,
      "Artifact",
      { height: 380, width: 600 },
      "#f8b551",
    );
  }
  return { artifactKinds, sections };
}

export function projectLensDocument(
  snapshot: LensSnapshot,
  { compact = false }: { compact?: boolean } = {},
): WorkspaceDocumentInput {
  const { artifactKinds, sections } = projectLensSections(snapshot);
  const present = SECTION_IDS.filter((id) => sections[id] !== undefined);
  const presentSet = new Set<string>(present);
  const atlasLayouts = atlasLayoutFor(presentSet);
  const inspectLayouts = inspectLayoutFor(presentSet, atlasLayouts);
  const atlasVisible = new Set([
    LENS_FACETS_SECTION_ID,
    LENS_SCATTER_SECTION_ID,
    LENS_PARALLEL_SECTION_ID,
    LENS_TABLE_SECTION_ID,
  ]);
  const inspectVisible = new Set([
    LENS_TABLE_SECTION_ID,
    LENS_SERIES_SECTION_ID,
    LENS_ARTIFACT_SECTION_ID,
  ]);
  const filteredAtlasLayouts = atlasLayouts;
  const filteredInspectLayouts = inspectLayouts;
  const viewport = compact
    ? { x: 40, y: 12, zoom: 0.62 }
    : { x: 300, y: 12, zoom: 0.78 };
  const views = {
    atlas: {
      id: "atlas",
      isTab: true,
      name: "Atlas",
      sectionVisibility: visibility(present, atlasVisible),
      sortIndex: 0,
      topLevelSections: filteredAtlasLayouts,
      viewport,
    },
    ...(artifactKinds.series || artifactKinds.artifact
      ? {
          inspect: {
            id: "inspect",
            isTab: true,
            name: "Inspect",
            sectionVisibility: visibility(present, inspectVisible),
            sortIndex: 1,
            topLevelSections: filteredInspectLayouts,
            viewport: { ...viewport, y: 18 },
          },
        }
      : {}),
  };
  return {
    activeIds: [],
    savedViews: parseWorkspaceSavedViewsState({
      activeViewId: "atlas",
      views,
    }),
    sections,
    topLevelSections: filteredAtlasLayouts,
    viewport,
  };
}
