import { createSectionInfo } from "thunks/sections/createSectionInfo";
import { getSectionName } from "thunks/sections/getters";
import { MenuItem } from "utils/atoms/menubar/menudropdownitem";
import { REACT_FLOW_STORE } from "utils/constants";
import { newSectionPosition } from "z_utils/objs/sectionPosition";

export function DeriveButton({ sectionId }) {
  function onClick() {
    addDerivedSection(sectionId);
  }

  return <MenuItem onClick={onClick}>Derive</MenuItem>;
}

function addDerivedSection(sectionId) {
  const reactFlowStore = REACT_FLOW_STORE.store;
  const sectionName = getSectionName(sectionId);
  const { position: sectionPosition, width: sectionWidth } = reactFlowStore
    .getState()
    .nodeInternals.get(sectionId);

  const sectionProps = {
    name: `${sectionName}.Fn()`,
    chainedFrom: sectionId,
  };

  createSectionInfo({
    sectionProps,
    topLevelPosition: newSectionPosition({
      x: sectionPosition.x + sectionWidth,
      y: sectionPosition.y,
    }),
  });
}
