import {
  createWorkspaceSavedViewsState,
  type WorkspaceDocument,
  type WorkspaceDocumentInput,
  type WorkspaceSavedView,
  type WorkspaceSavedViewsState,
  type WorkspaceSection,
} from "@setta/workspace";

import type { ProjectDraftV1, ProjectV1 } from "../backend/generatedContract";
import {
  BENCH_CANDIDATE_SECTION_KIND,
  BENCH_CASE_SET_SECTION_KIND,
  BENCH_EVALUATOR_SECTION_KIND,
} from "./benchSectionKinds";
import { projectDraft } from "./benchContext";

export const BENCH_BUILD_VIEW_ID = "build";
export const BENCH_RUNS_VIEW_ID = "runs";
export const BENCH_COMPARE_VIEW_ID = "compare";

export type BenchViewId =
  | typeof BENCH_BUILD_VIEW_ID
  | typeof BENCH_RUNS_VIEW_ID
  | typeof BENCH_COMPARE_VIEW_ID;

const BENCH_VIEW_IDS = new Set<string>([
  BENCH_BUILD_VIEW_ID,
  BENCH_RUNS_VIEW_ID,
  BENCH_COMPARE_VIEW_ID,
]);

function projectSection(
  id: string,
  kind: string,
  name: string,
  project: ProjectV1,
  previous: WorkspaceSection | undefined,
): WorkspaceSection {
  const layout = project.presentation.sections[id];
  if (layout === undefined) {
    throw new Error(`Bench presentation is missing section ${id}.`);
  }
  return {
    children: [],
    data: { entityId: id },
    id,
    isHorizontalOrientation: false,
    isMinimized: previous?.isMinimized ?? false,
    kind,
    name,
    overflowMode: false,
    positionAndSizeLocked: false,
    size: { height: layout.height, width: layout.width },
    styleColor: previous?.styleColor ?? null,
    tagColor: previous?.tagColor ?? null,
  };
}

function baseWorkspaceDocument(
  project: ProjectV1,
  previous: WorkspaceDocument | undefined,
): WorkspaceDocumentInput {
  const sections: WorkspaceDocument["sections"] = {};
  sections[project.caseSet.id] = projectSection(
    project.caseSet.id,
    BENCH_CASE_SET_SECTION_KIND,
    project.caseSet.name,
    project,
    previous?.sections[project.caseSet.id],
  );
  for (const candidate of project.candidates) {
    sections[candidate.id] = projectSection(
      candidate.id,
      BENCH_CANDIDATE_SECTION_KIND,
      candidate.name,
      project,
      previous?.sections[candidate.id],
    );
  }
  if (project.evaluator !== null) {
    sections[project.evaluator.id] = projectSection(
      project.evaluator.id,
      BENCH_EVALUATOR_SECTION_KIND,
      project.evaluator.name,
      project,
      previous?.sections[project.evaluator.id],
    );
  }
  const topLevelSections = Object.fromEntries(
    Object.entries(project.presentation.sections).map(([id, layout]) => [
      id,
      {
        h: layout.height,
        w: layout.width,
        x: layout.x,
        y: layout.y,
        zIndex: layout.zIndex,
      },
    ]),
  );
  return {
    activeIds:
      previous?.activeIds.filter((sectionId) => sections[sectionId]) ?? [],
    savedViews: null,
    sections,
    topLevelSections,
    viewport: project.presentation.viewport,
  };
}

function fixedView(
  source: WorkspaceSavedView,
  id: BenchViewId,
  name: string,
  sortIndex: number,
  visible: boolean,
): WorkspaceSavedView {
  return {
    ...source,
    id,
    isTab: true,
    name,
    sectionVisibility: Object.fromEntries(
      Object.keys(source.sectionVisibility).map((sectionId) => [
        sectionId,
        visible,
      ]),
    ),
    sortIndex,
  };
}

