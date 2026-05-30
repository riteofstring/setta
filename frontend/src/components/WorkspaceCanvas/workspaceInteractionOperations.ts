import { callOpenAPI } from "@setta/app-subsystem-frontend-sdk";
import { setParamEnteredValue, setSectionSizes } from "openapi/http";
import type { Dispatch, SetStateAction } from "react";
import { dispatchButtonParamAction } from "state/actions/params/buttonParamActions";
import {
  moveParamsWithBackend,
  orderParamIdsByParent,
  selectOnlyParam,
} from "state/actions/params/moveParams";
import {
  buildParamParentMap,
  getParamRootId,
  getRootSelectedParamIds,
  getSharedParentId,
  isDescendantOfSelection,
  resolveFullIndexForVisibleInsertion,
} from "state/actions/params/paramTree";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveCodeObjImpl,
  getCurrEffectiveSectionImplWithTypeGuard,
  getCurrProjectConfigId,
  setCurrEffectiveCodeObjImplValue,
} from "state/actions/sectionInfos";
import { moveSectionsWithBackend } from "state/actions/sections/moveSections";
import { setSelfParentSiblingChildrenWidths } from "state/actions/sections/sectionSizes";
import { useProjectState } from "state/definitions";
import type {
  BaseCodeObjImplUnion,
  ButtonParamCodeObjImpl,
  SectionSize,
} from "utils/generatedTypes";
import {
  CodeObjTypeEnum,
  isBaseParentCodeObjImpl,
  isBaseSectionWithParamsImpl,
} from "utils/generatedTypes";
import {
  reduceActiveEditorSession,
  setWorkspaceActiveControlState,
  setWorkspaceActiveEditorSession,
  toggleWorkspaceParamDisclosureCollapsed,
  type ActiveEditorSession,
  type WorkspaceCanvasControllerState,
  type WorkspaceParamRowDragDraft,
  type WorkspaceParamRowDropTarget,
  type WorkspaceSceneTarget,
} from "./workspaceController";
import { type WorkspaceCanvasPointerInteraction } from "./workspaceInteractionTypes";
import { dispatchWorkspaceTopLevelSectionLayoutUpdate } from "./workspaceMutations";
import {
  rectContainsPoint,
  screenToWorkspace,
  workspaceToScreen,
} from "./workspaceScene";
import {
  getEffectiveCodeObjSnapshot,
  getEffectiveSectionSnapshot,
} from "./workspaceSceneProject";
import {
  WORKSPACE_SCENE_GEOMETRY,
  type WorkspaceDictRowScene,
  type WorkspacePoint,
  type WorkspaceRect,
  type WorkspaceScene,
} from "./workspaceSceneTypes";

export function createWorkspaceParamRowDragInteraction({
  scene,
  target,
  screenPoint,
  pointerId,
}: {
  scene: WorkspaceScene;
  target: Extract<WorkspaceSceneTarget, { kind: "dict-row" }>;
  screenPoint: WorkspacePoint;
  pointerId: number;
}): Extract<
  WorkspaceCanvasPointerInteraction,
  { kind: "param-row-drag" }
> | null {
  const row = findWorkspaceDictRow(scene, target);
  if (!row) {
    return null;
  }
  const state = useProjectState.getState();
  const sectionImpl = getCurrEffectiveSectionImplWithTypeGuard(
    state,
    target.sectionId,
    isBaseSectionWithParamsImpl,
  );
  if (sectionImpl.paramFilter.trim().length > 0) {
    return null;
  }
  const rootId = getParamRootId(state, target.sectionId);
  const parentById = buildParamParentMap(state, target.sectionId, rootId);
  if (!Object.prototype.hasOwnProperty.call(parentById, target.paramId)) {
    return null;
  }
  const draggingParamIds = resolveWorkspaceDraggingParamIds({
    sectionId: target.sectionId,
    activeParamId: target.paramId,
    parentById,
    selectedParams: sectionImpl.selectedParams ?? [],
  });
  const workspacePoint = screenToWorkspace(screenPoint, scene.viewport);
  return {
    kind: "param-row-drag",
    pointerId,
    sectionId: target.sectionId,
    rowId: target.rowId,
    paramId: target.paramId,
    list: row.list,
    startScreen: screenPoint,
    startWorkspace: workspacePoint,
    currentWorkspace: workspacePoint,
    rowRect: row.rect,
    draggingParamIds,
    parentById,
    moved: false,
    dropTarget: null,
  };
}

