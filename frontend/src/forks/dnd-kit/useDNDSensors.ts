import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "forks/dnd-kit/CustomCore";
import { sortableKeyboardCoordinates } from "forks/dnd-kit/CustomSortable";
import { useShareSession } from "state/definitions";

export function useDNDSensors() {
  const allowLayoutChanges = useShareSession(
    (x) => x.sharePolicy?.allowLayoutChanges ?? true,
  );
  const pointerSensor = useSensor(PointerSensor);
  const keyboardSensor = useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  });
  if (!allowLayoutChanges) {
    return useSensors();
  }
  return useSensors(pointerSensor, keyboardSensor);
}
