import type { GpuRetainedContentScrollOffsetMap } from "gpuFlow/retainedContentScroll";
import type { GpuFlowScene } from "gpuFlow/scene";
import type { GpuSectionSceneScrollOffsetMap } from "gpuFlow/sceneScroll";
import type { ZustandProjectState } from "state/definitions";
import type { ProjectGpuFlowSceneOptions } from "./projectGpuFlowSceneFactory";
import type {
  ProjectGpuActiveParamCanvasPopup,
  ProjectGpuActiveParamDomIsland,
  ProjectGpuRetainedParamTarget,
} from "./projectGpuParamContentAdapter";
import type { ProjectGpuRetainedParamDragPreview } from "./projectGpuParamDragAdapter";
import type { ProjectGpuRetainedPasswordRevealStateMap } from "./projectGpuRetainedParamPasswordRevealState";
import type { ProjectGpuSceneResizePolicyContext } from "./projectGpuSceneResizePolicy";

type OptionalParamCanvasPopup =
  | ProjectGpuActiveParamCanvasPopup
  | null
  | undefined;
type OptionalParamDomIsland = ProjectGpuActiveParamDomIsland | null | undefined;
type OptionalParamDragPreview =
  | ProjectGpuRetainedParamDragPreview
  | null
  | undefined;
type OptionalParamTarget = ProjectGpuRetainedParamTarget | null | undefined;

type ProjectGpuFlowSceneCacheKey = {
  readonly activeParamCanvasControlSignature: string;
  readonly activeParamCanvasPopupSignature: string;
  readonly activeParamDomIslandSignature: string;
  readonly contentScrollOffsetsSignature: string;
  readonly darkMode: boolean;
  readonly hoveredParamTargetSignature: string;
  readonly retainedParamDragPreviewSignature: string;
  readonly canEditParams: boolean;
  readonly canEditStructure: boolean;
  readonly isDeploymentMode: boolean;
  readonly passwordRevealStatesSignature: string;
  readonly projectSearchFocused:
    | NonNullable<ProjectGpuFlowSceneOptions["projectSearch"]>["focused"]
    | undefined;
  readonly projectSearchLookup:
    | NonNullable<ProjectGpuFlowSceneOptions["projectSearch"]>["lookup"]
    | undefined;
  readonly activeViewModeId: ZustandProjectState["projectConfig"]["activeViewModeId"];
  readonly activeViewModeTopLevelSections:
    | ZustandProjectState["projectConfig"]["topLevelSections"]
    | undefined;
  readonly activeViewModeVisibilityBySectionId:
    | ZustandProjectState["projectConfig"]["viewModes"][string]["visibilityBySectionId"]
    | undefined;
  readonly isEditingViewMode: ZustandProjectState["projectConfig"]["isEditingViewMode"];
  readonly projectTopLevelSections: ZustandProjectState["projectConfig"]["topLevelSections"];
  readonly resizeEventBySectionId:
    | ProjectGpuSceneResizePolicyContext["resizeEventBySectionId"]
    | undefined;
  readonly revision: number;
  readonly sectionImpls: ZustandProjectState["sectionImpls"];
  readonly sectionVariants: ZustandProjectState["sectionVariants"];
  readonly sections: ZustandProjectState["sections"];
  readonly scrollOffsetsSignature: string;
  readonly sizingPolicy:
    | ProjectGpuSceneResizePolicyContext["sizingPolicy"]
    | undefined;
  readonly typeErrors: ProjectGpuFlowSceneOptions["typeErrors"];
};

type ProjectGpuFlowSceneCache = {
  readonly key: ProjectGpuFlowSceneCacheKey;
  readonly scene: GpuFlowScene;
};

const DEFAULT_PROJECT_GPU_FLOW_SCENE_CACHE_POLICY = {
  canEditParams: true,
  canEditStructure: true,
  isDeploymentMode: false,
} as const;
const PROJECT_GPU_FLOW_SCENE_CACHE_KEY_FIELDS = [
  "activeParamCanvasControlSignature",
  "activeParamCanvasPopupSignature",
  "activeParamDomIslandSignature",
  "contentScrollOffsetsSignature",
  "darkMode",
  "hoveredParamTargetSignature",
  "retainedParamDragPreviewSignature",
  "canEditParams",
  "canEditStructure",
  "isDeploymentMode",
  "passwordRevealStatesSignature",
  "projectSearchFocused",
  "projectSearchLookup",
  "activeViewModeId",
  "activeViewModeTopLevelSections",
  "activeViewModeVisibilityBySectionId",
  "isEditingViewMode",
  "projectTopLevelSections",
  "resizeEventBySectionId",
  "revision",
  "sectionImpls",
  "sectionVariants",
  "sections",
  "scrollOffsetsSignature",
  "sizingPolicy",
  "typeErrors",
] as const satisfies readonly (keyof ProjectGpuFlowSceneCacheKey)[];
const MAX_PROJECT_GPU_FLOW_SCENE_CACHE_ENTRIES = 8;
const MAX_PROJECT_GPU_FLOW_PREWARM_KEYS = 16;
const MAX_PROJECT_GPU_FLOW_PREWARM_VIEW_MODES = 8;

