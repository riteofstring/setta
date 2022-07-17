import { Button, useDisclosure } from "@chakra-ui/react";
import { generateCode } from "codeGeneration/codeGeneration";
import { useState } from "react";

import ExportSelectedModal from "./ExportSelectedModal";

const yaml = require("js-yaml");

export default function ExportSelectedButton({
  exportSelected,
  outputAs,
  buttonText,
}) {
  const { isOpen, onOpen, onClose } = useDisclosure();

  const [selectedAsString, setSelectedAsString] = useState("");

  function convertAndOpen() {
    const selected = exportSelected();
    let asString = null;
    if (outputAs === "json") {
      asString = JSON.stringify(selected, null, 2);
    } else if (outputAs === "yaml") {
      asString = yaml.dump(selected);
    } else if (outputAs == "code") {
      asString = generateCode(selected);
    }
    setSelectedAsString(asString);
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
        {buttonText}
      </Button>
      <ExportSelectedModal
        isOpen={isOpen}
        onClose={onClose}
        selectedAsString={selectedAsString}
      />
    </>
  );
}
