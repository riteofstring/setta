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

  const target = event.target;
  return !(
    target instanceof Element &&
    target.closest('[data-meta-control-drag-handle="true"]') &&
    target.closest("[data-section-id]")?.getAttribute("data-section-id") ===
      String(source.id)
  );
}

export function useSectionDndSensors() {
  const host = useWorkspaceHost();
  const canEditLayout = useWorkspaceCapabilities((x) => x.canEditLayout);
  return useMemo(() => {
    if (!canEditLayout) {
      return [];
    }

    const pointerSensor = PointerSensor.configure({
      activationConstraints: (event, source) => {
        if (
          event.target instanceof Element &&
          event.target.closest('[data-meta-control-drag-handle="true"]')
        ) {
          return [new PointerActivationConstraints.Distance({ value: 5 })];
        }
        const constraints = PointerSensor.defaults.activationConstraints;
        return typeof constraints === "function"
          ? constraints(event, source)
          : constraints;
      },
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
  event: Event,
  source: DndSource,
): boolean {
  if (getDragType(source) !== "item") {
    return true;
  }
  if (!getWorkspaceCapabilitiesStore(host).getState().canEditStructure)
    return true;
  if (getItemSelectionModeStore(host).getState().isSelectingItems) return false;
  const target = event.target;
  return !(
    target instanceof Element &&
    target.closest('[data-workspace-item-drag-handle="true"]') &&
    target
      .closest("[data-workspace-item-id]")
      ?.getAttribute("data-workspace-item-id") === source.data?.current?.itemId
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
