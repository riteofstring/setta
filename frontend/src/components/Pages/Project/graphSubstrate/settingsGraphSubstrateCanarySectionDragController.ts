import { addNodes, moveNodes } from "state/actions/nodeInternals";
import { setZIndices } from "state/actions/sections/sectionPositions";
import { useNodeInternals } from "state/definitions";
import type { Position } from "utils/generatedTypes";
import {
  resolveSettingsGraphSubstrateCanarySectionDragEndPosition,
  resolveSettingsGraphSubstrateCanarySectionDragMovePosition,
  shouldIgnoreSettingsGraphSubstrateCanarySectionDragTarget,
  shouldStartSettingsGraphSubstrateCanarySectionDrag,
} from "./settingsGraphSubstrateCanaryInteractions";
import type { GraphSubstrateCanarySection } from "./settingsGraphSubstrateCanaryModel";
import type {
  SettingsGraphSubstrateCanarySceneSection,
  SettingsGraphSubstrateCanarySectionPositionOverride,
} from "./settingsGraphSubstrateCanarySceneSnapshot";
import type { GraphViewport } from "./viewportTransform";

type ActiveSectionDrag = {
  latestWorldPosition: Position | null;
  pointerId: number;
  sectionId: string;
  started: boolean;
  originScreenPoint: Position;
  originWorldPosition: Position;
};

type SettingsGraphSubstrateCanarySectionDragEffects = {
  beginSectionDrag: (
    section:
      | GraphSubstrateCanarySection
      | SettingsGraphSubstrateCanarySceneSection,
  ) => void;
  persistSectionDrag: (
    section:
      | GraphSubstrateCanarySection
      | SettingsGraphSubstrateCanarySceneSection,
    position: Position,
  ) => void;
  resetSectionTempZIndex: (sectionId: string) => void;
};

type SettingsGraphSubstrateCanarySectionDragPointerDownInput = {
  button: number;
  clientX: number;
  clientY: number;
  pointerId: number;
  section: SettingsGraphSubstrateCanarySceneSection;
  target: EventTarget | null;
};

type SettingsGraphSubstrateCanarySectionDragPointerMoveInput = {
  clientX: number;
  clientY: number;
  pointerId: number;
};

type SettingsGraphSubstrateCanarySectionDragFinishInput = {
  persistLayout: boolean;
  pointerId: number;
};

type SettingsGraphSubstrateCanarySectionDragSnapSettings = {
  snapGrid: [number, number];
  snapToGrid: boolean;
};

type SettingsGraphSubstrateCanarySectionDragControllerDependencies = {
  effects?: SettingsGraphSubstrateCanarySectionDragEffects;
  getNodeDragThreshold: () => number;
  getResolvedViewport: () => GraphViewport | null;
  getSectionById: (
    sectionId: string,
  ) =>
    | GraphSubstrateCanarySection
    | SettingsGraphSubstrateCanarySceneSection
    | undefined;
  getSnapSettings: () => SettingsGraphSubstrateCanarySectionDragSnapSettings;
  onDraggingSectionIdChange: (sectionId: string | null) => void;
  onSectionPositionOverrideChange: (
    override: SettingsGraphSubstrateCanarySectionPositionOverride,
  ) => void;
};

export type SettingsGraphSubstrateCanarySectionDragController = {
  cancelSectionDrag: () => void;
  cleanup: () => void;
  finishSectionDrag: (
    input: SettingsGraphSubstrateCanarySectionDragFinishInput,
  ) => boolean;
  handleSectionPointerDown: (
    input: SettingsGraphSubstrateCanarySectionDragPointerDownInput,
  ) => boolean;
  handleSectionPointerMove: (
    input: SettingsGraphSubstrateCanarySectionDragPointerMoveInput,
  ) => boolean;
};

