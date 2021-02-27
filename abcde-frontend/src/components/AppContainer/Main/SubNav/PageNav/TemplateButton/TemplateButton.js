import { useState } from "react";
import { Button, Icon, useDisclosure } from "@chakra-ui/react";
import { HiSave } from "react-icons/hi";
import TemplateModal from "./TemplateModal";
import { useStoreActions, useStoreState } from "easy-peasy";

export default function TemplateButton() {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [selectedUIName, setSelectedUIName] = useState(null);

  const savedUIAndVersionNames = useStoreState((state) => state.uiInfo.savedUIAndVersionNames);
  const loadUIAndVersionNames = useStoreActions((actions) => actions.uiInfo.loadUIAndVersionNames);
  const loadUI = useStoreActions((actions) => actions.uiInfo.loadUI);
  const token = useStoreState((state) => state.auth.token);

  const resetSections = useStoreActions((actions) => actions.master.resetSections);
  const loadSections = useStoreActions((actions) => actions.master._loadSections);
  const setGlobalCurr = useStoreActions((actions) => actions.globalCurr.setGlobalCurr);

  const onOpenClick = () => {
    loadUIAndVersionNames({ token });
    onOpen();
  };

  const onLoad = async () => {
    const { originalRootSections } = await loadUI({
      token,
      uiName: selectedUIName,
    });
    console.log("originalRootSections", originalRootSections)
    resetSections();
    loadSections({ isJson: false, data: originalRootSections });
    // setGlobalCurr(globalCurr);
    onClose();
  };

  return (
    <>
      <Button
        leftIcon={<Icon as={HiSave} />}
        size="sm"
        mr="-px"
        onClick={onOpenClick}
        variant="ghost"
      >
        Load Template
      </Button>
      <TemplateModal
        isOpen={isOpen}
        onClose={onClose}
        onLoad={onLoad}
        savedUIAndVersionNames={savedUIAndVersionNames}
        setSelectedUIName={setSelectedUIName}
      />
    </>
  );
}
