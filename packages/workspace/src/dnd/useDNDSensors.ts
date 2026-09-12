import {
  KeyboardSensor,
  PointerActivationConstraints,
  PointerSensor,
} from "@dnd-kit/dom";
import { useMemo } from "react";
import {
  getWorkspaceCapabilitiesStore,
  useWorkspaceCapabilities,
} from "../document/capabilities";
import { getItemSelectionModeStore } from "../document/itemSelectionMode";
import { NO_DRAG_CLASS_NAME } from "../interaction";
import { useWorkspaceHost } from "../workspaceHostContext";
import type { WorkspaceHost } from "../workspaceHost";
import { getDndStateStore } from "./dndState";
import {
  getSelectionDragHandle,
  getSelectionDragPrimaryId,
} from "./selectionDragHandle";

type DndSource = {
  id: string | number;
  element?: Element;
  handle?: Element;
  data?: {
    current?: {
      type?: string;
      isTopLevel?: boolean;
    };
  };
};

function getDragType(source: DndSource): string | null {
  return source.data?.current?.type ?? null;
}

function getIsTopLevel(source: DndSource): boolean {
  return Boolean(source.data?.current?.isTopLevel);
}

function eventTargetsNoDragElement(event: Event): boolean {
  const target = event.target;
  if (!(target instanceof Element)) {
    return false;
  }
  return target.closest(`.${NO_DRAG_CLASS_NAME}`) !== null;
}

function preventSectionActivation(
  host: WorkspaceHost,
  event: Event,
  source: DndSource,
): boolean {
  const { isSorting, isMovingFree } = getDndStateStore(host).getState();
  const isTopLevel = getIsTopLevel(source);
  if (isMovingFree) {
    return false;
  }

  if (isSorting && !isTopLevel) {
    return false;
  }

  if (eventTargetsNoDragElement(event)) {
    return true;
  }

  return true;
}

export function useSectionDndSensors() {
  const host = useWorkspaceHost();
  const canEditLayout = useWorkspaceCapabilities((x) => x.canEditLayout);
  return useMemo(() => {
    if (!canEditLayout) {
      return [];
    }

    const pointerSensor = PointerSensor.configure({
      activatorElements: (source: DndSource) => {
        const baseTarget = source.handle ?? source.element;
        const handleElement = getSelectionDragHandle(host).value;
        const primaryId = getSelectionDragPrimaryId(host).value;
        if (
          handleElement &&
          primaryId &&
          String(source.id) === String(primaryId)
        ) {
          return [baseTarget, handleElement];
        }
        return [baseTarget];
      },
      preventActivation: (event, source) =>
        preventSectionActivation(host, event, source as DndSource),
    });

    const keyboardSensor = KeyboardSensor.configure({
      preventActivation: (event, source) =>
        preventSectionActivation(host, event, source as DndSource),
    });

    return [pointerSensor, keyboardSensor];
  }, [canEditLayout, host]);
}

function preventItemActivation(
  host: WorkspaceHost,
  _event: Event,
  source: DndSource,
): boolean {
  if (getDragType(source) !== "item") {
    return true;
  }
  return (
    !getWorkspaceCapabilitiesStore(host).getState().canEditStructure ||
    !getItemSelectionModeStore(host).getState().isSelectingItems
  );
}

export function useItemDndSensors() {
  const host = useWorkspaceHost();
  return useMemo(() => {
    const pointerSensor = PointerSensor.configure({
      activationConstraints: (_event: Event, source: DndSource) => {
        if (getDragType(source) !== "item") {
          return undefined;
        }

        return [
          new PointerActivationConstraints.Distance({
            value: 5,
          }),
        ];
      },
      preventActivation: (event, source) =>
        preventItemActivation(host, event, source as DndSource),
    });

    const keyboardSensor = KeyboardSensor.configure({
      preventActivation: (event, source) =>
        preventItemActivation(host, event, source as DndSource),
    });

    return [pointerSensor, keyboardSensor];
  }, [host]);
}
