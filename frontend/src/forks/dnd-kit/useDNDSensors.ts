import {
  KeyboardSensor,
  PointerActivationConstraints,
  PointerSensor,
} from "@dnd-kit/dom";
import { useMemo } from "react";
import { useMisc } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import {
  type DndSource,
  getSectionDndActivatorElements,
  shouldPreventSectionDndActivation,
} from "./dndSensorActivation";
import { useDndState } from "./dndState";

function getDragType(source: DndSource): string | null {
  return source.data?.current?.type ?? null;
}

export function useSectionDndSensors() {
  const { canEditLayout } = useShareCapabilities();
  return useMemo(() => {
    if (!canEditLayout) {
      return [];
    }

    const pointerSensor = PointerSensor.configure({
      activatorElements: getSectionDndActivatorElements,
      preventActivation: (event, source: DndSource) => {
        return shouldPreventSectionDndActivation(
          event,
          source,
          useDndState.getState(),
        );
      },
    });

    const keyboardSensor = KeyboardSensor.configure({
      preventActivation: (event, source: DndSource) => {
        return shouldPreventSectionDndActivation(
          event,
          source,
          useDndState.getState(),
        );
      },
    });

    return [pointerSensor, keyboardSensor];
  }, [canEditLayout]);
}

export function useParamDndSensors() {
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
