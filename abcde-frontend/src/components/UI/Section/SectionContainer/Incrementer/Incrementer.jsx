import { HStack, IconButton } from "@chakra-ui/react";
import { useState } from "react";
import { AiOutlineMinus, AiOutlinePlus } from "react-icons/ai";
import { addChild } from "thunks/addChild";
import { deleteChild } from "thunks/deleteChild";

export default function Incrementer({
  parentId,
  sectionId,
  nextId,
  isRoot,
  hasNested,
}) {
  const decrementButtonCondition = () => {
    return (isRoot && hasNested) || (!isRoot && nextId);
  };

  const addSections = (numSections) => {
    if (isRoot) {
      addChild({ parentId: sectionId, numChildren: numSections });
    } else {
      addChild({ parentId, numChildren: numSections, startId: sectionId });
    }
  };

  const deleteChildren = (numSections) => {
    if (isRoot) {
      deleteChild({ sectionId, numChildren: numSections });
    } else {
      deleteChild({
        sectionId: parentId,
        numChildren: numSections,
        startId: nextId,
      });
    }
  };
  const numSectionsOnChange = (value) => {
    if (value && !isNaN(value)) {
      setNumSections(parseInt(value));
    } else {
      setNumSections("");
    }
  };

  const [numSections, setNumSections] = useState(1);
  return (
    <HStack maxW="320px" bg="gray.100" borderRadius="xl" p="0.25rem 0.5rem">
      <h3 style={{ fontSize: ".75em", color: "#A0AEC0" }}>
        {isRoot && "Children: "}
      </h3>
      <input
        className="nodrag max-w-[5ch] bg-white rounded-md text-center text-xs"
        value={numSections}
        onChange={(e) => numSectionsOnChange(e.target.value)}
        aria-label="Number of sections"
      />

      <IconButton
        icon={<AiOutlineMinus />}
        size="xs"
        onClick={() => deleteChildren(numSections)}
        isDisabled={!decrementButtonCondition()}
        aria-label="Delete child section"
        borderRadius="full"
        className="nodrag"
      />

      <IconButton
        icon={<AiOutlinePlus />}
        size="xs"
        onClick={() => addSections(numSections)}
        aria-label="Add child section"
        borderRadius="full"
        className="nodrag"
      />
    </HStack>
  );
}
