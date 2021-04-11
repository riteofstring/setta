import ParamContainer from "../ParamContainer/ParamContainer";
import ParamNameInput from "../ParamContainer/ParamItems/ParamNameInput";
import { useState, useEffect } from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import { HStack, IconButton } from "@chakra-ui/react";
import { CloseIcon } from "@chakra-ui/icons";
import { nullOrUndefined } from "../../../../../../../../utils/utils";

export default function KwargParam(props) {
  const { sectionId, inputKwargName, onClickDelete } = props;

  console.log("KwargParam", inputKwargName);

  const [kwargName, setKwargName] = useState(
    inputKwargName ? inputKwargName : ""
  );
  const addKwarg = useStoreActions((actions) => actions.master.addKwarg);
  const deleteKwarg = useStoreActions((actions) => actions.master.deleteKwarg);
  const replaceKwarg = useStoreActions(
    (actions) => actions.master.replaceKwarg
  );

  useEffect(() => {
    setKwargName(inputKwargName);
  }, [inputKwargName]);

  const onSubmit = (v) => {
    console.log("onSubmit", v);
    if (!nullOrUndefined(inputKwargName)) {
      replaceKwarg({ sectionId, oldKwarg: inputKwargName, newKwarg: v });
    } else if (v) {
      addKwarg({ sectionId, kwargName: v });
    }
    setKwargName(v);
  };

  const onClick = () => {
    deleteKwarg({ sectionId, kwargName: inputKwargName });
    onClickDelete();
  };

  function getParamNameInput() {
    return <ParamNameInput value={kwargName} onSubmit={onSubmit} />;
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
      {inputKwargName ? (
        <ParamContainer sectionId={sectionId} paramName={inputKwargName}>
          {getParamNameInput()}
        </ParamContainer>
      ) : (
        getParamNameInput()
      )}
    </HStack>
  );
}
