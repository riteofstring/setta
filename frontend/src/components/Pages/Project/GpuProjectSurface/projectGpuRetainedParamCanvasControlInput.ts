import {
  hitTestGpuRetainedContentInteraction,
  shouldPreserveGpuRetainedContentNativeTarget,
  type GpuRetainedContentInteractionHit,
} from "gpuFlow/interactions/retainedContentInteraction";
import {
  getGpuRetainedContentRangedControlKeyboardCommand,
  getGpuRetainedContentRangedControlWheelCommand,
  isGpuRetainedContentButtonKeyboardCommit,
  isGpuRetainedContentSwitchKeyboardToggle,
} from "gpuFlow/retainedContentControls";
import type {
  GpuRetainedContentControlDescriptor,
  GpuRetainedContentRow,
} from "gpuFlow/retainedContentScene";
import type { GpuFlowScene } from "gpuFlow/scene";
import { useEffect, type RefObject } from "react";

import type { ProjectGpuRetainedParamTarget } from "./projectGpuLayoutAdapter";
import { commitProjectGpuRetainedButtonParamClick } from "./projectGpuRetainedParamButtonAdapter";
import { commitProjectGpuRetainedRangedParamCommandValue } from "./projectGpuRetainedParamRangedControlAdapter";
import { commitProjectGpuRetainedSwitchParamClick } from "./projectGpuRetainedParamSwitchAdapter";

type ProjectGpuRetainedCanvasControlContext = {
  readonly control: GpuRetainedContentControlDescriptor;
  readonly ownerSectionId: string;
  readonly paramInfoId: string;
  readonly row: GpuRetainedContentRow;
};

export function useProjectGpuRetainedParamCanvasControlKeyboard<
  RootElement extends HTMLElement,
