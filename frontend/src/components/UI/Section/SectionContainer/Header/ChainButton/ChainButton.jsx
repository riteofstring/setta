import { CiLink } from "react-icons/ci";
import { createSectionInfo } from "thunks/sections/createSectionInfo";
import { getSectionName } from "thunks/sections/getters";
import { IconButton } from "utils/atoms/buttons/IconButton";
import { REACT_FLOW_STORE } from "utils/constants";
import { newSectionPosition } from "z_utils/objs/sectionPosition";

export function ChainButton({ sectionId }) {
  function onClick() {
    addDerivedSection(sectionId);
  }

  return (
    <IconButton
      icon={<CiLink />}
      color="text-slate-600 hover:text-white"
      bg="bg-transparent hover:bg-red-500"
      size="w-3 h-3"
      onClick={onClick}
    />
  );
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
