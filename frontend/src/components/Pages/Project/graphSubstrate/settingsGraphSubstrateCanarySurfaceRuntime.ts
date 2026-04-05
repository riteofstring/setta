import {
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  type RefObject,
} from "react";
import { PanOnScrollModeEnum } from "utils/generatedTypes";
import { isMacOs } from "utils/utils";
import type { GraphSubstrateCanarySection } from "./settingsGraphSubstrateCanaryModel";
import {
  createSettingsGraphSubstrateCanaryPaneInteractionController,
  type SettingsGraphSubstrateCanaryPaneInteractionController,
} from "./settingsGraphSubstrateCanaryPaneInteractionController";
import { useSettingsGraphSubstrateCanarySceneRuntime } from "./settingsGraphSubstrateCanarySceneRuntime";
import type { SettingsGraphSubstrateCanarySceneSnapshot } from "./settingsGraphSubstrateCanarySceneSnapshot";
import { useSettingsGraphSubstrateCanarySceneState } from "./settingsGraphSubstrateCanarySceneState";
import {
  createSettingsGraphSubstrateCanarySectionDragController,
  type SettingsGraphSubstrateCanarySectionDragController,
} from "./settingsGraphSubstrateCanarySectionDragController";
import type { SettingsGraphSubstrateCanaryWheelBehavior } from "./settingsGraphSubstrateCanaryViewport";
import { useSettingsGraphSubstrateCanaryViewportRuntime } from "./settingsGraphSubstrateCanaryViewportRuntime";
import type { GraphViewport } from "./viewportTransform";

type SettingsGraphSubstrateCanarySurfaceRuntimeArgs = {
  defaultZoomLevel: number;
  maxZoom: number;
  minZoom: number;
  nodeDragThreshold: number;
  overviewTrueWidth: number;
  panOnScroll: boolean;
  panOnScrollMode: SettingsGraphSubstrateCanaryWheelBehavior["panOnScrollMode"];
  panOnScrollSpeed: number;
  rootRef: RefObject<HTMLDivElement | null>;
  sections: Array<GraphSubstrateCanarySection>;
  sharedProjectViewport: GraphViewport | null;
  snapGrid: [number, number];
  snapToGrid: boolean;
  uiEditorTrueWidth: number;
  zoomActivationKeyPressed: boolean;
  zoomOnPinch: boolean;
  zoomOnScroll: boolean;
};

export type SettingsGraphSubstrateCanarySurfaceRuntime = {
  draggingSectionId: string | null;
  finishPanePan: (event: ReactPointerEvent<HTMLDivElement>) => void;
  handlePanePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  handlePanePointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  handlePaneWheel: (event: ReactWheelEvent<HTMLDivElement>) => void;
  isViewportPanning: boolean;
  resolvedViewport: GraphViewport | null;
  sceneSnapshot: SettingsGraphSubstrateCanarySceneSnapshot;
  sectionDragController: SettingsGraphSubstrateCanarySectionDragController;
};