>({
  activeParamCanvasControl,
  disabled,
  rootRef,
  scene,
}: {
  readonly activeParamCanvasControl: ProjectGpuRetainedParamTarget | null;
  readonly disabled?: (() => boolean) | undefined;
  readonly rootRef: RefObject<RootElement | null>;
  readonly scene: GpuFlowScene;
}) {
  useEffect(() => {
    if (!activeParamCanvasControl) {
      return;
    }
    const ownerDocument = rootRef.current?.ownerDocument ?? document;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (shouldSkipProjectGpuRetainedCanvasControlKeyDown(event, disabled)) {
        return;
      }
      if (
        !handleProjectGpuRetainedParamCanvasControlKeyDown({
          activeParamCanvasControl,
          event,
          scene,
        })
      ) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    ownerDocument.addEventListener("keydown", handleKeyDown, true);
    return () => {
      ownerDocument.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [activeParamCanvasControl, disabled, rootRef, scene]);
}

export function useProjectGpuRetainedParamCanvasControlWheel<
  RootElement extends HTMLElement,
>({
  disabled,
  onActiveParamCanvasControlChange,
  rootRef,
  scene,
}: {
  readonly disabled?: (() => boolean) | undefined;
  readonly onActiveParamCanvasControlChange:
    | ((target: ProjectGpuRetainedParamTarget | null) => void)
    | undefined;
  readonly rootRef: RefObject<RootElement | null>;
  readonly scene: GpuFlowScene;
}) {
  useEffect(() => {
    const ownerDocument = rootRef.current?.ownerDocument ?? document;
    const handleWheel = (event: WheelEvent) => {
      if (shouldSkipProjectGpuRetainedCanvasControlWheel(event, disabled)) {
        return;
      }
      const root = rootRef.current;
      if (!root) {
        return;
      }
      const hit = hitTestGpuRetainedContentInteraction({
        element: root,
        event,
        getScene: () => scene,
      });
      if (
        !handleProjectGpuRetainedParamCanvasControlWheel({
          event,
          hit,
          onActiveParamCanvasControlChange,
        })
      ) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    ownerDocument.addEventListener("wheel", handleWheel, {
      capture: true,
      passive: false,
    });
    return () => {
      ownerDocument.removeEventListener("wheel", handleWheel, true);
    };
  }, [disabled, onActiveParamCanvasControlChange, rootRef, scene]);
}

export function handleProjectGpuRetainedParamCanvasControlKeyDown({
  activeParamCanvasControl,
  event,
  scene,
}: {
  readonly activeParamCanvasControl: ProjectGpuRetainedParamTarget | null;
  readonly event: Pick<KeyboardEvent, "code" | "key">;
  readonly scene: GpuFlowScene;
}): boolean {
  const context = getProjectGpuRetainedCanvasControlContextFromTarget({
    scene,
    target: activeParamCanvasControl,
  });
  if (!context || context.row.state.disabled) {
    return false;
  }
  if (
    commitProjectGpuRetainedImmediateControlKeyDown({
      context,
      event,
    })
  ) {
    return true;
  }
  const command = getGpuRetainedContentRangedControlKeyboardCommand(event);
  if (
    !command ||
    (context.control.kind !== "slider" && context.control.kind !== "rotary")
  ) {
    return false;
  }
  return commitProjectGpuRetainedRangedParamCommandValue({
    command,
    control: context.control,
    paramInfoId: context.paramInfoId,
    sectionId: context.ownerSectionId,
  });
}

export function handleProjectGpuRetainedParamCanvasControlWheel({
  event,
  hit,
  onActiveParamCanvasControlChange,
}: {
  readonly event: Pick<WheelEvent, "deltaX" | "deltaY">;
  readonly hit: GpuRetainedContentInteractionHit | null;
  readonly onActiveParamCanvasControlChange?:
    | ((target: ProjectGpuRetainedParamTarget | null) => void)
    | undefined;
}): boolean {
  if (!hit) {
    return false;
  }
  const context = getProjectGpuRetainedCanvasControlContextFromHit(hit);
  if (
    !context ||
    context.row.state.disabled ||
    (context.control.kind !== "slider" && context.control.kind !== "rotary")
  ) {
    return false;
  }
  const command = getGpuRetainedContentRangedControlWheelCommand(event);
  if (!command) {
    return false;
  }
  if (
    !commitProjectGpuRetainedRangedParamCommandValue({
      command,
      control: context.control,
      paramInfoId: context.paramInfoId,
      sectionId: context.ownerSectionId,
    })
  ) {
    return false;
  }
  onActiveParamCanvasControlChange?.(toProjectGpuRetainedParamTarget(hit));
  return true;
}

export function toProjectGpuRetainedCanvasControlTarget(
  event: GpuRetainedContentInteractionHit,
): ProjectGpuRetainedParamTarget | null {
  const context = getProjectGpuRetainedCanvasControlContextFromHit(event);
  return context ? toProjectGpuRetainedParamTarget(event) : null;
}

function commitProjectGpuRetainedImmediateControlKeyDown({
  context,
  event,
}: {
  readonly context: ProjectGpuRetainedCanvasControlContext;
  readonly event: Pick<KeyboardEvent, "code" | "key">;
}): boolean {
  if (
    context.control.kind === "switch" &&
    isGpuRetainedContentSwitchKeyboardToggle(event)
  ) {
    commitProjectGpuRetainedSwitchParamClick({
      checked: context.control.checked,
      paramInfoId: context.paramInfoId,
      sectionId: context.ownerSectionId,
    });
    return true;
  }
  if (
    context.control.kind === "button" &&
    isGpuRetainedContentButtonKeyboardCommit(event)
  ) {
    commitProjectGpuRetainedButtonParamClick({
      paramInfoId: context.paramInfoId,
      sectionId: context.ownerSectionId,
    });
    return true;
  }
  return false;
}

function getProjectGpuRetainedCanvasControlContextFromTarget({
  scene,
  target,
}: {
  readonly scene: GpuFlowScene;
  readonly target: ProjectGpuRetainedParamTarget | null;
}): ProjectGpuRetainedCanvasControlContext | null {
  if (!target) {
    return null;
  }
  const surface = scene.contentSurfaces.find(
    (candidate) =>
      candidate.id === target.surfaceId &&
      candidate.ownerSectionId === target.sectionId,
  );
  if (
    !surface ||
    surface.renderer.kind !== "canvas-content" ||
    !surface.retainedScene
  ) {
    return null;
  }
  const hit = surface.retainedScene.hitRecords.find(
    (candidate) =>
      candidate.id === target.hitRecordId &&
      candidate.kind === "control" &&
      candidate.ownerRowId === target.paramInfoId,
  );
  if (!hit) {
    return null;
  }
  return getProjectGpuRetainedCanvasControlContextFromHit({
    flowPoint: { x: hit.rect.x, y: hit.rect.y },
    hit,
    localPoint: { x: hit.rect.x, y: hit.rect.y },
    ownerSectionId: surface.ownerSectionId,
    retainedScene: surface.retainedScene,
    screenPoint: { x: 0, y: 0 },
    surfaceId: surface.id,
    zIndex: surface.zIndex,
  });
}

function getProjectGpuRetainedCanvasControlContextFromHit(
  hit: GpuRetainedContentInteractionHit | null,
): ProjectGpuRetainedCanvasControlContext | null {
  if (!hit || hit.hit.kind !== "control") {
    return null;
  }
  const row = hit.retainedScene.rows.find(
    (candidate) => candidate.id === hit.hit.ownerRowId,
  );
  if (!row?.control || row.control.commitPolicy === "native-island") {
    return null;
  }
  return {
    control: row.control,
    ownerSectionId: hit.ownerSectionId,
    paramInfoId: hit.hit.ownerRowId,
    row,
  };
}

function shouldSkipProjectGpuRetainedCanvasControlKeyDown(
  event: KeyboardEvent,
  disabled: (() => boolean) | undefined,
): boolean {
  return (
    event.defaultPrevented ||
    hasProjectGpuRetainedCanvasControlKeyboardModifier(event) ||
    Boolean(disabled?.()) ||
    shouldPreserveGpuRetainedContentNativeTarget(event)
  );
}

function shouldSkipProjectGpuRetainedCanvasControlWheel(
  event: WheelEvent,
  disabled: (() => boolean) | undefined,
): boolean {
  return (
    event.defaultPrevented ||
    hasProjectGpuRetainedCanvasControlWheelModifier(event) ||
    Boolean(disabled?.()) ||
    shouldPreserveGpuRetainedContentNativeTarget(event)
  );
}

function hasProjectGpuRetainedCanvasControlKeyboardModifier(
  event: Pick<KeyboardEvent, "altKey" | "ctrlKey" | "metaKey" | "shiftKey">,
): boolean {
  return event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
}

function hasProjectGpuRetainedCanvasControlWheelModifier(
  event: Pick<WheelEvent, "altKey" | "ctrlKey" | "metaKey" | "shiftKey">,
): boolean {
  return event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
}

function toProjectGpuRetainedParamTarget(
  event: GpuRetainedContentInteractionHit,
): ProjectGpuRetainedParamTarget {
  return {
    hitRecordId: event.hit.id,
    paramInfoId: event.hit.ownerRowId,
    sectionId: event.ownerSectionId,
    surfaceId: event.surfaceId,
  };
}
