import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "utils/DNDSortable/CustomCore";
import { sortableKeyboardCoordinates } from "utils/DNDSortable/CustomSortable";

export function useDNDSensors() {
  return useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
}
