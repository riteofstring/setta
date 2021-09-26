import { CloseIcon } from "@chakra-ui/icons";
import { HStack, IconButton } from "@chakra-ui/react";
import { useStoreActions } from "easy-peasy";
import { useState, useEffect } from "react";

import { nullOrUndefined } from "../../../../../../../../utils/utils";
import ParamContainer from "../ParamContainer/ParamContainer";
import ParamNameInput from "../ParamContainer/ParamItems/ParamNameInput";

export default function KwargParam(props) {
  const {
    sectionId,
    stateIsUpToDate,
    enteredKwargName,
    setEnteredKwargName,
    onClickDelete,
    paramAndKwargNames,
  } = props;

  const addKwarg = useStoreActions((actions) => actions.master.addKwarg);
  const deleteKwarg = useStoreActions((actions) => actions.master.deleteKwarg);
  const replaceKwarg = useStoreActions(
    (actions) => actions.master.replaceKwarg
  );

  const onSubmit = (v) => {
    if (enteredKwargName) {
      replaceKwarg({ sectionId, oldKwarg: enteredKwargName, newKwarg: v });
    } else if (v) {
      addKwarg({ sectionId, kwargName: v });
    }
    setEnteredKwargName(v);
  };

  const deleteFromState = () => {
    if (enteredKwargName) {
      deleteKwarg({ sectionId, kwargName: enteredKwargName });
    }
  };

  const onClick = () => {
    deleteFromState();
    onClickDelete();
  };

  function getParamNameInput() {
    return (
      <ParamNameInput
        value={enteredKwargName}
        onSubmit={onSubmit}
        takenNames={paramAndKwargNames}
      />
    );
  }

  return (
    <HStack>
      <IconButton
        icon={<CloseIcon w={2} />}
        size="xs"
        variant="outline"
        borderRadius="full"
        onClick={onClick}
      />
      {stateIsUpToDate && enteredKwargName ? (
        <ParamContainer sectionId={sectionId} paramName={enteredKwargName}>
          {getParamNameInput()}
        </ParamContainer>
      ) : (
        getParamNameInput()
      )}
    </HStack>
  );
}
