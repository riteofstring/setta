import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { openAddImageByFilepathModal } from "state/actions/modal";

export function AddImageByFilepath({ sectionId }) {
  async function onClick() {
    openAddImageByFilepathModal(sectionId);
  }

  return <MenuItem onClick={onClick}>Add image by filepath</MenuItem>;
}
