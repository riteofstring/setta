import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { maybeRunGuiToYaml } from "state/actions/guiToYaml";
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
    maybeRunGuiToYaml(sectionId, variantId);
  }

  return <MenuItem onClick={onClick}>Clear Values</MenuItem>;
}
