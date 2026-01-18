import {
  KeyboardSensor,
  PointerActivationConstraints,
  PointerSensor,
} from "@dnd-kit/dom";
import { useMemo } from "react";
import { useMisc } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { useDndState } from "./dndState";

export function useDNDSensors() {
  const { canEditLayout } = useShareCapabilities();
  return useMemo(() => {
    if (!canEditLayout) {
      return [];
    }

    const pointerSensor = PointerSensor.configure({
      activationConstraints: (_event, source) => {
        const type = (
          source.data as { current?: { type?: string } } | undefined
        )?.current?.type;
        if (type === "param") {
          return [
            new PointerActivationConstraints.Distance({
              value: 5,
            }),
          ];
        }
        return undefined;
      },
      preventActivation: (_event, source) => {
        const type = (
          source.data as { current?: { type?: string } } | undefined
        )?.current?.type;
        if (type === "param") {
          return !useMisc.getState().isSelectingParams;
        }
        const { isSorting, isMovingFree } = useDndState.getState();
        const isTopLevel = Boolean(
          (source.data as { current?: { isTopLevel?: boolean } } | undefined)
            ?.current?.isTopLevel,
        );

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
      preventActivation: (_event, source) => {
        const type = (
          source.data as { current?: { type?: string } } | undefined
        )?.current?.type;
        if (type === "param") {
          return !useMisc.getState().isSelectingParams;
        }
        const { isSorting, isMovingFree } = useDndState.getState();
        const isTopLevel = Boolean(
          (source.data as { current?: { isTopLevel?: boolean } } | undefined)
            ?.current?.isTopLevel,
        );

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
