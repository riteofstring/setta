import * as Tooltip from "@radix-ui/react-tooltip";
import { useState } from "react";
import { AiOutlineMinus, AiOutlinePlus } from "react-icons/ai";
import { FiCornerRightDown } from "react-icons/fi";
import { addChildForSeries } from "thunks/sections/addChild";
import { deleteChild } from "thunks/sections/deleteChild";

export function Incrementer({
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
      addChildForSeries({ parentId: sectionId, numChildren: numSections });
    } else {
      addChildForSeries({
        parentId,
        numChildren: numSections,
        startId: sectionId,
      });
    }
  };

  const deleteChildren = (numSections) => {
    if (isRoot) {
      deleteChild({ parentId: sectionId, numChildren: numSections });
    } else {
      deleteChild({
        parentId,
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
    <Tooltip.Provider>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <div className="flex max-w-xs bg-gray-200 rounded-lg gap-2 py-1 px-2">
            {isRoot && (
              <h3 className="text-xs font-bold text-gray-600">Children</h3>
            )}
            {isRoot && <FiCornerRightDown className="text-gray-600" />}
            <input
              className="nodrag max-w-[5ch] bg-white rounded-md text-center text-xs focus-visible:ring-2"
              value={numSections}
              onChange={(e) => numSectionsOnChange(e.target.value)}
              aria-label="Number of sections"
            />

            <button
              className="nodrag rounded-full focus-visible:ring-2"
              onClick={() => deleteChildren(numSections)}
              disabled={!decrementButtonCondition()}
              aria-label="Delete child section"
            >
              <AiOutlineMinus />
            </button>

            <button
              className="nodrag rounded-full focus-visible:ring-2"
              onClick={() => addSections(numSections)}
              aria-label="Add child section"
            >
              <AiOutlinePlus />
            </button>
          </div>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className="bg-white px-3 py-2 rounded-md shadow-md z-30 text-xs font-bold">
            {isRoot ? "Add / Remove Children" : "Add / Remove Siblings"}

            <Tooltip.Arrow className="[fill:white]" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
