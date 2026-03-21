import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";

export function AddArtifactByFilepath({ sectionId }) {
  async function onClick() {
    openAddArtifactByFilepathModal(sectionId);
  }

  return <MenuItem onClick={onClick}>Add artifact by filepath</MenuItem>;
}