let projectGpuFlowSceneCacheEntries: readonly ProjectGpuFlowSceneCache[] = [];
let projectGpuFlowPrewarmedKeys: readonly string[] = [];

export function getCachedProjectGpuFlowScene(
  cacheKey: ProjectGpuFlowSceneCacheKey,
): GpuFlowScene | null {
  const entryIndex = projectGpuFlowSceneCacheEntries.findIndex((entry) =>
    isProjectGpuFlowSceneCacheHit(entry.key, cacheKey),
  );
  if (entryIndex === -1) {
    return null;
  }
  const entry = projectGpuFlowSceneCacheEntries[entryIndex];
  if (!entry) {
    return null;
  }
  projectGpuFlowSceneCacheEntries = [
    entry,
    ...projectGpuFlowSceneCacheEntries.filter(
      (_candidate, index) => index !== entryIndex,
    ),
  ];
  return entry.scene;
}

export function cacheProjectGpuFlowScene(
  entry: ProjectGpuFlowSceneCache,
): void {
  projectGpuFlowSceneCacheEntries = [
    entry,
    ...projectGpuFlowSceneCacheEntries.filter(
      (candidate) => !isProjectGpuFlowSceneCacheHit(candidate.key, entry.key),
    ),
  ].slice(0, MAX_PROJECT_GPU_FLOW_SCENE_CACHE_ENTRIES);
}

export function prewarmProjectGpuFlowSceneCache(
  projectState: ZustandProjectState,
  options: ProjectGpuFlowSceneOptions,
  resolveScene: (
    projectState: ZustandProjectState,
    options: ProjectGpuFlowSceneOptions,
  ) => GpuFlowScene,
): void {
  const activeViewModeId = projectState.projectConfig.activeViewModeId;
  const inactiveViewModes = Object.values(projectState.projectConfig.viewModes)
    .filter((mode) => mode.id !== activeViewModeId)
    .sort(
      (left, right) =>
        (left.sortIndex ?? Number.MAX_SAFE_INTEGER) -
        (right.sortIndex ?? Number.MAX_SAFE_INTEGER),
    )
    .slice(0, MAX_PROJECT_GPU_FLOW_PREWARM_VIEW_MODES);
  for (const viewMode of inactiveViewModes) {
    resolveScene(
      createProjectStateForGpuFlowViewMode(projectState, viewMode.id),
      options,
    );
  }
}

export function getProjectGpuFlowPrewarmViewModeIds(
  projectState: ZustandProjectState,
): readonly string[] {
  const activeViewModeId = projectState.projectConfig.activeViewModeId;
  return Object.values(projectState.projectConfig.viewModes)
    .filter((mode) => mode.id !== activeViewModeId)
    .sort(
      (left, right) =>
        (left.sortIndex ?? Number.MAX_SAFE_INTEGER) -
        (right.sortIndex ?? Number.MAX_SAFE_INTEGER),
    )
    .slice(0, MAX_PROJECT_GPU_FLOW_PREWARM_VIEW_MODES)
    .map((mode) => mode.id);
}

export function prewarmProjectGpuFlowSceneCacheViewMode(
  projectState: ZustandProjectState,
  options: ProjectGpuFlowSceneOptions,
  activeViewModeId: string,
  resolveScene: (
    projectState: ZustandProjectState,
    options: ProjectGpuFlowSceneOptions,
  ) => GpuFlowScene,
): void {
  resolveScene(
    createProjectStateForGpuFlowViewMode(projectState, activeViewModeId),
    options,
  );
}

export function createProjectGpuFlowPrewarmKey(
  projectState: ZustandProjectState,
  options: ProjectGpuFlowSceneOptions,
): string {
  return [
    projectState.projectConfig.id,
    options.revision ?? 0,
    options.darkMode ? "dark" : "light",
    gpuPointMapSignature(options.contentScrollOffsets),
    gpuPointMapSignature(options.scrollOffsets),
    ...createProjectGpuFlowSearchPrewarmKeyParts(options.projectSearch),
    ...createProjectGpuFlowResizePrewarmKeyParts(options.resizePolicyContext),
    ...createProjectGpuFlowInteractionPrewarmKeyParts(options),
  ].join("|");
}

