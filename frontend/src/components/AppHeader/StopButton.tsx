import { RiStopFill } from "react-icons/ri";
import { stopCode } from "state/actions/runOrImportCode";
export function StopButton() {
  return (
    <div className="flex justify-stretch">
      <button
        className="nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-2 text-xs font-semibold text-setta-700 transition-colors hover:bg-red-500 hover:text-white focus-visible:ring-2 active:!bg-blue-100 dark:text-setta-100 dark:hover:bg-red-800 active:dark:!bg-blue-950"
        onClick={stopCode}
      >
        <RiStopFill />
        Stop
      </button>
    </div>
  );
}
