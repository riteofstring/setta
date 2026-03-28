import { MenuItem } from "./DropdownMenuItem";
import { getSectionInfo } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";

export function ClearValues({ sectionId }) {
  function onClick() {
    const { variantId } = getSectionInfo(sectionId);

    useProjectState.setState((x) => {
      for (const k of Object.keys(x.variants[variantId].values)) {
        x.variants[variantId].values[k] = createEVEntry();
      }
    });
  }

  return <MenuItem onClick={onClick}>Clear Values</MenuItem>;
}
