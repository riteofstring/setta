import { IoLinkSharp } from "react-icons/io5";

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
      icon={<IoLinkSharp />}
      color="text-runcoder-300"
      bg="bg-transparent p-1 transition-colors duration-150 hover:bg-runcoder-100 focus-visible:ring-2 dark:text-runcoder-400/50 dark:hover:bg-runcoder-900 dark:hover:text-runcoder-300"
      onClick={onClick}
    />
  );
}

// bg-transparent p-1 text-runcoder-300 transition-colors duration-150 hover:bg-runcoder-100 focus-visible:ring-2 dark:text-runcoder-600 dark:hover:bg-runcoder-900 dark:hover:text-runcoder-300

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
