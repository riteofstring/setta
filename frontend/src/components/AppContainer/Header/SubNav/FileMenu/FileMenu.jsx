import * as Menubar from "@radix-ui/react-menubar";
import { createAndGoToProject } from "hooks/useGetOrCreateProjects";
import { useSaveLoadProjectOnKeyActivation } from "hooks/useSaveProjectOnKeyActivation";
import { useModal } from "models/modal";
import { VscSave, VscSaveAs } from "react-icons/vsc";
import { saveProject } from "thunks/save";
import { DialogMenuBarTriggerItem } from "utils/atoms/dialog/dialogTriggerItem";
import { MenuDropdown } from "utils/atoms/menubar/menudropdown";

export function FileMenu() {
  const setModalType = useModal((x) => x.setModalType);

  async function openLoadModal() {
    setModalType("Load");
  }

  async function openSaveAsModal() {
    setModalType("Save As");
  }

  function openExportJSONModal() {
    setModalType("Export JSON");
  }

  function openExportFullJSONModal() {
    setModalType("Export Full JSON");
  }

  function openImportJSONModal() {
    setModalType("Import JSON");
  }

  useSaveLoadProjectOnKeyActivation({ openLoadModal, openSaveAsModal });

  return (
    <MenuDropdown trigger="File">
      <DialogMenuBarTriggerItem
        onClick={() => createAndGoToProject({})}
        shortcut="Ctrl + Shift + N"
      >
        New Project
      </DialogMenuBarTriggerItem>
      <DialogMenuBarTriggerItem onClick={openLoadModal} shortcut="Ctrl + L">
        Load
      </DialogMenuBarTriggerItem>
      <DialogMenuBarTriggerItem onClick={saveProject} shortcut="Ctrl + S">
        <VscSave />
        Save
      </DialogMenuBarTriggerItem>
      <DialogMenuBarTriggerItem
        onClick={openSaveAsModal}
        shortcut="Ctrl + Shift + S"
      >
        <VscSaveAs />
        Save As
      </DialogMenuBarTriggerItem>
      <Menubar.Separator className="dark: m-[5px] h-[1px] bg-runcoder-100 dark:bg-runcoder-600" />

      <DialogMenuBarTriggerItem onClick={openImportJSONModal}>
        {/* <BiImport /> */}
        Import JSON
      </DialogMenuBarTriggerItem>
      <DialogMenuBarTriggerItem onClick={openExportJSONModal}>
        {/* <BiExport /> */}
        Export JSON
      </DialogMenuBarTriggerItem>
      <DialogMenuBarTriggerItem onClick={openExportFullJSONModal}>
        {/* <BiExport /> */}
        Export Full JSON
      </DialogMenuBarTriggerItem>
    </MenuDropdown>
  );
}