function resolveWorkspaceDraggingParamIds({
  sectionId,
  activeParamId,
  parentById,
  selectedParams,
}: {
  sectionId: string;
  activeParamId: string;
  parentById: Record<string, string | null>;
  selectedParams: Array<string>;
}) {
  if (!selectedParams.includes(activeParamId)) {
    selectOnlyParam(sectionId, activeParamId);
    return [activeParamId];
  }
  const rootSelected = getRootSelectedParamIds(parentById, selectedParams);
  const draggingParamIds =
    rootSelected.length > 0 ? rootSelected : [activeParamId];
  if (
    draggingParamIds.length === 1 ||
    getSharedParentId(parentById, draggingParamIds)
  ) {
    return draggingParamIds;
  }
  selectOnlyParam(sectionId, activeParamId);
  return [activeParamId];
}

export function createWorkspaceParamRowDragDraft(
  interaction: Extract<
    WorkspaceCanvasPointerInteraction,
    { kind: "param-row-drag" }
  >,
): WorkspaceParamRowDragDraft {
  const delta = {
    x: interaction.currentWorkspace.x - interaction.startWorkspace.x,
    y: interaction.currentWorkspace.y - interaction.startWorkspace.y,
  };
  return {
    sectionId: interaction.sectionId,
    rowId: interaction.rowId,
    paramId: interaction.paramId,
    worldRect: {
      ...interaction.rowRect,
      x: interaction.rowRect.x + delta.x,
      y: interaction.rowRect.y + delta.y,
    },
    dropTarget: interaction.dropTarget,
  };
}

// The drop target resolver mirrors the supported before/after/inside row zones.
// eslint-disable-next-line complexity
export function resolveWorkspaceParamRowDropTarget({
  scene,
  sectionId,
  list,
  draggingParamIds,
  parentById,
  workspacePoint,
}: {
  scene: WorkspaceScene;
  sectionId: string;
  list: WorkspaceDictRowScene["list"];
  draggingParamIds: Array<string>;
  parentById: Record<string, string | null>;
  workspacePoint: WorkspacePoint;
}): WorkspaceParamRowDropTarget | null {
  const section = scene.sectionsById[sectionId];
  if (!section || section.renderModel.kind !== "dict") {
    return null;
  }
  const rows = section.renderModel.dict.rows.filter(
    (row) => row.list === list && row.visible && row.visibleRect,
  );
  const overRow =
    rows.find(
      (row) =>
        row.visibleRect && rectContainsPoint(row.visibleRect, workspacePoint),
    ) ?? null;
  if (!overRow) {
    return null;
  }
  const movingIds = new Set(draggingParamIds);
  if (isDescendantOfSelection(parentById, overRow.paramId, movingIds)) {
    return null;
  }
  const insideTarget = resolveWorkspaceParamInsideDropTarget({
    sectionId,
    rows,
    overRow,
    draggingParamIds,
    movingIds,
    workspacePoint,
  });
  if (insideTarget) {
    return insideTarget;
  }
  const newParentId = overRow.parentParamId;
  if (!newParentId) {
    return null;
  }
  const visibleSiblings = rows
    .filter((row) => row.parentParamId === newParentId)
    .map((row) => row.paramId);
  const overVisibleIndex = visibleSiblings.indexOf(overRow.paramId);
  if (overVisibleIndex < 0) {
    return null;
  }
  const placement =
    workspacePoint.y > overRow.rect.y + overRow.rect.height / 2
      ? "after"
      : "before";
  const targetVisibleIndex = overVisibleIndex + (placement === "after" ? 1 : 0);
  const newIndex = resolveWorkspaceParamFullInsertionIndex({
    sectionId,
    newParentId,
    visibleSiblings,
    movingIds,
    targetVisibleIndex,
  });
  if (newIndex === null) {
    return null;
  }
  return {
    sectionId,
    paramId: overRow.paramId,
    newParentId,
    newIndex,
    placement,
    indicatorRect: {
      x: overRow.rect.x,
      y:
        placement === "after"
          ? overRow.rect.y + overRow.rect.height
          : overRow.rect.y,
      width: overRow.rect.width,
      height: 2,
    },
  };
}