export function createSettingsGraphSubstrateCanarySectionDragController({
  effects = defaultSettingsGraphSubstrateCanarySectionDragEffects,
  getNodeDragThreshold,
  getResolvedViewport,
  getSectionById,
  getSnapSettings,
  onDraggingSectionIdChange,
  onSectionPositionOverrideChange,
}: SettingsGraphSubstrateCanarySectionDragControllerDependencies): SettingsGraphSubstrateCanarySectionDragController {
  let activeDrag: ActiveSectionDrag | null = null;

  function clearLocalDragState() {
    activeDrag = null;
    onDraggingSectionIdChange(null);
    onSectionPositionOverrideChange(null);
  }

  function resetCurrentDrag() {
    const activeSectionId = activeDrag?.sectionId;
    const activeDragStarted = activeDrag?.started === true;
    clearLocalDragState();
    if (activeDragStarted && activeSectionId) {
      effects.resetSectionTempZIndex(activeSectionId);
    }
  }

  return {
    cancelSectionDrag() {
      resetCurrentDrag();
    },
    cleanup() {
      if (activeDrag?.started) {
        effects.resetSectionTempZIndex(activeDrag.sectionId);
      }
      activeDrag = null;
    },
    finishSectionDrag({ persistLayout, pointerId }) {
      if (!activeDrag || activeDrag.pointerId !== pointerId) {
        return false;
      }

      const completedDrag = activeDrag;
      clearLocalDragState();
      const draggedSection = getSectionById(completedDrag.sectionId);
      if (
        persistLayout &&
        completedDrag.started &&
        draggedSection &&
        completedDrag.latestWorldPosition
      ) {
        effects.persistSectionDrag(
          draggedSection,
          resolveSettingsGraphSubstrateCanarySectionDragEndPosition(
            completedDrag.latestWorldPosition,
            getSnapSettings(),
          ),
        );
      } else {
        effects.resetSectionTempZIndex(completedDrag.sectionId);
      }
      return true;
    },
    handleSectionPointerDown({
      button,
      clientX,
      clientY,
      pointerId,
      section,
      target,
    }) {
      if (!getResolvedViewport() || section.positionAndSizeLocked) {
        return false;
      }
      if (button !== 0) {
        return false;
      }
      if (shouldIgnoreSettingsGraphSubstrateCanarySectionDragTarget(target)) {
        return false;
      }

      const nodeDragThreshold = getNodeDragThreshold();
      activeDrag = {
        latestWorldPosition:
          nodeDragThreshold === 0 ? section.renderedPosition : null,
        pointerId,
        sectionId: section.sectionId,
        started: nodeDragThreshold === 0,
        originScreenPoint: {
          x: clientX,
          y: clientY,
        },
        originWorldPosition: section.renderedPosition,
      };
      if (nodeDragThreshold === 0) {
        effects.beginSectionDrag(section);
        onDraggingSectionIdChange(section.sectionId);
      }
      return true;
    },
    handleSectionPointerMove({ clientX, clientY, pointerId }) {
      const resolvedViewport = getResolvedViewport();
      if (
        !activeDrag ||
        !resolvedViewport ||
        activeDrag.pointerId !== pointerId
      ) {
        return false;
      }

      if (!activeDrag.started) {
        const currentScreenPoint = { x: clientX, y: clientY };
        if (
          !shouldStartSettingsGraphSubstrateCanarySectionDrag({
            currentScreenPoint,
            nodeDragThreshold: getNodeDragThreshold(),
            originScreenPoint: activeDrag.originScreenPoint,
          })
        ) {
          return false;
        }
        const section = getSectionById(activeDrag.sectionId);
        if (!section) {
          return false;
        }
        activeDrag.started = true;
        activeDrag.originScreenPoint = currentScreenPoint;
        activeDrag.latestWorldPosition = activeDrag.originWorldPosition;
        effects.beginSectionDrag(section);
        onDraggingSectionIdChange(section.sectionId);
        return true;
      }

      const nextPosition =
        resolveSettingsGraphSubstrateCanarySectionDragMovePosition({
          currentScreenPoint: { x: clientX, y: clientY },
          originScreenPoint: activeDrag.originScreenPoint,
          originWorldPosition: activeDrag.originWorldPosition,
          zoom: resolvedViewport.zoom,
        });
      activeDrag.latestWorldPosition = nextPosition;
      onSectionPositionOverrideChange({
        sectionId: activeDrag.sectionId,
        position: nextPosition,
      });
      return true;
    },
  };
}

export const defaultSettingsGraphSubstrateCanarySectionDragEffects: SettingsGraphSubstrateCanarySectionDragEffects =
  {
    beginSectionDrag(section) {
      ensureCanaryNode(section);
    },
    persistSectionDrag(section, position) {
      ensureCanaryNode({
        ...section,
        position,
      });
      moveNodes([
        {
          id: section.sectionId,
          position,
        },
      ]);
      setZIndices([section.sectionId], true);
    },
    resetSectionTempZIndex() {},
  };

function ensureCanaryNode(
  section:
    | GraphSubstrateCanarySection
    | SettingsGraphSubstrateCanarySceneSection,
) {
  if (useNodeInternals.getState().x.has(section.sectionId)) {
    return;
  }
  const width =
    "resolvedSize" in section ? section.resolvedSize?.width : section.width;
  const height =
    "resolvedSize" in section ? section.resolvedSize?.height : section.height;
  addNodes([
    {
      id: section.sectionId,
      position: section.position,
      width,
      height,
      zIndex: section.zIndex,
      tempZIndex: section.zIndex,
    },
  ]);
}
