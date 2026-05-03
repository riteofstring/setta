import {
  hitTestGpuRetainedContentInteraction,
  shouldPreserveGpuRetainedContentNativeTarget,
  type GpuRetainedContentInteractionHit,
} from "gpuFlow/interactions/retainedContentInteraction";
import {
  getGpuRetainedContentChoicePopupKeyboardCommand,
  getGpuRetainedContentChoicePopupWheelCommand,
  resolveGpuRetainedContentChoicePopupKeyboard,
} from "gpuFlow/retainedContentPopupKeyboard";
import type { GpuFlowScene } from "gpuFlow/scene";
import { useEffect, useRef, type RefObject } from "react";

import type { ProjectGpuActiveParamCanvasPopup } from "./projectGpuLayoutAdapter";
import { commitProjectGpuRetainedColorChoiceValue } from "./projectGpuRetainedParamColorPickerAdapter";
import { commitProjectGpuRetainedDropdownChoiceValue } from "./projectGpuRetainedParamDropdownAdapter";

type ProjectGpuActiveParamCanvasPopupKeyboardResult =
  | { readonly handled: false }
  | {
      readonly action: "highlight";
      readonly handled: true;
      readonly popup: ProjectGpuActiveParamCanvasPopup;
    }
  | {
      readonly action: "commit";
      readonly handled: true;
      readonly optionValue: string;
      readonly popup: ProjectGpuActiveParamCanvasPopup;
    };

type ProjectGpuActiveParamCanvasPopupTypeaheadState = {
  query: string;
  updatedAtMs: number;
};

const PROJECT_GPU_CANVAS_POPUP_TYPEAHEAD_RESET_MS = 700;

export function useProjectGpuActiveParamCanvasPopupKeyboard<
  RootElement extends HTMLElement,
