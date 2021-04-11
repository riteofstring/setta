import { useContext } from "react";
import { MenuContext } from "../SectionFooter";

import SaveLoadModal from "../../../../../../utils/FileExplorer/SaveLoadModal";
import ParamSweepModal from "./ParamSweepModal/ParamSweepModal";
import UITypesModal from "./UITypesModal/UITypesModal";

const foldersAndFiles = { folder1: ["apple", "bear"] };

export default function GearModal() {
  const { modalSelect, onClose, isOpen } = useContext(MenuContext);
  switch (modalSelect) {
    case "LOAD":
    case "SAVE":
      return (
        <SaveLoadModal
          onClose={onClose}
          isOpen={isOpen}
          buttonText={modalSelect}
          foldersAndFiles={foldersAndFiles}
        />
      );
    case "PARAM_SWEEP":
      return <ParamSweepModal />;
    case "UI_TYPES":
      return <UITypesModal />;
    default:
      return null;
  }
}