function resolveWorkspaceParamInsideDropTarget({
  sectionId,
  rows,
  overRow,
  draggingParamIds,
  movingIds,
  workspacePoint,
}: {
  sectionId: string;
  rows: Array<WorkspaceDictRowScene>;
  overRow: WorkspaceDictRowScene;
  draggingParamIds: Array<string>;
  movingIds: Set<string>;
  workspacePoint: WorkspacePoint;
}): WorkspaceParamRowDropTarget | null {
  if (draggingParamIds.includes(overRow.paramId)) {
    return null;
  }
  if (overRow.support.controlKind !== "disclosure") {
    return null;
  }
  const insideX =
    overRow.labelRect.x + WORKSPACE_SCENE_GEOMETRY.dictNestingIndent * 1.5;
  const middleInset = Math.max(2, overRow.rect.height * 0.22);
  const insideY =
    workspacePoint.y >= overRow.rect.y + middleInset &&
    workspacePoint.y <= overRow.rect.y + overRow.rect.height - middleInset;
  if (!insideY || workspacePoint.x < insideX) {
    return null;
  }
  const childRows = rows.filter((row) => row.parentParamId === overRow.paramId);
  const targetVisibleIndex = childRows.length;
  const newIndex = resolveWorkspaceParamFullInsertionIndex({
    sectionId,
    newParentId: overRow.paramId,
    visibleSiblings: childRows.map((row) => row.paramId),
    movingIds,
    targetVisibleIndex,
  });
  if (newIndex === null) {
    return null;
  }
  return {
    sectionId,
    paramId: overRow.paramId,
    newParentId: overRow.paramId,
    newIndex,
    placement: "inside",
    indicatorRect: {
      x: overRow.rect.x + WORKSPACE_SCENE_GEOMETRY.dictNestingIndent,
      y: overRow.rect.y + overRow.rect.height,
      width: Math.max(
        0,
        overRow.rect.width - WORKSPACE_SCENE_GEOMETRY.dictNestingIndent,
      ),
      height: 2,
    },
  };
}

function resolveWorkspaceParamFullInsertionIndex({
  sectionId,
  newParentId,
  visibleSiblings,
  movingIds,
  targetVisibleIndex,
}: {
  sectionId: string;
  newParentId: string;
  visibleSiblings: Array<string>;
  movingIds: Set<string>;
  targetVisibleIndex: number;
}) {
  const state = useProjectState.getState();
  const parentImpl = getCurrEffectiveCodeObjImpl(state, sectionId, newParentId);
  const fullChildren = isBaseParentCodeObjImpl(
    parentImpl as BaseCodeObjImplUnion,
  )
    ? parentImpl.children ?? []
    : [];
  return resolveFullIndexForVisibleInsertion({
    targetVisibleIndex,
    movingIds,
    visibleSiblings,
    fullChildren,
  });
}

export function commitWorkspaceParamRowDrag(
  interaction: Extract<
    WorkspaceCanvasPointerInteraction,
    { kind: "param-row-drag" }
  >,
) {
  const dropTarget = interaction.dropTarget;
  if (!dropTarget) {
    return;
  }
  const state = useProjectState.getState();
  const oldParentId =
    getSharedParentId(interaction.parentById, interaction.draggingParamIds) ??
    interaction.parentById[interaction.draggingParamIds[0] ?? ""] ??
    null;
  if (!oldParentId) {
    return;
  }
  if (
    isDescendantOfSelection(
      interaction.parentById,
      dropTarget.newParentId,
      new Set(interaction.draggingParamIds),
    )
  ) {
    return;
  }
  const orderedParamIds = orderParamIdsByParent(
    state,
    interaction.sectionId,
    oldParentId,
    interaction.draggingParamIds,
  );
  if (orderedParamIds.length === 0) {
    return;
  }
  if (
    isNoopWorkspaceParamMove({
      sectionId: interaction.sectionId,
      oldParentId,
      newParentId: dropTarget.newParentId,
      newIndex: dropTarget.newIndex,
      orderedParamIds,
    })
  ) {
    return;
  }
  moveParamsWithBackend({
    sectionId: interaction.sectionId,
    paramIds: orderedParamIds,
    newParentId: dropTarget.newParentId,
    newIndex: dropTarget.newIndex,
  });
}

