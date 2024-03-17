import { MeasuringFrequency } from "utils/DNDSortable/CustomCore";
import { useIsDraggingFreely } from "utils/DNDSortable/useDndUtils";

export function useMeasuring() {
  const isDraggingFreely = useIsDraggingFreely();
  const frequency = isDraggingFreely ? 200 : MeasuringFrequency.Optimized;
  return {
    droppable: { frequency },
  };
}
