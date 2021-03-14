import { useState } from "react";
import { Button, Icon, useDisclosure, MenuItem } from "@chakra-ui/react";
import { ExternalLinkIcon } from "@chakra-ui/icons";
import TemplateModal from "./TemplateModal";
import { useStoreActions, useStoreState } from "easy-peasy";

export default function TemplateButton() {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [selectedUIName, setSelectedUIName] = useState(null);

  const savedUINames = useStoreState((state) => state.uiInfo.savedUINames);
  const loadUINames = useStoreActions((actions) => actions.uiInfo.loadUINames);
  const loadUI = useStoreActions((actions) => actions.uiInfo.loadUI);
  const token = useStoreState((state) => state.auth.token);

  const resetSections = useStoreActions(
    (actions) => actions.master.resetSections
  );
  const loadSections = useStoreActions(
    (actions) => actions.master._loadSections
  );
  const setGlobalCurr = useStoreActions(
    (actions) => actions.globalCurr.setGlobalCurr
  );

  const onOpenClick = () => {
    loadUINames({ token });
    onOpen();
  };

  const onLoad = async () => {
    const { originalRootSections } = await loadUI({
      token,
      uiName: selectedUIName,
    });
    console.log("originalRootSections", originalRootSections);
    resetSections();
    loadSections({ isJson: false, data: originalRootSections });
    // setGlobalCurr(globalCurr);
    onClose();
  };

  return (
    <>
      <MenuItem onClick={onOpenClick} icon={<ExternalLinkIcon />}>
        Load
      </MenuItem>

      <TemplateModal
        isOpen={isOpen}
        onClose={onClose}
        onLoad={onLoad}
        savedUINames={savedUINames}
        setSelectedUIName={setSelectedUIName}
      />
    </>
  );
}