function isNoopWorkspaceParamMove({
  sectionId,
  oldParentId,
  newParentId,
  newIndex,
  orderedParamIds,
}: {
  sectionId: string;
  oldParentId: string;
  newParentId: string;
  newIndex: number;
  orderedParamIds: Array<string>;
}) {
  if (oldParentId !== newParentId) {
    return false;
  }
  const state = useProjectState.getState();
  const parentImpl = getCurrEffectiveCodeObjImpl(state, sectionId, newParentId);
  if (!isBaseParentCodeObjImpl(parentImpl as BaseCodeObjImplUnion)) {
    return false;
  }
  const currentIndex = (parentImpl.children ?? []).indexOf(
    orderedParamIds[0] ?? "",
  );
  return currentIndex === newIndex;
}

export function openWorkspaceActiveEditorSession({
  scene,
  target,
  setControllerState,
}: {
  scene: WorkspaceScene;
  target: Extract<WorkspaceSceneTarget, { kind: "dict-row" | "control" }>;
  setControllerState: Dispatch<SetStateAction<WorkspaceCanvasControllerState>>;
}) {
  const row = findWorkspaceDictRow(scene, target);
  if (!row || !isWorkspaceOverlayEditorRow(row)) {
    return false;
  }
  const rect = target.kind === "control" ? row.controlRect : row.valueRect;
  const session: ActiveEditorSession = {
    id: `${row.id}:editor:${scene.cacheKeys.scene}`,
    kind: resolveWorkspaceActiveEditorSessionKind(row),
    target,
    rectKey: serializeWorkspaceRectKey(rect),
    initialValue: row.passiveValue.text,
    draftValue: row.passiveValue.text,
    commitMode: row.support.commitMode,
    openedAtSceneRevision: scene.cacheKeys.scene,
  };
  setControllerState((current) =>
    setWorkspaceActiveEditorSession(
      setWorkspaceActiveControlState(current, null),
      session,
    ),
  );
  return true;
}

function isWorkspaceOverlayEditorRow(row: WorkspaceDictRowScene) {
  return (
    row.support.activeInputStrategy === "dom-native-overlay" ||
    row.support.activeInputStrategy === "dom-rich-overlay"
  );
}

function resolveWorkspaceActiveEditorSessionKind(
  row: WorkspaceDictRowScene,
): ActiveEditorSession["kind"] {
  if (
    row.paramType === CodeObjTypeEnum.CodeParam ||
    row.support.activeInputStrategy === "dom-rich-overlay"
  ) {
    return "code";
  }
  if (row.passiveValue.kind === "number") {
    return "number";
  }
  if (row.passiveValue.kind === "color") {
    return "color";
  }
  if (row.passiveValue.kind === "choice") {
    return "combobox";
  }
  return "text";
}

export function commitWorkspaceActiveEditorSession({
  controllerState,
  setControllerState,
}: {
  controllerState: WorkspaceCanvasControllerState;
  setControllerState: Dispatch<SetStateAction<WorkspaceCanvasControllerState>>;
}) {
  const reduced = reduceActiveEditorSession(
    controllerState.activeEditorSession,
    { type: "commit" },
  );
  setControllerState((current) =>
    setWorkspaceActiveEditorSession(current, reduced.session),
  );
  if (reduced.outcome.kind !== "commit") {
    return;
  }
  commitCanvasParamValue({
    sectionId: reduced.outcome.session.target.sectionId,
    paramId: reduced.outcome.session.target.paramId,
    value: reduced.outcome.value,
  });
}

function serializeWorkspaceRectKey(rect: WorkspaceRect) {
  return [rect.x, rect.y, rect.width, rect.height]
    .map((value) => Math.round(value * 100) / 100)
    .join(",");
}

