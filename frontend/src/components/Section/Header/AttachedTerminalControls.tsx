import {
  callOpenAPI,
  res200,
  type ResponseDataAndStatus,
} from "@setta/app-subsystem-frontend-sdk";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import _ from "lodash";
import {
  createChildSections,
  getLatestProjectState,
  toggleMinimized,
  type GetLatestProjectStateResponse,
} from "openapi/http";
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
import {
  SectionTypeEnum,
  type CreateChildSectionsResult,
} from "utils/generatedTypes";
type CreateChildSectionsRouteResponse =
  ResponseDataAndStatus<CreateChildSectionsResult>;
type LatestProjectStateRouteResponse =
  ResponseDataAndStatus<GetLatestProjectStateResponse>;
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
        callOpenAPI(
          toggleMinimized({
            body: {
              projectConfigId: getCurrProjectConfigId(),
              sectionId: attachedTerminalId,
              frontendOpId,
            },
          } as Parameters<typeof toggleMinimized>[0]),
        ),
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
  const createResponse = (await callOpenAPI(
    createChildSections({
      body: {
        projectConfigId,
        parentId: sectionId,
        implType: SectionTypeEnum.Terminal,
        numChildren: 1,
        startIdx: 0,
      },
    } as Parameters<typeof createChildSections>[0]),
  )) as CreateChildSectionsRouteResponse;
  if (!res200(createResponse)) {
    return;
  }
  const latestProjectStateResponse = (await callOpenAPI(
    getLatestProjectState({
      body: {
        projectConfigId,
      },
    } as Parameters<typeof getLatestProjectState>[0]),
  )) as LatestProjectStateRouteResponse;
  if (!res200(latestProjectStateResponse)) {
    return;
  }
  processProjectStateUpdateFromBackend(latestProjectStateResponse.data);
}
