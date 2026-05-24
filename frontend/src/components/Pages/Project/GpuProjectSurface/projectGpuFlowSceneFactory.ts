import type { GpuRetainedContentScrollOffsetMap } from "gpuFlow/retainedContentScroll";
import {
  createGpuFlowContentSurfacesFromSections,
  type GpuFlowScene,
} from "gpuFlow/scene";
import { resolveGpuSectionSceneResizePreviewSections } from "gpuFlow/sceneResize";
import type { GpuSectionSceneScrollOffsetMap } from "gpuFlow/sceneScroll";
import type { GpuRect } from "gpuFlow/viewportMath";
import type {
  ZustandProjectSearch,
  ZustandProjectState,
  ZustandTypeErrors,
} from "state/definitions";
import {
  createProjectGpuParamContentSurfaces,
  createProjectGpuParamDomIslands,
  DEFAULT_PROJECT_GPU_PARAM_EDIT_POLICY,
  type ProjectGpuActiveParamCanvasPopup,
  type ProjectGpuActiveParamDomIsland,
  type ProjectGpuParamEditPolicy,
  type ProjectGpuRetainedParamTarget,
} from "./projectGpuParamContentAdapter";
import type { ProjectGpuRetainedParamDragPreview } from "./projectGpuParamDragAdapter";
import type { ProjectGpuRetainedPasswordRevealStateMap } from "./projectGpuRetainedParamPasswordRevealState";
import type { ProjectGpuSceneResizePolicyContext } from "./projectGpuSceneResizePolicy";

export type ProjectGpuResizePreviewSceneInput = {
  readonly resizedWorldRect: GpuRect;
  readonly scene: GpuFlowScene;
  readonly sectionId: string;
};

export type ProjectGpuFlowSceneOptions = {
  readonly darkMode: boolean;
  readonly contentScrollOffsets?: GpuRetainedContentScrollOffsetMap | undefined;
  readonly activeParamCanvasPopup?:
    | ProjectGpuActiveParamCanvasPopup
    | null
    | undefined;
  readonly activeParamCanvasControl?:
    | ProjectGpuRetainedParamTarget
    | null
    | undefined;
  readonly activeParamDomIsland?:
    | ProjectGpuActiveParamDomIsland
    | null
    | undefined;
  readonly hoveredParamTarget?:
    | ProjectGpuRetainedParamTarget
    | null
    | undefined;
  readonly passwordRevealStates?:
    | ProjectGpuRetainedPasswordRevealStateMap
    | undefined;
  readonly projectSearch?:
    | Pick<ZustandProjectSearch, "focused" | "lookup">
    | undefined;
  readonly paramEditPolicy?: ProjectGpuParamEditPolicy | undefined;
  readonly retainedParamDragPreview?:
    | ProjectGpuRetainedParamDragPreview
    | null
    | undefined;
  readonly resizePolicyContext?: ProjectGpuSceneResizePolicyContext | undefined;
  readonly revision?: number | undefined;
  readonly scrollOffsets?: GpuSectionSceneScrollOffsetMap | undefined;
  readonly typeErrors?: ZustandTypeErrors["errors"] | undefined;
};

export function resolveProjectGpuResizePreviewScene(
  projectState: ZustandProjectState,
  options: ProjectGpuFlowSceneOptions,
  input: ProjectGpuResizePreviewSceneInput,
): GpuFlowScene {
  return createProjectGpuFlowSceneFromLayoutScene(projectState, options, {
    contentSurfaces: [],
    domIslands: [],
    edges: input.scene.edges,
    revision: input.scene.revision,
    sections: resolveGpuSectionSceneResizePreviewSections({
      resizedWorldRect: input.resizedWorldRect,
      scene: input.scene,
      sectionId: input.sectionId,
    }),
  });
}

export function createProjectGpuFlowSceneFromLayoutScene(
  projectState: ZustandProjectState,
  options: ProjectGpuFlowSceneOptions,
  layoutScene: GpuFlowScene,
): GpuFlowScene {
  const paramEditPolicy =
    options.paramEditPolicy ?? DEFAULT_PROJECT_GPU_PARAM_EDIT_POLICY;
  const paramContentSurfaces = createProjectGpuParamContentSurfaces({
    activeParamCanvasControl: options.activeParamCanvasControl,
    activeParamCanvasPopup: options.activeParamCanvasPopup,
    activeParamDomIsland: options.activeParamDomIsland,
    contentScrollOffsets: options.contentScrollOffsets,
    editPolicy: paramEditPolicy,
    hoveredParamTarget: options.hoveredParamTarget,
    passwordRevealStates: options.passwordRevealStates,
    projectState,
    projectSearch: options.projectSearch,
    retainedParamDragPreview: options.retainedParamDragPreview,
    sections: layoutScene.sections,
    typeErrors: options.typeErrors,
  });
  const domIslands = createProjectGpuParamDomIslands({
    activeParamDomIsland: options.activeParamDomIsland,
    contentSurfaces: paramContentSurfaces,
    editPolicy: paramEditPolicy,
    projectState,
  });
  const contentSurfaces = createGpuFlowContentSurfacesFromSections(
    layoutScene.sections,
    paramContentSurfaces,
  );
  return {
    ...layoutScene,
    domIslands,
    contentSurfaces,
  };
}
