import { Box, Text, VStack } from "@chakra-ui/react";

import ModalContainer from "../../../../../../../utils/ModalContainer/ModalContainer";
import { useGetAllParamInfos } from "../../../../../../../utils/useCreateInfo";
import Item from "./Item";

export default function UITypesModal({
  isOpen,
  onClose,
  sectionInfoId,
  objInfoId,
}) {
  const paramInfos = useGetAllParamInfos(sectionInfoId, objInfoId);

  return (
    <ModalContainer
      onClose={onClose}
      isOpen={isOpen}
      size={"2xl"}
      maxH="80vh"
      header={<Header />}
      body={<Body paramInfos={paramInfos} />}
      footer={<Footer />}
    />
  );
}

function Header() {
  return <Box>UI Types</Box>;
}

function Body({ paramInfos }) {
  return paramInfos.length > 0 ? (
    <VStack align="stretch" spacing="0">
      {paramInfos.map((e, idx) => (
        <Item paramInfo={e} key={`${e.name}-${idx}`} />
      ))}
    </VStack>
  ) : (
    <Text>There are no parameters</Text>
  );
}

function Footer() {
  return <Box></Box>;
}
