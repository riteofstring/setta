import { Box, Text } from "@chakra-ui/react";
import ModalContainer from "utils/ModalContainer/ModalContainer";

function numSpaces(x) {
  return x.search(/\S|$/);
}

export default function ExportSelectedModal({
  isOpen,
  onClose,
  selectedAsString,
}) {
  return (
    <ModalContainer
      onClose={onClose}
      isOpen={isOpen}
      size={"full"}
      header={<Header />}
      body={<Body selectedAsString={selectedAsString} />}
      footer={<Footer />}
    />
  );
}

function Header() {
  return <Box>Selections</Box>;
}

function Body({ selectedAsString }) {
  const splitByLines = selectedAsString.split("\n");
  return splitByLines.map((x, idx) => (
    <Text
      key={`selectedAsString-${idx}`}
      style={{ textIndent: 10 * numSpaces(x) }}
    >
      {x}
    </Text>
  ));
}

function Footer() {
  return <Box></Box>;
}
