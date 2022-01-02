import { Box, Text } from "@chakra-ui/react";
import ModalContainer from "utils/ModalContainer/ModalContainer";

function numSpaces(x) {
  return x.search(/\S|$/);
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
      style={{ textIndent: 10 * numSpaces(x) }}
    >
      {x}
    </Text>
  ));
}

function Footer() {
  return <Box></Box>;
}