export function claimProjectGpuFlowPrewarmKey(prewarmKey: string): boolean {
  if (projectGpuFlowPrewarmedKeys.includes(prewarmKey)) {
    return false;
  }
  projectGpuFlowPrewarmedKeys = [
    prewarmKey,
    ...projectGpuFlowPrewarmedKeys,
  ].slice(0, MAX_PROJECT_GPU_FLOW_PREWARM_KEYS);
  return true;
}

export function createProjectGpuFlowSceneCacheKey(
  projectState: ZustandProjectState,
  options: ProjectGpuFlowSceneOptions,
): ProjectGpuFlowSceneCacheKey {
  const policy = resolveProjectGpuFlowSceneCachePolicy(options.paramEditPolicy);
  const activeViewMode = getProjectGpuActiveViewMode(projectState);
  return {
    activeParamCanvasControlSignature: projectGpuParamTargetSignature(
      options.activeParamCanvasControl,
    ),
    activeParamCanvasPopupSignature: projectGpuParamCanvasPopupSignature(
      options.activeParamCanvasPopup,
    ),
    activeParamDomIslandSignature: projectGpuParamDomIslandSignature(
      options.activeParamDomIsland,
    ),
    contentScrollOffsetsSignature: gpuPointMapSignature(
      options.contentScrollOffsets,
    ),
    darkMode: options.darkMode,
    hoveredParamTargetSignature: projectGpuParamTargetSignature(
      options.hoveredParamTarget,
    ),
    retainedParamDragPreviewSignature: projectGpuParamDragPreviewSignature(
      options.retainedParamDragPreview,
    ),
    canEditParams: policy.canEditParams,
    canEditStructure: policy.canEditStructure,
    isDeploymentMode: policy.isDeploymentMode,
    passwordRevealStatesSignature: passwordRevealStatesSignature(
      options.passwordRevealStates,
    ),
    activeViewModeId: projectState.projectConfig.activeViewModeId,
    activeViewModeTopLevelSections: activeViewMode?.topLevelSections,
    activeViewModeVisibilityBySectionId:
      activeViewMode?.visibilityBySectionId,
    isEditingViewMode: projectState.projectConfig.isEditingViewMode,
    projectTopLevelSections: projectState.projectConfig.topLevelSections,
    projectSearchFocused: options.projectSearch?.focused,
    projectSearchLookup: options.projectSearch?.lookup,
    resizeEventBySectionId: options.resizePolicyContext?.resizeEventBySectionId,
    revision: options.revision ?? 0,
    sectionImpls: projectState.sectionImpls,
    sectionVariants: projectState.sectionVariants,
    sections: projectState.sections,
    scrollOffsetsSignature: gpuPointMapSignature(options.scrollOffsets),
    sizingPolicy: options.resizePolicyContext?.sizingPolicy,
    typeErrors: options.typeErrors,
  };
}

function createProjectGpuFlowSearchPrewarmKeyParts(
  projectSearch: ProjectGpuFlowSceneOptions["projectSearch"],
): readonly string[] {
  return [
    projectSearch?.focused ? "search-focused" : "search-blurred",
    setStringSignature(projectSearch?.lookup),
  ];
}

function createProjectGpuFlowResizePrewarmKeyParts(
  resizePolicyContext: ProjectGpuFlowSceneOptions["resizePolicyContext"],
): readonly string[] {
  return [
    String(resizePolicyContext?.sizingPolicy ?? ""),
    stringRecordSignature(resizePolicyContext?.resizeEventBySectionId),
  ];
}

function setStringSignature(values: ReadonlySet<string> | undefined): string {
  return values ? [...values].sort().join(",") : "";
}

