import { MenuItem } from "./DropdownMenuItem";

export function AddArtifactByFilepath({ sectionId }) {
  async function onClick() {
    openAddArtifactByFilepathModal(sectionId);
  }

  return <MenuItem onClick={onClick}>Add artifact by filepath</MenuItem>;
}
