import React from "react";
import {
  LiveDictAreaMount,
  type LiveDictAreaMountProps,
} from "./groupContainerLiveDictAreaMount";

export type GroupContainerShellProps = {
  liveDictAreaMountProps: LiveDictAreaMountProps;
  setOuterRef: (node: HTMLDivElement | null) => void;
  waitingForResult: boolean;
};

export function GroupContainerShell({
  liveDictAreaMountProps,
  setOuterRef,
  waitingForResult,
}: GroupContainerShellProps) {
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
