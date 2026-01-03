import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "forks/dnd-kit/CustomCore";
import { sortableKeyboardCoordinates } from "forks/dnd-kit/CustomSortable";
import { useSharePolicyFlag } from "state/hooks/share";

export function useDNDSensors() {
  const allowLayoutChanges = useSharePolicyFlag("allowLayoutChanges");
  const pointerSensor = useSensor(PointerSensor);
  const keyboardSensor = useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  });
  if (!allowLayoutChanges) {
    return useSensors();
  }
  return useSensors(pointerSensor, keyboardSensor);
}
