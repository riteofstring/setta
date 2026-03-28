import {
  LiveDictAreaMount,
  type LiveDictAreaMountProps,
} from "./groupContainerLiveDictAreaMount";
import type { LiveDictAreaSceneBoundary } from "./groupContainerLiveDictAreaSceneBoundary";
import { buildLiveDictAreaPixiFixedMeasurements } from "./liveDictAreaPixiLayout";
import { LiveDictAreaPixiScene } from "./LiveDictAreaPixiScene";

export type GroupContainerShellProps = {
  liveDictAreaMountProps: LiveDictAreaMountProps;
  liveDictAreaSceneBoundary?: LiveDictAreaSceneBoundary;
  renderMode?: "dom" | "pixi-node-body";
  setOuterRef: (node: HTMLDivElement | null) => void;
  waitingForResult: boolean;
};

export function GroupContainerShell({
  liveDictAreaMountProps,
  liveDictAreaSceneBoundary,
  renderMode = "dom",
  setOuterRef,
  waitingForResult,
}: GroupContainerShellProps) {
  return (
    <div
      className="section-row-pin-main section-w-full relative -mt-3 flex min-h-0 flex-col pt-2"
      data-live-dict-area-render-mode={renderMode}
      ref={setOuterRef}
    >
      {waitingForResult && (
        <div className="pointer-events-auto absolute inset-0 z-10 flex items-start justify-center bg-transparent pt-3">
          <i className="section-args gg-spinner !scale-100 before:!border-t-blue-500 after:!border-blue-500" />
        </div>
      )}
      {renderMode === "pixi-node-body" && liveDictAreaSceneBoundary ? (
        <LiveDictAreaPixiFixedMeasurementMarkers
          liveDictAreaSceneBoundary={liveDictAreaSceneBoundary}
        />
      ) : null}
      {renderMode === "pixi-node-body" && liveDictAreaSceneBoundary ? (
        <LiveDictAreaPixiScene
          liveDictAreaSceneBoundary={liveDictAreaSceneBoundary}
        />
      ) : (
        <LiveDictAreaMount {...liveDictAreaMountProps} />
      )}
    </div>
  );
}

function LiveDictAreaPixiFixedMeasurementMarkers({
  liveDictAreaSceneBoundary,
}: {
  liveDictAreaSceneBoundary: LiveDictAreaSceneBoundary;
}) {
  const measurements = buildLiveDictAreaPixiFixedMeasurements({
    liveDictAreaSceneBoundary,
  });

  if (measurements.length === 0) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute left-0 top-0 w-px opacity-0"
    >
      {measurements.map((measurement) => (
        <div
          key={measurement.blockId}
          data-live-dict-area-fixed-measurement={measurement.blockId}
          data-params-fixed="true"
          style={{ height: `${measurement.height}px` }}
        />
      ))}
    </div>
  );
}
