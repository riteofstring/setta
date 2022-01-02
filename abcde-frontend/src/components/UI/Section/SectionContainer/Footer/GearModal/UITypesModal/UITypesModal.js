import { Box, Text, VStack } from "@chakra-ui/react";
import {
  useGetAllParamAndKwargInfos,
  useGetObjInfos,
  useGetParamUIType,
} from "hooks/useCreateInfo";
import ModalContainer from "utils/ModalContainer/ModalContainer";

import Item from "./Item";

export default function UITypesModal({
  isOpen,
  onClose,
  sectionId,
  objInfoId,
}) {
  const objInfo = useGetObjInfos(sectionId, objInfoId);
  const paramInfos = useGetAllParamAndKwargInfos(sectionId, objInfo);
  const getUITypeFn = useGetParamUIType(sectionId);

  return (
    <ModalContainer
      onClose={onClose}
      isOpen={isOpen}
      size={"2xl"}
      maxH="80vh"
      header={<Header />}
      body={<Body paramInfos={paramInfos} getUITypeFn={getUITypeFn} />}
      footer={<Footer />}
    />
  );
}

function Header() {
  return <Box>UI Types</Box>;
}

function Body({ paramInfos, getUITypeFn }) {
  return paramInfos.length > 0 ? (
    <VStack align="stretch" spacing="0">
      {paramInfos.map((e, idx) => (
        <Item
          paramInfo={e}
          getUITypeFn={getUITypeFn}
          key={`${e.name}-${idx}`}
        />
      ))}
    </VStack>
  ) : (
    <Text>There are no parameters</Text>
  );
}

function Footer() {
  return <Box></Box>;
}