export function useSettingsGraphSubstrateCanarySurfaceRuntime({
  defaultZoomLevel,
  maxZoom,
  minZoom,
  nodeDragThreshold,
  overviewTrueWidth,
  panOnScroll,
  panOnScrollMode,
  panOnScrollSpeed,
  rootRef,
  sections,
  sharedProjectViewport,
  snapGrid,
  snapToGrid,
  uiEditorTrueWidth,
  zoomActivationKeyPressed,
  zoomOnPinch,
  zoomOnScroll,
}: SettingsGraphSubstrateCanarySurfaceRuntimeArgs): SettingsGraphSubstrateCanarySurfaceRuntime {
  const {
    draggingSectionId,
    sectionPositionOverride,
    setDraggingSectionId,
    setSectionPositionOverride,
  } = useSettingsGraphSubstrateCanarySceneState();
  const sceneSnapshot = useSettingsGraphSubstrateCanarySceneRuntime({
    draggingSectionId,
    sectionPositionOverride,
    sections,
  });
  const viewportRuntime = useSettingsGraphSubstrateCanaryViewportRuntime({
    defaultZoomLevel,
    maxZoom,
    minZoom,
    overviewTrueWidth,
    rootRef,
    sceneSnapshot,
    sharedProjectViewport,
    uiEditorTrueWidth,
  });
  const paneInteractionBehaviorRef = useRef({
    isMacOs: isMacOs(),
    maxZoom: 4,
    minZoom: 0.1,
    panOnScroll: false,
    panOnScrollMode: PanOnScrollModeEnum.free,
    panOnScrollSpeed: 0,
    zoomActivationKeyPressed: false,
    zoomOnPinch: false,
    zoomOnScroll: false,
  });
  const paneInteractionControllerRef =
    useRef<SettingsGraphSubstrateCanaryPaneInteractionController | null>(null);
  const sceneSectionsByIdRef = useRef(sceneSnapshot.sectionsById);
  sceneSectionsByIdRef.current = sceneSnapshot.sectionsById;
  const sectionDragBehaviorRef = useRef({
    nodeDragThreshold: 0,
    snapGrid,
    snapToGrid,
  });
  const sectionDragControllerRef =
    useRef<SettingsGraphSubstrateCanarySectionDragController | null>(null);

  useEffect(() => {
    return () => {
      sectionDragControllerRef.current?.cleanup();
      paneInteractionControllerRef.current?.cleanup();
    };
  }, []);

  paneInteractionBehaviorRef.current = {
    isMacOs: isMacOs(),
    maxZoom,
    minZoom,
    panOnScroll,
    panOnScrollMode,
    panOnScrollSpeed,
    zoomActivationKeyPressed,
    zoomOnPinch,
    zoomOnScroll,
  };
  sectionDragBehaviorRef.current = {
    nodeDragThreshold,
    snapGrid,
    snapToGrid,
  };

  if (paneInteractionControllerRef.current === null) {
    paneInteractionControllerRef.current =
      createSettingsGraphSubstrateCanaryPaneInteractionController({
        applyControlledViewportChange:
          viewportRuntime.applyControlledViewportChange,
        commitLocalViewport: viewportRuntime.commitLocalViewport,
        getResolvedViewport: viewportRuntime.getResolvedViewport,
        getRootBounds: viewportRuntime.getRootBounds,
        getWheelBehavior: () => paneInteractionBehaviorRef.current,
        onViewportPanningChange: viewportRuntime.onViewportPanningChange,
        syncViewportInteractionState:
          viewportRuntime.syncViewportInteractionState,
      });
  }

  if (sectionDragControllerRef.current === null) {
    sectionDragControllerRef.current =
      createSettingsGraphSubstrateCanarySectionDragController({
        getNodeDragThreshold: () =>
          sectionDragBehaviorRef.current.nodeDragThreshold,
        getResolvedViewport: viewportRuntime.getResolvedViewport,
        getSectionById: (sectionId) =>
          sceneSectionsByIdRef.current.get(sectionId),
        getSnapSettings: () => ({
          snapGrid: sectionDragBehaviorRef.current.snapGrid,
          snapToGrid: sectionDragBehaviorRef.current.snapToGrid,
        }),
        onDraggingSectionIdChange: setDraggingSectionId,
        onSectionPositionOverrideChange: setSectionPositionOverride,
      });
  }
  const sectionDragController = sectionDragControllerRef.current;
  const paneInteractionController = paneInteractionControllerRef.current;

  useEffect(() => {
    if (
      (draggingSectionId &&
        !sceneSnapshot.sectionsById.has(draggingSectionId)) ||
      (sectionPositionOverride &&
        !sceneSnapshot.sectionsById.has(sectionPositionOverride.sectionId)) ||
      sceneSnapshot.sections.length === 0
    ) {
      sectionDragController.cancelSectionDrag();
    }
  }, [
    draggingSectionId,
    sceneSnapshot.sections.length,
    sceneSnapshot.sectionsById,
    sectionDragController,
    sectionPositionOverride,
  ]);

  function handlePanePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (
      !paneInteractionController.handlePanePointerDown({
        button: event.button,
        clientX: event.clientX,
        clientY: event.clientY,
        pointerId: event.pointerId,
        target: event.target,
      })
    ) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePanePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (
      !paneInteractionController.handlePanePointerMove({
        clientX: event.clientX,
        clientY: event.clientY,
        pointerId: event.pointerId,
      })
    ) {
      return;
    }
    event.preventDefault();
  }

  function finishPanePan(event: ReactPointerEvent<HTMLDivElement>) {
    if (
      !paneInteractionController.finishPanePan({
        pointerId: event.pointerId,
      })
    ) {
      return;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handlePaneWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (
      !paneInteractionController.handlePaneWheel({
        clientX: event.clientX,
        clientY: event.clientY,
        ctrlKey: event.ctrlKey,
        deltaMode: event.deltaMode,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        shiftKey: event.shiftKey,
        target: event.target,
      })
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  return {
    draggingSectionId,
    finishPanePan,
    handlePanePointerDown,
    handlePanePointerMove,
    handlePaneWheel,
    isViewportPanning: viewportRuntime.isViewportPanning,
    resolvedViewport: viewportRuntime.resolvedViewport,
    sceneSnapshot,
    sectionDragController,
  };
}
