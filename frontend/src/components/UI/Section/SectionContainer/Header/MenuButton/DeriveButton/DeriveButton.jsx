import { MenuItem } from "utils/atoms/menubar/menudropdownitem";
import { creatAdjacentSection } from "../utils";

export function DeriveButton({ sectionId }) {
  function onClick() {
    addDerivedSection(sectionId);
  }

  return <MenuItem onClick={onClick}>Derive</MenuItem>;
}

function addDerivedSection(sectionId) {
  creatAdjacentSection(sectionId, { chainedFrom: sectionId });
}
