import * as Tooltip from "@radix-ui/react-tooltip";
import { useState } from "react";
import { AiOutlineMinus, AiOutlinePlus } from "react-icons/ai";
import { FiCornerRightDown } from "react-icons/fi";
import { addChildForSeries } from "thunks/sections/addChild";
import { deleteChildrenFromSeries } from "thunks/sections/deleteChild";

export function Incrementer({ sectionId, nextId, isRoot, hasNested }) {
  const decrementButtonCondition = () => {
    return (isRoot && hasNested) || (!isRoot && nextId);
  };

  const addSections = (numSections) => {
    if (isRoot) {
      addChildForSeries({
        parentId: sectionId,
        numChildren: numSections,
        incrementVersion: true,
      });
    } else {
      addChildForSeries({
        parentId,
        numChildren: numSections,
        startId: sectionId,
        incrementVersion: true,
      });
    }
  };

  const deleteChildren = (numSections) => {
    deleteChildrenFromSeries({
      calledBy: sectionId,
      numChildren: numSections,
      incrementVersion: true,
    });
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
          <div className="flex max-w-xs gap-1 rounded-lg bg-runcoder-200 px-2 py-1 dark:bg-runcoder-900">
            {isRoot ? (
              <p className="text-xs font-bold text-runcoder-500">Children</p>
            ) : (
              <p className="text-xs text-runcoder-500">Siblings</p>
            )}
            {isRoot && <FiCornerRightDown className="mr-1 text-runcoder-600" />}

            <input
              className="nodrag max-w-[3ch] cursor-auto rounded-md bg-white px-2 text-xs focus-visible:ring-2 dark:bg-runcoder-800 dark:text-runcoder-300"
              value={numSections}
              onChange={(e) => numSectionsOnChange(e.target.value)}
              aria-label="Number of sections"
            />

            <button
              className="nodrag rounded-full focus-visible:ring-2 dark:text-runcoder-300"
              onClick={() => deleteChildren(numSections)}
              disabled={!decrementButtonCondition()}
              aria-label="Delete child section"
              role="button"
            >
              <AiOutlineMinus />
            </button>

            <button
              className="nodrag rounded-full focus-visible:ring-2 dark:text-runcoder-300"
              onClick={() => addSections(numSections)}
              aria-label="Add child section"
              role="button"
            >
              <AiOutlinePlus />
            </button>
          </div>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className="z-30 rounded-md bg-white px-3 py-2 text-xs font-bold shadow-md dark:bg-runcoder-800">
            {isRoot ? "Add / Remove Children" : "Add / Remove Siblings"}

            <Tooltip.Arrow className="[fill:white]" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
