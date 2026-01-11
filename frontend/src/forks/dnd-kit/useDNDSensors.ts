import { KeyboardSensor, PointerSensor } from "@dnd-kit/dom";
import { useDndState } from "./dndState";
import { useShareCapabilities } from "state/hooks/share";

export function useDNDSensors() {
  const { canEditLayout } = useShareCapabilities();
  if (!canEditLayout) {
    return [];
  }

  const pointerSensor = PointerSensor.configure({
    activationConstraints: () => undefined,
    preventActivation: (_event, source) => {
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
}