function stringRecordSignature(
  record: Readonly<Record<string, string | undefined>> | undefined,
): string {
  if (!record) {
    return "";
  }
  return Object.entries(record)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${value ?? ""}`)
    .join(",");
}

function createProjectGpuFlowInteractionPrewarmKeyParts(
  options: ProjectGpuFlowSceneOptions,
): readonly string[] {
  return [
    projectGpuParamTargetSignature(options.activeParamCanvasControl),
    projectGpuParamCanvasPopupSignature(options.activeParamCanvasPopup),
    projectGpuParamDomIslandSignature(options.activeParamDomIsland),
    projectGpuParamTargetSignature(options.hoveredParamTarget),
    passwordRevealStatesSignature(options.passwordRevealStates),
    projectGpuParamDragPreviewSignature(options.retainedParamDragPreview),
  ];
}

function createProjectStateForGpuFlowViewMode(
  projectState: ZustandProjectState,
  activeViewModeId: string,
): ZustandProjectState {
  return {
    ...projectState,
    projectConfig: {
      ...projectState.projectConfig,
      activeViewModeId,
    },
  };
}

function resolveProjectGpuFlowSceneCachePolicy(
  policy: ProjectGpuFlowSceneOptions["paramEditPolicy"],
): {
  readonly canEditParams: boolean;
  readonly canEditStructure: boolean;
  readonly isDeploymentMode: boolean;
} {
  return {
    canEditParams:
      policy?.canEditParams ??
      DEFAULT_PROJECT_GPU_FLOW_SCENE_CACHE_POLICY.canEditParams,
    canEditStructure:
      policy?.canEditStructure ??
      DEFAULT_PROJECT_GPU_FLOW_SCENE_CACHE_POLICY.canEditStructure,
    isDeploymentMode:
      policy?.isDeploymentMode ??
      DEFAULT_PROJECT_GPU_FLOW_SCENE_CACHE_POLICY.isDeploymentMode,
  };
}

function isProjectGpuFlowSceneCacheHit(
  previous: ProjectGpuFlowSceneCacheKey,
  next: ProjectGpuFlowSceneCacheKey,
): boolean {
  return PROJECT_GPU_FLOW_SCENE_CACHE_KEY_FIELDS.every(
    (field) => previous[field] === next[field],
  );
}

function getProjectGpuActiveViewMode(
  projectState: ZustandProjectState,
): ZustandProjectState["projectConfig"]["viewModes"][string] | undefined {
  const { activeViewModeId, viewModes } = projectState.projectConfig;
  return activeViewModeId ? viewModes[activeViewModeId] : undefined;
}

function projectGpuParamTargetSignature(target: OptionalParamTarget): string {
  if (!target) {
    return "";
  }
  return [
    target.sectionId,
    target.surfaceId,
    target.paramInfoId,
    target.hitRecordId,
  ].join("|");
}

function projectGpuParamCanvasPopupSignature(
  popup: OptionalParamCanvasPopup,
): string {
  if (!popup) {
    return "";
  }
  if (popup.kind === "date-calendar") {
    return [
      projectGpuParamTargetSignature(popup),
      popup.kind,
      popup.highlightedDateIso ?? "",
      popup.visibleMonth.year,
      popup.visibleMonth.monthIndex,
    ].join("|");
  }
  return [
    projectGpuParamTargetSignature(popup),
    popup.kind,
    popup.highlightedOptionIndex ?? "",
  ].join("|");
}

function projectGpuParamDomIslandSignature(
  island: OptionalParamDomIsland,
): string {
  if (!island) {
    return "";
  }
  const activation = island.activation;
  return [
    projectGpuParamTargetSignature(island),
    activation?.kind ?? "",
    activation?.clientPoint.x ?? "",
    activation?.clientPoint.y ?? "",
  ].join("|");
}

function projectGpuParamDragPreviewSignature(
  preview: OptionalParamDragPreview,
): string {
  if (!preview) {
    return "";
  }
  return [
    preview.sectionId,
    preview.surfaceId,
    preview.draggingParamIds.join(","),
    ...projectGpuParamDragPreviewDropMarkerSignatureParts(preview),
    ...projectGpuParamDragPreviewPointerSignatureParts(preview),
  ].join("|");
}

function projectGpuParamDragPreviewDropMarkerSignatureParts(
  preview: ProjectGpuRetainedParamDragPreview,
): readonly string[] {
  return [preview.dropMarker?.rowId ?? "", preview.dropMarker?.edge ?? ""];
}

function projectGpuParamDragPreviewPointerSignatureParts(
  preview: ProjectGpuRetainedParamDragPreview,
): readonly string[] {
  return [
    String(preview.pointerLocal?.x ?? ""),
    String(preview.pointerLocal?.y ?? ""),
  ];
}

function passwordRevealStatesSignature(
  states: ProjectGpuRetainedPasswordRevealStateMap | undefined,
): string {
  if (!states || states.size === 0) {
    return "";
  }
  return [...states.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([key, state]) =>
        `${key}:${state.pending ? "1" : "0"}:${state.value ?? ""}`,
    )
    .join("|");
}

function gpuPointMapSignature(
  map:
    | GpuRetainedContentScrollOffsetMap
    | GpuSectionSceneScrollOffsetMap
    | undefined,
): string {
  if (!map || map.size === 0) {
    return "";
  }
  return [...map.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, point]) => `${key}:${point.x},${point.y}`)
    .join("|");
}
