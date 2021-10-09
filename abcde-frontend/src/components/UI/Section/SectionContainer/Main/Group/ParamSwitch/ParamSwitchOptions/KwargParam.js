import { CloseIcon } from "@chakra-ui/icons";
import { HStack, IconButton } from "@chakra-ui/react";
import { useStoreActions } from "easy-peasy";

import ParamContainer from "../ParamContainer/ParamContainer";
import ParamNameInput from "../ParamContainer/ParamItems/ParamNameInput";

export default function KwargParam(props) {
  const { paramInfo: kwargInfo, deleteKwarg } = props;
  const setName = useStoreActions((x) => x.kwargInfos.setName);
  const onBlur = (v) => {
    setName({ kwargInfoId: kwargInfo.id, name: v });
  };

  const onClick = () => {
    deleteKwarg(kwargInfo.id);
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
