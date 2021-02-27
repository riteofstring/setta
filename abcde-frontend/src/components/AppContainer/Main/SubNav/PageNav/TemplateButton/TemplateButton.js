import { useState } from "react";
import { Button, Icon, useDisclosure } from "@chakra-ui/react";
import { HiSave } from "react-icons/hi";
import TemplateModal from "./TemplateModal";
import { useStoreActions, useStoreState } from "easy-peasy";
import { setCompleteState } from "../../../../../../utils/commonFunctions";

export default function TemplateButton() {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [selectedUIAndVersionName, setSelectedUIAndVersionName] = useState(
    null
  );

  const savedUIAndVersionNames = useStoreState(
    (state) => state.uiInfo.savedUIAndVersionNames
  );
  const loadUIAndVersionNames = useStoreActions(
    (actions) => actions.uiInfo.loadUIAndVersionNames
  );
  const loadUI = useStoreActions((actions) => actions.uiInfo.loadUI);
  const token = useStoreState((state) => state.auth.token);

  const masterSetEntireState = useStoreActions(
    (actions) => actions.master.setEntireState
  );

  const globalCurrSetEntireState = useStoreActions(
    (actions) => actions.globalCurr.setEntireState
  );

  const yamlEntrySetEntireState = useStoreActions(
    (actions) => actions.yamlEntry.setEntireState
  );

  const factoriesInfoSetEntireState = useStoreActions(
    (actions) => actions.factoriesInfo.setEntireState
  );

  const funcsInfoSetEntireState = useStoreActions(
    (actions) => actions.funcsInfo.setEntireState
  );

  const resetSections = useStoreActions(
    (actions) => actions.master.resetSections
  );

  const onOpenClick = () => {
    loadUIAndVersionNames({ token });
    onOpen();
  };

  const onLoad = async () => {
    const completeState = await loadUI({
      token,
      ...selectedUIAndVersionName,
    });
    if (completeState) {
      resetSections();
      setCompleteState({
        completeState,
        masterSetEntireState,
        globalCurrSetEntireState,
        yamlEntrySetEntireState,
        factoriesInfoSetEntireState,
        funcsInfoSetEntireState,
      });
      onClose();
    }
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
        setSelectedUIAndVersionName={setSelectedUIAndVersionName}
      />
    </>
  );
}
