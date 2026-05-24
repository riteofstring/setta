import type { CodeObjType, SectionType } from "utils/generatedTypes";
import {
  getGpuFlowParamCompatibilityMatrix,
  getGpuFlowSectionCompatibilityMatrix,
  type GpuFlowParamCompatibilityEntry,
  type GpuFlowSectionCompatibilityEntry,
} from "./gpuFlowCompatibilityMatrix";

export const GPU_FLOW_COMPATIBILITY_ZOOM_LEVELS = [0.5, 1, 2] as const;

type GpuFlowCompatibilityZoomLevel =
  (typeof GPU_FLOW_COMPATIBILITY_ZOOM_LEVELS)[number];

type GpuFlowSectionCompatibilityFixture = {
  readonly canvasInteractions: readonly string[];
  readonly display: string;
  readonly fixtureId: string;
  readonly nativeInteractions: readonly string[];
  readonly sectionType: SectionType;
  readonly zoomLevels: readonly GpuFlowCompatibilityZoomLevel[];
};

type GpuFlowParamCompatibilityFixture = {
  readonly codeObjType: CodeObjType;
  readonly fixtureId: string;
  readonly firstInteraction: string;
  readonly metaControlRendererFamily: string | null;
  readonly sectionParamUIRendererFamily: string | null;
  readonly surfaces: readonly string[];
};

type GpuFlowCompatibilityVerificationScenario = {
  readonly canvasInteractions: readonly string[];
  readonly nativeInteractions: readonly string[];
  readonly paramFixtureIds: readonly string[];
  readonly paramSurfaces: readonly string[];
  readonly scenarioId: string;
  readonly sectionFixtureIds: readonly string[];
  readonly zoomLevels: readonly GpuFlowCompatibilityZoomLevel[];
};

type GpuFlowCompatibilityFixturePlan = {
  readonly paramFixtures: readonly GpuFlowParamCompatibilityFixture[];
  readonly sectionFixtures: readonly GpuFlowSectionCompatibilityFixture[];
  readonly verificationScenarios: readonly GpuFlowCompatibilityVerificationScenario[];
};

export function getGpuFlowCompatibilityFixturePlan(): GpuFlowCompatibilityFixturePlan {
  const sectionFixtures =
    getGpuFlowSectionCompatibilityMatrix().map(createSectionFixture);
  const paramFixtures =
    getGpuFlowParamCompatibilityMatrix().map(createParamFixture);

  return {
    paramFixtures,
    sectionFixtures,
    verificationScenarios: createVerificationScenarios({
      paramFixtures,
      sectionFixtures,
    }),
  };
}

function createSectionFixture(
  entry: GpuFlowSectionCompatibilityEntry,
): GpuFlowSectionCompatibilityFixture {
  assertCompleteSectionEntry(entry);
  return {
    canvasInteractions: entry.canvasInteractions,
    display: entry.display,
    fixtureId: `section:${entry.sectionType}`,
    nativeInteractions: entry.nativeInteractions,
    sectionType: entry.sectionType,
    zoomLevels: GPU_FLOW_COMPATIBILITY_ZOOM_LEVELS,
  };
}

function createParamFixture(
  entry: GpuFlowParamCompatibilityEntry,
): GpuFlowParamCompatibilityFixture {
  assertCompleteParamEntry(entry);
  return {
    codeObjType: entry.codeObjType,
    fixtureId: `param:${entry.codeObjType}`,
    firstInteraction: entry.firstInteraction,
    metaControlRendererFamily: entry.metaControlRendererFamily,
    sectionParamUIRendererFamily: entry.sectionParamUIRendererFamily,
    surfaces: entry.surfaces,
  };
}

function createVerificationScenarios({
  paramFixtures,
  sectionFixtures,
}: {
  readonly paramFixtures: readonly GpuFlowParamCompatibilityFixture[];
  readonly sectionFixtures: readonly GpuFlowSectionCompatibilityFixture[];
}): readonly GpuFlowCompatibilityVerificationScenario[] {
  const sectionFixtureIds = sectionFixtures.map(({ fixtureId }) => fixtureId);
  const paramFixtureIds = paramFixtures.map(({ fixtureId }) => fixtureId);
  const canvasInteractions = uniqueSorted(
    sectionFixtures.flatMap(({ canvasInteractions }) => canvasInteractions),
  );
  const nativeInteractions = uniqueSorted(
    sectionFixtures.flatMap(({ nativeInteractions }) => nativeInteractions),
  );
  const paramSurfaces = uniqueSorted(
    paramFixtures.flatMap(({ surfaces }) => surfaces),
  );

  return [
    {
      canvasInteractions: [],
      nativeInteractions: [],
      paramFixtureIds: [],
      paramSurfaces: [],
      scenarioId: "sections:display-all-zooms",
      sectionFixtureIds,
      zoomLevels: GPU_FLOW_COMPATIBILITY_ZOOM_LEVELS,
    },
    {
      canvasInteractions,
      nativeInteractions: [],
      paramFixtureIds: [],
      paramSurfaces: [],
      scenarioId: "sections:canvas-interactions-all-zooms",
      sectionFixtureIds,
      zoomLevels: GPU_FLOW_COMPATIBILITY_ZOOM_LEVELS,
    },
    ...nativeInteractions.map((interaction) => ({
      canvasInteractions: [],
      nativeInteractions: [interaction],
      paramFixtureIds: [],
      paramSurfaces: [],
      scenarioId: `sections:native:${slugSegment(interaction)}`,
      sectionFixtureIds: sectionFixtures
        .filter((fixture) => fixture.nativeInteractions.includes(interaction))
        .map(({ fixtureId }) => fixtureId),
      zoomLevels: GPU_FLOW_COMPATIBILITY_ZOOM_LEVELS,
    })),
    {
      canvasInteractions: [],
      nativeInteractions: [],
      paramFixtureIds,
      paramSurfaces,
      scenarioId: "params:first-interactions",
      sectionFixtureIds: [],
      zoomLevels: [1],
    },
    ...paramSurfaces.map((surface) => ({
      canvasInteractions: [],
      nativeInteractions: [],
      paramFixtureIds: paramFixtures
        .filter((fixture) => fixture.surfaces.includes(surface))
        .map(({ fixtureId }) => fixtureId),
      paramSurfaces: [surface],
      scenarioId: `params:surface:${slugSegment(surface)}`,
      sectionFixtureIds: [],
      zoomLevels: [1],
    })),
  ];
}

function assertCompleteSectionEntry(
  entry: GpuFlowSectionCompatibilityEntry,
): asserts entry is GpuFlowSectionCompatibilityEntry & {
  readonly hasAreaRenderer: true;
  readonly hasCompatibilityExpectation: true;
} {
  if (
    !entry.hasAreaRenderer ||
    !entry.hasCompatibilityExpectation ||
    entry.display.length === 0 ||
    entry.nativeInteractions.length === 0 ||
    entry.canvasInteractions.length === 0
  ) {
    throw new Error(
      `Missing GPU flow section compatibility fixture input for ${entry.sectionType}.`,
    );
  }
}

function assertCompleteParamEntry(
  entry: GpuFlowParamCompatibilityEntry,
): asserts entry is GpuFlowParamCompatibilityEntry & {
  readonly hasCompatibilityExpectation: true;
} {
  if (
    !entry.hasCompatibilityExpectation ||
    entry.firstInteraction.length === 0 ||
    entry.surfaces.length === 0
  ) {
    throw new Error(
      `Missing GPU flow param compatibility fixture input for ${entry.codeObjType}.`,
    );
  }
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values)).sort();
}

function slugSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
