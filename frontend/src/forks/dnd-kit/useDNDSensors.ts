import {
  KeyboardSensor,
  PointerActivationConstraints,
  PointerSensor,
} from "@dnd-kit/dom";
import { useMemo } from "react";
import { useMisc } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { useDndState } from "./dndState";
import {
  selectionDragHandle,
  selectionDragPrimaryId,
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

export function useSectionDndSensors() {
  const { canEditLayout } = useShareCapabilities();
  return useMemo(() => {
    if (!canEditLayout) {
      return [];
    }

    const pointerSensor = PointerSensor.configure({
      activatorElements: (source: DndSource) => {
        const baseTarget = source.handle ?? source.element;
        const handleElement = selectionDragHandle.value;
        const primaryId = selectionDragPrimaryId.value;
        if (
          handleElement &&
          primaryId &&
          String(source.id) === String(primaryId)
        ) {
          return [baseTarget, handleElement];
        }
        return [baseTarget];
      },
      preventActivation: (_event, source: DndSource) => {
        const { isSorting, isMovingFree } = useDndState.getState();
        const isTopLevel = getIsTopLevel(source);

        if (isMovingFree) {
          return false;
        }

        if (isSorting && !isTopLevel) {
          return false;
        }

        return true;
      },
    });

    const keyboardSensor = KeyboardSensor.configure({
      preventActivation: (_event, source: DndSource) => {
        const { isSorting, isMovingFree } = useDndState.getState();
        const isTopLevel = getIsTopLevel(source);

        if (isMovingFree) {
          return false;
        }

        if (isSorting && !isTopLevel) {
          return false;
        }

        return true;
      },
    });

    return [pointerSensor, keyboardSensor];
  }, [canEditLayout]);
}

function useParamDndSensors() {
  const { canEditStructure } = useShareCapabilities();
  const isSelectingParams = useMisc((state) => state.isSelectingParams);
  return useMemo(() => {
    if (!canEditStructure || !isSelectingParams) {
      return [];
    }

    // Only activate for param drags so nested providers don't capture sections.
    const pointerSensor = PointerSensor.configure({
      activationConstraints: (_event, source: DndSource) => {
        const type = getDragType(source);
        if (type !== "param") {
          return undefined;
        }

        return [
          new PointerActivationConstraints.Distance({
            value: 5,
          }),
        ];
      },
      preventActivation: (_event, source: DndSource) => {
        const type = getDragType(source);
        if (type !== "param") {
          return true;
        }

        return !useMisc.getState().isSelectingParams;
      },
    });

    const keyboardSensor = KeyboardSensor.configure({
      preventActivation: (_event, source: DndSource) => {
        const type = getDragType(source);
        if (type !== "param") {
          return true;
        }

        return !useMisc.getState().isSelectingParams;
      },
    });

    return [pointerSensor, keyboardSensor];
  }, [canEditStructure, isSelectingParams]);
}
