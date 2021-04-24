import ModalContainer from "../../../../../utils/ModalContainer/ModalContainer";
import { Box, Text } from "@chakra-ui/react";

function numSpaces(x) {
  let count = 0;
  let index = 0;
  while (x.charAt(index++) === " ") {
    count++;
  }
  return count;
}

export default function ExportYamlModal({ isOpen, onClose, selectedAsYaml }) {
  return (
    <ModalContainer
      onClose={onClose}
      isOpen={isOpen}
      size={"full"}
      header={<Header />}
      body={<Body selectedAsYaml={selectedAsYaml} />}
      footer={<Footer />}
    />
  );
}

function Header() {
  return <Box>Selections as YAML</Box>;
}

function Body({ selectedAsYaml }) {
  const splitByLines = selectedAsYaml.split("\n");
  return splitByLines.map((x, idx) => (
    <Text
      key={`selectedAsYaml-${idx}`}
      style={{ textIndent: 10*numSpaces(x) }}
    >
      {x}
    </Text>
  ));
}

function Footer() {
  return <Box></Box>;
}