// Canvas control activation fans out by declared control kind.
// eslint-disable-next-line complexity
export function activateWorkspaceCanvasControl({
  scene,
  screenPoint,
  target,
  pointerId,
  setControllerState,
}: {
  scene: WorkspaceScene;
  screenPoint: WorkspacePoint;
  target: Extract<WorkspaceSceneTarget, { kind: "control" }>;
  pointerId: number;
  setControllerState: Dispatch<SetStateAction<WorkspaceCanvasControllerState>>;
}): WorkspaceCanvasPointerInteraction | null {
  const row = findWorkspaceDictRow(scene, target);
  if (!row) {
    return null;
  }
  const workspacePoint = screenToWorkspace(screenPoint, scene.viewport);
  if (row.support.controlKind === "toggle") {
    const nextValue = row.passiveValue.text === "On" ? "false" : "true";
    commitCanvasParamValue({
      sectionId: target.sectionId,
      paramId: target.paramId,
      value: nextValue,
    });
    pulseWorkspaceCanvasControl(
      setControllerState,
      target,
      nextValue === "true",
    );
    return null;
  }
  if (row.support.controlKind === "dropdown") {
    openWorkspaceCanvasPopup(setControllerState, target, row.passiveValue.text);
    return null;
  }
  if (row.support.controlKind === "color-swatch") {
    openWorkspaceCanvasPopup(setControllerState, target, row.passiveValue.text);
    return null;
  }
  if (row.support.controlKind === "slider") {
    const sliderConfig = getSliderConfigForTarget(target);
    const draftValue = resolveSliderValueFromWorkspacePoint(
      {
        kind: "slider",
        pointerId,
        target,
        controlRect: row.controlRect,
        min: sliderConfig.min,
        max: sliderConfig.max,
        step: sliderConfig.step,
        draftValue: row.passiveValue.text,
      },
      workspacePoint,
    );
    setControllerState((current) =>
      setWorkspaceActiveControlState(current, {
        id: target.controlId,
        target,
        phase: "dragging",
        draftValue,
      }),
    );
    return {
      kind: "slider",
      pointerId,
      target,
      controlRect: row.controlRect,
      min: sliderConfig.min,
      max: sliderConfig.max,
      step: sliderConfig.step,
      draftValue,
    };
  }
  if (row.support.controlKind === "button") {
    const buttonConfig = getButtonConfigForTarget(target);
    if (buttonConfig) {
      dispatchButtonParamAction({
        config: buttonConfig,
        sectionId: target.sectionId,
        controlParamId: target.paramId,
      });
    }
    pulseWorkspaceCanvasControl(setControllerState, target, true);
    return null;
  }
  if (row.support.controlKind === "disclosure") {
    setControllerState((current) =>
      setWorkspaceActiveControlState(
        toggleWorkspaceParamDisclosureCollapsed(
          current,
          target.sectionId,
          target.paramId,
        ),
        {
          id: target.controlId,
          target,
          phase: "pressed",
          draftValue: true,
        },
      ),
    );
    return null;
  }
  return null;
}

function openWorkspaceCanvasPopup(
  setControllerState: Dispatch<SetStateAction<WorkspaceCanvasControllerState>>,
  target: Extract<WorkspaceSceneTarget, { kind: "control" }>,
  draftValue: string,
) {
  setControllerState((current) =>
    setWorkspaceActiveControlState(current, {
      id: target.controlId,
      target,
      phase: "popup-open",
      draftValue,
    }),
  );
}

function pulseWorkspaceCanvasControl(
  setControllerState: Dispatch<SetStateAction<WorkspaceCanvasControllerState>>,
  target: Extract<WorkspaceSceneTarget, { kind: "control" }>,
  draftValue: string | boolean,
) {
  setControllerState((current) =>
    setWorkspaceActiveControlState(current, {
      id: target.controlId,
      target,
      phase: "pressed",
      draftValue,
    }),
  );
}

