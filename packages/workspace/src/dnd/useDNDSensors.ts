import {
  KeyboardSensor,
  PointerActivationConstraints,
  PointerSensor,
} from "@dnd-kit/dom";
import { useMemo } from "react";
import {
  getWorkspaceCapabilitiesStore,
  useWorkspaceCapabilities,
} from "../document/capabilities.js";
import { getItemSelectionModeStore } from "../document/itemSelectionMode.js";
import { useWorkspaceHost } from "../workspaceHostContext.js";
import type { WorkspaceHost } from "../workspaceHost.js";
import { getDndStateStore } from "./dndState.js";
import { setItemDndState } from "./itemDndState.js";
import {
  getSelectionDragHandle,
  getSelectionDragPrimaryId,
} from "./selectionDragHandle.js";

type DndSource = {
  id: string | number;
  element?: Element;
  handle?: Element;
  data?: {
    current?: {
      type?: string;
      isTopLevel?: boolean;
      itemId?: string;
    };
  };
};

function getDragType(source: DndSource): string | null {
  return source.data?.current?.type ?? null;
}

function getIsTopLevel(source: DndSource): boolean {
  return Boolean(source.data?.current?.isTopLevel);
}

function startsOnHandle(
  event: Event,
  handle: string,
  owner: string,
  id: string | undefined,
) {
  const target = event.target;
  return (
    target instanceof Element &&
    Boolean(target.closest(handle)) &&
    target.closest(`[${owner}]`)?.getAttribute(owner) === id
  );
}

function preventSectionActivation(
  host: WorkspaceHost,
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
      preventActivation: (_event, source) =>
        preventSectionActivation(host, source as DndSource),
    });

    const keyboardSensor = KeyboardSensor.configure({
      preventActivation: (_event, source) =>
        preventSectionActivation(host, source as DndSource),
    });

    return [pointerSensor, keyboardSensor];
  }, [canEditLayout, host]);
}

function preventItemActivation(
  host: WorkspaceHost,
  event: Event,
  source: DndSource,
): boolean {
  if (getDragType(source) !== "item") {
    return true;
  }
  if (!getWorkspaceCapabilitiesStore(host).getState().canEditStructure)
    return true;
  if (getItemSelectionModeStore(host).getState().isSelectingItems) {
    setItemDndState(host, { isHandleDrag: false });
    return false;
  }
  const fromHandle = startsOnHandle(
    event,
    '[data-workspace-item-drag-handle="true"]',
    "data-workspace-item-id",
    source.data?.current?.itemId,
  );
  if (fromHandle) setItemDndState(host, { isHandleDrag: true });
  return !fromHandle;
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
