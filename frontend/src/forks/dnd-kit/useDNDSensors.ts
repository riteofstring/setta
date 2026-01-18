import {
  KeyboardSensor,
  PointerActivationConstraints,
  PointerSensor,
} from "@dnd-kit/dom";
import { useMemo } from "react";
import { useMisc } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { useDndState } from "./dndState";

type DndSource = {
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

export function useParamDndSensors() {
  const { canEditStructure } = useShareCapabilities();
  return useMemo(() => {
    if (!canEditStructure) {
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
  }, [canEditStructure]);
}
