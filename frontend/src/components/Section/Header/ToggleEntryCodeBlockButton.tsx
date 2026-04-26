import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { FaFlag, FaRegFlag } from "react-icons/fa";
import { useProjectState } from "state/definitions";
import {
  canSelectSectionAsEntryCodeBlock,
  getSectionEntryCodeBlockValue,
} from "utils/runCapabilities";

export function ToggleEntryCodeBlockButton({
  sectionId,
}: {
  sectionId: string;
}) {
  const canSelectAsEntryCodeBlock = useProjectState((state) =>
    canSelectSectionAsEntryCodeBlock(state, sectionId),
  );
  const entryCodeBlockValue = useProjectState((state) =>
    getSectionEntryCodeBlockValue(state, sectionId),
  );
  const isEntryCodeBlock = useProjectState(
    (state) => state.projectConfig.entryCodeBlockId === entryCodeBlockValue,
  );

  function onClick() {
    if (!canSelectAsEntryCodeBlock) {
      return;
    }
    useProjectState.setState((state) => {
      state.projectConfig.entryCodeBlockId = entryCodeBlockValue;
    });
  }

  if (!canSelectAsEntryCodeBlock) {
    return null;
  }

  return (
    <button
      className={`nodrag flex inline-flex cursor-pointer items-center justify-center focus-visible:ring-2 ${
        isEntryCodeBlock ? "hover:bg-blue-500" : "bg-transparent"
      } ${
        isEntryCodeBlock
          ? "text-blue-500 hover:!text-cyan-200"
          : "text-setta-600 hover:!text-blue-500"
      } mr-1 h-4 w-4 rounded-full p-0 active:!text-blue-500`}
      onClick={onClick}
      {...getFloatingBoxHandlers({ title: "Toggle Entry Code Block" })}
    >
      {isEntryCodeBlock ? (
        <FaFlag className="h-3 w-3" />
      ) : (
        <FaRegFlag className="h-3 w-3" />
      )}
    </button>
  );
}
