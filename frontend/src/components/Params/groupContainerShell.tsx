import React from "react";
import { LiveDictAreaMount } from "./groupContainerLiveDictAreaMount";
import {
  useGroupContainerShellBoundary,
  type GroupContainerShellBoundaryInput,
} from "./groupContainerShellBoundary";

export type GroupContainerShellProps = GroupContainerShellBoundaryInput;

export function GroupContainerShell({
  sectionId,
  bgColor,
  sectionTypeName,
}: GroupContainerShellProps) {
  const { liveDictAreaMountProps, setOuterRef, waitingForResult } =
    useGroupContainerShellBoundary({
      bgColor,
      sectionId,
      sectionTypeName,
    });

  return (
    <div
      className="section-row-pin-main section-w-full relative -mt-3 flex min-h-0 flex-col pt-2"
      ref={setOuterRef}
    >
      {waitingForResult && (
        <div className="pointer-events-auto absolute inset-0 z-10 flex items-start justify-center bg-transparent pt-3">
          <i className="section-args gg-spinner !scale-100 before:!border-t-blue-500 after:!border-blue-500" />
        </div>
      )}
      <LiveDictAreaMount {...liveDictAreaMountProps} />
    </div>
  );
}
