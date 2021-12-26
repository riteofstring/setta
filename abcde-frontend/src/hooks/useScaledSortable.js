import { useSortable } from "@dnd-kit/sortable";
import { getEventCoordinates, isKeyboardEvent } from "@dnd-kit/utilities";
import { useStoreState } from "easy-peasy";

export function useScaledSortable(props) {
  const mapScale = useStoreState((x) => x.mapInteraction.currScaleAdjusted);
  const output = useSortable(props);
  const { transform } = output;

  console.log("mapScale", mapScale);

  //   if (output.activatorEvent){
  // console.log("output.activatorEvent.screenY", output.activatorEvent.screenY)
  //   }
  //   console.log("output", output);

  if (output.isDragging && mapScale !== 1 && transform) {
    // transform.x /= mapScale;
    transform.y /= mapScale
  }
  //   if(transform){
  //     console.log("transform.y", transform.y)
  //   }

  return output;
}
