import { MeasuringFrequency } from "@dnd-kit/core";
import { useDndState } from "models/info/dndState";
import { useKeyActivations } from "models/keyActivations";

export function useMeasuring() {
  const isMovingFree = useKeyActivations((x) => x.isMovingFree);
  const nestedTransitionComplete = useDndState(
    (x) => x.nestedTransitionComplete
  );
  const frequency =
    isMovingFree && !nestedTransitionComplete
      ? 100
      : MeasuringFrequency.Optimized;

  return {
    droppable: { frequency },
  };
}
