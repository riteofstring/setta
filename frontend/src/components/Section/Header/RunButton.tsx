import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { RiPlayMiniFill } from "react-icons/ri";
import { runCodeBlock } from "state/actions/runOrImportCode";
import { useShareCapabilities } from "state/hooks/share";

export function RunButton({ sectionId }) {
  const { canRun } = useShareCapabilities();
  if (!canRun) {
    return null;
  }

  function onClick() {
    runCodeBlock(sectionId);
  }

  return (
    <button
      className="nodrag mr-1 flex inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-full bg-transparent p-0 text-setta-600 hover:text-green-500 focus-visible:ring-2 active:!text-blue-700"
      onClick={onClick}
      {...getFloatingBoxHandlers({ title: "Run this code block" })}
    >
      <RiPlayMiniFill />
    </button>
  );
}
