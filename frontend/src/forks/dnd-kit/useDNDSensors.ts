import {
  KeyboardSensor,
  PointerActivationConstraints,
  PointerSensor,
} from "@dnd-kit/dom";
import { useMemo } from "react";
import { useMisc } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";

type DndSource = {
  readonly data?: {
    readonly current?: {
      readonly type?: string;
    };
  };
};

function getDragType(source: DndSource): string | null {
  return source.data?.current?.type ?? null;
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