>({
  activeParamCanvasPopup,
  onActiveParamCanvasPopupChange,
  rootRef,
  scene,
}: {
  readonly activeParamCanvasPopup: ProjectGpuActiveParamCanvasPopup | null;
  readonly onActiveParamCanvasPopupChange: (
    popup: ProjectGpuActiveParamCanvasPopup | null,
  ) => void;
  readonly rootRef: RefObject<RootElement | null>;
  readonly scene: GpuFlowScene;
}) {
  const typeaheadStateRef =
    useRef<ProjectGpuActiveParamCanvasPopupTypeaheadState>({
      query: "",
      updatedAtMs: 0,
    });

  useEffect(() => {
    if (!isProjectGpuChoiceCanvasPopup(activeParamCanvasPopup)) {
      typeaheadStateRef.current = { query: "", updatedAtMs: 0 };
      return;
    }
    const ownerDocument = rootRef.current?.ownerDocument ?? document;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (shouldSkipProjectGpuActiveParamCanvasPopupKeyDown(event)) {
        return;
      }
      const typeaheadQuery = getProjectGpuCanvasPopupTypeaheadQuery(
        event,
        typeaheadStateRef.current,
      );
      const result = resolveProjectGpuActiveParamCanvasPopupKeyboard({
        activeParamCanvasPopup,
        event,
        scene,
        typeaheadQuery,
      });
      if (!result.handled) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      if (result.action === "commit") {
        commitProjectGpuActiveParamCanvasPopupKeyboardResult(result);
        onActiveParamCanvasPopupChange(null);
        typeaheadStateRef.current = { query: "", updatedAtMs: 0 };
        return;
      }
      onActiveParamCanvasPopupChange(result.popup);
    };
    ownerDocument.addEventListener("keydown", handleKeyDown, true);
    return () => {
      ownerDocument.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [activeParamCanvasPopup, onActiveParamCanvasPopupChange, rootRef, scene]);
}

export function useProjectGpuActiveParamCanvasPopupWheel<
  RootElement extends HTMLElement,
>({
  activeParamCanvasPopup,
  onActiveParamCanvasPopupChange,
  rootRef,
  scene,
}: {
  readonly activeParamCanvasPopup: ProjectGpuActiveParamCanvasPopup | null;
  readonly onActiveParamCanvasPopupChange: (
    popup: ProjectGpuActiveParamCanvasPopup | null,
  ) => void;
  readonly rootRef: RefObject<RootElement | null>;
  readonly scene: GpuFlowScene;
}) {
  useEffect(() => {
    if (!isProjectGpuChoiceCanvasPopup(activeParamCanvasPopup)) {
      return;
    }
    const ownerDocument = rootRef.current?.ownerDocument ?? document;
    const handleWheel = (event: WheelEvent) => {
      if (shouldSkipProjectGpuActiveParamCanvasPopupWheel(event)) {
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
      if (!isProjectGpuChoiceCanvasPopupWheelHit(activeParamCanvasPopup, hit)) {
        return;
      }
      const result = resolveProjectGpuActiveParamCanvasPopupWheel({
        activeParamCanvasPopup,
        event,
        scene,
      });
      if (!result.handled) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      onActiveParamCanvasPopupChange(result.popup);
    };
    ownerDocument.addEventListener("wheel", handleWheel, {
      capture: true,
      passive: false,
    });
    return () => {
      ownerDocument.removeEventListener("wheel", handleWheel, true);
    };
  }, [activeParamCanvasPopup, onActiveParamCanvasPopupChange, rootRef, scene]);
}

export function resolveProjectGpuActiveParamCanvasPopupKeyboard({
  activeParamCanvasPopup,
  event,
  scene,
  typeaheadQuery = "",
}: {
  readonly activeParamCanvasPopup: ProjectGpuActiveParamCanvasPopup | null;
  readonly event: Pick<KeyboardEvent, "key">;
  readonly scene: GpuFlowScene;
  readonly typeaheadQuery?: string | undefined;
}): ProjectGpuActiveParamCanvasPopupKeyboardResult {
  if (!isProjectGpuChoiceCanvasPopup(activeParamCanvasPopup)) {
    return { handled: false };
  }
  const command = getGpuRetainedContentChoicePopupKeyboardCommand(
    event,
    typeaheadQuery,
  );
  if (!command) {
    return { handled: false };
  }
  const result = resolveGpuRetainedContentChoicePopupKeyboard({
    command,
    scene,
    target: {
      highlightedOptionIndex: activeParamCanvasPopup.highlightedOptionIndex,
      kind: activeParamCanvasPopup.kind,
      ownerRowId: activeParamCanvasPopup.paramInfoId,
      surfaceId: activeParamCanvasPopup.surfaceId,
    },
  });
  if (!result.handled) {
    return { handled: false };
  }
  const popup = {
    ...activeParamCanvasPopup,
    highlightedOptionIndex: result.target.highlightedOptionIndex,
  };
  if (result.action === "commit") {
    return {
      action: "commit",
      handled: true,
      optionValue: result.optionValue,
      popup,
    };
  }
  return {
    action: "highlight",
    handled: true,
    popup,
  };
}

export function resolveProjectGpuActiveParamCanvasPopupWheel({
  activeParamCanvasPopup,
  event,
  scene,
}: {
  readonly activeParamCanvasPopup: ProjectGpuActiveParamCanvasPopup | null;
  readonly event: Pick<WheelEvent, "deltaX" | "deltaY">;
  readonly scene: GpuFlowScene;
}): ProjectGpuActiveParamCanvasPopupKeyboardResult {
  if (!isProjectGpuChoiceCanvasPopup(activeParamCanvasPopup)) {
    return { handled: false };
  }
  const command = getGpuRetainedContentChoicePopupWheelCommand(event);
  if (!command) {
    return { handled: false };
  }
  const result = resolveGpuRetainedContentChoicePopupKeyboard({
    command,
    scene,
    target: {
      highlightedOptionIndex: activeParamCanvasPopup.highlightedOptionIndex,
      kind: activeParamCanvasPopup.kind,
      ownerRowId: activeParamCanvasPopup.paramInfoId,
      surfaceId: activeParamCanvasPopup.surfaceId,
    },
  });
  if (!result.handled || result.action !== "highlight") {
    return { handled: false };
  }
  return {
    action: "highlight",
    handled: true,
    popup: {
      ...activeParamCanvasPopup,
      highlightedOptionIndex: result.target.highlightedOptionIndex,
    },
  };
}

function commitProjectGpuActiveParamCanvasPopupKeyboardResult(
  result: Extract<
    ProjectGpuActiveParamCanvasPopupKeyboardResult,
    { action: "commit" }
  >,
) {
  if (result.popup.kind === "color-picker") {
    commitProjectGpuRetainedColorChoiceValue({
      nextColor: result.optionValue,
      paramInfoId: result.popup.paramInfoId,
      sectionId: result.popup.sectionId,
    });
    return;
  }
  if (result.popup.kind === "dropdown") {
    commitProjectGpuRetainedDropdownChoiceValue({
      nextValue: result.optionValue,
      paramInfoId: result.popup.paramInfoId,
      sectionId: result.popup.sectionId,
    });
    return;
  }
  throw new Error(
    `Unsupported GPU retained canvas popup keyboard commit kind ${result.popup.kind}.`,
  );
}

function getProjectGpuCanvasPopupTypeaheadQuery(
  event: KeyboardEvent,
  state: ProjectGpuActiveParamCanvasPopupTypeaheadState,
): string {
  if (!isProjectGpuCanvasPopupTypeaheadKey(event)) {
    return "";
  }
  const now = event.timeStamp || Date.now();
  const key = event.key.toLocaleLowerCase();
  const previousQuery =
    now - state.updatedAtMs <= PROJECT_GPU_CANVAS_POPUP_TYPEAHEAD_RESET_MS
      ? state.query
      : "";
  const nextQuery = normalizeProjectGpuCanvasPopupTypeaheadQuery(
    previousQuery + key,
    key,
  );
  state.query = nextQuery;
  state.updatedAtMs = now;
  return nextQuery;
}

function normalizeProjectGpuCanvasPopupTypeaheadQuery(
  query: string,
  key: string,
): string {
  return query.split("").every((char) => char === key) ? key : query;
}

function isProjectGpuCanvasPopupTypeaheadKey(
  event: Pick<KeyboardEvent, "key">,
): boolean {
  return event.key.length === 1 && event.key !== " ";
}

function shouldSkipProjectGpuActiveParamCanvasPopupKeyDown(
  event: KeyboardEvent,
): boolean {
  return (
    event.defaultPrevented ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    shouldPreserveGpuRetainedContentNativeTarget(event)
  );
}

function shouldSkipProjectGpuActiveParamCanvasPopupWheel(
  event: WheelEvent,
): boolean {
  return (
    event.defaultPrevented ||
    event.ctrlKey ||
    shouldPreserveGpuRetainedContentNativeTarget(event)
  );
}

function isProjectGpuChoiceCanvasPopupWheelHit(
  popup: ProjectGpuActiveParamCanvasPopup,
  hit: GpuRetainedContentInteractionHit | null,
): boolean {
  return Boolean(
    hit &&
      hit.surfaceId === popup.surfaceId &&
      hit.ownerSectionId === popup.sectionId &&
      hit.hit.ownerRowId === popup.paramInfoId &&
      (hit.hit.kind === "popup-background" || hit.hit.kind === "popup-option"),
  );
}

function isProjectGpuChoiceCanvasPopup(
  popup: ProjectGpuActiveParamCanvasPopup | null,
): popup is Extract<
  ProjectGpuActiveParamCanvasPopup,
  { kind: "color-picker" | "dropdown" }
> {
  return popup?.kind === "color-picker" || popup?.kind === "dropdown";
}
