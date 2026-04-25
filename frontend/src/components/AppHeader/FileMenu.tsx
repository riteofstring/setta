import * as Menubar from "@radix-ui/react-menubar";
import { NavbarMenuDropdown } from "components/Utils/atoms/menubar/menudropdown";
import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import _ from "lodash";
import { useAppSubsystemAppDeploymentModal } from "plugins/appSubsystem";
import { VscSave, VscSaveAs } from "react-icons/vsc";
import {
  openFileMenuLoadProjectConfigModal,
  openFileMenuSaveProjectConfigAsModal,
  openFileMenuSaveProjectConfigAsWithRefsModal,
  openPublishAppDeploymentModal,
  openPublishShareDeploymentModal,
  openWorkspaceSwitcherModal,
} from "state/actions/modal";
import { useCreateAndGoToProjectConfig } from "state/actions/project/loadProject";
import { saveProject } from "state/actions/project/saveProject";
import { useSettings } from "state/definitions";
import { shortcutPrettified } from "utils/utils";

export function FileMenu() {
  const appDeploymentModal = useAppSubsystemAppDeploymentModal();
  const shortcuts = useSettings((x) => {
    return {
      newProjectConfigShortcut: shortcutPrettified(
        x.shortcuts.newProjectConfigShortcut,
      ),
      saveShortcut: shortcutPrettified(x.shortcuts.saveShortcut),
      saveAsShortcut: shortcutPrettified(x.shortcuts.saveAsShortcut),
      loadShortcut: shortcutPrettified(x.shortcuts.loadShortcut),
      undoShortcut: shortcutPrettified(x.shortcuts.undoShortcut),
      groupShortcut: shortcutPrettified(x.shortcuts.groupShortcut),
    };
  }, _.isEqual);

  const createAndGoToProjectConfig = useCreateAndGoToProjectConfig();

  return (
    <NavbarMenuDropdown trigger="Project">
      <MenuItem
        onClick={createAndGoToProjectConfig}
        shortcut={shortcuts.newProjectConfigShortcut}
        paddingClassName="px-1.5"
      >
        New Config
      </MenuItem>
      <MenuItem
        onClick={openFileMenuLoadProjectConfigModal}
        shortcut={shortcuts.loadShortcut}
        paddingClassName="px-1.5"
      >
        Load
      </MenuItem>
      <MenuItem
        onClick={saveProject}
        shortcut={shortcuts.saveShortcut}
        paddingClassName="px-1.5"
      >
        <VscSave />
        Save
      </MenuItem>
      <MenuItem
        onClick={openFileMenuSaveProjectConfigAsModal}
        shortcut={shortcuts.saveAsShortcut}
        paddingClassName="px-1.5"
      >
        <VscSaveAs />
        Save As
      </MenuItem>
      <MenuItem
        onClick={openFileMenuSaveProjectConfigAsWithRefsModal}
        paddingClassName="px-1.5"
      >
        <VscSaveAs />
        Save As (With Refs)
      </MenuItem>
      <MenuItem
        onClick={openPublishShareDeploymentModal}
        paddingClassName="px-1.5"
      >
        Publish Share Deployment
      </MenuItem>
      {appDeploymentModal ? (
        <MenuItem
          onClick={openPublishAppDeploymentModal}
          paddingClassName="px-1.5"
        >
          Publish App Deployment
        </MenuItem>
      ) : null}
      <MenuItem onClick={openWorkspaceSwitcherModal} paddingClassName="px-1.5">
        Switch Workspace
      </MenuItem>
      <Menubar.Separator className="dark: m-[5px] h-[1px] bg-setta-100 dark:bg-setta-600" />
    </NavbarMenuDropdown>
  );
}

// <MenuItem onClick={openImportJSONModal}>
//   {/* <BiImport /> */}
//   Import JSON
// </MenuItem>
// <MenuItem onClick={openExportJSONModal}>
//   {/* <BiExport /> */}
//   Export JSON
// </MenuItem>
