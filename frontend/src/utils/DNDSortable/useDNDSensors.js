import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@alissavrk/dnd-kit-core";
import { sortableKeyboardCoordinates } from "@alissavrk/dnd-kit-sortable";

export function useDNDSensors() {
  return useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
}
