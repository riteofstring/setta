import { useState } from "react";
import { TbSortDescendingSmallBig } from "react-icons/tb";
import { addChildrenToSeries } from "state/actions/addSection";
import { deleteChildrenFromSeries } from "state/actions/deleteChild";

export function Incrementer({ sectionId, isRoot, popover = false }) {
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
    <div
      className={`card-incrementer -mx-2 flex items-center gap-1 rounded-lg  bg-setta-100 pl-2 pr-1 dark:bg-setta-950 ${popover ? "border border-solid border-white py-1 shadow-lg dark:border-setta-800" : ""}`}
    >
      {isRoot ? (
        <>
          <TbSortDescendingSmallBig className="text-setta-300 dark:text-setta-600" />
          <p className="text-[10px] font-bold text-setta-500">Children: </p>
        </>
      ) : (
        <p className="text-[10px] text-setta-500">Siblings</p>
      )}
      {/* {isRoot && <i className="gg-corner-right-down -ml-1 text-setta-600" />} */}

      <input
        className="nodrag max-w-[3ch] cursor-auto rounded-md bg-white px-2 text-xs focus-visible:ring-2 dark:bg-setta-800 dark:text-setta-300"
        value={numSections}
        onChange={(e) => numSectionsOnChange(e.target.value)}
        aria-label="Number of sections"
      />

      {/* <div className="nodrag max-w-[3ch] cursor-auto rounded-md bg-white px-2 text-[10px] focus-visible:ring-2 dark:bg-setta-800 dark:text-setta-300">
        {numSections}
      </div> */}

      <button
        className="nodrag gg-math-minus rounded-full focus-visible:ring-2 dark:text-setta-300"
        onClick={() => deleteChildren(numSections)}
        aria-label="Delete child section"
        role="button"
      />

      <button
        className="nodrag gg-math-plus rounded-full focus-visible:ring-2 dark:text-setta-300"
        onClick={() => addSections(numSections)}
        aria-label="Add child section"
        role="button"
      />
    </div>
    //     </Tooltip.Trigger>
    //     <Tooltip.Portal>
    //       <Tooltip.Content className="z-30 rounded-md bg-white px-3 py-2 text-xs font-bold shadow-md dark:bg-setta-800">
    //         {isRoot ? "Add / Remove Children" : "Add / Remove Siblings"}

    //         <Tooltip.Arrow className="[fill:white]" />
    //       </Tooltip.Content>
    //     </Tooltip.Portal>
    //   </Tooltip.Root>
    // </Tooltip.Provider>
  );
}
