import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import _ from "lodash";
import React from "react";
import { FaTerminal } from "react-icons/fa";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImpl,
  getCurrProjectConfigId,
  getEmbeddedAttachedTerminalForCodeSection,
  isBaseCodeSectionType,
  processProjectStateUpdateFromBackend,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { res200, type ResponseDataAndStatus } from "utils/endpointUtils";
import {
  route_create_child_sections,
  route_get_latest_project_state,
  route_toggle_minimized,
} from "utils/generatedEndpoints";
import {
  type CreateChildSectionsResponse,
  type ProjectStateSingleConfigWithCompletedOpIDs,
  SectionTypeEnum,
} from "utils/generatedTypes";

type CreateChildSectionsRouteResponse =
  ResponseDataAndStatus<CreateChildSectionsResponse>;
type LatestProjectStateRouteResponse =
  ResponseDataAndStatus<ProjectStateSingleConfigWithCompletedOpIDs>;

export function AttachedTerminalControls({
  sectionId,
  isUserView,
}: {
  sectionId: string;
  isUserView: boolean;
}) {
  const [isCreatingTerminal, setIsCreatingTerminal] = React.useState(false);
  const { isBaseCodeSection, attachedTerminalId, terminalHidden } =
    useProjectState((x) => {
      const impl = getCurrEffectiveSectionImpl(x, sectionId);
      const isBaseCodeSection = isBaseCodeSectionType(impl.type);
      if (!isBaseCodeSection) {
        return {
          isBaseCodeSection,
          attachedTerminalId: null,
          terminalHidden: false,
        };
      }
      const embeddedTerminal = getEmbeddedAttachedTerminalForCodeSection(
        x,
        sectionId,
      );
      if (!embeddedTerminal) {
        return {
          isBaseCodeSection,
          attachedTerminalId: null,
          terminalHidden: false,
        };
      }
      return {
        isBaseCodeSection,
        attachedTerminalId: embeddedTerminal.attachedTerminalId,
        terminalHidden: embeddedTerminal.isTerminalMinimized,
      };
    }, _.isEqual);

  if (isUserView || !isBaseCodeSection) {
    return null;
  }

  const hasAttachedTerminal = attachedTerminalId !== null;
  let title = "Create terminal";
  if (hasAttachedTerminal) {
    title = terminalHidden ? "Show terminal" : "Hide terminal";
  }
  let toggleClassName =
    "nodrag mr-1 inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-full bg-transparent p-0 focus-visible:ring-2";
  if (!hasAttachedTerminal || terminalHidden) {
    toggleClassName = `${toggleClassName} text-setta-400 hover:text-setta-600 dark:text-setta-600 dark:hover:text-setta-300`;
  } else {
    toggleClassName = `${toggleClassName} text-setta-600 hover:text-blue-600 dark:text-setta-500 dark:hover:text-[#0084ff]`;
  }

  function onToggle() {
    if (!hasAttachedTerminal) {
      if (isCreatingTerminal) {
        return;
      }
      setIsCreatingTerminal(true);
      void createAttachedTerminalAndRefreshProjectState(sectionId).finally(
        () => {
          setIsCreatingTerminal(false);
        },
      );
      return;
    }

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
        aria-pressed={hasAttachedTerminal && !terminalHidden}
        className={toggleClassName}
        data-attached-terminal-toggle
        disabled={isCreatingTerminal}
        onClick={onToggle}
        title={title}
        type="button"
        {...getFloatingBoxHandlers({ content: title })}
      >
        <FaTerminal className="text-[12px]" />
      </button>
    </>
  );
}

async function createAttachedTerminalAndRefreshProjectState(
  sectionId: string,
): Promise<void> {
  const projectConfigId = getCurrProjectConfigId();
  const createResponse: CreateChildSectionsRouteResponse =
    await route_create_child_sections({
      projectConfigId,
      parentId: sectionId,
      implType: SectionTypeEnum.Terminal,
      numChildren: 1,
      startIdx: 0,
    });
  if (!res200(createResponse)) {
    return;
  }

  const latestProjectStateResponse: LatestProjectStateRouteResponse =
    await route_get_latest_project_state({
      projectConfigId,
    });
  if (!res200(latestProjectStateResponse)) {
    return;
  }
  processProjectStateUpdateFromBackend(latestProjectStateResponse.data);
}
