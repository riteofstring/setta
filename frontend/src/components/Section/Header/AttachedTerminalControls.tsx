import _ from "lodash";
import { FaTerminal } from "react-icons/fa";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImpl,
  getCurrProjectConfigId,
  isBaseCodeSectionType,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { route_toggle_minimized } from "utils/generatedEndpoints";
import { SectionTypeEnum } from "utils/generatedTypes";
import { DeleteOrHideButton } from "./DeleteOrHideButton";

export function AttachedTerminalControls({
  sectionId,
  isUserView,
}: {
  sectionId: string;
  isUserView: boolean;
}) {
  const { attachedTerminalId, terminalHidden } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    if (!isBaseCodeSectionType(impl.type)) {
      return { attachedTerminalId: null, terminalHidden: false };
    }
    const attachedId = impl.attachedTerminalSectionId ?? null;
    if (!attachedId || !(attachedId in x.sections)) {
      return { attachedTerminalId: null, terminalHidden: false };
    }
    const children = Array.isArray(impl.children) ? impl.children : [];
    const candidateChildId = children.length > 0 ? children[0] : attachedId;
    const isEmbeddedCandidate =
      candidateChildId === attachedId &&
      children.length < 2 &&
      x.parentSectionMap[attachedId] === sectionId;
    if (!isEmbeddedCandidate) {
      return { attachedTerminalId: null, terminalHidden: false };
    }
    const terminalImpl = getCurrEffectiveSectionImpl(x, attachedId);
    if (terminalImpl.type !== SectionTypeEnum.Terminal) {
      return { attachedTerminalId: null, terminalHidden: false };
    }
    return { attachedTerminalId: attachedId, terminalHidden: terminalImpl.isMinimized };
  }, _.isEqual);

  if (isUserView || !attachedTerminalId) {
    return null;
  }

  const title = terminalHidden ? "Show terminal" : "Hide terminal";
  let toggleClassName =
    "nodrag mr-1 flex inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-full bg-transparent p-0 focus-visible:ring-2";
  if (terminalHidden) {
    toggleClassName = `${toggleClassName} text-setta-400 hover:text-setta-600 dark:text-setta-600 dark:hover:text-setta-300`;
  } else {
    toggleClassName = `${toggleClassName} text-setta-600 hover:text-blue-600 dark:text-setta-500 dark:hover:text-[#0084ff]`;
  }

  function onToggle() {
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        const impl = getCurrEffectiveSectionImpl(state, attachedTerminalId);
        setCurrEffectiveSectionImplValue(state, attachedTerminalId, {
          isMinimized: !impl.isMinimized,
        });
      },
      send: (frontendOpId) =>
        route_toggle_minimized({
          projectConfigId: getCurrProjectConfigId(),
          sectionId: attachedTerminalId,
          frontendOpId,
        }),
    });
  }

  return (
    <>
      <button
        aria-label={title}
        aria-pressed={!terminalHidden}
        className={toggleClassName}
        data-attached-terminal-toggle
        onClick={onToggle}
        title={title}
        type="button"
      >
        <FaTerminal className="text-[12px]" />
      </button>
      <DeleteOrHideButton
        sectionId={attachedTerminalId}
        title="Trash terminal"
        icon={<i className="gg-trash" />}
        data-attached-terminal-trash
        bg="bg-transparent hover:bg-red-500"
        color="text-setta-600 hover:text-white"
        rounded="rounded-full"
        padding="p-0"
        size="h-4 min-w-4"
      />
    </>
  );
}

