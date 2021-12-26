import { Button, useDisclosure } from "@chakra-ui/react";
import { useState } from "react";

import ExportYamlModal from "./ExportYamlModal";

const yaml = require("js-yaml");

export default function ExportYamlButton({ exportSelected }) {
  const { isOpen, onOpen, onClose } = useDisclosure();

  const [selectedAsYaml, setSelectedAsYaml] = useState("");

  function convertAndOpen() {
    const selected = exportSelected();
    setSelectedAsYaml(yaml.dump(selected));
    onOpen();
  }

  return (
    <>
      <Button
        size="xs"
        mr="-px"
        onClick={convertAndOpen}
        variant="ghost"
        colorScheme="blue"
      >
        Export YAML
      </Button>
      <ExportYamlModal
        isOpen={isOpen}
        onClose={onClose}
        selectedAsYaml={selectedAsYaml}
      />
    </>
  );
}
