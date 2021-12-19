import { CloseIcon } from "@chakra-ui/icons";
import { HStack, IconButton } from "@chakra-ui/react";

import ParamContainer from "../ParamContainer/ParamContainer";
import ParamNameInput from "../ParamContainer/ParamItems/ParamNameInput";

export default function KwargParam(props) {
  const { paramInfo: kwargInfo, getDeleteKwargFn, setKwargNameFn } = props;
  const onBlur = (v) => {
    setKwargNameFn(kwargInfo.id, v);
  };
  const deleteKwarg = getDeleteKwargFn(kwargInfo);

  const onClick = () => {
    deleteKwarg();
  };

  return (
    <HStack>
      <IconButton
        icon={<CloseIcon w={2} />}
        size="xs"
        variant="outline"
        borderRadius="full"
        onClick={onClick}
      />
      <ParamContainer {...props}>
        <ParamNameInput value={kwargInfo.name} onBlur={onBlur} />
      </ParamContainer>
    </HStack>
  );
}
