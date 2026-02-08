import _ from "lodash";
import React, { useState } from "react";
import {
  getActiveViewModeConfig,
  getAttachedTerminalParentIdForTerminalSection,
  getCurrEffectiveSectionImpl,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useTerminal } from "state/hooks/terminals/terminal";
import { NO_PAN_CLASS_NAME } from "utils/constants";
import { DeleteOrHideButton } from "../Header/DeleteOrHideButton";

function _TerminalArea({ sectionId }) {
  const { width, height, isAttachedTerminalChild, isUserView } =
    useProjectState((x) => {
      const impl = getCurrEffectiveSectionImpl(x, sectionId);
      const viewMode = getActiveViewModeConfig(x);
      return {
        ...impl.size,
        isAttachedTerminalChild:
          getAttachedTerminalParentIdForTerminalSection(x, sectionId) !== null,
        isUserView: viewMode.isUserFacing && !x.projectConfig.isEditingViewMode,
      };
    }, _.isEqual);
  const [hasScrollbar, setHasScrollbar] = useState(false);

  return (
    <TerminalAreaReadWrite
      sectionId={sectionId}
      width={width}
      height={height}
      hasScrollbar={hasScrollbar}
      setHasScrollbar={setHasScrollbar}
      dataAttachedTerminalId={isAttachedTerminalChild ? sectionId : null}
      showAttachedTerminalTrashButton={isAttachedTerminalChild && !isUserView}
    />
  );
}

export const TerminalArea = React.memo(_TerminalArea);

type TerminalAreaReadWriteProps = {
  sectionId: string;
  width: number;
  height: number;
  hasScrollbar: boolean;
  setHasScrollbar: (value: boolean) => void;
  dataAttachedTerminalId: string | null;
  showAttachedTerminalTrashButton: boolean;
};

type TerminalAreaCoreProps = {
  sectionId: string;
  width: number;
  height: number;
  hasScrollbar: boolean;
  terminalRef: React.RefObject<HTMLDivElement>;
  dataAttachedTerminalId: string | null;
  showAttachedTerminalTrashButton: boolean;
};

function TerminalAreaReadWrite({
  sectionId,
  width,
  height,
  hasScrollbar,
  setHasScrollbar,
  dataAttachedTerminalId,
  showAttachedTerminalTrashButton,
}: TerminalAreaReadWriteProps) {
  const terminalRef = useTerminal({
    sectionId,
    setHasScrollbar,
  });

  return (
    <TerminalAreaCore
      sectionId={sectionId}
      width={width}
      height={height}
      hasScrollbar={hasScrollbar}
      terminalRef={terminalRef}
      dataAttachedTerminalId={dataAttachedTerminalId}
      showAttachedTerminalTrashButton={showAttachedTerminalTrashButton}
    />
  );
}

function TerminalAreaCore({
  sectionId,
  width,
  height,
  hasScrollbar,
  terminalRef,
  dataAttachedTerminalId,
  showAttachedTerminalTrashButton,
}: TerminalAreaCoreProps) {
  return (
    <div
      className="relative"
      style={{ width: `${width - 24}px`, height: `${height - 32}px` }}
    >
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
        ref={terminalRef}
        className={`${hasScrollbar ? "nowheel" : ""} ${NO_PAN_CLASS_NAME} nodrag section-row-search-gutter section-key-value`}
        data-section-main-editor
        data-attached-terminal-section-id={dataAttachedTerminalId ?? undefined}
        style={{ height: "100%", width: "100%" }}
      />
    </div>
  );
}