export function commitWorkspaceCanvasPopupOption({
  target,
  setControllerState,
}: {
  target: Extract<WorkspaceSceneTarget, { kind: "canvas-popup-option" }>;
  setControllerState: Dispatch<SetStateAction<WorkspaceCanvasControllerState>>;
}) {
  commitCanvasParamValue({
    sectionId: target.sectionId,
    paramId: target.paramId,
    value: target.value,
  });
  setControllerState((current) =>
    setWorkspaceActiveControlState(current, null),
  );
}

export function commitWorkspaceCanvasPopupDraft({
  scene,
  controllerState,
  setControllerState,
}: {
  scene: WorkspaceScene;
  controllerState: WorkspaceCanvasControllerState;
  setControllerState: Dispatch<SetStateAction<WorkspaceCanvasControllerState>>;
}) {
  const popup = scene.canvasPopup;
  if (!popup) {
    return false;
  }
  const option = resolveActivePopupDraftOption(scene, controllerState);
  if (!option) {
    return false;
  }
  commitCanvasParamValue({
    sectionId: popup.target.sectionId,
    paramId: popup.target.paramId,
    value: option.value,
  });
  setControllerState((current) =>
    setWorkspaceActiveControlState(current, null),
  );
  return true;
}

export function updateWorkspaceCanvasPopupDraft({
  scene,
  controllerState,
  setControllerState,
  direction,
}: {
  scene: WorkspaceScene;
  controllerState: WorkspaceCanvasControllerState;
  setControllerState: Dispatch<SetStateAction<WorkspaceCanvasControllerState>>;
  direction: 1 | -1;
}) {
  const popup = scene.canvasPopup;
  const active = controllerState.activeControlState;
  if (!popup || !active || active.phase !== "popup-open") {
    return false;
  }
  const options = popup.options;
  if (options.length === 0) {
    return false;
  }
  const draftValue =
    typeof active.draftValue === "string" ? active.draftValue : null;
  const currentIndex = draftValue
    ? options.findIndex((option) => option.value === draftValue)
    : options.findIndex((option) => option.selected);
  const nextIndex =
    currentIndex < 0
      ? direction > 0
        ? 0
        : options.length - 1
      : (currentIndex + direction + options.length) % options.length;
  const nextOption = options[nextIndex];
  if (!nextOption) {
    return false;
  }
  setControllerState((current) =>
    setWorkspaceActiveControlState(current, {
      ...active,
      draftValue: nextOption.value,
    }),
  );
  return true;
}

function resolveActivePopupDraftOption(
  scene: WorkspaceScene,
  controllerState: WorkspaceCanvasControllerState,
) {
  const popup = scene.canvasPopup;
  const active = controllerState.activeControlState;
  if (!popup || !active || active.phase !== "popup-open") {
    return null;
  }
  const draftValue =
    typeof active.draftValue === "string" ? active.draftValue : null;
  return (
    popup.options.find((option) => option.value === draftValue) ??
    popup.options.find((option) => option.selected) ??
    null
  );
}

function findWorkspaceDictRow(
  scene: WorkspaceScene,
  target: Extract<WorkspaceSceneTarget, { kind: "control" | "dict-row" }>,
): WorkspaceDictRowScene | null {
  const section = scene.sectionsById[target.sectionId];
  if (!section || section.renderModel.kind !== "dict") {
    return null;
  }
  return (
    section.renderModel.dict.rows.find((row) => row.id === target.rowId) ?? null
  );
}

// eslint-disable-next-line complexity
function getSliderConfigForTarget(
  target: Extract<WorkspaceSceneTarget, { kind: "control" }>,
) {
  const state = useProjectState.getState();
  const sectionSnapshot = getEffectiveSectionSnapshot(state, target.sectionId);
  const codeObjSnapshot = sectionSnapshot
    ? getEffectiveCodeObjSnapshot(
        state,
        sectionSnapshot.effectiveImpl,
        target.paramId,
      )
    : null;
  const impl = codeObjSnapshot?.effectiveImpl as
    | (BaseCodeObjImplUnion & { min?: number; max?: number; step?: number })
    | undefined;
  return {
    min: typeof impl?.min === "number" ? impl.min : 0,
    max: typeof impl?.max === "number" ? impl.max : 100,
    step: typeof impl?.step === "number" && impl.step > 0 ? impl.step : 1,
  };
}

