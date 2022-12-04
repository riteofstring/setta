import { CloseIcon } from "@chakra-ui/icons";
import { HStack, IconButton } from "@chakra-ui/react";
import { useStoreActions } from "easy-peasy";
import ParamContainer from "../ParamContainer/ParamContainer";
import ParamNameInput from "../ParamContainer/ParamItems/ParamNameInput";

export default function KwargParam(props) {
  const { sectionId, objInfoId, paramInfo: kwargInfo } = props;
  const setName = useStoreActions((x) => x.codeInfo.setName);
  const onBlur = (v) => {
    setName({ id: kwargInfo.id, name: v });
  };
  const deleteKwarg = useStoreActions((x) => x.thunks.deleteKwarg);

  const onClick = () => {
    deleteKwarg({ sectionId, objInfoId, kwargId: kwargInfo.id });
  };

  return (
    <HStack spacing={0}>
      <IconButton
        icon={<CloseIcon w={2} />}
        size="sm"
        variant="ghost"
        borderRadius="full"
        onClick={onClick}
        color="gray.300"
        _hover={{
          color: "gray.800",
        }}
        className="nodrag"
      />
      <ParamContainer {...props}>
        <ParamNameInput value={kwargInfo.name} onBlur={onBlur} />
      </ParamContainer>
    </HStack>
  );
}
