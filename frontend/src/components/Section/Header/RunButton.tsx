import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { RiPlayMiniFill } from "react-icons/ri";
import { runCodeBlock } from "state/actions/runOrImportCode";

export function RunButton({ sectionId }) {
  function onClick() {
    runCodeBlock(sectionId);
  }

  return (
    <button
      className="focus-visible:ring-2 inline-flex items-center nodrag cursor-pointer flex justify-center bg-transparent text-setta-600 hover:text-green-500 active:!text-blue-700 rounded-full p-0 mr-1 w-4 h-4"
      onClick={onClick}
      {...getFloatingBoxHandlers({ title: "Run this code block" })}
    >
      <RiPlayMiniFill />
    </button>
  );
}
