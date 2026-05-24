import _ from "lodash";
import React, { useState } from "react";
import {
  getActiveViewModeConfig,
  getAttachedTerminalParentIdForTerminalSection,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useTerminal } from "state/hooks/terminals/terminal";
import { NO_PAN_CLASS_NAME } from "utils/constants";
import {
  ChatWindowPlacementEnum,
  type ChatWindowPlacement,
} from "utils/generatedTypes";
import { DeleteOrHideButton } from "../Header/DeleteOrHideButton";

type TerminalSurfaceHost =
  | ChatWindowPlacement
  | "section_layout"
  | "standalone_page";

function _TerminalArea({
  sectionId,
  host,
}: {
  sectionId: string;
  host?: TerminalSurfaceHost;
}) {
  const { isAttachedTerminalChild, isUserView } = useProjectState((x) => {
    const viewMode = getActiveViewModeConfig(x);
    return {
      isAttachedTerminalChild:
        getAttachedTerminalParentIdForTerminalSection(x, sectionId) !== null,
      isUserView: viewMode.isUserFacing && !x.projectConfig.isEditingViewMode,
    };
  }, _.isEqual);
  const [hasScrollbar, setHasScrollbar] = useState(false);
  const hasWindowChromeInset =
    host === ChatWindowPlacementEnum.floating ||
    host === ChatWindowPlacementEnum.maximized ||
    host === "standalone_page";

  return (
    <TerminalAreaReadWrite
      sectionId={sectionId}
      hasScrollbar={hasScrollbar}
      setHasScrollbar={setHasScrollbar}
      dataAttachedTerminalId={isAttachedTerminalChild ? sectionId : null}
      showAttachedTerminalTrashButton={isAttachedTerminalChild && !isUserView}
      hasWindowChromeInset={hasWindowChromeInset}
    />
  );
}

export const TerminalArea = React.memo(_TerminalArea);

type TerminalAreaReadWriteProps = {
  sectionId: string;
  hasScrollbar: boolean;
  setHasScrollbar: (value: boolean) => void;
  dataAttachedTerminalId: string | null;
  showAttachedTerminalTrashButton: boolean;
  hasWindowChromeInset: boolean;
};

type TerminalAreaCoreProps = {
  sectionId: string;
  hasScrollbar: boolean;
  terminalRef: React.RefObject<HTMLDivElement>;
  dataAttachedTerminalId: string | null;
  showAttachedTerminalTrashButton: boolean;
  hasWindowChromeInset: boolean;
};

function TerminalAreaReadWrite({
  sectionId,
  hasScrollbar,
  setHasScrollbar,
  dataAttachedTerminalId,
  showAttachedTerminalTrashButton,
  hasWindowChromeInset,
}: TerminalAreaReadWriteProps) {
  const terminalRef = useTerminal({
    sectionId,
    setHasScrollbar,
  });

  return (
    <TerminalAreaCore
      sectionId={sectionId}
      hasScrollbar={hasScrollbar}
      terminalRef={terminalRef}
      dataAttachedTerminalId={dataAttachedTerminalId}
      showAttachedTerminalTrashButton={showAttachedTerminalTrashButton}
      hasWindowChromeInset={hasWindowChromeInset}
    />
  );
}

function TerminalAreaCore({
  sectionId,
  hasScrollbar,
  terminalRef,
  dataAttachedTerminalId,
  showAttachedTerminalTrashButton,
  hasWindowChromeInset,
}: TerminalAreaCoreProps) {
  return (
    <div className="section-row-search-gutter section-key-value relative box-border h-full w-full overflow-hidden">
      {showAttachedTerminalTrashButton && (
        <div className="absolute -right-1 top-1 z-20">
          <DeleteOrHideButton
            sectionId={sectionId}
            title="Trash terminal"
            icon={<i className="gg-trash" />}
            data-attached-terminal-trash
            bg="bg-transparent hover:bg-red-500"
            color="text-setta-600 hover:text-white"
            rounded="rounded-full"
            padding="p-0"
            size="h-4 min-w-4"
          />
        </div>
      )}
      <div
        className={`h-full w-full ${hasWindowChromeInset ? "box-border px-2 pb-2 pt-1" : ""}`}
        data-terminal-window-host-inset={
          hasWindowChromeInset ? "true" : undefined
        }
      >
        <div
          ref={terminalRef}
          className={`${hasScrollbar ? "nowheel" : ""} ${NO_PAN_CLASS_NAME} nodrag`}
          data-gpu-flow-control={`terminal:${sectionId}`}
          data-section-main-editor
          data-attached-terminal-section-id={
            dataAttachedTerminalId ?? undefined
          }
          style={{ height: "100%", width: "100%" }}
        />
      </div>
    </div>
  );
}
