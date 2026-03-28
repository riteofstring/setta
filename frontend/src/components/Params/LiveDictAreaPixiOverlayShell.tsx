import { useState } from "react";
import {
  LiveDictAreaMount,
  type LiveDictAreaMountProps,
} from "./groupContainerLiveDictAreaMount";
import type { LiveDictAreaSceneBoundary } from "./groupContainerLiveDictAreaSceneBoundary";
import { buildLiveDictAreaPixiFixedMeasurements } from "./liveDictAreaPixiLayout";
import { LiveDictAreaPixiScene } from "./LiveDictAreaPixiScene";

type LiveDictAreaPixiOverlayShellProps = {
  liveDictAreaMountProps: LiveDictAreaMountProps;
  liveDictAreaSceneBoundary: LiveDictAreaSceneBoundary;
};

export function LiveDictAreaPixiOverlayShell({
  liveDictAreaMountProps,
  liveDictAreaSceneBoundary,
}: LiveDictAreaPixiOverlayShellProps) {
  const [isEditorOverlayActive, setIsEditorOverlayActive] = useState(false);

  return (
    <>
      <LiveDictAreaPixiFixedMeasurementMarkers
        liveDictAreaSceneBoundary={liveDictAreaSceneBoundary}
      />
      <LiveDictAreaPixiScene
        liveDictAreaSceneBoundary={liveDictAreaSceneBoundary}
      />
      {isEditorOverlayActive ? (
        <div
          className="absolute inset-0 z-20 overflow-y-auto"
          data-live-dict-area-editor-overlay="active"
        >
          <LiveDictAreaMount {...liveDictAreaMountProps} />
        </div>
      ) : (
        <button
          aria-label="Activate live dict-area editor overlay"
          className="absolute inset-0 z-[5] appearance-none border-0 bg-transparent p-0"
          data-live-dict-area-editor-handoff="available"
          onClick={() => {
            setIsEditorOverlayActive(true);
          }}
          type="button"
        />
      )}
    </>
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