function getButtonConfigForTarget(
  target: Extract<WorkspaceSceneTarget, { kind: "control" }>,
): ButtonParamCodeObjImpl | null {
  const state = useProjectState.getState();
  const sectionSnapshot = getEffectiveSectionSnapshot(state, target.sectionId);
  const codeObjSnapshot = sectionSnapshot
    ? getEffectiveCodeObjSnapshot(
        state,
        sectionSnapshot.effectiveImpl,
        target.paramId,
      )
    : null;
  const impl = codeObjSnapshot?.effectiveImpl;
  return impl?.type === CodeObjTypeEnum.ButtonParam
    ? (impl as ButtonParamCodeObjImpl)
    : null;
}

export function resolveSliderValueFromWorkspacePoint(
  interaction: Extract<WorkspaceCanvasPointerInteraction, { kind: "slider" }>,
  screenPoint: WorkspacePoint,
) {
  const ratio =
    interaction.controlRect.width <= 0
      ? 0
      : (screenPoint.x - interaction.controlRect.x) /
        interaction.controlRect.width;
  const clamped = Math.min(1, Math.max(0, ratio));
  const rawValue =
    interaction.min + (interaction.max - interaction.min) * clamped;
  const stepped =
    Math.round((rawValue - interaction.min) / interaction.step) *
      interaction.step +
    interaction.min;
  return String(Math.min(interaction.max, Math.max(interaction.min, stepped)));
}

export function commitCanvasParamValue({
  sectionId,
  paramId,
  value,
}: {
  sectionId: string;
  paramId: string;
  value: string;
}) {
  const projectState = useProjectState.getState();
  const sectionVariantId =
    projectState.projectConfig.sectionVariantMap[sectionId];
  if (!sectionVariantId) {
    return;
  }
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      setCurrEffectiveCodeObjImplValue<
        BaseCodeObjImplUnion & { value: string }
      >(state, sectionId, paramId, { value });
    },
    send: (frontendOpId) =>
      callOpenAPI(
        setParamEnteredValue<true>({
          body: {
            projectConfigId: getCurrProjectConfigId(),
            sectionId,
            sectionVariantId,
            paramInfoId: paramId,
            value,
            frontendOpId,
          },
        } as Parameters<typeof setParamEnteredValue<true>>[0]),
      ),
  });
}

// eslint-disable-next-line complexity
export function commitWorkspaceSectionDrag({
  scene,
  projectState,
  interaction,
}: {
  scene: WorkspaceScene;
  projectState: ReturnType<typeof useProjectState.getState>;
  interaction: Extract<
    WorkspaceCanvasPointerInteraction,
    { kind: "section-drag" }
  >;
}) {
  if (interaction.sectionIds.length === 1) {
    const sectionId = interaction.sectionIds[0];
    if (!sectionId) {
      return;
    }
    const dropZone = findNestedSectionDropZone(
      scene,
      sectionId,
      interaction.currentWorkspace,
    );
    if (dropZone) {
      const newIndex = resolveNestedSectionDropIndex({
        scene,
        projectState,
        sectionId,
        parentSectionId: dropZone.parentSectionId,
        index: dropZone.index,
      });
      moveSectionsWithBackend({
        sectionIds: [sectionId],
        newParentId: dropZone.parentSectionId,
        newIndex,
        positionsById: null,
      });
      return;
    }
    const parentId = projectState.parentSectionMap[sectionId] ?? null;
    if (parentId !== null) {
      const draft =
        interaction.currentBoundsById[sectionId] ??
        interaction.startBoundsById[sectionId];
      if (!draft) {
        return;
      }
      moveSectionsWithBackend({
        sectionIds: [sectionId],
        newParentId: null,
        newIndex: null,
        positionsById: {
          [sectionId]: {
            x: draft.x,
            y: draft.y,
          },
        },
      });
      return;
    }
  }

  let changed = false;
  const nextLayouts = { ...projectState.projectConfig.topLevelSections };
  for (const sectionId of interaction.sectionIds) {
    const startBounds = interaction.startBoundsById[sectionId];
    const currentDraft =
      interaction.currentBoundsById[sectionId] ?? startBounds;
    if (!currentDraft) {
      continue;
    }
    const parentId = projectState.parentSectionMap[sectionId] ?? null;
    if (parentId !== null) {
      continue;
    }
    const currentLayout = nextLayouts[sectionId];
    if (!currentLayout) {
      continue;
    }
    nextLayouts[sectionId] = {
      ...currentLayout,
      x: currentDraft.x,
      y: currentDraft.y,
    };
    changed = true;
  }
  if (!changed) {
    return;
  }
  dispatchWorkspaceTopLevelSectionLayoutUpdate(nextLayouts, true);
}

