import { PointerSensor } from "@dnd-kit/dom";
import { useShareCapabilities } from "state/hooks/share";

export function useDNDSensors() {
  const { canEditLayout } = useShareCapabilities();
  if (!canEditLayout) {
    return [];
  }

  const pointerSensor = PointerSensor.configure({});

  return [pointerSensor];
}
