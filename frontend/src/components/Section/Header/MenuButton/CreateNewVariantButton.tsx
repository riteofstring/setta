import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { getCurrProjectConfigId } from "state/actions/sectionInfos";
import { route_create_new_section_variant } from "utils/generatedEndpoints";

export function CreateNewVariantButton({ sectionId }) {
  async function onClick() {
    route_create_new_section_variant({
      projectConfigId: getCurrProjectConfigId(),
      sectionId,
    });
  }

  return <MenuItem onClick={onClick}>New Variant</MenuItem>;
}