function createFixedSavedViews(
  document: WorkspaceDocumentInput,
  previous: WorkspaceSavedViewsState | null | undefined,
): WorkspaceSavedViewsState {
  const initial = createWorkspaceSavedViewsState(document, {
    id: BENCH_BUILD_VIEW_ID,
    isTab: true,
    name: "Build",
  });
  const build = initial.views[BENCH_BUILD_VIEW_ID];
  if (build === undefined) {
    throw new Error("Bench Build view could not be created.");
  }
  const activeViewId =
    previous !== null &&
    previous !== undefined &&
    BENCH_VIEW_IDS.has(previous.activeViewId)
      ? previous.activeViewId
      : BENCH_BUILD_VIEW_ID;
  return {
    activeViewId,
    views: {
      [BENCH_BUILD_VIEW_ID]: fixedView(
        build,
        BENCH_BUILD_VIEW_ID,
        "Build",
        0,
        true,
      ),
      [BENCH_RUNS_VIEW_ID]: fixedView(
        build,
        BENCH_RUNS_VIEW_ID,
        "Runs",
        1,
        false,
      ),
      [BENCH_COMPARE_VIEW_ID]: fixedView(
        build,
        BENCH_COMPARE_VIEW_ID,
        "Compare",
        2,
        false,
      ),
    },
  };
}

export function projectWorkspaceDocument(
  project: ProjectV1,
  previous?: WorkspaceDocument,
): WorkspaceDocumentInput {
  const base = baseWorkspaceDocument(project, previous);
  const savedViews = createFixedSavedViews(base, previous?.savedViews);
  const active = savedViews.views[savedViews.activeViewId];
  if (active === undefined) {
    throw new Error("Bench active saved view is missing.");
  }
  return {
    ...base,
    activeIds:
      savedViews.activeViewId === BENCH_BUILD_VIEW_ID ? base.activeIds : [],
    savedViews,
    topLevelSections: active.topLevelSections,
    viewport: active.viewport,
  };
}

function resolvedLayoutDimension(
  value: number | null,
  sectionValue: number | "auto",
  fallback: number,
): number {
  if (typeof sectionValue === "number") return sectionValue;
  return value ?? fallback;
}

export function projectDraftFromWorkspace(
  project: ProjectV1,
  document: WorkspaceDocument,
): ProjectDraftV1 {
  const draft = projectDraft(project);
  const entityNames = new Map<string, string>();
  for (const [id, section] of Object.entries(document.sections)) {
    entityNames.set(id, section.name);
  }
  return {
    ...draft,
    candidates: project.candidates.map((candidate) => ({
      ...candidate,
      name: entityNames.get(candidate.id) ?? candidate.name,
    })),
    caseSet: {
      ...project.caseSet,
      name: entityNames.get(project.caseSet.id) ?? project.caseSet.name,
    },
    evaluator:
      project.evaluator === null
        ? null
        : {
            ...project.evaluator,
            name:
              entityNames.get(project.evaluator.id) ?? project.evaluator.name,
          },
    presentation: {
      sections: Object.fromEntries(
        Object.entries(project.presentation.sections).map(([id, current]) => {
          const layout = document.topLevelSections[id];
          const section = document.sections[id];
          if (layout === undefined || section === undefined) {
            throw new Error(`Workspace is missing Bench section ${id}.`);
          }
          return [
            id,
            {
              height: resolvedLayoutDimension(
                layout.h,
                section.size.height,
                current.height,
              ),
              width: resolvedLayoutDimension(
                layout.w,
                section.size.width,
                current.width,
              ),
              x: layout.x,
              y: layout.y,
              zIndex: layout.zIndex,
            },
          ];
        }),
      ),
      viewport: document.viewport ?? project.presentation.viewport,
    },
  };
}

export function projectDraftSignature(draft: ProjectDraftV1): string {
  return JSON.stringify(stableValue(draft));
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableValue(entry)]),
  );
}
