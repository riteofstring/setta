import { useState } from "react";
import { addChildrenToSeries } from "thunks/sections/addChild";
import { deleteChildrenFromSeries } from "thunks/sections/deleteChild";

export function Incrementer({ sectionId, isRoot }) {
  const addSections = (numSections) => {
    addChildrenToSeries({
      isRoot,
      calledBy: sectionId,
      numChildren: numSections,
      incrementVersion: true,
    });
  };

  const deleteChildren = (numSections) => {
    deleteChildrenFromSeries({
      isRoot,
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
    // <Tooltip.Provider>
    //   <Tooltip.Root>
    //     <Tooltip.Trigger asChild>
    <div className="flex max-w-xs gap-1 rounded-lg bg-runcoder-200 px-2 py-1 dark:bg-runcoder-900">
      {isRoot ? (
        <p className="text-xs font-bold text-runcoder-500">Children</p>
      ) : (
        <p className="text-xs text-runcoder-500">Siblings</p>
      )}
      {isRoot && <i className="gg-corner-right-down" />}

      {/* <input
        className="nodrag max-w-[3ch] cursor-auto rounded-md bg-white px-2 text-xs focus-visible:ring-2 dark:bg-runcoder-800 dark:text-runcoder-300"
        value={numSections}
        onChange={(e) => numSectionsOnChange(e.target.value)}
        aria-label="Number of sections"
      /> */}

      <button
        className="nodrag rounded-full focus-visible:ring-2 dark:text-runcoder-300"
        onClick={() => deleteChildren(numSections)}
        aria-label="Delete child section"
        role="button"
      >
        <i className="gg-math-minus" />
      </button>

      <button
        className="nodrag rounded-full focus-visible:ring-2 dark:text-runcoder-300"
        onClick={() => addSections(numSections)}
        aria-label="Add child section"
        role="button"
      >
        <i className="gg-math-plus" />
      </button>
    </div>
    //     </Tooltip.Trigger>
    //     <Tooltip.Portal>
    //       <Tooltip.Content className="z-30 rounded-md bg-white px-3 py-2 text-xs font-bold shadow-md dark:bg-runcoder-800">
    //         {isRoot ? "Add / Remove Children" : "Add / Remove Siblings"}

    //         <Tooltip.Arrow className="[fill:white]" />
    //       </Tooltip.Content>
    //     </Tooltip.Portal>
    //   </Tooltip.Root>
    // </Tooltip.Provider>
  );
}
