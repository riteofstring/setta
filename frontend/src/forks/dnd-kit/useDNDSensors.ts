import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "forks/dnd-kit/CustomCore";
import { sortableKeyboardCoordinates } from "forks/dnd-kit/CustomSortable";
import { useShareCapabilities } from "state/hooks/share";

export function useDNDSensors() {
  const { canEditLayout } = useShareCapabilities();
  const pointerSensor = useSensor(PointerSensor);
  const keyboardSensor = useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  });
  if (!canEditLayout) {
    return useSensors();
  }
  return useSensors(pointerSensor, keyboardSensor);
}