function findNestedSectionDropZone(
  scene: WorkspaceScene,
  draggedSectionId: string,
  workspacePoint: WorkspacePoint,
) {
  for (const sectionId of [...scene.sectionOrder].reverse()) {
    const section = scene.sectionsById[sectionId];
    if (!section) {
      continue;
    }
    for (const zone of section.nestedDropZones) {
      const zoneParent = scene.sectionsById[zone.parentSectionId];
      if (!zoneParent) {
        continue;
      }
      if (zoneParent.sectionPath.includes(draggedSectionId)) {
        continue;
      }
      if (rectContainsPoint(zone.rect, workspacePoint)) {
        return zone;
      }
    }
  }
  return null;
}

function resolveNestedSectionDropIndex({
  scene,
  projectState,
  sectionId,
  parentSectionId,
  index,
}: {
  scene: WorkspaceScene;
  projectState: ReturnType<typeof useProjectState.getState>;
  sectionId: string;
  parentSectionId: string;
  index: number;
}) {
  const currentParentId = projectState.parentSectionMap[sectionId] ?? null;
  if (currentParentId !== parentSectionId) {
    return index;
  }
  const parent = scene.sectionsById[parentSectionId];
  const currentIndex = parent?.childIds.indexOf(sectionId) ?? -1;
  if (currentIndex >= 0 && currentIndex < index) {
    return Math.max(0, index - 1);
  }
  return index;
}

export function commitWorkspaceSectionResize({
  projectState,
  sectionId,
  bounds,
}: {
  projectState: ReturnType<typeof useProjectState.getState>;
  sectionId: string;
  bounds: WorkspaceRect;
}) {
  const parentId = projectState.parentSectionMap[sectionId] ?? null;
  if (parentId === null) {
    const currentLayouts = projectState.projectConfig.topLevelSections;
    const currentLayout = currentLayouts[sectionId];
    if (!currentLayout) {
      return;
    }
    dispatchWorkspaceTopLevelSectionLayoutUpdate(
      {
        ...currentLayouts,
        [sectionId]: {
          ...currentLayout,
          w: Math.round(bounds.width),
          h: Math.round(bounds.height),
        },
      },
      true,
    );
    return;
  }
  persistNestedWorkspaceSectionSize(sectionId, {
    width: Math.round(bounds.width),
    height: Math.round(bounds.height),
  });
}

function persistNestedWorkspaceSectionSize(
  sectionId: string,
  nextSize: Partial<SectionSize>,
) {
  let updatedSectionSizes: Record<string, SectionSize> = {};
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      updatedSectionSizes = setSelfParentSiblingChildrenWidths(
        sectionId,
        nextSize,
        state,
      );
    },
    send: (frontendOpId) =>
      callOpenAPI(
        setSectionSizes<true>({
          body: {
            projectConfigId: getCurrProjectConfigId(),
            sectionSizes: updatedSectionSizes,
            frontendOpId,
          },
        } as unknown as Parameters<typeof setSectionSizes<true>>[0]),
      ),
  });
}

export function getKeyboardActivationPoint(
  scene: WorkspaceScene,
  target: Extract<WorkspaceSceneTarget, { kind: "control" }>,
) {
  const row = findWorkspaceDictRow(scene, target);
  if (!row) {
    return { x: 0, y: 0 };
  }
  return workspaceToScreen(
    {
      x: row.controlRect.x + row.controlRect.width / 2,
      y: row.controlRect.y + row.controlRect.height / 2,
    },
    scene.viewport,
  );
}
